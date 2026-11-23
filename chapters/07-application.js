registerChapter({
  id: 'ch07',
  title: 'Couche application : ports & use cases',
  subtitle: "Exprimer les besoins du cœur sous forme de Protocols, orchestrer chaque cas d'utilisation et fixer la frontière transactionnelle avec une Unit of Work.",
  duration: '50 min',
  objectives: [
    'Définir les ports : repositories, <code>UnitOfWork</code> et <code>Clock</code>.',
    "Écrire des use cases à responsabilité unique (<code>RegisterBook</code>, <code>BorrowBook</code>, <code>ReturnBook</code>…).",
    'Comprendre le pattern Unit of Work, l\'équivalent explicite de <code>@Transactional</code>.',
    'Garder la couche application indépendante de tout framework.',
  ],
  content: `
<h2>Le rôle de la couche application</h2>
<p>Un <strong>use case</strong> raconte une histoire métier : « un bibliothécaire enregistre l'emprunt d'un livre par un adhérent ». Il :</p>
<ol>
  <li>reçoit une <strong>commande</strong> (données d'entrée simples) ;</li>
  <li>charge les entités via des <strong>ports</strong> ;</li>
  <li>délègue les décisions au <strong>domaine</strong> (<code>member.ensure_can_borrow</code>, <code>book.lend</code>) ;</li>
  <li>persiste et <strong>committe</strong> ;</li>
  <li>retourne une entité ou un résultat, <em>jamais</em> un objet HTTP.</li>
</ol>
${callout('java', 'Le service applicatif de Spring', `<p>C'est ton <code>@Service</code> transactionnel… sans Spring. La transaction n'est pas déclarée par une annotation magique : elle est <strong>explicite</strong> (<code>async with uow</code> … <code>await uow.commit()</code>). On lit le code et on sait exactement où la transaction commence et se termine.</p>`)}

<h2>Les ports</h2>
${py.file('src/biblio/application/ports.py')`
from datetime import datetime
from types import TracebackType
from typing import Protocol, Self
from uuid import UUID

from biblio.domain.entities import Book, Loan, Member
from biblio.domain.value_objects import Isbn


class BookRepository(Protocol):
    async def get(self, book_id: UUID) -> Book | None: ...
    async def get_by_isbn(self, isbn: Isbn) -> Book | None: ...
    async def search(self, *, text: str | None, limit: int, offset: int) -> list[Book]: ...
    async def count(self, *, text: str | None) -> int: ...
    async def add(self, book: Book) -> None: ...
    async def update(self, book: Book) -> None: ...


class MemberRepository(Protocol):
    async def get(self, member_id: UUID) -> Member | None: ...
    async def get_by_email(self, email: str) -> Member | None: ...
    async def add(self, member: Member) -> None: ...


class LoanRepository(Protocol):
    async def get(self, loan_id: UUID) -> Loan | None: ...
    async def count_active_for_member(self, member_id: UUID) -> int: ...
    async def list_overdue(self, now: datetime) -> list[Loan]: ...
    async def add(self, loan: Loan) -> None: ...
    async def update(self, loan: Loan) -> None: ...


class UnitOfWork(Protocol):
    """Frontière transactionnelle : regroupe les repositories d'une même transaction."""

    # Propriétés en lecture seule : une implémentation peut exposer un sous-type
    # (SqlAlchemyBookRepository) sans que mypy ne crie à l'invariance.
    @property
    def books(self) -> BookRepository: ...
    @property
    def members(self) -> MemberRepository: ...
    @property
    def loans(self) -> LoanRepository: ...

    async def __aenter__(self) -> Self: ...
    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None: ...
    async def commit(self) -> None: ...
    async def rollback(self) -> None: ...


class Clock(Protocol):
    def now(self) -> datetime: ...
`}
${explain([
  [`from types import TracebackType`, `Le type d'une « trace d'appels » d'exception, utilisé dans la signature de <code>__aexit__</code>.`],
  [`class BookRepository(Protocol):`, `Un <strong>port</strong> : l'interface du repository de livres, vue depuis l'application. Aucune trace de SQL ici.`],
  [`async def get(self, book_id: UUID) -> Book | None: ...`, `Une méthode <strong>asynchrone</strong> attendue, écrite sur une seule ligne. Le corps <code>...</code> signifie « pas d'implémentation, juste la signature ». Elle renvoie le livre, ou <code>None</code> s'il n'existe pas.`],
  [`async def search(self, *, text: str | None, limit: int, offset: int) -> list[Book]: ...`, `Le <code>*</code> impose des arguments nommés : <code>search(text="clean", limit=20, offset=0)</code>.`],
  [`@property
def books(self) -> BookRepository: ...`, `L'unité de travail <strong>expose</strong> ses repositories comme attributs en lecture seule : <code>uow.books</code>, <code>uow.members</code>…`],
  [`async def __aenter__(self) -> Self: ...`, `Ces deux méthodes spéciales permettent d'écrire <code>async with uow:</code>. <code>__aenter__</code> est appelée à l'entrée du bloc et renvoie l'unité de travail elle-même (<code>Self</code>), récupérable avec <code>as uow</code>.`],
  [`async def __aexit__(
    self,
    exc_type: type[BaseException] | None,
    exc: BaseException | None,
    tb: TracebackType | None,
) -> None: ...`, `Appelée à la sortie du bloc <code>async with</code>, <strong>même en cas d'exception</strong>. Python lui passe le type, l'objet et la trace de l'exception éventuelle, ou trois <code>None</code> si tout s'est bien passé. C'est l'endroit où l'on annule la transaction en cas d'erreur.`],
  [`class Clock(Protocol):
    def now(self) -> datetime: ...`, `Un port pour l'heure courante. En production, on renverra la vraie heure ; en test, une heure figée.`],
])}
${callout('clean', 'Des ports à la mesure des use cases', `
<p>Pas de <code>GenericRepository&lt;T&gt;</code> avec 25 méthodes « au cas où ». Chaque port expose <strong>exactement</strong> ce dont les use cases ont besoin (<em>Interface Segregation</em>),
avec des noms métier : <code>count_active_for_member</code> plutôt que <code>count(filter=...)</code>.</p>
<p>Remarque : la méthode de recherche s'appelle <code>search</code>, et non <code>list</code>. Dans le corps d'une classe, une méthode nommée <code>list</code> masquerait le type <code>list[Book]</code> utilisé dans les annotations suivantes.</p>`)}

<h2>Commandes et pagination applicative</h2>
${py.file('src/biblio/application/commands.py')`
from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True, slots=True)
class RegisterBookCommand:
    isbn: str
    title: str
    author: str
    copies: int = 1


@dataclass(frozen=True, slots=True)
class RenameBookCommand:
    book_id: UUID
    title: str | None = None
    author: str | None = None


@dataclass(frozen=True, slots=True)
class SearchBooksQuery:
    text: str | None = None
    limit: int = 20
    offset: int = 0


@dataclass(frozen=True, slots=True)
class RegisterMemberCommand:
    full_name: str
    email: str


@dataclass(frozen=True, slots=True)
class BorrowBookCommand:
    book_id: UUID
    member_id: UUID
`}
${explain([
  [`@dataclass(frozen=True, slots=True)
class RegisterBookCommand:`, `Une <strong>commande</strong> : un petit objet immuable qui transporte les données d'entrée d'un use case. Elle ne dépend ni de FastAPI ni de Pydantic.`],
  [`copies: int = 1`, `Champ facultatif. Les champs avec valeur par défaut viennent toujours <strong>après</strong> les champs obligatoires.`],
  [`class SearchBooksQuery:`, `Même idée pour une lecture (une <em>query</em>, au sens CQRS).`],
])}
${py.file('src/biblio/application/pagination.py')`
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Page[T]:                 # syntaxe générique Python 3.12 (PEP 695)
    items: list[T]
    total: int
    limit: int
    offset: int
`}
${explain([
  [`class Page[T]:`, `Une classe <strong>générique</strong> en <code>T</code>, avec la syntaxe de Python 3.12 : <code>Page[T]</code> correspond à <code>Page&lt;T&gt;</code>. On écrira <code>Page[Book]</code>.`],
  [`items: list[T]`, `Les éléments de la page, de type <code>T</code>.`],
])}

<h2>Use cases du catalogue</h2>
${py.file('src/biblio/application/use_cases/books.py')`
from uuid import UUID

from biblio.application.commands import RegisterBookCommand, RenameBookCommand, SearchBooksQuery
from biblio.application.pagination import Page
from biblio.application.ports import UnitOfWork
from biblio.domain.entities import Book
from biblio.domain.exceptions import BookNotFound, DuplicateIsbn
from biblio.domain.value_objects import Isbn


class RegisterBook:
    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    async def execute(self, command: RegisterBookCommand) -> Book:
        isbn = Isbn(command.isbn)                       # InvalidIsbn si incorrect
        async with self._uow as uow:
            if await uow.books.get_by_isbn(isbn) is not None:
                raise DuplicateIsbn(str(isbn))
            book = Book.create(isbn=isbn, title=command.title, author=command.author, copies=command.copies)
            await uow.books.add(book)
            await uow.commit()
        return book


class GetBook:
    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    async def execute(self, book_id: UUID) -> Book:
        async with self._uow as uow:
            book = await uow.books.get(book_id)
        if book is None:
            raise BookNotFound(book_id)
        return book


class SearchBooks:
    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    async def execute(self, query: SearchBooksQuery) -> Page[Book]:
        async with self._uow as uow:
            items = await uow.books.search(text=query.text, limit=query.limit, offset=query.offset)
            total = await uow.books.count(text=query.text)
        return Page(items=items, total=total, limit=query.limit, offset=query.offset)


class RenameBook:
    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    async def execute(self, command: RenameBookCommand) -> Book:
        async with self._uow as uow:
            book = await uow.books.get(command.book_id)
            if book is None:
                raise BookNotFound(command.book_id)
            book.rename(title=command.title, author=command.author)
            await uow.books.update(book)
            await uow.commit()
        return book
`}
${explain([
  [`class RegisterBook:`, `Un <strong>use case</strong> : une classe avec une seule méthode publique, <code>execute</code>.`],
  [`def __init__(self, uow: UnitOfWork) -> None:
    self._uow = uow`, `<strong>Injection par constructeur</strong> : le use case reçoit une unité de travail qui respecte le port <code>UnitOfWork</code>, sans savoir s'il s'agit de SQLAlchemy ou d'un fake de test.`],
  [`async def execute(self, command: RegisterBookCommand) -> Book:`, `Méthode asynchrone : elle pourra <code>await</code>er les appels à la base.`],
  [`isbn = Isbn(command.isbn)`, `Construit le value object. Si l'ISBN est invalide, <code>InvalidIsbn</code> est levée tout de suite, avant même d'ouvrir une transaction.`],
  [`async with self._uow as uow:`, `Ouvre la transaction : Python appelle <code>__aenter__</code>, dont le résultat est rangé dans <code>uow</code>. À la fin du bloc, ou si une exception survient, <code>__aexit__</code> referme proprement la transaction (≈ <code>await using</code>).`],
  [`if await uow.books.get_by_isbn(isbn) is not None:`, `<code>await</code> attend le résultat de la requête. S'il existe déjà un livre avec cet ISBN (le résultat n'est pas <code>None</code>), on refuse.`],
  [`await uow.commit()`, `Valide la transaction. Sans cet appel explicite, <code>__aexit__</code> annule tout : c'est volontaire.`],
  [`return book`, `On renvoie l'entité du domaine. La couche présentation la convertira en JSON.`],
  [`async with self._uow as uow:
    book = await uow.books.get(book_id)
if book is None:`, `Dans <code>GetBook</code>, on sort du <code>async with</code> (on libère la connexion) dès la lecture faite. Les variables définies dans un bloc restent accessibles après lui : <code>book</code> est utilisable en dehors.`],
  [`return Page(items=items, total=total, limit=query.limit, offset=query.offset)`, `Construit la page de résultats. mypy en déduit le type <code>Page[Book]</code>.`],
])}

<h2>Use cases des emprunts</h2>
${py.file('src/biblio/application/use_cases/loans.py')`
from uuid import UUID

from biblio.application.commands import BorrowBookCommand
from biblio.application.ports import Clock, UnitOfWork
from biblio.domain.entities import Loan
from biblio.domain.exceptions import BookNotFound, LoanNotFound, MemberNotFound


class BorrowBook:
    def __init__(self, uow: UnitOfWork, clock: Clock) -> None:
        self._uow = uow
        self._clock = clock

    async def execute(self, command: BorrowBookCommand) -> Loan:
        async with self._uow as uow:
            book = await uow.books.get(command.book_id)
            if book is None:
                raise BookNotFound(command.book_id)
            member = await uow.members.get(command.member_id)
            if member is None:
                raise MemberNotFound(command.member_id)

            member.ensure_can_borrow(await uow.loans.count_active_for_member(member.id))
            book.lend()
            loan = Loan.start(book_id=book.id, member_id=member.id, now=self._clock.now())

            await uow.books.update(book)
            await uow.loans.add(loan)
            await uow.commit()
        return loan


class ReturnBook:
    def __init__(self, uow: UnitOfWork, clock: Clock) -> None:
        self._uow = uow
        self._clock = clock

    async def execute(self, loan_id: UUID) -> Loan:
        async with self._uow as uow:
            loan = await uow.loans.get(loan_id)
            if loan is None:
                raise LoanNotFound(loan_id)
            book = await uow.books.get(loan.book_id)
            if book is None:
                raise BookNotFound(loan.book_id)

            loan.close(now=self._clock.now())
            book.give_back()

            await uow.loans.update(loan)
            await uow.books.update(book)
            await uow.commit()
        return loan


class ListOverdueLoans:
    def __init__(self, uow: UnitOfWork, clock: Clock) -> None:
        self._uow = uow
        self._clock = clock

    async def execute(self) -> list[Loan]:
        async with self._uow as uow:
            return await uow.loans.list_overdue(self._clock.now())
`}
${explain([
  [`def __init__(self, uow: UnitOfWork, clock: Clock) -> None:`, `Deux dépendances injectées : l'unité de travail et l'horloge.`],
  [`book = await uow.books.get(command.book_id)
if book is None:
    raise BookNotFound(command.book_id)`, `Charge le livre, ou lève une erreur métier s'il n'existe pas. L'exception traverse le <code>async with</code>, qui annule la transaction au passage.`],
  [`member.ensure_can_borrow(await uow.loans.count_active_for_member(member.id))`, `On lit de l'intérieur vers l'extérieur. On <code>await</code>e d'abord le comptage des emprunts actifs, puis on passe le résultat à la règle métier de l'adhérent.`],
  [`book.lend()`, `La règle « au moins un exemplaire disponible » est vérifiée <strong>dans l'entité</strong>, pas ici.`],
  [`Loan.start(book_id=book.id, member_id=member.id, now=self._clock.now())`, `Crée l'emprunt avec l'heure fournie par le port <code>Clock</code>.`],
  [`await uow.books.update(book)
await uow.loans.add(loan)
await uow.commit()`, `On persiste les deux modifications, puis on valide <strong>une seule</strong> transaction : soit tout est enregistré, soit rien.`],
  [`return await uow.loans.list_overdue(self._clock.now())`, `Un <code>return</code> à l'intérieur d'un <code>async with</code> est permis : la sortie du bloc (<code>__aexit__</code>) s'exécute quand même avant de rendre la main.`],
])}
${callout('clean', 'Lis BorrowBook à voix haute', `<p>« Charger le livre, charger l'adhérent, vérifier qu'il peut emprunter, sortir un exemplaire, ouvrir l'emprunt, enregistrer, valider. » Pas de SQL, pas de HTTP, pas de calcul : le use case <strong>orchestre</strong>, et le domaine <strong>décide</strong>.</p>`)}

<h2>La Unit of Work, pas à pas</h2>
${compare(['Moment', 'Ce qui se passe'], [
  ['<code>async with self._uow as uow:</code>', "Ouverture d'une session/transaction et création des repositories qui la partagent"],
  ['<code>await uow.books.update(book)</code>', "Les changements sont enregistrés dans la session, rien n'est encore validé"],
  ['<code>await uow.commit()</code>', 'Tout est validé <strong>atomiquement</strong> : stock et emprunt, ou rien'],
  ['Exception avant <code>commit</code>', '<code>__aexit__</code> fait un rollback : la base reste cohérente'],
  ['Sortie du bloc', 'Libération de la connexion'],
])}

${callout('warn', 'Concurrence : le dernier exemplaire', `
<p>Deux bibliothécaires empruntent simultanément le dernier exemplaire : les deux transactions lisent <code>available_copies = 1</code>, et les deux réussissent.
La réponse classique est le <strong>verrouillage optimiste</strong>, comme <code>@Version</code> en JPA ou <code>[ConcurrencyCheck]</code>/<code>RowVersion</code> en EF Core.
SQLAlchemy le propose via <code>__mapper_args__ = {"version_id_col": version}</code>, et lève <code>StaleDataError</code> au commit. Tu pourras le traduire en 409. On le garde comme amélioration à faire en fin de parcours.</p>`)}

${callout('info', 'Et les tests ?', `<p>Ces use cases se testent avec une <code>FakeUnitOfWork</code> en mémoire, de quelques dizaines de lignes, sans base ni HTTP. Les tests s'exécutent en quelques millisecondes. Ce sera l'objet de l'étape 11.</p>`)}
`,
  exercise: {
    title: 'Les use cases des adhérents',
    statement: `
<p>Dans <code>application/use_cases/members.py</code>, écris :</p>
<ul>
  <li><code>RegisterMember</code> : il reçoit un <code>RegisterMemberCommand</code> et refuse un e-mail déjà utilisé (<code>DuplicateEmail</code>). Attention à la normalisation !</li>
  <li><code>GetMember</code> : il lève <code>MemberNotFound</code> si l'adhérent n'existe pas.</li>
</ul>`,
    hints: [
      "Crée d'abord l'entité avec <code>Member.register(...)</code> : c'est elle qui normalise l'e-mail en minuscules. Cherche ensuite le doublon avec <code>member.email</code>.",
      'Inspire-toi de <code>RegisterBook</code> et de <code>GetBook</code>.',
    ],
    solution: `
${py.file('src/biblio/application/use_cases/members.py')`
from uuid import UUID

from biblio.application.commands import RegisterMemberCommand
from biblio.application.ports import UnitOfWork
from biblio.domain.entities import Member
from biblio.domain.exceptions import DuplicateEmail, MemberNotFound


class RegisterMember:
    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    async def execute(self, command: RegisterMemberCommand) -> Member:
        member = Member.register(full_name=command.full_name, email=command.email)
        async with self._uow as uow:
            if await uow.members.get_by_email(member.email) is not None:
                raise DuplicateEmail(member.email)
            await uow.members.add(member)
            await uow.commit()
        return member


class GetMember:
    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    async def execute(self, member_id: UUID) -> Member:
        async with self._uow as uow:
            member = await uow.members.get(member_id)
        if member is None:
            raise MemberNotFound(member_id)
        return member
`}
${explain([
  [`member = Member.register(full_name=command.full_name, email=command.email)`, `On crée l'entité <strong>avant</strong> d'ouvrir la transaction, ce qui normalise l'e-mail (minuscules, sans espaces).`],
  [`if await uow.members.get_by_email(member.email) is not None:`, `On vérifie l'unicité avec l'e-mail <strong>normalisé</strong>, pas avec la saisie brute.`],
])}
<p>Si tu avais cherché avec <code>command.email</code> brut, <code>Alice@Mail.org</code> et <code>alice@mail.org</code> auraient pu coexister. C'est le genre de bug que la normalisation dans le domaine évite.</p>
<p>En complément, ajoute une contrainte <code>UNIQUE</code> en base (étape 8) : elle protège contre deux inscriptions simultanées.</p>`,
  },
  quiz: [
    {
      q: 'Quel est le rôle principal de la Unit of Work ?',
      options: [
        'Mettre en cache les entités entre deux requêtes',
        'Définir la frontière transactionnelle : toutes les modifications d\'un use case sont validées ou annulées ensemble',
        'Générer les identifiants',
        'Remplacer les repositories',
      ],
      answer: 1,
      explain: "Elle joue le rôle de <code>@Transactional</code> ou de <code>DbContext.SaveChanges()</code>, explicitement : commit atomique, rollback en cas d'exception.",
    },
    {
      q: 'Pourquoi définir les ports avec <code>typing.Protocol</code> ?',
      options: [
        "Parce que Python n'a pas de classes abstraites",
        "Parce que les implémentations n'ont pas besoin d'en hériter : l'infrastructure et les fakes de test respectent simplement la forme, et mypy vérifie",
        'Pour que FastAPI les injecte automatiquement',
        'Pour la performance',
      ],
      answer: 1,
      explain: "Avec <code>abc.ABC</code> cela fonctionnerait aussi. Le typage structurel réduit cependant le couplage et simplifie les doublures de test.",
    },
    {
      q: 'Que doit retourner <code>RegisterBook.execute</code> ?',
      options: [
        'Un <code>BookRead</code> Pydantic prêt à être sérialisé',
        'Une <code>JSONResponse</code>',
        "L'entité <code>Book</code> du domaine : la conversion en contrat HTTP est le travail de la présentation",
        'Un dict',
      ],
      answer: 2,
      explain: "Si le use case renvoyait un schéma HTTP, il dépendrait de la présentation, ce qui viole la règle de dépendance. Et un autre adaptateur (CLI, gRPC) ne pourrait pas le réutiliser.",
    },
    {
      q: 'Dans <code>BorrowBook</code>, qui décide qu\'un adhérent a atteint sa limite d\'emprunts ?',
      options: [
        'Le use case, avec un <code>if count &gt;= 3</code>',
        "L'entité <code>Member</code> (<code>ensure_can_borrow</code>). Le use case lui fournit seulement le nombre d'emprunts actifs",
        'Le repository',
        'La route FastAPI',
      ],
      answer: 1,
      explain: "Le use case collecte l'information (requête de comptage), le domaine applique la règle. Ainsi, la limite n'est définie qu'à un seul endroit.",
    },
    {
      q: 'Pourquoi le port <code>UnitOfWork</code> déclare-t-il <code>books</code> comme <code>@property</code> plutôt que comme simple attribut ?',
      options: [
        'Pour le lazy loading',
        "Un attribut mutable d'un Protocol est invariant pour mypy. Une propriété en lecture seule est covariante, et accepte donc une implémentation qui expose <code>SqlAlchemyBookRepository</code>",
        'Parce que FastAPI l\'exige',
        'Pour cacher le repository',
      ],
      answer: 1,
      explain: "Si le membre était un attribut settable, mypy exigerait que l'implémentation déclare exactement <code>books: BookRepository</code>. C'est une subtilité de typage, mais très concrète.",
    },
  ],
});
