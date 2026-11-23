registerChapter({
  id: 'ch10',
  title: 'Tester à chaque niveau',
  subtitle: "La pyramide de tests de Biblio : domaine pur, use cases avec des fakes en mémoire, repositories sur une vraie base, et API via TestClient + dependency_overrides.",
  duration: '60 min',
  objectives: [
    'Configurer pytest et pytest-asyncio.',
    'Écrire des fakes (<code>FakeUnitOfWork</code>, <code>FixedClock</code>) plutôt que des mocks.',
    'Tester les use cases sans base ni HTTP, en quelques millisecondes.',
    "Tester l'API avec <code>TestClient</code> et <code>app.dependency_overrides</code>.",
    'Écrire des tests d\'intégration SQLAlchemy sur SQLite.',
  ],
  content: `
<h2>La pyramide de Biblio</h2>
${compare(['Niveau', 'Cible', 'Outils', 'Vitesse'], [
  ['Unitaire (domaine)', 'Entités, value objects', 'pytest seul', '⚡⚡⚡'],
  ['Unitaire (application)', 'Use cases', 'Fakes en mémoire', '⚡⚡⚡'],
  ['Intégration', 'Repositories, UoW, mappers', 'SQLite fichier temporaire', '⚡⚡'],
  ['API', 'Routes, validation, erreurs HTTP', 'TestClient + overrides', '⚡⚡'],
])}
${compare(['pytest', 'JUnit 5', 'xUnit / NUnit'], [
  ['fonction <code>test_*</code> + <code>assert</code>', '<code>@Test</code> + <code>assertEquals</code>', '<code>[Fact]</code> + <code>Assert.Equal</code>'],
  ['<code>@pytest.fixture</code>', '<code>@BeforeEach</code> / extensions', 'constructeur / <code>IClassFixture</code>'],
  ['<code>@pytest.mark.parametrize</code>', '<code>@ParameterizedTest</code>', '<code>[Theory]</code> + <code>[InlineData]</code>'],
  ['<code>pytest.raises(X)</code>', '<code>assertThrows</code>', '<code>Assert.Throws</code>'],
  ['<code>conftest.py</code>', 'classe de base / extension partagée', 'fixture partagée'],
  ['<code>TestClient</code>', '<code>MockMvc</code>', '<code>WebApplicationFactory</code>'],
  ['<code>app.dependency_overrides</code>', '<code>@MockBean</code>', '<code>ConfigureTestServices</code>'],
])}

<h2>Configuration</h2>
${toml.file('pyproject.toml (extrait)')`
[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"                         # les tests async def sont détectés seuls
asyncio_default_fixture_loop_scope = "function"
addopts = "--strict-markers"

[tool.coverage.run]
source = ["biblio"]
branch = true
`}
${tree(`
tests/
├── __init__.py              # un __init__.py dans chaque dossier de tests
├── fakes.py                 # FakeUnitOfWork, FixedClock, repositories en mémoire
├── conftest.py              # fixtures partagées : uow, clock
├── unit/
│   ├── __init__.py
│   ├── domain/              # __init__.py, test_book.py, test_isbn.py, test_loan.py
│   └── application/         # __init__.py, test_borrow_book.py, ...
├── integration/             # __init__.py, test_repositories.py
└── api/                     # __init__.py, conftest.py (client), test_books_api.py
`)}

<h2>Tests du domaine</h2>
${py.file('tests/unit/domain/test_isbn.py')`
import pytest

from biblio.domain.exceptions import InvalidIsbn
from biblio.domain.value_objects import Isbn


@pytest.mark.parametrize("raw", ["978-0-13-449416-6", "9780134494166", "978 0 13 449416 6"])
def test_isbn_is_normalized(raw: str) -> None:
    assert Isbn(raw).value == "9780134494166"


@pytest.mark.parametrize("raw", ["9780134494167", "123", "97801344941xx", ""])
def test_invalid_isbn_is_rejected(raw: str) -> None:
    with pytest.raises(InvalidIsbn):
        Isbn(raw)


def test_isbn_equality_is_by_value() -> None:
    assert Isbn("978-0-13-449416-6") == Isbn("9780134494166")
`}

<h2>Des fakes plutôt que des mocks</h2>
<p>Un <strong>fake</strong> est une implémentation réelle mais simplifiée d'un port : un repository qui stocke dans un <code>dict</code>.
Contrairement à un mock (<code>when(repo.get(...)).thenReturn(...)</code>), il ne fige pas <em>comment</em> le use case appelle ses dépendances. On teste le <strong>comportement</strong>, pas l'implémentation, et les tests survivent aux refactorings.</p>
${py.file('tests/fakes.py')`
import copy
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from types import TracebackType
from typing import Self
from uuid import UUID

from biblio.domain.entities import Book, Loan, Member
from biblio.domain.value_objects import Isbn


class InMemoryBookRepository:
    def __init__(self) -> None:
        self._items: dict[UUID, Book] = {}

    async def get(self, book_id: UUID) -> Book | None:
        book = self._items.get(book_id)
        return copy.deepcopy(book) if book else None

    async def get_by_isbn(self, isbn: Isbn) -> Book | None:
        return next((copy.deepcopy(b) for b in self._items.values() if b.isbn == isbn), None)

    async def search(self, *, text: str | None, limit: int, offset: int) -> list[Book]:
        return self._matching(text)[offset : offset + limit]

    async def count(self, *, text: str | None) -> int:
        return len(self._matching(text))

    async def add(self, book: Book) -> None:
        self._items[book.id] = copy.deepcopy(book)

    async def update(self, book: Book) -> None:
        self._items[book.id] = copy.deepcopy(book)

    def _matching(self, text: str | None) -> list[Book]:
        books = sorted(self._items.values(), key=lambda b: (b.title, str(b.id)))
        if text:
            needle = text.lower()
            books = [b for b in books if needle in b.title.lower() or needle in b.author.lower()]
        return [copy.deepcopy(b) for b in books]


class InMemoryMemberRepository:
    def __init__(self) -> None:
        self._items: dict[UUID, Member] = {}

    async def get(self, member_id: UUID) -> Member | None:
        member = self._items.get(member_id)
        return copy.deepcopy(member) if member else None

    async def get_by_email(self, email: str) -> Member | None:
        return next((copy.deepcopy(m) for m in self._items.values() if m.email == email), None)

    async def add(self, member: Member) -> None:
        self._items[member.id] = copy.deepcopy(member)


class InMemoryLoanRepository:
    def __init__(self) -> None:
        self._items: dict[UUID, Loan] = {}

    async def get(self, loan_id: UUID) -> Loan | None:
        loan = self._items.get(loan_id)
        return copy.deepcopy(loan) if loan else None

    async def count_active_for_member(self, member_id: UUID) -> int:
        return sum(1 for loan in self._items.values() if loan.member_id == member_id and loan.is_active)

    async def list_overdue(self, now: datetime) -> list[Loan]:
        overdue = [loan for loan in self._items.values() if loan.is_overdue(now)]
        return [copy.deepcopy(loan) for loan in sorted(overdue, key=lambda loan: loan.due_at)]

    async def add(self, loan: Loan) -> None:
        self._items[loan.id] = copy.deepcopy(loan)

    async def update(self, loan: Loan) -> None:
        self._items[loan.id] = copy.deepcopy(loan)


class FakeUnitOfWork:
    def __init__(self) -> None:
        self.books = InMemoryBookRepository()
        self.members = InMemoryMemberRepository()
        self.loans = InMemoryLoanRepository()
        self.commits = 0

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        return None

    async def commit(self) -> None:
        self.commits += 1

    async def rollback(self) -> None:
        return None


@dataclass
class FixedClock:
    current: datetime = field(default_factory=lambda: datetime(2026, 1, 15, 10, 0, tzinfo=UTC))

    def now(self) -> datetime:
        return self.current

    def advance(self, delta: timedelta) -> None:
        self.current += delta
`}
${callout('tip', 'Pourquoi deepcopy ?', `<p>Sans copie, le use case modifierait directement l'objet stocké, et un oubli de <code>await uow.books.update(book)</code> passerait inaperçu en test… puis échouerait en production. Copier à l'entrée et à la sortie reproduit le comportement d'une vraie base.</p>`)}
${py.file('tests/conftest.py')`
import pytest

from tests.fakes import FakeUnitOfWork, FixedClock


@pytest.fixture
def uow() -> FakeUnitOfWork:
    return FakeUnitOfWork()


@pytest.fixture
def clock() -> FixedClock:
    return FixedClock()
`}

<h2>Tests des use cases</h2>
${py.file('tests/unit/application/test_borrow_book.py')`
import pytest

from biblio.application.commands import BorrowBookCommand
from biblio.application.use_cases.loans import BorrowBook
from biblio.domain.entities import Book, Loan, Member
from biblio.domain.exceptions import BookNotFound, LoanLimitReached, NoCopyAvailable
from biblio.domain.value_objects import Isbn
from tests.fakes import FakeUnitOfWork, FixedClock


async def given_book(uow: FakeUnitOfWork, *, copies: int = 1) -> Book:
    book = Book.create(isbn=Isbn("9780134494166"), title="Clean Architecture", author="Robert C. Martin", copies=copies)
    await uow.books.add(book)
    return book


async def given_member(uow: FakeUnitOfWork) -> Member:
    member = Member.register(full_name="Alice Martin", email="alice@example.org")
    await uow.members.add(member)
    return member


async def test_borrowing_opens_a_loan_and_takes_a_copy(uow: FakeUnitOfWork, clock: FixedClock) -> None:
    book, member = await given_book(uow), await given_member(uow)

    loan = await BorrowBook(uow, clock).execute(BorrowBookCommand(book_id=book.id, member_id=member.id))

    assert loan.due_at == clock.now() + Loan.DURATION
    stored_book = await uow.books.get(book.id)
    assert stored_book is not None and stored_book.available_copies == 0
    assert await uow.loans.get(loan.id) is not None
    assert uow.commits == 1


async def test_borrowing_unknown_book_fails_without_commit(uow: FakeUnitOfWork, clock: FixedClock) -> None:
    member = await given_member(uow)
    unknown = Book.create(isbn=Isbn("9780132350884"), title="Clean Code", author="Robert C. Martin")

    with pytest.raises(BookNotFound):
        await BorrowBook(uow, clock).execute(BorrowBookCommand(book_id=unknown.id, member_id=member.id))
    assert uow.commits == 0


async def test_cannot_borrow_when_no_copy_left(uow: FakeUnitOfWork, clock: FixedClock) -> None:
    book, member = await given_book(uow, copies=1), await given_member(uow)
    use_case = BorrowBook(uow, clock)
    await use_case.execute(BorrowBookCommand(book_id=book.id, member_id=member.id))

    with pytest.raises(NoCopyAvailable):
        await use_case.execute(BorrowBookCommand(book_id=book.id, member_id=member.id))


async def test_member_cannot_exceed_active_loan_limit(uow: FakeUnitOfWork, clock: FixedClock) -> None:
    book = await given_book(uow, copies=Member.MAX_ACTIVE_LOANS + 1)
    member = await given_member(uow)
    use_case = BorrowBook(uow, clock)
    for _ in range(Member.MAX_ACTIVE_LOANS):
        await use_case.execute(BorrowBookCommand(book_id=book.id, member_id=member.id))

    with pytest.raises(LoanLimitReached):
        await use_case.execute(BorrowBookCommand(book_id=book.id, member_id=member.id))
`}
${callout('clean', 'Des tests lisibles', `<p>Structure <em>Arrange / Act / Assert</em> séparée par des lignes vides, helpers <code>given_*</code> au vocabulaire métier, nom de test qui décrit la règle (<code>test_member_cannot_exceed_active_loan_limit</code>). Un test qui échoue doit expliquer <strong>quelle règle</strong> est cassée.</p>`)}

<h2>Tests d'API</h2>
<p>On remplace les dépendances <code>get_uow</code> et <code>get_clock</code> par les fakes : toute la pile HTTP (routage, validation, sérialisation, gestion des erreurs) est testée, sans base de données.</p>
${py.file('tests/api/conftest.py')`
import pytest
from fastapi.testclient import TestClient

from biblio.config import Settings
from biblio.main import create_app
from biblio.presentation.dependencies import get_clock, get_uow
from tests.fakes import FakeUnitOfWork, FixedClock


@pytest.fixture
def client(uow: FakeUnitOfWork, clock: FixedClock) -> TestClient:
    app = create_app(Settings(environment="test", create_schema_on_startup=False))
    app.dependency_overrides[get_uow] = lambda: uow
    app.dependency_overrides[get_clock] = lambda: clock
    # Sans "with TestClient(app)", le lifespan n'est pas exécuté : aucune base n'est ouverte.
    return TestClient(app)
`}
${py.file('tests/api/test_books_api.py')`
from fastapi.testclient import TestClient

BOOK = {"isbn": "978-0-13-449416-6", "title": "Clean Architecture", "author": "Robert C. Martin", "copies": 2}


def test_register_book_returns_201_with_location(client: TestClient) -> None:
    response = client.post("/api/v1/books", json=BOOK)

    assert response.status_code == 201
    body = response.json()
    assert body["isbn"] == "9780134494166"
    assert body["available_copies"] == 2
    assert response.headers["location"].endswith(f"/api/v1/books/{body['id']}")


def test_invalid_isbn_returns_problem_details(client: TestClient) -> None:
    response = client.post("/api/v1/books", json=BOOK | {"isbn": "9780134494167"})

    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["code"] == "InvalidIsbn"


def test_duplicate_isbn_returns_409(client: TestClient) -> None:
    client.post("/api/v1/books", json=BOOK)

    response = client.post("/api/v1/books", json=BOOK)

    assert response.status_code == 409
    assert response.json()["code"] == "DuplicateIsbn"


def test_unknown_field_is_rejected(client: TestClient) -> None:
    response = client.post("/api/v1/books", json=BOOK | {"available_copies": 99})
    assert response.status_code == 422


def test_search_paginates(client: TestClient) -> None:
    client.post("/api/v1/books", json=BOOK)
    client.post("/api/v1/books", json={"isbn": "9780132350884", "title": "Clean Code", "author": "Robert C. Martin"})

    page = client.get("/api/v1/books", params={"q": "clean", "limit": 1}).json()

    assert page["total"] == 2
    assert [b["title"] for b in page["items"]] == ["Clean Architecture"]
`}

<h2>Tests d'intégration des repositories</h2>
${py.file('tests/integration/test_repositories.py')`
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from biblio.domain.entities import Book, Loan, Member
from biblio.domain.value_objects import Isbn
from biblio.infrastructure.db.engine import create_engine_and_session_factory, create_schema
from biblio.infrastructure.db.unit_of_work import SqlAlchemyUnitOfWork


@pytest.fixture
async def session_factory(tmp_path: Path) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine, factory = create_engine_and_session_factory(f"sqlite+aiosqlite:///{tmp_path / 'test.db'}")
    await create_schema(engine)
    yield factory
    await engine.dispose()


async def test_book_roundtrip(session_factory: async_sessionmaker[AsyncSession]) -> None:
    book = Book.create(isbn=Isbn("9780134494166"), title="Clean Architecture", author="Robert C. Martin")
    async with SqlAlchemyUnitOfWork(session_factory) as uow:
        await uow.books.add(book)
        await uow.commit()

    async with SqlAlchemyUnitOfWork(session_factory) as uow:
        loaded = await uow.books.get(book.id)

    assert loaded == book                     # égalité d'entité (id)
    assert loaded is not None and loaded.isbn == book.isbn


async def test_uncommitted_changes_are_discarded(session_factory: async_sessionmaker[AsyncSession]) -> None:
    book = Book.create(isbn=Isbn("9780132350884"), title="Clean Code", author="Robert C. Martin")
    async with SqlAlchemyUnitOfWork(session_factory) as uow:
        await uow.books.add(book)             # pas de commit

    async with SqlAlchemyUnitOfWork(session_factory) as uow:
        assert await uow.books.get(book.id) is None


async def test_list_overdue_matches_domain_rule(session_factory: async_sessionmaker[AsyncSession]) -> None:
    book = Book.create(isbn=Isbn("9782070368228"), title="L'Étranger", author="Albert Camus", copies=2)
    member = Member.register(full_name="Alice Martin", email="alice@example.org")
    start = datetime(2026, 1, 1, tzinfo=UTC)
    late = Loan.start(book_id=book.id, member_id=member.id, now=start)
    recent = Loan.start(book_id=book.id, member_id=member.id, now=start + timedelta(days=15))
    now = start + Loan.DURATION + timedelta(days=1)

    async with SqlAlchemyUnitOfWork(session_factory) as uow:
        await uow.books.add(book)
        await uow.members.add(member)
        await uow.loans.add(late)
        await uow.loans.add(recent)
        await uow.commit()

    async with SqlAlchemyUnitOfWork(session_factory) as uow:
        overdue = await uow.loans.list_overdue(now)

    assert [loan.id for loan in overdue] == [late.id]
    assert all(loan.is_overdue(now) for loan in overdue)   # requête SQL ≡ règle du domaine
`}

<h2>Lancer les tests</h2>
${sh`
uv run pytest                          # tout
uv run pytest tests/unit -q            # uniquement les tests rapides
uv run pytest -k borrow -vv            # filtre par nom
uv run pytest --cov --cov-report=term-missing
`}
`,
  exercise: {
    title: 'Tester ReturnBook',
    statement: `
<p>Écris <code>tests/unit/application/test_return_book.py</code> pour couvrir :</p>
<ol>
  <li>le cas nominal : l'emprunt est clos à l'heure de l'horloge, et l'exemplaire revient en rayon ;</li>
  <li>le double retour, qui lève <code>LoanAlreadyReturned</code> ;</li>
  <li>un emprunt inconnu, qui lève <code>LoanNotFound</code> ;</li>
  <li>bonus : avec <code>clock.advance()</code>, un emprunt non rendu après 22 jours apparaît dans <code>ListOverdueLoans</code>.</li>
</ol>`,
    hints: [
      'Réutilise <code>given_book</code> et <code>given_member</code> : déplace-les dans <code>tests/fakes.py</code> ou dans une fixture.',
      "Pour un id inconnu, <code>uuid4()</code> suffit.",
    ],
    solution: `
${py.file('tests/unit/application/test_return_book.py')`
from datetime import timedelta
from uuid import uuid4

import pytest

from biblio.application.commands import BorrowBookCommand
from biblio.application.use_cases.loans import BorrowBook, ListOverdueLoans, ReturnBook
from biblio.domain.entities import Loan
from biblio.domain.exceptions import LoanAlreadyReturned, LoanNotFound
from tests.fakes import FakeUnitOfWork, FixedClock
from tests.unit.application.test_borrow_book import given_book, given_member


async def borrow(uow: FakeUnitOfWork, clock: FixedClock) -> Loan:
    book, member = await given_book(uow), await given_member(uow)
    return await BorrowBook(uow, clock).execute(BorrowBookCommand(book_id=book.id, member_id=member.id))


async def test_return_closes_loan_and_restocks(uow: FakeUnitOfWork, clock: FixedClock) -> None:
    loan = await borrow(uow, clock)
    clock.advance(timedelta(days=3))

    returned = await ReturnBook(uow, clock).execute(loan.id)

    assert returned.returned_at == clock.now()
    book = await uow.books.get(loan.book_id)
    assert book is not None and book.available_copies == 1


async def test_cannot_return_twice(uow: FakeUnitOfWork, clock: FixedClock) -> None:
    loan = await borrow(uow, clock)
    use_case = ReturnBook(uow, clock)
    await use_case.execute(loan.id)

    with pytest.raises(LoanAlreadyReturned):
        await use_case.execute(loan.id)


async def test_unknown_loan(uow: FakeUnitOfWork, clock: FixedClock) -> None:
    with pytest.raises(LoanNotFound):
        await ReturnBook(uow, clock).execute(uuid4())


async def test_unreturned_loan_becomes_overdue(uow: FakeUnitOfWork, clock: FixedClock) -> None:
    loan = await borrow(uow, clock)
    clock.advance(Loan.DURATION + timedelta(days=1))

    overdue = await ListOverdueLoans(uow, clock).execute()

    assert [o.id for o in overdue] == [loan.id]
`}
<p>Importer des helpers depuis un autre module de test fonctionne, mais à partir de deux usages, range-les dans <code>tests/fakes.py</code> (ou un module <code>tests/builders.py</code>) pour éviter le couplage entre fichiers de tests.</p>`,
  },
  quiz: [
    {
      q: "Quel est l'avantage principal d'un fake en mémoire par rapport à un mock configuré appel par appel ?",
      options: [
        'Il est plus rapide à écrire pour chaque test',
        "Il teste le comportement observable sans figer la séquence d'appels internes : les tests résistent aux refactorings",
        "Il vérifie le SQL généré",
        'Il ne nécessite pas de typage',
      ],
      answer: 1,
      explain: "Un mock vérifie <em>comment</em> le code appelle ses dépendances. Un fake permet de vérifier <em>ce qui</em> a changé. Le fake est écrit une fois et réutilisé partout.",
    },
    {
      q: 'Comment remplacer la Unit of Work réelle par un fake dans un test d\'API ?',
      options: [
        'Monkey-patcher SQLAlchemy',
        '<code>app.dependency_overrides[get_uow] = lambda: fake_uow</code>',
        'Modifier <code>app.state</code> après chaque requête',
        'Utiliser une base de données en mémoire obligatoirement',
      ],
      answer: 1,
      explain: 'Les overrides remplacent une dépendance par une autre dans tout le graphe, comme <code>@MockBean</code> ou <code>ConfigureTestServices</code>.',
    },
    {
      q: 'Que permet <code>asyncio_mode = "auto"</code> de pytest-asyncio ?',
      options: [
        'Exécuter les tests en parallèle',
        'Exécuter automatiquement les tests et fixtures <code>async def</code> dans une boucle d\'événements, sans décorateur',
        'Convertir les tests synchrones en asynchrones',
        'Désactiver les warnings',
      ],
      answer: 1,
      explain: "Sans ce mode, il faut marquer chaque test avec <code>@pytest.mark.asyncio</code>.",
    },
    {
      q: 'Dans la fixture <code>client</code>, pourquoi ne pas utiliser <code>with TestClient(app) as c:</code> ?',
      options: [
        'Parce que cette syntaxe est dépréciée',
        "Parce que le context manager déclenche le lifespan (création du moteur SQL), inutile ici puisque la UoW est remplacée par un fake",
        'Parce que TestClient ne supporte pas les context managers',
        'Pour pouvoir utiliser httpx',
      ],
      answer: 1,
      explain: "Le lifespan ne s'exécute qu'en mode context manager. Pour des tests de bout en bout avec une vraie base, on l'utiliserait au contraire volontairement.",
    },
    {
      q: 'Pourquoi le test <code>test_list_overdue_matches_domain_rule</code> a-t-il de la valeur ?',
      options: [
        'Il augmente la couverture',
        "La règle « en retard » existe en Python (<code>Loan.is_overdue</code>) et en SQL (<code>list_overdue</code>). Le test garantit que les deux restent cohérentes",
        'Il teste FastAPI',
        'Il vérifie les performances',
      ],
      answer: 1,
      explain: 'Dès qu\'une règle est dupliquée pour des raisons de performance, un test d\'intégration doit verrouiller leur équivalence.',
    },
  ],
});
