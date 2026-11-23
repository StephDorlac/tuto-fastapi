registerChapter({
  id: 'ch07',
  title: 'Infrastructure : SQLAlchemy 2 async',
  subtitle: "Les adaptateurs de persistance : modèles ORM, mappers vers le domaine, repositories, Unit of Work concrète et migrations Alembic.",
  duration: '60 min',
  objectives: [
    'Déclarer des modèles SQLAlchemy 2.0 typés (<code>Mapped</code>, <code>mapped_column</code>).',
    'Séparer modèles ORM et entités grâce à des mappers.',
    'Implémenter les ports <code>BookRepository</code> et <code>UnitOfWork</code> en async.',
    'Connaître les pièges de l\'async : <code>expire_on_commit</code>, lazy loading, fuseaux horaires sous SQLite.',
    'Versionner le schéma avec Alembic.',
  ],
  content: `
<h2>SQLAlchemy en deux mots</h2>
<p>SQLAlchemy est l'ORM de référence en Python. La version 2.0 a modernisé l'API (typage complet, <code>select()</code> unifié, support async natif).</p>
${compare(['SQLAlchemy 2', 'JPA / Hibernate', 'EF Core'], [
  ['<code>DeclarativeBase</code> + <code>Mapped[...]</code>', '<code>@Entity</code> + champs annotés', 'classes POCO + <code>DbSet&lt;T&gt;</code>'],
  ['<code>AsyncSession</code>', '<code>EntityManager</code>', '<code>DbContext</code>'],
  ['<code>async_sessionmaker</code>', '<code>EntityManagerFactory</code>', '<code>IDbContextFactory</code>'],
  ['<code>select(BookModel).where(...)</code>', 'Criteria API / JPQL', 'LINQ'],
  ['<code>session.get(BookModel, id)</code>', '<code>em.find(Book.class, id)</code>', '<code>ctx.Books.Find(id)</code>'],
  ['<code>session.commit()</code>', '<code>tx.commit()</code>', '<code>SaveChangesAsync()</code>'],
  ['Alembic', 'Flyway / Liquibase', 'EF Migrations'],
])}

<h2>Moteur et sessions</h2>
${py.file('src/biblio/infrastructure/db/engine.py')`
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from biblio.infrastructure.db.models import Base


def create_engine_and_session_factory(
    database_url: str, *, echo: bool = False
) -> tuple[AsyncEngine, async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(database_url, echo=echo)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    return engine, session_factory


async def create_schema(engine: AsyncEngine) -> None:
    """Pratique en dev et en test. En production, on utilise Alembic."""
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
`}
${callout('warn', 'expire_on_commit=False : indispensable en async', `
<p>Par défaut, après un <code>commit()</code>, SQLAlchemy <em>expire</em> les objets : l'accès suivant à un attribut déclenche un rechargement SQL <strong>implicite</strong>.
En async, une I/O implicite hors d'un <code>await</code> est impossible, et on obtient l'erreur <code>MissingGreenlet</code>. Pour la même raison, le <em>lazy loading</em> des relations est à proscrire en async :
on charge explicitement (<code>selectinload</code>) ou, comme ici, on convertit tout en entités du domaine avant de sortir du repository.</p>`)}

<h2>Les modèles ORM</h2>
${py.file('src/biblio/infrastructure/db/models.py')`
from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class BookModel(Base):
    __tablename__ = "books"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    isbn: Mapped[str] = mapped_column(String(13), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(255), index=True)
    author: Mapped[str] = mapped_column(String(255))
    total_copies: Mapped[int]
    available_copies: Mapped[int]


class MemberModel(Base):
    __tablename__ = "members"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(320), unique=True)


class LoanModel(Base):
    __tablename__ = "loans"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    book_id: Mapped[UUID] = mapped_column(ForeignKey("books.id"), index=True)
    member_id: Mapped[UUID] = mapped_column(ForeignKey("members.id"), index=True)
    borrowed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    returned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))   # nullable déduit
`}
<p>Le type Python suffit le plus souvent : <code>Mapped[int]</code> donne <code>INTEGER NOT NULL</code>, <code>Mapped[UUID]</code> donne un type UUID natif (ou <code>CHAR(32)</code> sous SQLite), et <code>Mapped[X | None]</code> rend la colonne nullable.</p>

<h2>Les mappers ORM ⇄ domaine</h2>
${py.file('src/biblio/infrastructure/db/mappers.py')`
from datetime import UTC, datetime

from biblio.domain.entities import Book, Loan, Member
from biblio.domain.value_objects import Isbn
from biblio.infrastructure.db.models import BookModel, LoanModel, MemberModel


def _as_utc(value: datetime) -> datetime:
    """SQLite ne conserve pas le fuseau : on le restaure (tout est stocké en UTC)."""
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def book_to_entity(model: BookModel) -> Book:
    return Book(
        id=model.id,
        isbn=Isbn(model.isbn),
        title=model.title,
        author=model.author,
        total_copies=model.total_copies,
        available_copies=model.available_copies,
    )


def book_to_model(book: Book) -> BookModel:
    return BookModel(
        id=book.id,
        isbn=str(book.isbn),
        title=book.title,
        author=book.author,
        total_copies=book.total_copies,
        available_copies=book.available_copies,
    )


def member_to_entity(model: MemberModel) -> Member:
    return Member(id=model.id, full_name=model.full_name, email=model.email)


def member_to_model(member: Member) -> MemberModel:
    return MemberModel(id=member.id, full_name=member.full_name, email=member.email)


def loan_to_entity(model: LoanModel) -> Loan:
    return Loan(
        id=model.id,
        book_id=model.book_id,
        member_id=model.member_id,
        borrowed_at=_as_utc(model.borrowed_at),
        due_at=_as_utc(model.due_at),
        returned_at=_as_utc(model.returned_at) if model.returned_at else None,
    )


def loan_to_model(loan: Loan) -> LoanModel:
    return LoanModel(
        id=loan.id,
        book_id=loan.book_id,
        member_id=loan.member_id,
        borrowed_at=loan.borrowed_at,
        due_at=loan.due_at,
        returned_at=loan.returned_at,
    )
`}
${callout('info', 'Alternative : le mapping impératif', `<p>On peut éviter les classes <code>*Model</code> en mappant directement les dataclasses du domaine sur des <code>Table</code> (<code>registry.map_imperatively</code>). C'est l'approche du livre <em>Architecture Patterns with Python</em> (« Cosmic Python »). Elle supprime les mappers, mais SQLAlchemy instrumente alors les entités du domaine. Ici, on privilégie une séparation stricte, plus lisible quand on débute.</p>`)}

<h2>Les repositories</h2>
${py.file('src/biblio/infrastructure/db/repositories.py')`
from datetime import datetime
from uuid import UUID

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from biblio.domain.entities import Book, Loan, Member
from biblio.domain.value_objects import Isbn
from biblio.infrastructure.db import mappers
from biblio.infrastructure.db.models import BookModel, LoanModel, MemberModel


class SqlAlchemyBookRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, book_id: UUID) -> Book | None:
        model = await self._session.get(BookModel, book_id)
        return mappers.book_to_entity(model) if model else None

    async def get_by_isbn(self, isbn: Isbn) -> Book | None:
        model = await self._session.scalar(select(BookModel).where(BookModel.isbn == str(isbn)))
        return mappers.book_to_entity(model) if model else None

    async def search(self, *, text: str | None, limit: int, offset: int) -> list[Book]:
        stmt = (
            select(BookModel)
            .where(*self._filters(text))
            .order_by(BookModel.title, BookModel.id)
            .limit(limit)
            .offset(offset)
        )
        models = await self._session.scalars(stmt)
        return [mappers.book_to_entity(m) for m in models]

    async def count(self, *, text: str | None) -> int:
        stmt = select(func.count()).select_from(BookModel).where(*self._filters(text))
        return (await self._session.scalar(stmt)) or 0

    async def add(self, book: Book) -> None:
        self._session.add(mappers.book_to_model(book))

    async def update(self, book: Book) -> None:
        await self._session.merge(mappers.book_to_model(book))

    @staticmethod
    def _filters(text: str | None) -> list[ColumnElement[bool]]:
        if not text:
            return []
        pattern = f"%{text}%"
        return [or_(BookModel.title.ilike(pattern), BookModel.author.ilike(pattern))]


class SqlAlchemyMemberRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, member_id: UUID) -> Member | None:
        model = await self._session.get(MemberModel, member_id)
        return mappers.member_to_entity(model) if model else None

    async def get_by_email(self, email: str) -> Member | None:
        model = await self._session.scalar(select(MemberModel).where(MemberModel.email == email))
        return mappers.member_to_entity(model) if model else None

    async def add(self, member: Member) -> None:
        self._session.add(mappers.member_to_model(member))


# SqlAlchemyLoanRepository : c'est l'exercice de cette étape !
`}
${callout('info', 'merge() pour la mise à jour', `<p><code>session.merge(model)</code> cherche l'objet persistant de même clé primaire, dans la session (<em>identity map</em>) ou en base, et y <strong>copie l'état</strong> du modèle transitoire. C'est l'équivalent de <code>EntityManager.merge()</code>. Ici, l'entité a été chargée juste avant dans la même session, donc aucune requête supplémentaire n'est émise.</p>`)}
${callout('clean', 'Pas d\'injection SQL', `<p>Le motif <code>f"%{text}%"</code> est passé comme <strong>paramètre lié</strong> par <code>ilike()</code>, et non concaténé dans le SQL. Le seul risque restant concerne les jokers <code>%</code> et <code>_</code> saisis par l'utilisateur (paramètre <code>escape=</code> si tu veux les neutraliser).</p>`)}

<h2>La Unit of Work concrète</h2>
${py.file('src/biblio/infrastructure/db/unit_of_work.py')`
from types import TracebackType
from typing import Self

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from biblio.infrastructure.db.repositories import (
    SqlAlchemyBookRepository,
    SqlAlchemyLoanRepository,
    SqlAlchemyMemberRepository,
)


class SqlAlchemyUnitOfWork:
    books: SqlAlchemyBookRepository
    members: SqlAlchemyMemberRepository
    loans: SqlAlchemyLoanRepository

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def __aenter__(self) -> Self:
        self._session = self._session_factory()
        self.books = SqlAlchemyBookRepository(self._session)
        self.members = SqlAlchemyMemberRepository(self._session)
        self.loans = SqlAlchemyLoanRepository(self._session)
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        if exc_type is not None:
            await self.rollback()
        await self._session.close()          # close() annule aussi toute transaction non validée

    async def commit(self) -> None:
        await self._session.commit()

    async def rollback(self) -> None:
        await self._session.rollback()
`}
${py.file('src/biblio/infrastructure/clock.py')`
from datetime import UTC, datetime


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(UTC)
`}
<p>Note qu'aucune de ces classes n'hérite d'un port. Elles respectent les <code>Protocol</code> par leur forme, et mypy le vérifiera au moment de l'assemblage (étape 9).</p>

<h2>Essai sans FastAPI</h2>
<p>Preuve que le cœur est indépendant du web : un petit script exécute un vrai use case sur une vraie base.</p>
${py.file('scripts/try_register.py')`
import asyncio

from biblio.application.commands import RegisterBookCommand
from biblio.application.use_cases.books import RegisterBook
from biblio.infrastructure.db.engine import create_engine_and_session_factory, create_schema
from biblio.infrastructure.db.unit_of_work import SqlAlchemyUnitOfWork


async def main() -> None:
    engine, session_factory = create_engine_and_session_factory("sqlite+aiosqlite:///./biblio.db", echo=True)
    await create_schema(engine)
    use_case = RegisterBook(SqlAlchemyUnitOfWork(session_factory))
    book = await use_case.execute(
        RegisterBookCommand(isbn="978-0-13-235088-4", title="Clean Code", author="Robert C. Martin", copies=2)
    )
    print(book)
    await engine.dispose()


asyncio.run(main())
`}
${sh`uv run python scripts/try_register.py`}

<h2>Migrations avec Alembic</h2>
${sh`
uv add alembic
uv run alembic init -t async migrations        # modèle async
`}
<p>Dans <code>migrations/env.py</code>, branche les métadonnées et l'URL :</p>
${py.file('migrations/env.py (extrait)')`
from biblio.config import get_settings
from biblio.infrastructure.db.models import Base

config.set_main_option("sqlalchemy.url", get_settings().database_url)
target_metadata = Base.metadata
`}
${sh`
uv run alembic revision --autogenerate -m "create books, members, loans"
uv run alembic upgrade head
`}
${callout('java', 'Comme Flyway, mais généré', `<p>Alembic compare <code>Base.metadata</code> au schéma réel et <strong>génère</strong> un script Python versionné (<code>upgrade()</code>/<code>downgrade()</code>), comme <code>dotnet ef migrations add</code>. Relis toujours le script généré avant de le committer : les renommages, par exemple, sont détectés comme une suppression suivie d'un ajout.</p>`)}
`,
  exercise: {
    title: 'Le repository des emprunts',
    statement: `
<p>Implémente <code>SqlAlchemyLoanRepository</code> conformément au port <code>LoanRepository</code> :
<code>get</code>, <code>count_active_for_member</code>, <code>list_overdue(now)</code>, <code>add</code> et <code>update</code>.</p>
<p>Un emprunt est <em>actif</em> si <code>returned_at IS NULL</code>, et <em>en retard</em> s'il est actif avec <code>due_at &lt; now</code>. Trie les retards du plus ancien au plus récent.</p>`,
    hints: [
      "En SQLAlchemy, on écrit <code>IS NULL</code> avec <code>LoanModel.returned_at.is_(None)</code>, et non <code>== None</code> (que Ruff signale d'ailleurs).",
      '<code>select(func.count()).select_from(LoanModel).where(...)</code> renvoie un entier via <code>session.scalar()</code>.',
    ],
    solution: `
${py.file('src/biblio/infrastructure/db/repositories.py (suite)')`
class SqlAlchemyLoanRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, loan_id: UUID) -> Loan | None:
        model = await self._session.get(LoanModel, loan_id)
        return mappers.loan_to_entity(model) if model else None

    async def count_active_for_member(self, member_id: UUID) -> int:
        stmt = (
            select(func.count())
            .select_from(LoanModel)
            .where(LoanModel.member_id == member_id, LoanModel.returned_at.is_(None))
        )
        return (await self._session.scalar(stmt)) or 0

    async def list_overdue(self, now: datetime) -> list[Loan]:
        stmt = (
            select(LoanModel)
            .where(LoanModel.returned_at.is_(None), LoanModel.due_at < now)
            .order_by(LoanModel.due_at)
        )
        models = await self._session.scalars(stmt)
        return [mappers.loan_to_entity(m) for m in models]

    async def add(self, loan: Loan) -> None:
        self._session.add(mappers.loan_to_model(loan))

    async def update(self, loan: Loan) -> None:
        await self._session.merge(mappers.loan_to_model(loan))
`}
<p>La règle « en retard » existe désormais deux fois : dans <code>Loan.is_overdue</code> et dans cette requête. C'est un compromis courant, car on ne veut pas charger tous les emprunts en mémoire pour filtrer en Python. Un test d'intégration (étape 10) garantira que les deux versions restent cohérentes.</p>`,
  },
  quiz: [
    {
      q: 'Pourquoi configurer <code>async_sessionmaker(engine, expire_on_commit=False)</code> ?',
      options: [
        'Pour que les sessions ne se ferment jamais',
        'Pour éviter un rechargement implicite des attributs après commit, impossible en async (erreur <code>MissingGreenlet</code>)',
        'Pour désactiver les transactions',
        'Pour accélérer les commits',
      ],
      answer: 1,
      explain: "En async, toute I/O doit passer par un <code>await</code>. Un attribut expiré qu'on relit déclencherait une requête synchrone cachée.",
    },
    {
      q: "Quel est l'équivalent SQLAlchemy de l'<code>EntityManager</code> JPA ou du <code>DbContext</code> EF Core ?",
      options: ['<code>Engine</code>', '<code>Session</code> / <code>AsyncSession</code>', '<code>MetaData</code>', '<code>DeclarativeBase</code>'],
      answer: 1,
      explain: "La session porte l'identity map, le suivi des changements et la transaction. L'engine, lui, gère le pool de connexions.",
    },
    {
      q: 'Que fait <code>await session.merge(book_model)</code> ?',
      options: [
        'Il insère toujours une nouvelle ligne',
        "Il copie l'état du modèle sur l'instance persistante de même clé primaire (chargée au besoin), qui sera mise à jour au commit",
        'Il fusionne deux tables',
        'Il supprime les doublons',
      ],
      answer: 1,
      explain: 'Comme <code>EntityManager.merge()</code>. Si aucune ligne n\'existe, merge prépare une insertion.',
    },
    {
      q: 'Quel est le principal intérêt de séparer <code>BookModel</code> (ORM) et <code>Book</code> (domaine) ?',
      options: [
        'Les performances',
        "Le domaine reste pur et le schéma SQL peut évoluer (dénormalisation, colonnes techniques…) sans impacter les règles métier, et inversement",
        "SQLAlchemy l'impose",
        'Pouvoir utiliser deux bases',
      ],
      answer: 1,
      explain: "Le coût est le mapping. Le bénéfice : aucune annotation ORM dans le domaine, et des tests du domaine qui n'ont jamais besoin d'une base.",
    },
    {
      q: 'Comment exprimer <code>returned_at IS NULL</code> dans une requête SQLAlchemy ?',
      options: [
        '<code>LoanModel.returned_at is None</code>',
        '<code>LoanModel.returned_at.is_(None)</code>',
        '<code>LoanModel.returned_at == "NULL"</code>',
        '<code>not LoanModel.returned_at</code>',
      ],
      answer: 1,
      explain: "<code>is None</code> est évalué par Python (toujours <code>False</code> ici) et ne produit aucun SQL. <code>.is_(None)</code> construit l'expression SQL. <code>== None</code> marche aussi, mais les linters le signalent.",
    },
  ],
});
