registerChapter({
  id: 'ch01',
  title: 'Python pour développeurs Java / C#',
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
<p>Notre <strong>Unit of Work</strong> sera un context manager asynchrone : <code>async with uow: ...</code> ouvre une session et une transaction, puis libère la connexion.</p>

<h2>Modules, packages et imports</h2>
<p>Un fichier <code>.py</code> est un <strong>module</strong>. Un dossier contenant un <code>__init__.py</code> est un <strong>package</strong>, l'équivalent d'un package Java ou d'un namespace C#. On importe des noms, pas des fichiers :</p>
${py`
# src/biblio/application/use_cases/loans.py
from biblio.domain.entities import Book, Loan       # import absolu : recommandé
from biblio.domain.exceptions import BookNotFound
`}
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
