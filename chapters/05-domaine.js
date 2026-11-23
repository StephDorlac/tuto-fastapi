registerChapter({
  id: 'ch05',
  title: 'Couche domaine : entités & règles métier',
  subtitle: 'Le cœur de Biblio en Python pur : exceptions métier, value object Isbn, entités Book, Member et Loan riches en comportement.',
  duration: '50 min',
  objectives: [
    'Distinguer entité (identité) et value object (valeur, immuabilité).',
    'Construire une hiérarchie d\'exceptions métier exploitable par la présentation.',
    'Encapsuler les invariants dans les entités (modèle riche, pas anémique).',
    'Écrire un domaine déterministe, sans <code>datetime.now()</code> caché.',
  ],
  content: `
<h2>Les exceptions métier</h2>
<p>On commence par le vocabulaire des échecs. La hiérarchie est pensée pour que la présentation puisse la traduire en HTTP <strong>par catégorie</strong>, sans connaître chaque cas :</p>
${compare(['Catégorie', 'Signification', 'Futur code HTTP'], [
  ['<code>InvalidValue</code>', 'Une donnée viole un invariant (ISBN faux, titre vide)', '422'],
  ['<code>NotFoundError</code>', "L'objet demandé n'existe pas", '404'],
  ['<code>BusinessRuleViolation</code>', "L'opération est incompatible avec l'état actuel (plus d'exemplaire, limite atteinte…)", '409'],
])}
${py.file('src/biblio/domain/exceptions.py')`
from uuid import UUID


class DomainError(Exception):
    """Racine de toutes les erreurs métier."""


# --- Données invalides -------------------------------------------------------
class InvalidValue(DomainError):
    """Une valeur viole un invariant du domaine."""


class InvalidIsbn(InvalidValue):
    def __init__(self, raw: str) -> None:
        super().__init__(f"ISBN-13 invalide : {raw!r}")
        self.raw = raw


# --- Ressources introuvables -------------------------------------------------
class NotFoundError(DomainError):
    entity_name = "Ressource"

    def __init__(self, entity_id: object) -> None:
        super().__init__(f"{self.entity_name} {entity_id} introuvable")
        self.entity_id = entity_id


class BookNotFound(NotFoundError):
    entity_name = "Livre"


class MemberNotFound(NotFoundError):
    entity_name = "Adhérent"


class LoanNotFound(NotFoundError):
    entity_name = "Emprunt"


# --- Règles métier violées ---------------------------------------------------
class BusinessRuleViolation(DomainError):
    """L'opération est refusée par une règle métier."""


class NoCopyAvailable(BusinessRuleViolation):
    def __init__(self, book_id: UUID) -> None:
        super().__init__(f"Aucun exemplaire disponible pour le livre {book_id}")


class LoanLimitReached(BusinessRuleViolation):
    def __init__(self, member_id: UUID, limit: int) -> None:
        super().__init__(f"L'adhérent {member_id} a déjà {limit} emprunts en cours")


class LoanAlreadyReturned(BusinessRuleViolation):
    def __init__(self, loan_id: UUID) -> None:
        super().__init__(f"L'emprunt {loan_id} a déjà été rendu")


class DuplicateIsbn(BusinessRuleViolation):
    def __init__(self, isbn: str) -> None:
        super().__init__(f"Un livre avec l'ISBN {isbn} existe déjà")


class DuplicateEmail(BusinessRuleViolation):
    def __init__(self, email: str) -> None:
        super().__init__(f"Un adhérent utilise déjà l'e-mail {email}")
`}
${callout('clean', 'Des exceptions qui parlent métier', `<p>On lève <code>NoCopyAvailable(book_id)</code>, pas <code>ValueError("stock = 0")</code>. Le nom de la classe est la documentation, le message sert l'humain et les attributs servent le code.</p>`)}

<h2>Value object : Isbn</h2>
<p>Un <strong>value object</strong> n'a pas d'identité : deux ISBN identiques sont interchangeables. Il est <strong>immuable</strong> et <strong>toujours valide</strong> :
s'il existe, c'est qu'il a passé ses contrôles. Plus besoin de revalider partout.</p>
${py.file('src/biblio/domain/value_objects.py')`
from dataclasses import dataclass

from biblio.domain.exceptions import InvalidIsbn

_ISBN13_LENGTH = 13


@dataclass(frozen=True, slots=True)
class Isbn:
    """ISBN-13 normalisé (13 chiffres, sans séparateurs) et vérifié."""

    value: str

    def __post_init__(self) -> None:
        normalized = self.value.replace("-", "").replace(" ", "")
        if not _has_valid_checksum(normalized):
            raise InvalidIsbn(self.value)
        object.__setattr__(self, "value", normalized)   # autorisé dans __post_init__ d'un frozen

    def __str__(self) -> str:
        return self.value


def _has_valid_checksum(digits: str) -> bool:
    if len(digits) != _ISBN13_LENGTH or not digits.isdigit():
        return False
    weighted_sum = sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(digits[:12]))
    check_digit = (10 - weighted_sum % 10) % 10
    return check_digit == int(digits[12])
`}
${py`
>>> Isbn("978-0-13-449416-6")
Isbn(value='9780134494166')
>>> Isbn("978-0-13-449416-6") == Isbn("9780134494166")
True
>>> Isbn("9780134494167")
biblio.domain.exceptions.InvalidIsbn: ISBN-13 invalide : '9780134494167'
`}

<h2>Une base pour les entités</h2>
<p>Une <strong>entité</strong> a une identité stable : deux livres sont « le même » s'ils ont le même <code>id</code>, même si leur titre a changé.
Les dataclasses comparent par défaut <em>tous</em> les champs. On désactive ce comportement (<code>eq=False</code>) au profit d'une égalité par identifiant :</p>
${py.file('src/biblio/domain/entities.py (1/4)')`
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import ClassVar, Self
from uuid import UUID, uuid4

from biblio.domain.exceptions import (
    BusinessRuleViolation,
    InvalidValue,
    LoanAlreadyReturned,
    LoanLimitReached,
    NoCopyAvailable,
)
from biblio.domain.value_objects import Isbn


@dataclass(kw_only=True, eq=False)
class Entity:
    id: UUID

    def __eq__(self, other: object) -> bool:
        return isinstance(other, Entity) and type(other) is type(self) and other.id == self.id

    def __hash__(self) -> int:
        return hash(self.id)
`}
${callout('java', 'equals/hashCode des entités JPA', `<p>C'est le même débat qu'avec les entités JPA ou EF Core : pour une entité, l'égalité porte sur l'identifiant. Ici l'<code>id</code> (UUID) est généré <strong>par le domaine</strong> à la création, pas par la base. L'entité est donc identifiable avant même d'être persistée.</p>`)}

<h2>Book : protéger le stock d'exemplaires</h2>
${py.file('src/biblio/domain/entities.py (2/4)')`
def _require_text(value: str, field_name: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise InvalidValue(f"Le champ '{field_name}' ne peut pas être vide")
    return cleaned


@dataclass(kw_only=True, eq=False)
class Book(Entity):
    isbn: Isbn
    title: str
    author: str
    total_copies: int
    available_copies: int

    @classmethod
    def create(cls, *, isbn: Isbn, title: str, author: str, copies: int = 1) -> Self:
        """Fabrique : seul point d'entrée pour un NOUVEAU livre."""
        if copies < 1:
            raise InvalidValue("Un livre doit avoir au moins un exemplaire")
        return cls(
            id=uuid4(),
            isbn=isbn,
            title=_require_text(title, "title"),
            author=_require_text(author, "author"),
            total_copies=copies,
            available_copies=copies,
        )

    @property
    def is_available(self) -> bool:
        return self.available_copies > 0

    def lend(self) -> None:
        if not self.is_available:
            raise NoCopyAvailable(self.id)
        self.available_copies -= 1

    def give_back(self) -> None:
        if self.available_copies >= self.total_copies:
            raise BusinessRuleViolation(f"Tous les exemplaires du livre {self.id} sont déjà en rayon")
        self.available_copies += 1

    def rename(self, *, title: str | None = None, author: str | None = None) -> None:
        if title is not None:
            self.title = _require_text(title, "title")
        if author is not None:
            self.author = _require_text(author, "author")
`}
${callout('info', 'Fabrique vs constructeur', `<p><code>Book.create(...)</code> applique les règles de <strong>création</strong> (stock initial = total). Le constructeur brut <code>Book(...)</code> sert à la <strong>reconstitution</strong> depuis la base, par les mappers de l'infrastructure : l'objet a déjà été validé lors de sa création.</p>`)}

<h2>Member : la limite d'emprunts</h2>
${py.file('src/biblio/domain/entities.py (3/4)')`
@dataclass(kw_only=True, eq=False)
class Member(Entity):
    MAX_ACTIVE_LOANS: ClassVar[int] = 3

    full_name: str
    email: str

    @classmethod
    def register(cls, *, full_name: str, email: str) -> Self:
        normalized_email = email.strip().lower()
        if "@" not in normalized_email:
            raise InvalidValue(f"E-mail invalide : {email!r}")
        return cls(id=uuid4(), full_name=_require_text(full_name, "full_name"), email=normalized_email)

    def ensure_can_borrow(self, active_loans: int) -> None:
        if active_loans >= self.MAX_ACTIVE_LOANS:
            raise LoanLimitReached(self.id, self.MAX_ACTIVE_LOANS)
`}
<p><code>ClassVar</code> indique à la dataclass que <code>MAX_ACTIVE_LOANS</code> est une constante de classe, et pas un champ du constructeur.</p>

<h2>Loan : durée, retour, retard</h2>
${py.file('src/biblio/domain/entities.py (4/4)')`
@dataclass(kw_only=True, eq=False)
class Loan(Entity):
    DURATION: ClassVar[timedelta] = timedelta(days=21)

    book_id: UUID
    member_id: UUID
    borrowed_at: datetime
    due_at: datetime
    returned_at: datetime | None = None

    @classmethod
    def start(cls, *, book_id: UUID, member_id: UUID, now: datetime) -> Self:
        return cls(id=uuid4(), book_id=book_id, member_id=member_id, borrowed_at=now, due_at=now + cls.DURATION)

    @property
    def is_active(self) -> bool:
        return self.returned_at is None

    def close(self, *, now: datetime) -> None:
        if not self.is_active:
            raise LoanAlreadyReturned(self.id)
        self.returned_at = now

    def is_overdue(self, now: datetime) -> bool:
        return self.is_active and now > self.due_at
`}
${callout('clean', 'Le temps est une dépendance', `<p>Aucune méthode n'appelle <code>datetime.now()</code> : l'instant présent est toujours <strong>passé en argument</strong>. Le domaine devient 100 % déterministe, et on teste un retard de 22 jours sans attendre 22 jours. L'application fournira cet instant via un port <code>Clock</code>.</p>`)}

<h2>Pourquoi un modèle riche ?</h2>
<p>Comparons deux façons d'écrire l'emprunt :</p>
${py`
# ❌ Modèle anémique : la règle est dans un service, n'importe qui peut la contourner
if book.available_copies > 0:
    book.available_copies -= 1

# ✅ Modèle riche : l'entité protège son invariant, impossible d'avoir un stock négatif
book.lend()
`}
<p>Avec un modèle anémique, chaque nouveau use case (import en masse, réservation…) devrait réimplémenter la règle, avec le risque de l'oublier. Le modèle riche la place à un seul endroit, garanti.</p>

${callout('fil', 'État du fil rouge', `<p>Le domaine est complet et ne dépend que de la bibliothèque standard. Lance <code>uv run lint-imports</code> : le contrat <em>forbidden</em> passe. Tu peux déjà jouer avec dans <code>uv run python</code>.</p>`)}
`,
  exercise: {
    title: 'Gérer le nombre d\'exemplaires',
    statement: `
<p>La médiathèque achète ou retire des exemplaires. Ajoute à <code>Book</code> :</p>
<ul>
  <li><code>add_copies(count: int)</code> : <code>count</code> doit être ≥ 1 ;</li>
  <li><code>remove_copies(count: int)</code> : impossible de retirer des exemplaires actuellement empruntés, et il doit toujours en rester au moins un.</li>
</ul>
<p>Écris ensuite <code>tests/unit/domain/test_book.py</code>, avec au moins 4 tests, et lance <code>uv run pytest</code>.</p>`,
    hints: [
      "On ne peut retirer que des exemplaires <em>disponibles</em> : <code>count &lt;= available_copies</code>.",
      "<code>pytest.raises(NoCopyAvailable)</code> s'utilise comme context manager : <code>with pytest.raises(...): ...</code>.",
    ],
    solution: `
${py.file('src/biblio/domain/entities.py (Book)')`
    def add_copies(self, count: int) -> None:
        if count < 1:
            raise InvalidValue("Le nombre d'exemplaires à ajouter doit être positif")
        self.total_copies += count
        self.available_copies += count

    def remove_copies(self, count: int) -> None:
        if count < 1:
            raise InvalidValue("Le nombre d'exemplaires à retirer doit être positif")
        if count > self.available_copies:
            raise BusinessRuleViolation("Impossible de retirer des exemplaires actuellement empruntés")
        if self.total_copies - count < 1:
            raise BusinessRuleViolation("Un livre doit conserver au moins un exemplaire")
        self.total_copies -= count
        self.available_copies -= count
`}
${py.file('tests/unit/domain/test_book.py')`
import pytest

from biblio.domain.entities import Book
from biblio.domain.exceptions import BusinessRuleViolation, InvalidValue, NoCopyAvailable
from biblio.domain.value_objects import Isbn


def make_book(copies: int = 1) -> Book:
    return Book.create(isbn=Isbn("9780134494166"), title="Clean Architecture", author="Robert C. Martin", copies=copies)


def test_lend_decrements_available_copies() -> None:
    book = make_book(copies=2)
    book.lend()
    assert book.available_copies == 1


def test_lend_without_available_copy_raises() -> None:
    book = make_book()
    book.lend()
    with pytest.raises(NoCopyAvailable):
        book.lend()


def test_add_copies_increases_total_and_available() -> None:
    book = make_book()
    book.add_copies(2)
    assert (book.total_copies, book.available_copies) == (3, 3)


def test_cannot_remove_borrowed_copies() -> None:
    book = make_book(copies=2)
    book.lend()
    with pytest.raises(BusinessRuleViolation):
        book.remove_copies(2)


def test_must_keep_at_least_one_copy() -> None:
    with pytest.raises(BusinessRuleViolation):
        make_book(copies=2).remove_copies(2)


@pytest.mark.parametrize("count", [0, -1])
def test_add_copies_rejects_non_positive(count: int) -> None:
    with pytest.raises(InvalidValue):
        make_book().add_copies(count)
`}`,
  },
  quiz: [
    {
      q: "Quelle est la différence essentielle entre une entité et un value object ?",
      options: [
        "L'entité est stockée en base, pas le value object",
        "L'entité a une identité qui perdure malgré les changements ; le value object est défini par sa valeur et il est immuable",
        "Le value object a toujours un id",
        'Aucune, ce sont deux noms pour la même chose',
      ],
      answer: 1,
      explain: "<code>Book</code> reste le même livre si son titre change (même <code>id</code>). Deux <code>Isbn(\"978...\")</code> égaux sont interchangeables.",
    },
    {
      q: 'Pourquoi déclarer les entités avec <code>@dataclass(eq=False)</code> ?',
      options: [
        'Pour améliorer les performances',
        "Pour que la dataclass ne génère pas une égalité sur tous les champs, et conserver l'égalité par id définie dans <code>Entity</code>",
        'Pour rendre les entités immuables',
        "Parce que les UUID ne sont pas comparables",
      ],
      answer: 1,
      explain: "Avec <code>eq=True</code> (le défaut), deux états différents d'un même livre seraient considérés comme différents, et <code>__hash__</code> serait mis à <code>None</code>.",
    },
    {
      q: 'Où doit être vérifiée la somme de contrôle de l\'ISBN ?',
      options: ['Dans la route', 'Dans le value object <code>Isbn</code> du domaine', 'Dans le repository', 'Dans une contrainte CHECK SQL uniquement'],
      answer: 1,
      explain: "Un value object toujours valide garantit qu'un <code>Isbn</code> existant est correct, quel que soit le point d'entrée.",
    },
    {
      q: "Qu'appelle-t-on un modèle anémique ?",
      options: [
        'Un modèle sans clé primaire',
        'Des entités réduites à des sacs de données (getters/setters), dont toute la logique vit dans des services',
        'Un modèle avec peu de champs',
        'Un modèle non persisté',
      ],
      answer: 1,
      explain: "Martin Fowler le décrit comme un anti-pattern : les invariants sont dispersés et faciles à contourner. <code>book.lend()</code> les centralise.",
    },
    {
      q: "Pourquoi <code>Loan.start()</code> reçoit-il <code>now</code> en paramètre au lieu d'appeler <code>datetime.now()</code> ?",
      options: [
        'Parce que <code>datetime.now()</code> est déprécié',
        "Pour rendre le domaine déterministe et testable : l'instant courant devient une dépendance injectable",
        'Pour éviter les problèmes de fuseau horaire uniquement',
        "C'est une contrainte de SQLAlchemy",
      ],
      answer: 1,
      explain: "C'est le même principe que l'injection d'un <code>Clock</code> (Java) ou d'un <code>TimeProvider</code> (.NET 8). Les tests fixent le temps.",
    },
  ],
});
