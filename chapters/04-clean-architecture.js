registerChapter({
  id: 'ch04',
  title: 'Clean Architecture : structurer Biblio',
  subtitle: "La règle de dépendance, les quatre couches, l'arborescence du projet et un garde-fou automatique avec import-linter.",
  duration: '40 min',
  objectives: [
    'Énoncer la règle de dépendance et la décliner en couches Python.',
    'Savoir où placer chaque élément : entité, règle, port, adaptateur, schéma, route.',
    "Mettre en place l'arborescence cible de Biblio API.",
    "Faire respecter l'architecture automatiquement avec <code>import-linter</code>.",
  ],
  content: `
<h2>La règle de dépendance</h2>
<p>Robert C. Martin résume la Clean Architecture en une phrase : <strong>les dépendances du code source pointent uniquement vers l'intérieur</strong>, vers les règles métier.
Le domaine ne connaît ni FastAPI, ni SQLAlchemy, ni Pydantic. Ce sont eux qui s'adaptent à lui.</p>

<div class="layers">
  <div class="layer layer-pres"><b>presentation/</b><small>FastAPI : routers, schémas Pydantic, dépendances, mapping des erreurs → HTTP</small></div>
  <div class="layer layer-infra"><b>infrastructure/</b><small>Adaptateurs : SQLAlchemy, repositories, Unit of Work, JWT, hachage, horloge système</small></div>
  <div class="arrow-note">▼ dépendent de ▼</div>
  <div class="layer layer-app"><b>application/</b><small>Cas d'utilisation (use cases), commandes, <strong>ports</strong> (Protocols) : repositories, UoW, Clock…</small></div>
  <div class="arrow-note">▼ dépend de ▼</div>
  <div class="layer layer-domain"><b>domain/</b><small>Entités, value objects, exceptions métier, invariants. <strong>Python pur, zéro dépendance.</strong></small></div>
</div>

<p>Et pour assembler le tout, le <strong>composition root</strong> (<code>biblio/main.py</code>) est le seul endroit qui connaît toutes les couches. Il instancie les adaptateurs concrets et les branche sur les ports.</p>

${callout('java', 'Tu connais déjà ce schéma', `
<p>C'est l'architecture hexagonale (Ports &amp; Adapters) d'Alistair Cockburn, celle que tu as peut-être pratiquée avec des modules Maven ou Gradle séparés
(<code>domain</code>, <code>application</code>, <code>infrastructure</code>, <code>api</code>) ou avec des projets .NET distincts (<code>Biblio.Domain</code>, <code>Biblio.Application</code>…).
En Java et en C#, le compilateur refuse une dépendance absente du <code>pom.xml</code> ou du <code>.csproj</code>. En Python, <strong>tout peut importer tout</strong> : on utilisera import-linter pour retrouver ce garde-fou.</p>`)}

<h2>Qui fait quoi ?</h2>
${compare(['Élément du fil rouge', 'Couche', 'Pourquoi'], [
  ['<code>Book</code>, <code>Member</code>, <code>Loan</code>', 'domain', 'Entités, avec identité et comportement'],
  ['<code>Isbn</code> (somme de contrôle)', 'domain', 'Value object : invariant métier universel'],
  ['« 3 emprunts actifs maximum »', 'domain', 'Règle métier (<code>Member.ensure_can_borrow</code>)'],
  ['<code>NoCopyAvailable</code>, <code>BookNotFound</code>', 'domain', 'Erreurs métier, indépendantes de HTTP'],
  ['<code>BookRepository</code>, <code>UnitOfWork</code>, <code>Clock</code>', 'application', "Ports : ce dont les use cases ont besoin, exprimé dans leur langage"],
  ['<code>BorrowBook</code>, <code>ReturnBook</code>', 'application', 'Orchestration : charger, appliquer les règles, persister, committer'],
  ['<code>SqlAlchemyBookRepository</code>, <code>BookModel</code>', 'infrastructure', 'Adaptateur de persistance'],
  ['<code>JwtTokenService</code>, <code>SystemClock</code>', 'infrastructure', 'Adaptateurs techniques'],
  ['<code>BookCreate</code>, <code>BookRead</code> (Pydantic)', 'presentation', 'Contrat HTTP'],
  ['<code>router = APIRouter(prefix="/books")</code>', 'presentation', 'Traduction HTTP ⇄ use case'],
  ['<code>DomainError</code> → 404/409/422', 'presentation', 'Mapping des erreurs vers HTTP'],
  ['<code>create_app()</code>, lifespan', 'composition root', 'Câblage des implémentations concrètes'],
])}

<h2>L'arborescence cible</h2>
${tree(`
biblio/
├── pyproject.toml
├── uv.lock
├── src/biblio/
│   ├── __init__.py
│   ├── main.py                     # composition root : create_app(), lifespan
│   ├── config.py                   # Settings (pydantic-settings)
│   ├── domain/                     # ❶ Python pur
│   │   ├── __init__.py
│   │   ├── entities.py             # Entity, Book, Member, Loan, User
│   │   ├── value_objects.py        # Isbn
│   │   └── exceptions.py           # DomainError & co
│   ├── application/                # ❷ dépend de domain uniquement
│   │   ├── __init__.py
│   │   ├── ports.py                # Protocols : repositories, UoW, Clock, ...
│   │   ├── commands.py             # dataclasses d'entrée des use cases
│   │   ├── pagination.py           # Page[T] applicative
│   │   └── use_cases/
│   │       ├── books.py
│   │       ├── members.py
│   │       ├── loans.py
│   │       └── auth.py
│   ├── infrastructure/             # ❸ dépend de application + domain
│   │   ├── __init__.py
│   │   ├── clock.py
│   │   ├── security.py             # JWT, hachage
│   │   └── db/
│   │       ├── engine.py           # moteur + fabrique de sessions
│   │       ├── models.py           # modèles ORM SQLAlchemy
│   │       ├── mappers.py          # ORM <-> entités
│   │       ├── repositories.py
│   │       └── unit_of_work.py
│   └── presentation/               # ❸ dépend de application + domain
│       ├── __init__.py
│       ├── dependencies.py         # Depends(...) : fabrique les use cases
│       ├── errors.py               # DomainError -> Problem Details
│       ├── security.py             # OAuth2, rôles
│       ├── schemas/
│       │   ├── books.py
│       │   ├── members.py
│       │   ├── loans.py
│       │   └── common.py           # Page[T]
│       └── routers/
│           ├── __init__.py         # api_router (/api/v1)
│           ├── books.py
│           ├── members.py
│           ├── loans.py
│           └── auth.py
└── tests/
    ├── unit/                       # domaine + use cases (fakes, sans I/O)
    ├── integration/                # repositories SQLAlchemy sur SQLite
    └── api/                        # TestClient + dependency_overrides
`)}

${callout('info', 'Présentation et infrastructure sont des voisines', `
<p>Note que <code>presentation</code> n'importe <strong>pas</strong> <code>infrastructure</code>. Les routes ne connaissent que les ports et les use cases.
C'est <code>main.py</code> qui dépose dans <code>app.state</code> une fabrique de <code>SqlAlchemyUnitOfWork</code>, et les dépendances FastAPI la récupèrent sous le type <code>UnitOfWork</code>.
On pourrait remplacer SQLAlchemy par MongoDB sans toucher une ligne de <code>presentation/</code>.</p>`)}

<h2>Choix assumé : dataclasses dans le domaine, Pydantic en bordure</h2>
<p>On voit souvent des projets FastAPI où le domaine est fait de modèles Pydantic, voire de modèles SQLModel (ORM + Pydantic). C'est productif pour un CRUD,
mais cela soude le métier au framework de validation et à la base de données. Ici, on choisit :</p>
<ul>
  <li><strong>domain</strong> : <code>@dataclass</code> + méthodes métier, en bibliothèque standard uniquement ;</li>
  <li><strong>presentation</strong> : Pydantic pour le contrat HTTP ;</li>
  <li><strong>infrastructure</strong> : modèles SQLAlchemy distincts, et des <em>mappers</em> entre les deux.</li>
</ul>
<p>Le coût, c'est un peu de code de mapping. Le gain : un domaine testable en millisecondes, des schémas HTTP qui évoluent sans casser la base, et une base qui évolue sans casser l'API.</p>

${callout('warn', 'Pas de dogmatisme', `<p>Pour un microservice CRUD sans règles métier, cette architecture est surdimensionnée. Elle prend tout son sens quand il y a des <strong>invariants</strong> à protéger, comme nos règles d'emprunt. Sache adapter le niveau de cérémonie au problème.</p>`)}

<h2>Principes Clean Code appliqués en Python</h2>
${compare(['Principe', 'Application dans Biblio'], [
  ['Noms révélant l\'intention', '<code>ensure_can_borrow</code>, <code>is_overdue(now)</code>, <code>count_active_for_member</code>. Pas de <code>check()</code>, <code>data</code>, <code>mgr</code>.'],
  ['Fonctions courtes, un seul niveau d\'abstraction', 'Une route : convertir → appeler le use case → convertir. Un use case : orchestrer, sans calcul métier.'],
  ['SRP', 'Un use case = une classe = une méthode <code>execute</code>.'],
  ['Pas de nombres magiques', '<code>Member.MAX_ACTIVE_LOANS = 3</code>, <code>Loan.DURATION = timedelta(days=21)</code>.'],
  ['Modèle riche (pas anémique)', '<code>book.lend()</code> protège le stock, plutôt que <code>book.available_copies -= 1</code> dans un service.'],
  ['Dépendre d\'abstractions (DIP)', 'Les use cases reçoivent un <code>UnitOfWork</code> (Protocol) par constructeur.'],
  ['Command/Query Separation', '<code>lend()</code> modifie sans rien renvoyer ; <code>is_overdue()</code> renvoie sans rien modifier.'],
  ['Typage exhaustif', '<code>mypy --strict</code> passe sur tout le projet.'],
])}

<h2>Un garde-fou : import-linter</h2>
<p><a href="https://import-linter.readthedocs.io/" target="_blank" rel="noopener">import-linter</a> vérifie les imports entre packages, à la manière d'<strong>ArchUnit</strong> (Java) ou de <strong>NetArchTest</strong> (.NET).</p>
${toml.file('pyproject.toml (extrait)')`
[tool.importlinter]
root_package = "biblio"
include_external_packages = true     # nécessaire pour interdire fastapi, sqlalchemy...

[[tool.importlinter.contracts]]
name = "Clean Architecture : les dépendances pointent vers le domaine"
type = "layers"
layers = [
    "biblio.main",
    "biblio.presentation | biblio.infrastructure",
    "biblio.application",
    "biblio.domain",
]

[[tool.importlinter.contracts]]
name = "Le domaine et l'application ignorent les frameworks"
type = "forbidden"
source_modules = ["biblio.domain", "biblio.application"]
forbidden_modules = ["fastapi", "pydantic", "sqlalchemy", "starlette", "jwt"]
`}
${sh`
uv run lint-imports
# Contracts: 2 kept, 0 broken.
`}
<p>Dans un contrat <code>layers</code>, une couche peut importer les couches situées <em>en dessous</em> d'elle, jamais celles du dessus.
La syntaxe <code>"a | b"</code> déclare deux couches de même niveau et <strong>indépendantes</strong> : elles ne doivent pas s'importer mutuellement.</p>
${callout('tip', 'Contrôle forbidden et dépendances externes', `<p>Le contrat <code>forbidden</code> vise des paquets externes (<code>fastapi</code>, <code>sqlalchemy</code>…). Il ne fonctionne que grâce à <code>include_external_packages = true</code>, qui ajoute ces paquets au graphe analysé.</p>`)}
`,
  exercise: {
    title: 'Poser le squelette',
    statement: `
<p>Crée l'arborescence ci-dessus dans <code>src/biblio/</code> : dossiers, fichiers <code>__init__.py</code> et modules vides.
Ajoute la configuration import-linter, puis lance <code>uv run lint-imports</code>.</p>
<p>Ensuite, <strong>casse volontairement</strong> l'architecture en ajoutant <code>import fastapi</code> dans <code>domain/entities.py</code>. Vérifie que le contrat échoue, puis annule la modification.</p>`,
    hints: [
      "Un fichier peut se créer avec <code>touch</code> ; un script shell de quelques lignes suffit.",
      "Le module <code>biblio.main</code> doit exister (même vide) pour être utilisé comme couche.",
    ],
    solution: `
${sh`
cd src/biblio
mkdir -p domain application/use_cases infrastructure/db presentation/schemas presentation/routers
touch main.py config.py
touch domain/{__init__,entities,value_objects,exceptions}.py
touch application/{__init__,ports,commands,pagination}.py
touch application/use_cases/{__init__,books,members,loans,auth}.py
touch infrastructure/{__init__,clock,security}.py
touch infrastructure/db/{__init__,engine,models,mappers,repositories,unit_of_work}.py
touch presentation/{__init__,dependencies,errors,security}.py
touch presentation/schemas/{__init__,books,members,loans,common}.py
touch presentation/routers/{__init__,books,members,loans,auth}.py
cd ../.. && mkdir -p tests/unit tests/integration tests/api && touch tests/__init__.py

uv run lint-imports        # 2 kept
echo "import fastapi" >> src/biblio/domain/entities.py
uv run lint-imports        # BROKEN : biblio.domain.entities -> fastapi
`}
`,
  },
  quiz: [
    {
      q: 'Que dit la règle de dépendance de la Clean Architecture ?',
      options: [
        'Chaque couche dépend de la couche immédiatement inférieure (présentation → métier → données)',
        'Les dépendances du code source pointent vers l\'intérieur, vers le domaine. Le domaine ne dépend de rien',
        "Le domaine dépend de l'infrastructure pour persister",
        'Toutes les couches dépendent du framework web',
      ],
      answer: 1,
      explain: "Contrairement à l'architecture en couches classique (UI → BLL → DAL), la persistance dépend ici du métier, via des ports. C'est l'inversion de dépendances.",
    },
    {
      q: 'Où placer la règle « un adhérent a au maximum 3 emprunts actifs » ?',
      options: [
        'Dans la route FastAPI <code>POST /loans</code>',
        'Dans le schéma Pydantic <code>LoanCreate</code>',
        "Dans le domaine (<code>Member.ensure_can_borrow</code>), appelé par le use case <code>BorrowBook</code>",
        'Dans une contrainte SQL',
      ],
      answer: 2,
      explain: "C'est un invariant métier. Il doit être testable sans HTTP ni base de données, et valoir pour tous les points d'entrée.",
    },
    {
      q: "Dans notre architecture, qu'est-ce qu'un « port » ?",
      options: [
        'Le port TCP du serveur Uvicorn',
        "Une interface (<code>Protocol</code>) définie par la couche application et implémentée par l'infrastructure",
        'Un router FastAPI',
        'Un modèle SQLAlchemy',
      ],
      answer: 1,
      explain: "Le port exprime un besoin du cœur (« je dois pouvoir charger un livre ») dans son propre vocabulaire. L'adaptateur (<code>SqlAlchemyBookRepository</code>) le satisfait.",
    },
    {
      q: 'Pourquoi le package <code>presentation</code> ne doit-il pas importer <code>infrastructure</code> ?',
      options: [
        "Python l'interdit",
        "Pour que les routes ne dépendent que des ports et des use cases : on peut changer la persistance ou la doubler en test sans les toucher",
        'Pour accélérer le démarrage',
        "C'est une exigence de FastAPI",
      ],
      answer: 1,
      explain: "Seul le composition root (<code>main.py</code>) connaît les implémentations concrètes. Les dépendances FastAPI récupèrent une fabrique typée par le port.",
    },
    {
      q: "Quel outil joue en Python le rôle d'ArchUnit (Java) / NetArchTest (.NET) dans ce tutoriel ?",
      options: ['mypy', 'Ruff', 'import-linter', 'pytest-cov'],
      answer: 2,
      explain: "import-linter vérifie des contrats sur le graphe d'imports (<code>layers</code>, <code>forbidden</code>, <code>independence</code>) et s'intègre à la CI.",
    },
  ],
});
