registerChapter({
  id: 'ch02',
  title: 'Python idiomatique pour Java / C#',
  subtitle: "Les 20 % de Python qui servent dans 80 % d'une API : typage, dataclasses, Protocol, exceptions, context managers et async.",
  duration: '45 min',
  objectives: [
    'Écrire du Python idiomatique et typé (PEP 8, type hints, mypy).',
    'Remplacer les records et les interfaces par <code>@dataclass</code> et <code>Protocol</code>.',
    "Comprendre <code>with</code>, <code>async</code>/<code>await</code> et les pièges de la boucle d'événements.",
  ],
  content: `
<h2>Syntaxe et conventions (PEP 8)</h2>
<p>Pas d'accolades ni de point-virgule : <strong>l'indentation est la syntaxe</strong> (4 espaces). Les conventions de nommage sont différentes de Java et de C# :</p>
${compare(['Élément', 'Python', 'Java', 'C#'], [
  ['Variables, fonctions, méthodes', '<code>snake_case</code>', '<code>camelCase</code>', '<code>camelCase</code> / <code>PascalCase</code>'],
  ['Classes', '<code>PascalCase</code>', '<code>PascalCase</code>', '<code>PascalCase</code>'],
  ['Constantes', '<code>UPPER_SNAKE</code>', '<code>UPPER_SNAKE</code>', '<code>PascalCase</code>'],
  ['Membre « privé »', '<code>_nom</code> (convention)', '<code>private</code>', '<code>private</code>'],
  ['Modules / fichiers', '<code>snake_case.py</code>', '<code>PascalCase.java</code>', '<code>PascalCase.cs</code>'],
  ['Null', '<code>None</code>', '<code>null</code>', '<code>null</code>'],
  ['Booléens', '<code>True</code> / <code>False</code>', '<code>true</code> / <code>false</code>', '<code>true</code> / <code>false</code>'],
])}

<h2>Le typage : des annotations, pas un compilateur</h2>
<p>Depuis Python 3.5, on peut annoter les types, et la syntaxe s'est beaucoup simplifiée avec les versions 3.10 à 3.12.
<strong>Python ne vérifie pas ces annotations à l'exécution.</strong> C'est le rôle de <code>mypy</code> ou de Pylance, et FastAPI et Pydantic s'en servent pour valider les données.</p>
${py`
from collections.abc import Iterable, Sequence
from typing import Final

MAX_ACTIVE_LOANS: Final = 3          # ≈ static final / const

def titles_by_author(books: Iterable["Book"], author: str) -> list[str]:
    return [book.title for book in books if book.author == author]

def find_title(titles: Sequence[str], prefix: str) -> str | None:   # ≈ Optional<String> / string?
    for title in titles:
        if title.startswith(prefix):
            return title
    return None

def count_by_author(books: Iterable["Book"]) -> dict[str, int]:     # ≈ Map<String, Integer>
    counts: dict[str, int] = {}
    for book in books:
        counts[book.author] = counts.get(book.author, 0) + 1
    return counts
`}
${explain([
  [`from collections.abc import Iterable, Sequence`, `Importe deux types abstraits de collections : <code>Iterable</code> (« parcourable avec <code>for</code> ») et <code>Sequence</code> (« liste indexable en lecture seule »). En paramètre, on demande le type <strong>le plus général</strong> dont on a besoin, comme on accepterait un <code>Iterable&lt;T&gt;</code> plutôt qu'un <code>ArrayList&lt;T&gt;</code>.`],
  [`MAX_ACTIVE_LOANS: Final = 3`, `Une constante de module. <code>Final</code> demande à mypy d'interdire toute réaffectation. Le nom en <code>MAJUSCULES</code> est la convention pour les constantes.`],
  [`books: Iterable["Book"]`, `Le type est écrit <strong>entre guillemets</strong> : c'est une <em>référence en avant</em> vers une classe <code>Book</code> pas encore définie à cet endroit du fichier. mypy la résoudra plus tard.`],
  [`return [book.title for book in books if book.author == author]`, `Une compréhension de liste : les titres des livres de l'auteur demandé.`],
  [`-> str | None:`, `Renvoie une <code>str</code> <strong>ou</strong> <code>None</code> si rien n'est trouvé. L'appelant devra gérer les deux cas, et mypy le vérifiera.`],
  [`counts: dict[str, int] = {}`, `Un dictionnaire vide, annoté « clés str → valeurs int ».`],
  [`counts[book.author] = counts.get(book.author, 0) + 1`, `<code>get(clé, 0)</code> lit le compteur actuel (0 si l'auteur n'est pas encore présent), puis on range la valeur + 1.`],
])}
${callout('java', 'LINQ et Streams → compréhensions', `
<p><code>[b.title for b in books if b.available]</code> correspond à
<code>books.stream().filter(Book::isAvailable).map(Book::getTitle).toList()</code> ou à
<code>books.Where(b =&gt; b.Available).Select(b =&gt; b.Title).ToList()</code>.
Il existe aussi les compréhensions de dictionnaire <code>{b.id: b for b in books}</code>, d'ensemble <code>{...}</code> et les générateurs paresseux <code>(... for ...)</code>.</p>`)}

<h2>Classes : self explicite, pas de modificateurs d'accès</h2>
${py`
class LibraryCard:
    """Docstring : l'équivalent de la Javadoc / des commentaires XML."""

    def __init__(self, number: str, owner: str) -> None:   # constructeur
        self.number = number          # attribut public
        self._owner = owner           # "privé" par convention uniquement

    @property
    def owner(self) -> str:           # getter sans parenthèses : card.owner
        return self._owner

    def __repr__(self) -> str:        # ≈ toString() / ToString() (pour le debug)
        return f"LibraryCard(number={self.number!r})"
`}
${explain([
  [`"""Docstring : ..."""`, `La première chaîne d'une classe est sa documentation. L'IDE l'affiche au survol.`],
  [`def __init__(self, number: str, owner: str) -> None:`, `Le constructeur. <code>self</code> est l'instance en cours de création, et les deux autres paramètres sont fournis par l'appelant : <code>LibraryCard("A-12", "Ada")</code>.`],
  [`self._owner = owner`, `Le <code>_</code> initial signale un attribut interne. Ce n'est qu'une convention : rien n'empêche techniquement d'y accéder.`],
  [`@property
def owner(self) -> str:`, `<code>@property</code> transforme la méthode en <strong>attribut en lecture seule</strong> : on écrit <code>card.owner</code> (sans parenthèses), ce qui appelle cette méthode. C'est l'équivalent d'un getter, ou d'une propriété C# <code>{ get; }</code>.`],
  [`def __repr__(self) -> str:`, `Méthode spéciale appelée pour afficher l'objet dans la console ou les logs (≈ <code>toString()</code>).`],
  [`f"LibraryCard(number={self.number!r})"`, `Dans une f-string, <code>!r</code> affiche la valeur sous sa forme « debug », avec ses guillemets : <code>LibraryCard(number='A-12')</code>.`],
])}
<p>Les méthodes « magiques » <code>__eq__</code>, <code>__hash__</code>, <code>__repr__</code> ou <code>__len__</code> correspondent à <code>equals</code>, <code>hashCode</code>, <code>toString</code>…</p>

<h2>dataclass : tes records Java / C#</h2>
<p>Écrire <code>__init__</code>, <code>__eq__</code> et <code>__repr__</code> à la main est fastidieux. Le décorateur <code>@dataclass</code> les génère pour toi :</p>
${py`
from dataclasses import dataclass, field
from datetime import date

@dataclass(frozen=True, slots=True)          # ≈ record Java / record C#
class Period:
    start: date
    end: date

    def __post_init__(self) -> None:          # ≈ constructeur compact du record
        if self.end < self.start:
            raise ValueError("end doit être postérieure à start")

    @property
    def days(self) -> int:
        return (self.end - self.start).days

@dataclass(kw_only=True)                     # mutable, arguments nommés obligatoires
class Shelf:
    code: str
    books: list[str] = field(default_factory=list)   # JAMAIS "= []" (défaut partagé !)

p = Period(start=date(2026, 1, 1), end=date(2026, 1, 22))
p.days               # 21
p == Period(date(2026, 1, 1), date(2026, 1, 22))   # True : égalité par valeur
`}
${explain([
  [`from dataclasses import dataclass, field`, `Importe le décorateur <code>dataclass</code> et la fonction <code>field</code> du module standard <code>dataclasses</code>.`],
  [`@dataclass(frozen=True, slots=True)`, `Le décorateur s'applique à la classe en dessous. <code>frozen=True</code> rend les instances <strong>immuables</strong> (toute affectation lève une erreur) et <code>slots=True</code> les rend plus compactes en mémoire.`],
  [`start: date
end: date`, `Dans une dataclass, chaque attribut <strong>annoté au niveau de la classe</strong> devient un champ. Le constructeur <code>__init__(self, start, end)</code> est généré automatiquement, dans cet ordre.`],
  [`def __post_init__(self) -> None:`, `Appelée automatiquement juste après le constructeur généré. C'est ici qu'on valide les invariants.`],
  [`raise ValueError("...")`, `Refuse une période incohérente en levant une exception. L'objet n'est alors jamais créé.`],
  [`@property
def days(self) -> int:`, `Un attribut calculé : <code>p.days</code>. Soustraire deux <code>date</code> donne un <code>timedelta</code> (une durée), dont <code>.days</code> est le nombre de jours.`],
  [`@dataclass(kw_only=True)`, `<code>kw_only=True</code> oblige à nommer les arguments : <code>Shelf(code="A1")</code>. Sans <code>frozen</code>, les instances restent modifiables.`],
  [`books: list[str] = field(default_factory=list)`, `Valeur par défaut : une liste vide <strong>neuve pour chaque instance</strong>. <code>default_factory=list</code> veut dire « appelle <code>list()</code> pour fabriquer la valeur ».`],
  [`p = Period(start=date(2026, 1, 1), end=date(2026, 1, 22))`, `<code>date(année, mois, jour)</code> crée une date. On crée la période avec des arguments nommés.`],
  [`p == Period(...)`, `<code>==</code> compare <strong>champ par champ</strong> grâce au <code>__eq__</code> généré : deux périodes identiques sont égales, comme deux <code>record</code>.`],
])}
${callout('warn', 'Piège classique : les valeurs par défaut mutables', `
<p>En Python, une valeur par défaut est évaluée <strong>une seule fois</strong>, à la définition. <code>def f(items=[])</code> partage donc la même liste entre tous les appels.
Utilise <code>None</code> ou <code>field(default_factory=list)</code>.</p>`)}

<h2>Interfaces : Protocol (typage structurel)</h2>
<p>Python a deux façons d'exprimer un contrat :</p>
<ul>
  <li><code>abc.ABC</code> + <code>@abstractmethod</code> : héritage <strong>nominal</strong>, proche de la classe abstraite Java.</li>
  <li><code>typing.Protocol</code> : typage <strong>structurel</strong> (« duck typing » vérifié statiquement). Une classe respecte le protocole si elle a les bonnes méthodes, <em>sans en hériter</em>, comme les interfaces de Go.</li>
</ul>
${py`
from typing import Protocol

class Notifier(Protocol):                     # ≈ interface Notifier
    def send(self, to: str, message: str) -> None: ...

class SmtpNotifier:                           # n'hérite de rien !
    def send(self, to: str, message: str) -> None:
        print(f"SMTP -> {to}: {message}")

def remind_overdue(notifier: Notifier, email: str) -> None:
    notifier.send(email, "Votre emprunt est en retard")

remind_overdue(SmtpNotifier(), "alice@example.org")   # mypy valide la conformité
`}
${explain([
  [`class Notifier(Protocol):`, `On déclare un <strong>contrat</strong> en héritant de <code>Protocol</code>. La classe ne sera jamais instanciée : elle décrit seulement des méthodes attendues.`],
  [`def send(self, to: str, message: str) -> None: ...`, `La signature attendue. Le corps <code>...</code> (Ellipsis) veut dire « pas d'implémentation ici », comme une méthode d'interface sans corps.`],
  [`class SmtpNotifier:`, `Aucun <code>implements</code> ni héritage : la classe est conforme simplement parce qu'elle possède une méthode <code>send</code> de même signature.`],
  [`def remind_overdue(notifier: Notifier, email: str) -> None:`, `La fonction dépend de l'<strong>abstraction</strong> <code>Notifier</code>, pas d'une implémentation concrète. C'est l'inversion de dépendances.`],
  [`remind_overdue(SmtpNotifier(), "alice@example.org")`, `<code>SmtpNotifier()</code> crée une instance (sans <code>new</code>). mypy vérifie qu'elle respecte bien le protocole.`],
])}
<p>Dans la Clean Architecture, ce sera notre outil pour définir les <strong>ports</strong> (interfaces de repository, d'horloge, de hachage…) côté application.
L'infrastructure les implémente sans même importer le protocole.</p>

<h2>Enums</h2>
${py`
from enum import StrEnum

class Role(StrEnum):                  # chaque membre EST une str
    LIBRARIAN = "librarian"
    ADMIN = "admin"

Role("admin") is Role.ADMIN           # True
Role.ADMIN == "admin"                 # True : pratique pour JSON et base de données
`}
${explain([
  [`class Role(StrEnum):`, `Une énumération dont les membres sont aussi des chaînes. On la déclare comme une classe.`],
  [`LIBRARIAN = "librarian"`, `Chaque membre est un attribut de classe : <code>Role.LIBRARIAN</code>, dont la valeur est <code>"librarian"</code>.`],
  [`Role("admin") is Role.ADMIN`, `Appeler l'enum avec une valeur retrouve le membre correspondant (≈ <code>Role.valueOf</code>). <code>is</code> vérifie qu'il s'agit bien du même objet unique.`],
])}

<h2>Exceptions</h2>
<p>Pas d'exceptions <em>checked</em> : tout est <em>unchecked</em>. On crée une hiérarchie métier en héritant d'<code>Exception</code> :</p>
${py`
class DomainError(Exception):
    """Racine des erreurs métier."""

class NoCopyAvailable(DomainError):
    def __init__(self, isbn: str) -> None:
        super().__init__(f"Aucun exemplaire disponible pour {isbn}")
        self.isbn = isbn

try:
    raise NoCopyAvailable("9780134494166")
except NoCopyAvailable as exc:        # ≈ catch (NoCopyAvailable exc)
    print(exc, exc.isbn)
except DomainError:
    ...
else:                                 # exécuté si aucune exception
    ...
finally:
    ...

# Chaîner la cause (≈ new XxxException(msg, cause)) :
try:
    int("abc")
except ValueError as exc:
    raise DomainError("Format invalide") from exc
`}
${explain([
  [`class DomainError(Exception):`, `Une exception est une classe qui hérite d'<code>Exception</code>.`],
  [`"""Racine des erreurs métier."""`, `Ici, la docstring <strong>sert de corps</strong> : une classe sans rien d'autre est valide, et on n'a pas besoin d'écrire <code>pass</code>.`],
  [`super().__init__(f"Aucun exemplaire disponible pour {isbn}")`, `On appelle le constructeur d'<code>Exception</code> avec le message, puis on mémorise l'ISBN dans un attribut pour le retrouver plus tard.`],
  [`except NoCopyAvailable as exc:`, `Attrape cette exception précise et la nomme <code>exc</code>. Les blocs <code>except</code> sont testés dans l'ordre, du plus spécifique au plus général.`],
  [`...`, `Ici, <code>...</code> sert de « bloc vide » à compléter.`],
  [`else:`, `Après un <code>try</code>, le <code>else</code> s'exécute seulement si <strong>aucune</strong> exception n'a été levée.`],
  [`raise DomainError("Format invalide") from exc`, `Lève une nouvelle exception en conservant l'originale comme <strong>cause</strong>. La trace affichera les deux.`],
])}

<h2>Context managers : with ≈ try-with-resources / using</h2>
${py`
with open("catalogue.csv", encoding="utf-8") as file:   # fermé automatiquement
    header = file.readline()

# Créer le sien : __enter__/__exit__ (ou __aenter__/__aexit__ en async)
from contextlib import contextmanager
from collections.abc import Iterator

@contextmanager
def timer(label: str) -> Iterator[None]:
    import time
    start = time.perf_counter()
    try:
        yield                                   # le bloc "with" s'exécute ici
    finally:
        print(f"{label}: {time.perf_counter() - start:.3f}s")
`}
${explain([
  [`with open("catalogue.csv", encoding="utf-8") as file:`, `<code>open</code> ouvre le fichier, <code>as file</code> le nomme dans le bloc, et le fichier est <strong>fermé automatiquement</strong> à la sortie du bloc, même en cas d'exception.`],
  [`@contextmanager
def timer(label: str) -> Iterator[None]:`, `Transforme une fonction génératrice en context manager utilisable avec <code>with timer("x"):</code>.`],
  [`import time`, `Un import peut être placé dans une fonction, mais la convention est de le mettre en haut du fichier.`],
  [`yield`, `Point de pause : le code <strong>avant</strong> <code>yield</code> s'exécute à l'entrée du <code>with</code>, le bloc <code>with</code> s'exécute, puis le code <strong>après</strong> (ici dans <code>finally</code>) s'exécute à la sortie.`],
  [`{time.perf_counter() - start:.3f}`, `<code>:.3f</code> formate le nombre avec 3 décimales.`],
])}
<p>Notre <strong>Unit of Work</strong> sera un context manager asynchrone : <code>async with uow: ...</code> ouvre une session et une transaction, puis libère la connexion.</p>

<h2>Modules, packages et imports</h2>
<p>Un fichier <code>.py</code> est un <strong>module</strong>. Un dossier contenant un <code>__init__.py</code> est un <strong>package</strong>, l'équivalent d'un package Java ou d'un namespace C#. On importe des noms, pas des fichiers :</p>
${py`
# src/biblio/application/use_cases/loans.py
from biblio.domain.entities import Book, Loan       # import absolu : recommandé
from biblio.domain.exceptions import BookNotFound
`}
${explain([
  [`from biblio.domain.entities import Book, Loan`, `Importe les classes <code>Book</code> et <code>Loan</code> du fichier <code>src/biblio/domain/entities.py</code>. Plusieurs noms se séparent par des virgules.`],
])}
${callout('clean', 'Règles de base', `
<ul>
  <li>Une responsabilité par module, comme une classe en Java. Pas de fichiers <code>utils.py</code> fourre-tout.</li>
  <li>Imports absolus, triés automatiquement par Ruff (règle <code>I</code>).</li>
  <li>Pas de logique à l'import (pas de connexion DB au niveau module), sauf dans le <em>composition root</em>.</li>
</ul>`)}

<h2>async / await : comme en C#, avec une boucle d'événements</h2>
<p>La syntaxe ressemble beaucoup à C# : <code>async def</code> déclare une <strong>coroutine</strong> et <code>await</code> suspend son exécution sans bloquer le thread.
La différence importante : tout tourne sur <strong>une seule boucle d'événements</strong> (<code>asyncio</code>), sur un seul thread.</p>
${py`
import asyncio

async def fetch_cover(isbn: str) -> bytes:
    await asyncio.sleep(0.2)          # I/O simulée : rend la main à la boucle
    return b"..."

async def fetch_all(isbns: list[str]) -> list[bytes]:
    # ≈ Task.WhenAll / CompletableFuture.allOf
    return await asyncio.gather(*(fetch_cover(i) for i in isbns))

asyncio.run(fetch_all(["9780134494166", "9780132350884"]))
`}
${explain([
  [`async def fetch_cover(isbn: str) -> bytes:`, `Déclare une <strong>coroutine</strong>. L'appeler (<code>fetch_cover("…")</code>) ne lance rien tout de suite : on obtient un objet qu'il faut <code>await</code>er, comme une <code>Task</code>.`],
  [`await asyncio.sleep(0.2)`, `Attend 0,2 s <strong>sans bloquer</strong> : pendant ce temps, la boucle d'événements exécute d'autres coroutines.`],
  [`return b"..."`, `<code>b"…"</code> est une valeur <code>bytes</code> (des octets bruts).`],
  [`await asyncio.gather(*(fetch_cover(i) for i in isbns))`, `<code>(fetch_cover(i) for i in isbns)</code> fabrique une coroutine par ISBN. L'étoile <code>*</code> les passe comme arguments séparés à <code>gather</code>, qui les exécute <strong>en parallèle</strong> et renvoie la liste des résultats.`],
  [`asyncio.run(fetch_all([...]))`, `Point d'entrée d'un programme asynchrone : démarre la boucle d'événements et exécute la coroutine. FastAPI le fait pour toi, tu n'appelleras jamais <code>asyncio.run</code> dans l'API.`],
])}
${callout('warn', "Ne jamais bloquer la boucle d'événements", `
<p>Dans une fonction <code>async def</code>, un appel bloquant comme <code>time.sleep()</code>, <code>requests.get()</code> ou un driver SQL synchrone <strong>gèle tout le serveur</strong>,
pas seulement la requête en cours. Utilise des bibliothèques asynchrones (<code>httpx</code>, <code>asyncpg</code>/<code>aiosqlite</code>, SQLAlchemy async). Pour du code bloquant
inévitable, déclare l'endpoint avec <code>def</code> (FastAPI l'exécutera dans un pool de threads) ou passe par <code>await asyncio.to_thread(fn)</code>.</p>`)}

<h2>Mémo de correspondance</h2>
${compare(['Python', 'Java', 'C#'], [
  ['<code>@dataclass(frozen=True)</code>', '<code>record</code>', '<code>record</code>'],
  ['<code>typing.Protocol</code>', '<code>interface</code> (mais structurel)', '<code>interface</code> (mais structurel)'],
  ['<code>abc.ABC</code>', '<code>abstract class</code>', '<code>abstract class</code>'],
  ['<code>X | None</code>', '<code>Optional&lt;X&gt;</code> / <code>@Nullable</code>', '<code>X?</code>'],
  ['<code>list[X]</code>, <code>dict[K, V]</code>', '<code>List&lt;X&gt;</code>, <code>Map&lt;K,V&gt;</code>', '<code>List&lt;X&gt;</code>, <code>Dictionary&lt;K,V&gt;</code>'],
  ['<code>with</code> / <code>async with</code>', 'try-with-resources', '<code>using</code> / <code>await using</code>'],
  ['décorateur <code>@xxx</code>', 'annotation (mais c\'est une fonction qui enveloppe)', 'attribut (idem)'],
  ['<code>@property</code>', 'getter', 'propriété <code>{ get; }</code>'],
  ['<code>@classmethod</code> (fabrique)', 'méthode <code>static</code> de fabrique', 'méthode <code>static</code> de fabrique'],
  ['<code>raise ... from exc</code>', 'cause d\'exception', '<code>InnerException</code>'],
])}
`,
  exercise: {
    title: 'Un premier value object Period',
    statement: `
<p>Dans un fichier jetable <code>scratch.py</code>, écris une dataclass immuable <code>LoanPeriod</code> avec :</p>
<ul>
  <li>deux champs <code>borrowed_on: date</code> et <code>due_on: date</code> ;</li>
  <li>une fabrique <code>LoanPeriod.starting(on: date, days: int = 21)</code> ;</li>
  <li>une méthode <code>is_overdue(self, today: date) -&gt; bool</code> ;</li>
  <li>une validation qui refuse <code>due_on &lt; borrowed_on</code>.</li>
</ul>
<p>Vérifie le typage avec <code>uv run mypy --strict scratch.py</code>.</p>`,
    hints: [
      'Utilise <code>@dataclass(frozen=True, slots=True)</code> et <code>__post_init__</code>.',
      "Une fabrique se déclare avec <code>@classmethod</code> et retourne <code>Self</code> (module <code>typing</code>).",
    ],
    solution: `
${py.file('scratch.py')`
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Self

@dataclass(frozen=True, slots=True)
class LoanPeriod:
    borrowed_on: date
    due_on: date

    def __post_init__(self) -> None:
        if self.due_on < self.borrowed_on:
            raise ValueError("La date de retour doit suivre la date d'emprunt")

    @classmethod
    def starting(cls, on: date, days: int = 21) -> Self:
        return cls(borrowed_on=on, due_on=on + timedelta(days=days))

    def is_overdue(self, today: date) -> bool:
        return today > self.due_on

period = LoanPeriod.starting(date(2026, 1, 1))
assert period.due_on == date(2026, 1, 22)
assert period.is_overdue(date(2026, 1, 23))
`}
${explain([
  [`from typing import Self`, `<code>Self</code> désigne « le type de la classe courante » dans une annotation.`],
  [`@classmethod
def starting(cls, on: date, days: int = 21) -> Self:`, `Une <strong>méthode de classe</strong>, l'équivalent d'une fabrique <code>static</code>. Elle reçoit la classe dans <code>cls</code>, et non une instance. On l'appelle sur la classe : <code>LoanPeriod.starting(date(…))</code>.`],
  [`return cls(borrowed_on=on, due_on=on + timedelta(days=days))`, `<code>cls(…)</code> crée une instance (≈ <code>new LoanPeriod(…)</code>). Ajouter un <code>timedelta</code> à une date donne une nouvelle date.`],
  [`assert period.due_on == date(2026, 1, 22)`, `<code>assert</code> vérifie une condition et lève <code>AssertionError</code> si elle est fausse. Pratique pour tester rapidement, et c'est aussi ainsi qu'on écrit les tests pytest.`],
])}
<p>Remarque : <code>today</code> est passé <strong>en paramètre</strong> plutôt que lu avec <code>date.today()</code>. Cela rend la méthode déterministe et testable. On réutilisera ce principe avec un port <code>Clock</code>.</p>`,
  },
  quiz: [
    {
      q: "Python vérifie-t-il les annotations de type à l'exécution ?",
      options: [
        'Oui, une erreur est levée si le type ne correspond pas',
        'Non : elles sont exploitées par les outils (mypy, IDE) et par des bibliothèques comme Pydantic/FastAPI',
        'Seulement en mode debug',
        "Seulement pour les types primitifs",
      ],
      answer: 1,
      explain: "L'interpréteur ignore les annotations. C'est mypy ou Pylance qui joue le rôle du compilateur, et Pydantic qui valide explicitement les données à la frontière HTTP.",
    },
    {
      q: "Quel est l'équivalent le plus proche d'un <code>record</code> Java/C# ?",
      options: ['<code>@dataclass(frozen=True)</code>', '<code>typing.Protocol</code>', '<code>dict</code>', '<code>@property</code>'],
      answer: 0,
      explain: 'Une dataclass gelée génère constructeur, égalité par valeur, <code>repr</code> et <code>hash</code>, et interdit la réaffectation des champs.',
    },
    {
      q: "Une classe <code>SmtpNotifier</code> possède la méthode <code>send(to, message)</code> mais n'hérite pas de <code>Notifier(Protocol)</code>. Peut-on la passer là où un <code>Notifier</code> est attendu ?",
      options: [
        'Non, il faut écrire <code>class SmtpNotifier(Notifier)</code>',
        "Oui : Protocol est structurel, seule la forme (méthodes et signatures) compte",
        'Oui, mais uniquement à l\'exécution, mypy refusera',
        'Non, Python ne supporte pas les interfaces',
      ],
      answer: 1,
      explain: "C'est tout l'intérêt de <code>Protocol</code> : l'infrastructure n'a pas besoin de dépendre du module qui définit le contrat. mypy vérifie la conformité structurelle.",
    },
    {
      q: 'Que signifie un attribut nommé <code>_owner</code> ?',
      options: [
        "Il est privé et inaccessible hors de la classe",
        "C'est une convention : « détail interne, ne pas utiliser de l'extérieur ». Rien ne l'interdit techniquement",
        "Il est statique",
        "Il est en lecture seule",
      ],
      answer: 1,
      explain: "Python n'a pas de modificateurs d'accès. Le préfixe <code>_</code> est un contrat entre développeurs, que les linters respectent.",
    },
    {
      q: "Que se passe-t-il si un endpoint <code>async def</code> appelle <code>time.sleep(2)</code> ?",
      options: [
        'Rien de grave, seule la requête courante attend',
        "La boucle d'événements est bloquée : aucune autre requête n'est traitée pendant 2 s par ce worker",
        'FastAPI convertit automatiquement l\'appel en <code>asyncio.sleep</code>',
        'Une exception est levée',
      ],
      answer: 1,
      explain: "Une coroutine qui bloque monopolise l'unique thread de la boucle. Il faut utiliser <code>await asyncio.sleep()</code>, une bibliothèque async, ou déclarer l'endpoint en <code>def</code>.",
    },
    {
      q: 'Quel est l\'équivalent Python de try-with-resources / <code>using</code> ?',
      options: ['<code>try/finally</code> uniquement', "L'instruction <code>with</code> (et <code>async with</code>)", 'Un décorateur <code>@resource</code>', '<code>del</code>'],
      answer: 1,
      explain: '<code>with</code> appelle <code>__enter__</code> puis <code>__exit__</code>, y compris en cas d\'exception. Sa version asynchrone utilise <code>__aenter__</code> et <code>__aexit__</code>.',
    },
  ],
});
