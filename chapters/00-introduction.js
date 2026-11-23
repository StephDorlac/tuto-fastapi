registerChapter({
  id: 'ch00',
  title: 'Bienvenue & mise en place',
  subtitle: "Pourquoi FastAPI, la cible du fil rouge et l'outillage Python moderne (uv, pyproject) vu par un dev Java/C#.",
  duration: '30 min',
  objectives: [
    "Comprendre ce qu'apporte FastAPI par rapport à Spring Boot et ASP.NET Core.",
    'Installer <code>uv</code> et créer le projet <code>biblio</code> avec la structure <em>src layout</em>.',
    'Faire le lien entre <code>pyproject.toml</code> / <code>uv.lock</code> et Maven, Gradle ou NuGet.',
  ],
  content: `
<h2>Pourquoi FastAPI ?</h2>
<p>FastAPI est un framework web Python pour construire des API HTTP. Il repose sur trois briques :</p>
<ul>
  <li><strong>Starlette</strong> : le noyau HTTP <em>ASGI</em> (Asynchronous Server Gateway Interface), l'équivalent conceptuel de la couche Servlet/Netty ou de Kestrel.</li>
  <li><strong>Pydantic</strong> : la validation et la sérialisation des données à partir des <em>type hints</em> Python (≈ Jackson + Bean Validation).</li>
  <li><strong>Les annotations de type</strong> : elles servent à la fois à l'IDE, au vérificateur statique (mypy) <em>et</em> au framework, qui en déduit la validation, l'injection de dépendances et la documentation OpenAPI.</li>
</ul>
<p>Résultat : on écrit une fonction typée, et FastAPI produit l'endpoint, la validation des entrées, les erreurs 422 détaillées et une page Swagger interactive, sans configuration supplémentaire.</p>

${compare(['Besoin', 'FastAPI', 'Spring Boot', 'ASP.NET Core'], [
  ['Déclarer un endpoint', '<code>@router.get("/books")</code>', '<code>@GetMapping("/books")</code>', '<code>app.MapGet("/books", ...)</code> / <code>[HttpGet]</code>'],
  ['Validation des entrées', 'Pydantic (type hints)', 'Bean Validation (<code>@Valid</code>)', 'DataAnnotations / FluentValidation'],
  ['Injection de dépendances', '<code>Depends(...)</code>, résolu par requête', 'Conteneur IoC Spring', '<code>IServiceCollection</code>'],
  ['Doc OpenAPI', 'Générée automatiquement (<code>/docs</code>)', 'springdoc-openapi', 'Swashbuckle / <code>Microsoft.AspNetCore.OpenApi</code>'],
  ['Serveur', 'Uvicorn (ASGI)', 'Tomcat / Netty', 'Kestrel'],
  ['Modèle d\'exécution', '<code>async</code>/<code>await</code> sur une boucle d\'événements', 'Threads (ou virtual threads / WebFlux)', '<code>async</code>/<code>await</code> + pool de threads'],
])}

${callout('java', 'Ce qui va te surprendre', `
<p>FastAPI est un <strong>micro-framework</strong> : pas de scan de classpath, pas de conteneur IoC global, pas de couche ORM imposée.
C'est une bonne nouvelle pour la Clean Architecture : rien ne te pousse à coupler ton domaine au framework. En contrepartie, <strong>c'est à toi</strong>
de poser la structure du projet. C'est précisément l'objet de ce tutoriel.</p>`)}

<h2>Le fil rouge : Biblio API</h2>
<p>Tout au long des étapes, tu vas construire l'API d'une médiathèque. Les règles métier ont été choisies pour justifier une vraie couche domaine :</p>
<ol>
  <li>Un livre est identifié par un <strong>ISBN-13 valide</strong>, avec contrôle de la somme de contrôle.</li>
  <li>Un livre possède un nombre d'<strong>exemplaires</strong>. On ne peut emprunter que s'il en reste au moins un de disponible.</li>
  <li>Un adhérent a au maximum <strong>3 emprunts actifs</strong>.</li>
  <li>Un emprunt dure <strong>21 jours</strong>. Au-delà, il est <strong>en retard</strong>.</li>
  <li>Un emprunt déjà rendu ne peut pas être rendu une seconde fois.</li>
  <li>Seuls les <strong>bibliothécaires authentifiés</strong> peuvent modifier les données. La consultation du catalogue est publique.</li>
</ol>

${callout('fil', 'Progression du fil rouge', `
<p>Étape 1 : les bases du langage Python, en partant de zéro. Étape 2 : le Python « idiomatique » utile pour une API.
Étapes 3 et 4 : un prototype naïf, tout dans un seul fichier. Étape 5 : on le <strong>restructure</strong> en couches.
Étapes 6 à 10 : on construit chaque couche (domaine → application → infrastructure → présentation → assemblage).
Étapes 11 à 13 : tests, sécurité, mise en production.</p>`)}

${callout('tip', 'Tu ne connais pas Python ? Pas de souci', `
<p>Le tutoriel ne suppose <strong>aucune</strong> connaissance de Python. L'<a href="#/ch01">étape 1</a> présente le langage depuis le début, en le comparant à Java et C#.
Ensuite, trois aides t'accompagnent dans tout le parcours :</p>
<ul>
  <li>dans les blocs de code, <span class="g-demo">les mots soulignés en pointillé</span> affichent leur définition au survol (ou au toucher) ;</li>
  <li>sous les extraits importants, un encadré <strong>🔎 Décryptage ligne à ligne</strong> explique chaque instruction ;</li>
  <li>le <a href="#/lexique">📖 Lexique Python</a> regroupe tous les mots-clés et notions, avec leur équivalent Java / C#.</li>
</ul>`)}

<h2>Installer l'outillage : uv</h2>
<p><a href="https://docs.astral.sh/uv/" target="_blank" rel="noopener">uv</a> est le gestionnaire de projets Python moderne (écrit en Rust par Astral, les auteurs de Ruff).
Il remplace <code>pip</code>, <code>venv</code>, <code>pip-tools</code>, <code>pyenv</code> et <code>poetry</code> par un seul binaire très rapide.</p>
${sh`
# Linux / macOS
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows (PowerShell)
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"

# uv sait aussi installer Python lui-même
uv python install 3.13
uv --version
`}

<h2>Créer le projet biblio</h2>
${sh`
uv init --package biblio      # --package => layout "src/" + projet installable
cd biblio

# Dépendances d'exécution
uv add "fastapi[standard]" "sqlalchemy[asyncio]" aiosqlite pydantic-settings

# Dépendances de développement (≈ scope "test" Maven)
uv add --dev pytest pytest-asyncio pytest-cov ruff mypy import-linter
`}
<p><code>fastapi[standard]</code> installe aussi Uvicorn, la commande <code>fastapi</code>, <code>httpx</code> (pour les tests), <code>python-multipart</code> (formulaires) et <code>email-validator</code>.</p>

<p>Le fichier <code>pyproject.toml</code> obtenu ressemble à ceci :</p>
${toml.file('pyproject.toml')`
[project]
name = "biblio"
version = "0.1.0"
description = "API REST de gestion de bibliothèque"
readme = "README.md"
requires-python = ">=3.12"
dependencies = [
    "aiosqlite>=0.20",
    "fastapi[standard]>=0.115",
    "pydantic-settings>=2.6",
    "sqlalchemy[asyncio]>=2.0",
]

[project.scripts]
biblio = "biblio:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[dependency-groups]
dev = [
    "import-linter>=2.1",
    "mypy>=1.13",
    "pytest>=8.3",
    "pytest-asyncio>=0.24",
    "pytest-cov>=6.0",
    "ruff>=0.8",
]
`}

${compare(['Python / uv', 'Java', 'C# / .NET'], [
  ['<code>pyproject.toml</code>', '<code>pom.xml</code> / <code>build.gradle</code>', '<code>.csproj</code>'],
  ['<code>uv.lock</code> (versions exactes, à committer)', 'Gradle lockfile / <code>dependencyManagement</code>', '<code>packages.lock.json</code>'],
  ['<code>.venv/</code> (environnement virtuel du projet)', '<code>~/.m2</code> + classpath du projet', '<code>~/.nuget/packages</code> + <code>bin/</code>'],
  ['PyPI', 'Maven Central', 'nuget.org'],
  ['<code>uv add</code> / <code>uv remove</code>', 'édition du POM', '<code>dotnet add package</code>'],
  ['<code>uv sync</code>', '<code>mvn dependency:resolve</code>', '<code>dotnet restore</code>'],
  ['<code>uv run &lt;cmd&gt;</code>', '<code>mvn exec:java</code>', '<code>dotnet run</code>'],
  ['<code>dependency-groups.dev</code>', 'scope <code>test</code>', '<code>PrivateAssets</code> / projet de tests'],
])}

${callout('info', 'Environnement virtuel', `
<p>Python installe les paquets dans un dossier. Sans isolation, tous tes projets partageraient les mêmes versions.
Le <code>.venv/</code> créé par uv est un Python privé au projet : <code>uv run</code> l'utilise automatiquement, pas besoin de l'« activer ».
Ajoute <code>.venv/</code> à ton <code>.gitignore</code> (uv le fait pour toi) et commite <code>uv.lock</code>.</p>`)}

<h2>Vérifier l'installation</h2>
${sh`
uv run python -c "import fastapi, sqlalchemy, pydantic; print(fastapi.__version__, sqlalchemy.__version__, pydantic.__version__)"
uv run pytest --version
uv run ruff --version
`}

<h2>Configurer l'IDE</h2>
<ul>
  <li><strong>VS Code</strong> : extensions <em>Python</em>, <em>Pylance</em> (mode <code>strict</code> conseillé) et <em>Ruff</em>. Sélectionne l'interpréteur <code>.venv/bin/python</code>.</li>
  <li><strong>PyCharm</strong> : il détecte <code>uv</code> et le <code>.venv</code>. L'expérience sera proche d'IntelliJ.</li>
</ul>
${callout('tip', 'Ton réflexe "compilateur"', `
<p>En Java ou en C#, le compilateur bloque les erreurs de type. En Python, <strong>rien ne les bloque à l'exécution</strong>.
Pour retrouver ce filet de sécurité, on lancera <code>mypy --strict</code> et <code>ruff</code> en continu (étape 13). Prends l'habitude d'activer le mode strict de Pylance dès maintenant.</p>`)}
`,
  exercise: {
    title: 'Initialiser le dépôt',
    statement: `
<p>Crée le projet <code>biblio</code> avec uv, ajoute les dépendances listées plus haut et vérifie que la commande
<code>uv run python -c "import fastapi"</code> fonctionne. Initialise ensuite un dépôt git et fais un premier commit
contenant <code>pyproject.toml</code>, <code>uv.lock</code>, <code>.python-version</code> et <code>src/</code>.</p>
<p>Question bonus : que se passe-t-il si un collègue clone le dépôt et lance <code>uv sync</code> ?</p>`,
    hints: [
      "<code>uv init --package</code> crée déjà <code>src/biblio/__init__.py</code> et un <code>.gitignore</code>.",
      "Avec <code>uv sync</code>, uv lit <code>uv.lock</code>, pas seulement <code>pyproject.toml</code>.",
    ],
    solution: `
${sh`
uv init --package biblio && cd biblio
uv add "fastapi[standard]" "sqlalchemy[asyncio]" aiosqlite pydantic-settings
uv add --dev pytest pytest-asyncio pytest-cov ruff mypy import-linter
uv run python -c "import fastapi; print(fastapi.__version__)"

git init
git add pyproject.toml uv.lock .python-version .gitignore README.md src/
git commit -m "chore: initialise le projet biblio"
`}
<p><strong>Bonus :</strong> <code>uv sync</code> crée le <code>.venv</code> du collègue (en installant au besoin la version de Python indiquée dans <code>.python-version</code>)
et y installe <strong>exactement</strong> les versions figées dans <code>uv.lock</code>, dépendances de dev comprises. Le build est reproductible, comme avec un lockfile Gradle.</p>`,
  },
  quiz: [
    {
      q: 'Sur quel standard serveur FastAPI repose-t-il ?',
      options: ['WSGI', 'ASGI', 'Servlet', 'CGI'],
      answer: 1,
      explain: "FastAPI est construit sur Starlette, un framework ASGI. ASGI est l'interface asynchrone qui succède à WSGI (synchrone). Uvicorn est le serveur ASGI qui l'exécute.",
    },
    {
      q: "D'où FastAPI tire-t-il la validation des requêtes et la documentation OpenAPI ?",
      options: [
        "D'un fichier YAML OpenAPI écrit à la main",
        'De décorateurs de validation spécifiques à chaque champ',
        'Des annotations de type Python, interprétées par Pydantic',
        "D'un schéma XSD",
      ],
      answer: 2,
      explain: 'Les type hints (<code>book_id: UUID</code>, modèles Pydantic…) sont lus à l\'exécution. FastAPI en déduit la validation, la conversion des types et le schéma OpenAPI.',
    },
    {
      q: 'Quel est le rôle du fichier <code>uv.lock</code> ?',
      options: [
        'Empêcher deux développeurs de modifier le projet en même temps',
        'Figer les versions exactes de toutes les dépendances (transitives comprises) pour des installations reproductibles',
        'Stocker les identifiants PyPI',
        'Lister uniquement les dépendances de développement',
      ],
      answer: 1,
      explain: "C'est un lockfile, comme <code>packages.lock.json</code> ou le lockfile Gradle. Il doit être commité.",
    },
    {
      q: 'Que fait <code>uv add --dev pytest</code> ?',
      options: [
        "Installe pytest globalement sur la machine",
        'Ajoute pytest au groupe de dépendances de développement du projet, puis met à jour le lockfile et le .venv',
        'Ajoute pytest aux dépendances de production',
        'Télécharge pytest sans le déclarer nulle part',
      ],
      answer: 1,
      explain: "L'équivalent d'une dépendance au scope <code>test</code> Maven : présente en dev et en CI, absente de l'image de production (<code>uv sync --no-dev</code>).",
    },
    {
      q: 'Pourquoi utiliser un environnement virtuel (<code>.venv</code>) ?',
      options: [
        "Pour exécuter Python dans une machine virtuelle comme la JVM",
        'Pour isoler les paquets et leurs versions par projet',
        'Pour compiler le code Python en bytecode',
        'Pour activer le typage statique',
      ],
      answer: 1,
      explain: "Sans isolation, tous les projets partageraient le même site-packages. Le .venv est l'équivalent d'un classpath dédié au projet.",
    },
  ],
});
