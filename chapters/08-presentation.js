registerChapter({
  id: 'ch08',
  title: 'Présentation : routers, Depends & erreurs',
  subtitle: "Des routes fines qui traduisent HTTP ⇄ use cases, l'injection de dépendances de FastAPI et le mapping des erreurs métier en Problem Details (RFC 9457).",
  duration: '60 min',
  objectives: [
    "Comprendre le système d'injection <code>Depends</code> (graphe, cache par requête, <code>Annotated</code>).",
    'Écrire des fabriques de use cases sans que la présentation connaisse l\'infrastructure.',
    'Organiser les routes avec <code>APIRouter</code> et versionner sous <code>/api/v1</code>.',
    'Traduire les <code>DomainError</code> en réponses <code>application/problem+json</code> cohérentes.',
  ],
  content: `
<h2>Depends : l'injection de dépendances de FastAPI</h2>
<p>Une dépendance est simplement un <strong>callable</strong> (fonction ou classe) dont FastAPI résout lui-même les paramètres : requête, en-têtes, autres dépendances…
FastAPI construit le graphe à chaque requête, et <strong>met en cache</strong> le résultat de chaque dépendance pour la durée de cette requête.</p>
${py`
from typing import Annotated
from fastapi import Depends, Header

def get_locale(accept_language: Annotated[str | None, Header()] = None) -> str:
    return (accept_language or "fr").split(",")[0]

Locale = Annotated[str, Depends(get_locale)]      # alias réutilisable

@app.get("/hello")
async def hello(locale: Locale) -> dict[str, str]:
    return {"message": "Bonjour" if locale.startswith("fr") else "Hello"}
`}
${compare(['FastAPI', 'Spring', 'ASP.NET Core'], [
  ['<code>Depends(fn)</code> résolu à chaque requête', 'Bean <code>@RequestScope</code>', '<code>AddScoped&lt;T&gt;()</code>'],
  ['Cache par requête (une seule exécution)', 'Scope request', 'Scope scoped'],
  ['Dépendance avec <code>yield</code> (setup/teardown)', '<code>@PreDestroy</code> sur bean request', '<code>IDisposable</code> scoped'],
  ['<code>app.dependency_overrides</code>', '<code>@MockBean</code> / <code>@TestConfiguration</code>', '<code>ConfigureTestServices</code>'],
  ['<code>app.state</code> (singletons posés au démarrage)', 'Beans singleton', '<code>AddSingleton&lt;T&gt;()</code>'],
])}
${callout('java', 'Pas de conteneur IoC', `<p>Il n'y a pas d'enregistrement par type : FastAPI ne sait pas « résoudre un <code>UnitOfWork</code> » tout seul. Tu déclares <strong>explicitement</strong> une fonction fournisseuse. C'est plus verbeux qu'un <code>@Autowired</code>, mais tout est visible et navigable dans l'IDE, sans magie de scan.</p>`)}

<h2>Les fournisseurs de Biblio</h2>
<p>Le principe : les <em>singletons</em> (fabrique de UoW, horloge) sont déposés dans <code>app.state</code> par le composition root (étape 9). Les dépendances les récupèrent <strong>typés par leur port</strong>, puis fabriquent un use case par requête.</p>
${py.file('src/biblio/presentation/dependencies.py')`
from typing import Annotated

from fastapi import Depends, Request

from biblio.application.ports import Clock, UnitOfWork
from biblio.application.use_cases.books import GetBook, RegisterBook, RenameBook, SearchBooks
from biblio.application.use_cases.loans import BorrowBook, ListOverdueLoans, ReturnBook
from biblio.application.use_cases.members import GetMember, RegisterMember


# --- Ports (fournis par le composition root via app.state) --------------------
def get_uow(request: Request) -> UnitOfWork:
    uow: UnitOfWork = request.app.state.uow_factory()
    return uow


def get_clock(request: Request) -> Clock:
    clock: Clock = request.app.state.clock
    return clock


UowDep = Annotated[UnitOfWork, Depends(get_uow)]
ClockDep = Annotated[Clock, Depends(get_clock)]


# --- Use cases -----------------------------------------------------------------
def get_register_book(uow: UowDep) -> RegisterBook:
    return RegisterBook(uow)


def get_get_book(uow: UowDep) -> GetBook:
    return GetBook(uow)


def get_search_books(uow: UowDep) -> SearchBooks:
    return SearchBooks(uow)


def get_rename_book(uow: UowDep) -> RenameBook:
    return RenameBook(uow)


def get_register_member(uow: UowDep) -> RegisterMember:
    return RegisterMember(uow)


def get_get_member(uow: UowDep) -> GetMember:
    return GetMember(uow)


def get_borrow_book(uow: UowDep, clock: ClockDep) -> BorrowBook:
    return BorrowBook(uow, clock)


def get_return_book(uow: UowDep, clock: ClockDep) -> ReturnBook:
    return ReturnBook(uow, clock)


def get_list_overdue_loans(uow: UowDep, clock: ClockDep) -> ListOverdueLoans:
    return ListOverdueLoans(uow, clock)


RegisterBookDep = Annotated[RegisterBook, Depends(get_register_book)]
GetBookDep = Annotated[GetBook, Depends(get_get_book)]
SearchBooksDep = Annotated[SearchBooks, Depends(get_search_books)]
RenameBookDep = Annotated[RenameBook, Depends(get_rename_book)]
RegisterMemberDep = Annotated[RegisterMember, Depends(get_register_member)]
GetMemberDep = Annotated[GetMember, Depends(get_get_member)]
BorrowBookDep = Annotated[BorrowBook, Depends(get_borrow_book)]
ReturnBookDep = Annotated[ReturnBook, Depends(get_return_book)]
ListOverdueLoansDep = Annotated[ListOverdueLoans, Depends(get_list_overdue_loans)]
`}
${callout('info', 'Pourquoi pas Depends(RegisterBook) directement ?', `<p>FastAPI sait utiliser une classe comme dépendance, en analysant son <code>__init__</code>. Mais il verrait <code>uow: UnitOfWork</code>, un type qu'il ne sait pas fournir, et tenterait d'en faire un paramètre de requête. Les fonctions fournisseuses gardent les use cases <strong>totalement ignorants</strong> de FastAPI.</p>`)}

<h2>Les schémas de la présentation</h2>
${py.file('src/biblio/presentation/schemas/common.py')`
from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


class ProblemDetail(BaseModel):
    """RFC 9457 — utilisé pour documenter les erreurs dans OpenAPI."""

    type: str = "about:blank"
    title: str
    status: int
    detail: str
    instance: str
    code: str
`}
${py.file('src/biblio/presentation/schemas/books.py')`
from typing import Annotated, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from biblio.application.commands import RegisterBookCommand, RenameBookCommand
from biblio.domain.entities import Book

Title = Annotated[str, Field(min_length=1, max_length=255)]
Author = Annotated[str, Field(min_length=1, max_length=255)]


class BookCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    isbn: Annotated[str, Field(min_length=10, max_length=17, examples=["978-0-13-449416-6"])]
    title: Title
    author: Author
    copies: Annotated[int, Field(ge=1, le=100)] = 1

    def to_command(self) -> RegisterBookCommand:
        return RegisterBookCommand(isbn=self.isbn, title=self.title, author=self.author, copies=self.copies)


class BookUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: Title | None = None
    author: Author | None = None

    @model_validator(mode="after")
    def at_least_one_field(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("Au moins un champ doit être fourni")
        return self

    def to_command(self, book_id: UUID) -> RenameBookCommand:
        return RenameBookCommand(book_id=book_id, title=self.title, author=self.author)


class BookRead(BaseModel):
    id: UUID
    isbn: str
    title: str
    author: str
    total_copies: int
    available_copies: int

    @classmethod
    def from_entity(cls, book: Book) -> Self:
        return cls(
            id=book.id,
            isbn=str(book.isbn),
            title=book.title,
            author=book.author,
            total_copies=book.total_copies,
            available_copies=book.available_copies,
        )
`}
${callout('clean', 'Conversions explicites', `<p><code>to_command()</code> et <code>from_entity()</code> sont les deux seuls points de passage entre HTTP et le cœur. On aurait pu utiliser <code>from_attributes=True</code>, mais <code>isbn</code> est un value object : une fabrique explicite est plus claire qu'une configuration de sérialisation.</p>`)}

<h2>Le router du catalogue</h2>
${py.file('src/biblio/presentation/routers/books.py')`
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Request, Response, status

from biblio.application.commands import SearchBooksQuery
from biblio.presentation.dependencies import GetBookDep, RegisterBookDep, RenameBookDep, SearchBooksDep
from biblio.presentation.schemas.books import BookCreate, BookRead, BookUpdate
from biblio.presentation.schemas.common import Page, ProblemDetail

router = APIRouter(prefix="/books", tags=["Livres"])

NOT_FOUND = {status.HTTP_404_NOT_FOUND: {"model": ProblemDetail, "description": "Livre introuvable"}}


@router.get("")
async def search_books(
    use_case: SearchBooksDep,
    q: Annotated[str | None, Query(max_length=100, description="Titre ou auteur")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[BookRead]:
    page = await use_case.execute(SearchBooksQuery(text=q, limit=limit, offset=offset))
    return Page[BookRead](
        items=[BookRead.from_entity(b) for b in page.items],
        total=page.total,
        limit=page.limit,
        offset=page.offset,
    )


@router.get("/{book_id}", responses=NOT_FOUND)
async def get_book(book_id: UUID, use_case: GetBookDep) -> BookRead:
    return BookRead.from_entity(await use_case.execute(book_id))


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    responses={status.HTTP_409_CONFLICT: {"model": ProblemDetail, "description": "ISBN déjà présent"}},
)
async def register_book(
    payload: BookCreate, use_case: RegisterBookDep, request: Request, response: Response
) -> BookRead:
    book = await use_case.execute(payload.to_command())
    response.headers["Location"] = str(request.url_for("get_book", book_id=book.id))
    return BookRead.from_entity(book)


@router.patch("/{book_id}", responses=NOT_FOUND)
async def rename_book(book_id: UUID, payload: BookUpdate, use_case: RenameBookDep) -> BookRead:
    return BookRead.from_entity(await use_case.execute(payload.to_command(book_id)))
`}
<p>Chaque route tient en 1 à 3 lignes : <strong>convertir l'entrée → exécuter le use case → convertir la sortie</strong>. Aucun <code>try/except</code> : les erreurs métier remontent jusqu'au gestionnaire global.</p>

<h2>Assembler les routers</h2>
${py.file('src/biblio/presentation/routers/__init__.py')`
from fastapi import APIRouter

from biblio.presentation.routers import books, loans, members

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(books.router)
api_router.include_router(members.router)
api_router.include_router(loans.router)
`}

<h2>Erreurs métier → Problem Details</h2>
<p>Plutôt que de parsemer les routes de <code>HTTPException</code>, on traduit <strong>une fois pour toutes</strong> les catégories d'erreurs du domaine en réponses
<a href="https://www.rfc-editor.org/rfc/rfc9457" target="_blank" rel="noopener">RFC 9457</a>. C'est le format <code>ProblemDetail</code> de Spring 6 et <code>ProblemDetails</code> d'ASP.NET Core.</p>
${py.file('src/biblio/presentation/errors.py')`
import logging
from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from biblio.domain.exceptions import BusinessRuleViolation, DomainError, InvalidValue, NotFoundError

logger = logging.getLogger(__name__)

_STATUS_BY_ERROR: dict[type[DomainError], HTTPStatus] = {
    NotFoundError: HTTPStatus.NOT_FOUND,
    BusinessRuleViolation: HTTPStatus.CONFLICT,
    InvalidValue: HTTPStatus.UNPROCESSABLE_ENTITY,
}


def _status_for(error: DomainError) -> HTTPStatus:
    for error_type, http_status in _STATUS_BY_ERROR.items():
        if isinstance(error, error_type):
            return http_status
    return HTTPStatus.BAD_REQUEST


def problem_response(request: Request, http_status: HTTPStatus, detail: str, code: str) -> JSONResponse:
    return JSONResponse(
        status_code=http_status,
        media_type="application/problem+json",
        content={
            "type": "about:blank",
            "title": http_status.phrase,
            "status": http_status.value,
            "detail": detail,
            "instance": request.url.path,
            "code": code,
        },
    )


async def handle_domain_error(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, DomainError):          # garde de typage : ne devrait jamais arriver
        raise exc
    http_status = _status_for(exc)
    logger.info("Erreur métier %s sur %s : %s", type(exc).__name__, request.url.path, exc)
    return problem_response(request, http_status, str(exc), type(exc).__name__)


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(DomainError, handle_domain_error)   # couvre toutes les sous-classes
`}
${http`
POST /api/v1/loans

HTTP/1.1 409 Conflict
content-type: application/problem+json

{
  "type": "about:blank",
  "title": "Conflict",
  "status": 409,
  "detail": "Aucun exemplaire disponible pour le livre 1f0c6c1e-...",
  "instance": "/api/v1/loans",
  "code": "NoCopyAvailable"
}
`}
${callout('tip', 'Le champ code', `<p><code>code</code> est une <em>extension</em> autorisée par la RFC. Elle donne aux clients une clé stable (<code>NoCopyAvailable</code>, <code>LoanLimitReached</code>…) pour réagir sans parser le message, qui peut être traduit ou reformulé.</p>`)}
${callout('warn', 'Ne jamais exposer les erreurs inattendues', `<p>Seules les <code>DomainError</code> sont traduites avec leur message. Une exception technique (base indisponible, bug) doit produire une 500 <strong>générique</strong>, avec le détail dans les logs uniquement. Tu peux ajouter un gestionnaire pour <code>Exception</code> qui renvoie un Problem Details 500 sans <code>detail</code> sensible.</p>`)}
`,
  exercise: {
    title: 'Les routers adhérents et emprunts',
    statement: `
<p>Écris les schémas et les routers suivants :</p>
<ul>
  <li><code>POST /api/v1/members</code> (201 + <code>Location</code>) et <code>GET /api/v1/members/{member_id}</code>. Utilise <code>EmailStr</code> pour l'e-mail.</li>
  <li><code>POST /api/v1/loans</code> (corps <code>{book_id, member_id}</code>, 201).</li>
  <li><code>POST /api/v1/loans/{loan_id}/return</code> (200, renvoie l'emprunt clos).</li>
  <li><code>GET /api/v1/loans/overdue</code>.</li>
</ul>
<p>Piège à éviter : si tu ajoutes plus tard <code>GET /loans/{loan_id}</code>, réfléchis à l'ordre de déclaration des routes.</p>`,
    hints: [
      '<code>from pydantic import EmailStr</code> (le paquet <code>email-validator</code> est fourni par <code>fastapi[standard]</code>).',
      "Les routes sont évaluées dans l'ordre de déclaration : <code>/loans/overdue</code> doit précéder <code>/loans/{loan_id}</code>, sinon <code>\"overdue\"</code> est pris pour un UUID (422).",
    ],
    solution: `
${py.file('src/biblio/presentation/schemas/members.py')`
from typing import Annotated, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from biblio.application.commands import RegisterMemberCommand
from biblio.domain.entities import Member


class MemberCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    full_name: Annotated[str, Field(min_length=1, max_length=255)]
    email: EmailStr

    def to_command(self) -> RegisterMemberCommand:
        return RegisterMemberCommand(full_name=self.full_name, email=str(self.email))


class MemberRead(BaseModel):
    id: UUID
    full_name: str
    email: str

    @classmethod
    def from_entity(cls, member: Member) -> Self:
        return cls(id=member.id, full_name=member.full_name, email=member.email)
`}
${py.file('src/biblio/presentation/schemas/loans.py')`
from datetime import datetime
from typing import Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from biblio.application.commands import BorrowBookCommand
from biblio.domain.entities import Loan


class LoanCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    book_id: UUID
    member_id: UUID

    def to_command(self) -> BorrowBookCommand:
        return BorrowBookCommand(book_id=self.book_id, member_id=self.member_id)


class LoanRead(BaseModel):
    id: UUID
    book_id: UUID
    member_id: UUID
    borrowed_at: datetime
    due_at: datetime
    returned_at: datetime | None

    @classmethod
    def from_entity(cls, loan: Loan) -> Self:
        return cls(
            id=loan.id,
            book_id=loan.book_id,
            member_id=loan.member_id,
            borrowed_at=loan.borrowed_at,
            due_at=loan.due_at,
            returned_at=loan.returned_at,
        )
`}
${py.file('src/biblio/presentation/routers/members.py')`
from uuid import UUID

from fastapi import APIRouter, Request, Response, status

from biblio.presentation.dependencies import GetMemberDep, RegisterMemberDep
from biblio.presentation.schemas.members import MemberCreate, MemberRead

router = APIRouter(prefix="/members", tags=["Adhérents"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def register_member(
    payload: MemberCreate, use_case: RegisterMemberDep, request: Request, response: Response
) -> MemberRead:
    member = await use_case.execute(payload.to_command())
    response.headers["Location"] = str(request.url_for("get_member", member_id=member.id))
    return MemberRead.from_entity(member)


@router.get("/{member_id}")
async def get_member(member_id: UUID, use_case: GetMemberDep) -> MemberRead:
    return MemberRead.from_entity(await use_case.execute(member_id))
`}
${py.file('src/biblio/presentation/routers/loans.py')`
from uuid import UUID

from fastapi import APIRouter, status

from biblio.presentation.dependencies import BorrowBookDep, ListOverdueLoansDep, ReturnBookDep
from biblio.presentation.schemas.loans import LoanCreate, LoanRead

router = APIRouter(prefix="/loans", tags=["Emprunts"])


@router.get("/overdue")                       # AVANT toute route /loans/{loan_id}
async def list_overdue_loans(use_case: ListOverdueLoansDep) -> list[LoanRead]:
    return [LoanRead.from_entity(loan) for loan in await use_case.execute()]


@router.post("", status_code=status.HTTP_201_CREATED)
async def borrow_book(payload: LoanCreate, use_case: BorrowBookDep) -> LoanRead:
    return LoanRead.from_entity(await use_case.execute(payload.to_command()))


@router.post("/{loan_id}/return")
async def return_book(loan_id: UUID, use_case: ReturnBookDep) -> LoanRead:
    return LoanRead.from_entity(await use_case.execute(loan_id))
`}
<p>Pourquoi <code>POST /loans/{id}/return</code> plutôt que <code>PATCH /loans/{id}</code> avec <code>{"returned_at": ...}</code> ? Le retour est une <strong>action métier</strong> : c'est le serveur qui fixe la date et applique les règles. Le client ne choisit pas la valeur de <code>returned_at</code>. Une sous-ressource d'action exprime mieux l'intention.</p>`,
  },
  quiz: [
    {
      q: 'Une dépendance <code>get_uow</code> est utilisée par deux autres dépendances dans la même requête. Combien de fois est-elle exécutée ?',
      options: ['Deux fois', 'Une seule fois : FastAPI met le résultat en cache pour la requête', 'Une fois pour toute la durée de l\'application', 'Zéro, elle est paresseuse'],
      answer: 1,
      explain: "Par défaut, <code>use_cache=True</code> : au sein d'une requête, chaque dépendance est résolue une seule fois et partagée. C'est l'équivalent d'un scope <em>request</em>.",
    },
    {
      q: 'Comment Biblio transforme-t-il <code>NoCopyAvailable</code> en réponse HTTP 409 ?',
      options: [
        'Chaque route attrape l\'exception et lève une <code>HTTPException(409)</code>',
        "Un gestionnaire global enregistré pour <code>DomainError</code> associe chaque catégorie (<code>BusinessRuleViolation</code>) à un statut",
        'Le use case lève directement une <code>HTTPException</code>',
        'FastAPI le fait automatiquement',
      ],
      answer: 1,
      explain: "Le domaine reste ignorant de HTTP, et la traduction est centralisée, comme un <code>@ControllerAdvice</code> ou un <code>IExceptionHandler</code>.",
    },
    {
      q: 'Les routes <code>GET /loans/{loan_id}</code> (UUID) puis <code>GET /loans/overdue</code> sont déclarées dans cet ordre. Que renvoie <code>GET /loans/overdue</code> ?',
      options: [
        'La liste des retards',
        'Une 422, car "overdue" est capturé par <code>{loan_id}</code> et n\'est pas un UUID valide',
        'Une 404',
        'Une 405',
      ],
      answer: 1,
      explain: "Le routage est séquentiel : la première route dont le motif correspond gagne. Il faut déclarer les routes statiques avant les routes paramétrées.",
    },
    {
      q: "Quel est l'avantage de <code>RegisterBookDep = Annotated[RegisterBook, Depends(get_register_book)]</code> ?",
      options: [
        'Il rend la dépendance asynchrone',
        "L'alias est réutilisable, le type reste exact pour mypy et l'IDE, et la signature des routes reste lisible",
        'Il crée un singleton',
        "Il désactive la validation",
      ],
      answer: 1,
      explain: "C'est la forme recommandée par FastAPI depuis la 0.95. Elle évite aussi les valeurs par défaut <code>= Depends(...)</code>, qui gênent l'ordre des paramètres.",
    },
    {
      q: 'Quelle réponse est la plus correcte pour la création réussie d\'un livre ?',
      options: [
        '200 OK avec le livre',
        '201 Created avec le livre dans le corps et un en-tête <code>Location</code> vers <code>/api/v1/books/{id}</code>',
        '204 No Content',
        '202 Accepted',
      ],
      answer: 1,
      explain: "201 + <code>Location</code> est la sémantique HTTP standard d'une création. Renvoyer la représentation évite au client un GET supplémentaire.",
    },
  ],
});
