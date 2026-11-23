registerChapter({
  id: 'ch06',
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
${explain([
  [`class DomainError(Exception):
    """Racine de toutes les erreurs métier."""`, `La classe racine de nos erreurs. La docstring suffit comme corps : pas besoin de <code>pass</code>.`],
  [`class InvalidIsbn(InvalidValue):`, `Une hiérarchie d'exceptions : <code>InvalidIsbn</code> est une <code>InvalidValue</code>, qui est une <code>DomainError</code>. Un <code>except DomainError</code> attrapera donc les trois.`],
  [`super().__init__(f"ISBN-13 invalide : {raw!r}")`, `Transmet le message au constructeur d'<code>Exception</code>. Le <code>!r</code> affiche la valeur entre guillemets, ce qui rend visibles d'éventuels espaces.`],
  [`self.raw = raw`, `Conserve la valeur fautive dans un attribut, pour que le code qui attrape l'exception puisse l'exploiter.`],
  [`entity_name = "Ressource"`, `Un <strong>attribut de classe</strong>, déclaré directement dans le corps de la classe et non dans <code>__init__</code>. Chaque sous-classe le redéfinit (<code>entity_name = "Livre"</code>).`],
  [`def __init__(self, entity_id: object) -> None:`, `<code>object</code> accepte n'importe quel type d'identifiant.`],
  [`f"{self.entity_name} {entity_id} introuvable"`, `<code>self.entity_name</code> lit l'attribut de la classe <strong>réelle</strong> de l'objet. Pour un <code>BookNotFound</code>, le message est donc « Livre … introuvable » : un polymorphisme sans réécrire le constructeur.`],
  [`class BookNotFound(NotFoundError):
    entity_name = "Livre"`, `Toute la sous-classe tient en une ligne : elle hérite du constructeur et ne change que le libellé.`],
])}
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
${explain([
  [`_ISBN13_LENGTH = 13`, `Une constante privée au module (<code>_</code> initial), qui évite un « nombre magique ».`],
  [`@dataclass(frozen=True, slots=True)
class Isbn:`, `Un <strong>value object</strong> : immuable (<code>frozen</code>) et comparé par valeur (le <code>__eq__</code> est généré).`],
  [`value: str`, `L'unique champ. Le constructeur généré est <code>Isbn(value)</code>.`],
  [`normalized = self.value.replace("-", "").replace(" ", "")`, `Retire tirets et espaces, pour obtenir les 13 chiffres seuls.`],
  [`if not _has_valid_checksum(normalized):`, `Appelle la fonction de vérification définie plus bas dans le fichier. C'est possible car elle n'est appelée qu'à l'exécution, quand tout le module a déjà été chargé.`],
  [`object.__setattr__(self, "value", normalized)`, `L'objet est <code>frozen</code> : <code>self.value = …</code> lèverait une erreur. On contourne volontairement la protection, une seule fois, au moment de la construction, pour stocker la forme normalisée.`],
  [`def __str__(self) -> str:`, `<code>str(isbn)</code> ou <code>f"{isbn}"</code> affichent les 13 chiffres.`],
  [`if len(digits) != _ISBN13_LENGTH or not digits.isdigit():`, `Si la longueur est mauvaise <strong>ou</strong> si la chaîne contient autre chose que des chiffres, l'ISBN est invalide.`],
  [`sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(digits[:12]))`, `On lit de l'intérieur vers l'extérieur. <code>digits[:12]</code> prend les 12 premiers chiffres, et <code>enumerate</code> donne <code>(indice, chiffre)</code>. Chaque chiffre est multiplié par 1 aux positions paires et par 3 aux positions impaires (ternaire <code>a if cond else b</code>). <code>sum(…)</code> additionne le tout. L'expression <code>(… for …)</code> sans crochets est un <strong>générateur</strong> : une compréhension évaluée à la volée.`],
  [`check_digit = (10 - weighted_sum % 10) % 10`, `La formule de la clé de contrôle ISBN-13. <code>%</code> est le modulo.`],
  [`return check_digit == int(digits[12])`, `Compare la clé calculée au 13e chiffre (indice 12) et renvoie <code>True</code> ou <code>False</code>.`],
])}
${py`
>>> Isbn("978-0-13-449416-6")
Isbn(value='9780134494166')
>>> Isbn("978-0-13-449416-6") == Isbn("9780134494166")
True
>>> Isbn("9780134494167")
biblio.domain.exceptions.InvalidIsbn: ISBN-13 invalide : '9780134494167'
`}
<p>Les lignes qui commencent par <code>&gt;&gt;&gt;</code> sont tapées dans la console interactive (<code>uv run python</code>). Les autres sont les réponses de Python.</p>

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
${explain([
  [`from biblio.domain.exceptions import (
    BusinessRuleViolation,
    ...
)`, `Les parenthèses permettent d'écrire un import <strong>sur plusieurs lignes</strong>, un nom par ligne.`],
  [`@dataclass(kw_only=True, eq=False)`, `<code>kw_only=True</code> oblige à construire avec des arguments nommés (<code>Book(id=…, title=…)</code>), ce qui est indispensable quand il y a beaucoup de champs. <code>eq=False</code> : on écrit nous-mêmes <code>__eq__</code>.`],
  [`id: UUID`, `Le champ commun à toutes les entités. Les sous-classes ajouteront les leurs.`],
  [`def __eq__(self, other: object) -> bool:`, `Redéfinit <code>==</code>. <code>other</code> peut être n'importe quoi, d'où le type <code>object</code>.`],
  [`isinstance(other, Entity) and type(other) is type(self) and other.id == self.id`, `Égaux si l'autre est une entité, <strong>de la même classe exacte</strong>, avec le même id. Grâce au court-circuit de <code>and</code>, <code>other.id</code> n'est lu que si les deux premiers tests passent.`],
  [`def __hash__(self) -> int:
    return hash(self.id)`, `Si l'on redéfinit <code>__eq__</code>, il faut aussi un <code>__hash__</code> cohérent pour pouvoir ranger l'entité dans un <code>set</code> ou l'utiliser comme clé de <code>dict</code>. C'est la même règle que <code>equals</code>/<code>hashCode</code>.`],
])}
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
${explain([
  [`def _require_text(value: str, field_name: str) -> str:`, `Une fonction utilitaire <strong>privée au module</strong> (<code>_</code>), hors de toute classe : elle valide qu'un texte n'est pas vide et renvoie sa version nettoyée.`],
  [`class Book(Entity):`, `<code>Book</code> hérite d'<code>Entity</code>, donc de son champ <code>id</code> et de son égalité par identifiant.`],
  [`isbn: Isbn`, `Le champ est typé avec notre value object : impossible d'y mettre une chaîne non validée sans que mypy le signale.`],
  [`@classmethod
def create(cls, *, isbn: Isbn, ...) -> Self:`, `La <strong>fabrique</strong> (méthode de classe). Le <code>*</code> impose d'appeler <code>Book.create(isbn=…, title=…)</code> avec des noms. <code>-&gt; Self</code> : elle renvoie un <code>Book</code>.`],
  [`return cls(
    id=uuid4(),
    ...
)`, `<code>cls(…)</code> appelle le constructeur généré par la dataclass. L'identifiant est généré ici, par le domaine.`],
  [`@property
def is_available(self) -> bool:`, `Attribut calculé : on écrit <code>book.is_available</code>, sans parenthèses.`],
  [`def lend(self) -> None:`, `Une méthode métier qui <strong>modifie</strong> l'objet (l'entité est mutable, contrairement au value object) après avoir vérifié la règle.`],
  [`raise NoCopyAvailable(self.id)`, `Si la règle est violée, l'exception interrompt la méthode : le stock n'est jamais décrémenté.`],
  [`def rename(self, *, title: str | None = None, author: str | None = None) -> None:`, `Deux paramètres facultatifs et nommés : <code>book.rename(title="…")</code> ne change que le titre.`],
  [`if title is not None:`, `On ne met à jour que ce qui a été fourni.`],
])}
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
${explain([
  [`MAX_ACTIVE_LOANS: ClassVar[int] = 3`, `Une constante <strong>de classe</strong>, partagée par tous les adhérents (≈ <code>static final</code>). <code>ClassVar</code> empêche la dataclass d'en faire un paramètre du constructeur.`],
  [`normalized_email = email.strip().lower()`, `Retire les espaces et passe en minuscules.`],
  [`if "@" not in normalized_email:`, `<code>not in</code> : la chaîne ne contient pas d'arobase.`],
  [`def ensure_can_borrow(self, active_loans: int) -> None:`, `La règle « 3 emprunts maximum ». Le nombre d'emprunts en cours est <strong>fourni par l'appelant</strong>, car l'entité n'a pas accès à la base.`],
  [`self.MAX_ACTIVE_LOANS`, `On lit l'attribut de classe via l'instance (<code>self</code>), ce qui est permis.`],
])}
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
${explain([
  [`DURATION: ClassVar[timedelta] = timedelta(days=21)`, `Une durée de 21 jours, constante de classe.`],
  [`returned_at: datetime | None = None`, `Facultatif : <code>None</code> tant que le livre n'est pas rendu. Dans une dataclass, les champs avec valeur par défaut se placent en dernier.`],
  [`def start(cls, *, book_id: UUID, member_id: UUID, now: datetime) -> Self:`, `Fabrique d'un nouvel emprunt. Le « maintenant » est un <strong>paramètre</strong>, pour que le code reste testable.`],
  [`due_at=now + cls.DURATION`, `Une date plus une durée donne une nouvelle date : la date d'échéance.`],
  [`return self.returned_at is None`, `L'emprunt est actif s'il n'a pas de date de retour.`],
  [`def close(self, *, now: datetime) -> None:`, `Clôture l'emprunt, en refusant un double retour.`],
  [`return self.is_active and now > self.due_at`, `En retard = toujours actif <strong>et</strong> échéance dépassée.`],
])}
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
`}
${explain([
  [`import pytest`, `Le framework de test. Avec pytest, pas de classe de test obligatoire : chaque fonction dont le nom commence par <code>test_</code> est un test.`],
  [`def make_book(copies: int = 1) -> Book:`, `Une petite fabrique de données de test (≈ <em>Object Mother</em>). Ce n'est pas un test : son nom ne commence pas par <code>test_</code>.`],
  [`def test_lend_decrements_available_copies() -> None:`, `Un test : une fonction sans paramètre, dont le nom décrit le comportement attendu.`],
  [`assert book.available_copies == 1`, `L'assertion. En cas d'échec, pytest affiche les deux valeurs comparées, sans avoir besoin d'<code>assertEquals</code>.`],
  [`with pytest.raises(NoCopyAvailable):
    book.lend()`, `Le test réussit si le bloc lève <strong>cette</strong> exception, et échoue sinon (≈ <code>assertThrows</code>).`],
  [`assert (book.total_copies, book.available_copies) == (3, 3)`, `Comparer deux tuples permet de vérifier plusieurs valeurs en une assertion.`],
  [`@pytest.mark.parametrize("count", [0, -1])`, `Exécute le test <strong>deux fois</strong>, avec <code>count = 0</code> puis <code>count = -1</code> (≈ <code>@ParameterizedTest</code> / <code>[Theory]</code>).`],
  [`def test_add_copies_rejects_non_positive(count: int) -> None:`, `pytest remplit le paramètre <code>count</code> avec chaque valeur de la liste.`],
])}
`,
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
