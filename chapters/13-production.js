registerChapter({
  id: 'ch13',
  title: 'Vers la production',
  subtitle: "Qualité outillée (Ruff, mypy strict, import-linter), logs corrélés, image Docker multi-étapes avec uv, pipeline CI et pistes pour aller plus loin.",
  duration: '50 min',
  objectives: [
    'Configurer Ruff et mypy en mode strict comme filet de sécurité « compilateur ».',
    'Ajouter un middleware de logs avec identifiant de requête.',
    'Construire une image Docker légère et non-root avec uv.',
    'Automatiser les contrôles dans une CI.',
    "Savoir ce qu'il reste à faire avant une vraie mise en production.",
  ],
  content: `
<h2>Ruff : lint + format en un outil</h2>
<p><a href="https://docs.astral.sh/ruff/" target="_blank" rel="noopener">Ruff</a> remplace flake8, isort, pyupgrade, black et des dizaines de plugins. Il analyse un projet entier en quelques millisecondes.</p>
${toml.file('pyproject.toml (extrait)')`
[tool.ruff]
line-length = 110
target-version = "py312"
src = ["src", "tests"]

[tool.ruff.lint]
select = [
    "E", "W", "F",     # pycodestyle + pyflakes (erreurs de base)
    "I",               # tri des imports
    "N",               # conventions de nommage PEP 8
    "UP",              # syntaxe moderne (X | None, list[...])
    "B",               # bugbear : pièges courants (défauts mutables...)
    "SIM",             # simplifications
    "ASYNC",           # appels bloquants dans du code async
    "S",               # bandit : sécurité
    "PT",              # bonnes pratiques pytest
    "RUF",
]

[tool.ruff.lint.per-file-ignores]
"tests/**" = ["S101"]      # assert est la norme dans les tests
`}
${sh`
uv run ruff check . --fix      # lint + corrections automatiques
uv run ruff format .           # formatage (≈ google-java-format / dotnet format)
`}

<h2>mypy strict : ton compilateur</h2>
${toml.file('pyproject.toml (extrait)')`
[tool.mypy]
python_version = "3.12"
strict = true
plugins = ["pydantic.mypy"]
mypy_path = "src"
`}
${sh`uv run mypy src tests`}
<p>En mode <code>strict</code>, toute fonction doit être typée, et <code>Any</code> implicite, retours non typés et appels non vérifiés sont interdits.
C'est ce mode qui vérifie, par exemple, que <code>SqlAlchemyUnitOfWork</code> respecte bien le Protocol <code>UnitOfWork</code>.</p>

<h2>Logs et identifiant de corrélation</h2>
${py.file('src/biblio/presentation/middleware.py')`
import logging
import time
from collections.abc import Awaitable, Callable
from uuid import uuid4

from fastapi import FastAPI, Request, Response

logger = logging.getLogger("biblio.access")


def register_request_logging(app: FastAPI) -> None:
    @app.middleware("http")
    async def log_requests(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        request_id = request.headers.get("X-Request-ID") or uuid4().hex
        started = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - started) * 1000
        response.headers["X-Request-ID"] = request_id
        logger.info(
            "%s %s -> %d (%.1f ms)",
            request.method, request.url.path, response.status_code, elapsed_ms,
            extra={"request_id": request_id},
        )
        return response
`}
${explain([
  [`from collections.abc import Awaitable, Callable`, `Types pour décrire une fonction (<code>Callable</code>) qui renvoie quelque chose qu'on peut <code>await</code>er (<code>Awaitable</code>).`],
  [`def register_request_logging(app: FastAPI) -> None:
    @app.middleware("http")
    async def log_requests(...)`, `La fonction <code>log_requests</code> est définie <strong>à l'intérieur</strong> de <code>register_request_logging</code> et enregistrée par le décorateur comme <strong>middleware HTTP</strong> : elle enveloppe chaque requête (≈ un <code>Filter</code> servlet ou un middleware ASP.NET).`],
  [`call_next: Callable[[Request], Awaitable[Response]]`, `<code>call_next</code> est une fonction qui reçoit la requête et renvoie (de façon asynchrone) la réponse : c'est « la suite de la chaîne » (≈ <code>chain.doFilter</code> / <code>next()</code>).`],
  [`request.headers.get("X-Request-ID") or uuid4().hex`, `Réutilise l'identifiant de corrélation envoyé par le client, ou en génère un. <code>.hex</code> donne l'UUID sous forme de 32 caractères hexadécimaux.`],
  [`started = time.perf_counter()`, `Un chronomètre de haute précision.`],
  [`response = await call_next(request)`, `On laisse FastAPI traiter la requête (routes, dépendances…) et on récupère la réponse.`],
  [`logger.info(
    "%s %s -> %d (%.1f ms)",
    request.method, request.url.path, response.status_code, elapsed_ms,
    extra={"request_id": request_id},
)`, `Un message au format <code>printf</code> : <code>%s</code> pour une chaîne, <code>%d</code> pour un entier, <code>%.1f</code> pour un nombre à une décimale. <code>extra</code> ajoute un champ structuré au log.`],
])}
${py.file('src/biblio/main.py (dans create_app)')`
import logging

    logging.basicConfig(
        level=logging.DEBUG if settings.environment == "dev" else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    register_request_logging(app)
`}
${explain([
  [`logging.basicConfig(
    level=logging.DEBUG if settings.environment == "dev" else logging.INFO,
    ...
)`, `Configure les logs une fois pour toutes. Le niveau est choisi par un ternaire : <code>DEBUG</code> en dev, <code>INFO</code> ailleurs.`],
  [`format="%(asctime)s %(levelname)s %(name)s %(message)s"`, `Le gabarit de chaque ligne de log : date, niveau, nom du logger, message (≈ <em>pattern</em> Logback).`],
])}
${callout('tip', 'En production', `<p>Préfère des logs <strong>JSON</strong> (<code>structlog</code> ou <code>python-json-logger</code>) pour ton agrégateur (ELK, Loki, Datadog). Pour les traces distribuées, <code>opentelemetry-instrumentation-fastapi</code> et <code>-sqlalchemy</code> instrumentent l'application en quelques lignes.</p>`)}

<h2>Image Docker multi-étapes avec uv</h2>
${docker.file('Dockerfile')`
# --- Étape 1 : construction du virtualenv -------------------------------------
FROM python:3.13-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=0
WORKDIR /app

# Dépendances d'abord : cette couche reste en cache tant que uv.lock ne change pas
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY README.md ./
COPY src ./src
RUN uv sync --frozen --no-dev --no-editable

# --- Étape 2 : image d'exécution minimale --------------------------------------
FROM python:3.13-slim
RUN useradd --create-home --uid 1000 biblio
WORKDIR /app
COPY --from=builder --chown=biblio:biblio /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1
USER biblio
EXPOSE 8000
CMD ["uvicorn", "biblio.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--proxy-headers"]
`}
${txt.file('.dockerignore')`
.venv
.git
__pycache__
.mypy_cache
.ruff_cache
.pytest_cache
*.db
.env
tests
`}
${sh`
docker build -t biblio-api .
docker run --rm -p 8000:8000 -e BIBLIO_ENVIRONMENT=prod -e BIBLIO_JWT_SECRET="$(openssl rand -base64 48)" biblio-api
`}
${callout('java', 'Le jar exécutable de Python', `<p>Le <code>.venv</code> construit par <code>uv sync --no-editable</code> contient le projet installé et toutes ses dépendances. C'est l'équivalent d'un <em>fat jar</em> ou d'un <code>dotnet publish</code>. On ne copie donc ni les sources ni uv dans l'image finale.</p>`)}
${callout('warn', 'Workers et schéma', `<p>Avec plusieurs workers, chaque processus exécute le lifespan. En production, désactive <code>create_schema_on_startup</code> et lance <code>alembic upgrade head</code> <strong>une seule fois</strong>, avant le déploiement (job d'init, étape de pipeline). Et quitte SQLite pour PostgreSQL.</p>`)}

<h2>Intégration continue</h2>
${yaml.file('.github/workflows/ci.yml')`
name: ci
on:
  push:
    branches: [main]
  pull_request:

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v6
      - run: uv sync --frozen
      - run: uv run ruff check .
      - run: uv run ruff format --check .
      - run: uv run mypy src tests
      - run: uv run lint-imports
      - run: uv run pytest --cov --cov-fail-under=85
`}

<h2>Check-list avant la mise en production</h2>
${compare(['Thème', 'À vérifier'], [
  ['Base de données', 'PostgreSQL + <code>asyncpg</code>, migrations Alembic, sauvegardes, taille du pool (<code>pool_size</code>, <code>max_overflow</code>)'],
  ['Concurrence', 'Verrouillage optimiste (<code>version_id_col</code>) sur <code>books</code> pour le dernier exemplaire'],
  ['Sécurité', 'Secret JWT fort, HTTPS, CORS restreint, rate limiting sur l\'authentification, dépendances auditées (<code>uvx pip-audit</code>)'],
  ['Erreurs', 'Gestionnaire 500 générique, aucun détail technique exposé, Sentry/APM'],
  ['Supervision', '<code>/health</code> (liveness) et <code>/health/ready</code> (vérifie la base), métriques Prometheus, logs JSON'],
  ['API', 'Versionnement <code>/api/v1</code>, pagination bornée, documentation OpenAPI relue, exemples dans les schémas'],
  ['Exploitation', 'Image non-root, arrêt propre (lifespan), variables d\'environnement documentées dans <code>.env.example</code>'],
])}

<h2>Pour aller plus loin</h2>
<ul>
  <li><strong>Événements de domaine</strong> : <code>LoanOverdue</code>, <code>BookReturned</code>… publiés par les entités et traités par des handlers (notifications), de préférence via un <em>outbox</em> transactionnel.</li>
  <li><strong>Tâches de fond</strong> : <code>BackgroundTasks</code> pour du léger, une file (Celery, arq, Dramatiq) pour la relance quotidienne des retards.</li>
  <li><strong>Pagination par curseur</strong> pour les gros volumes, plutôt que <code>offset</code>.</li>
  <li><strong>CQRS léger</strong> : des requêtes de lecture SQL dédiées (sans passer par les entités) pour les écrans de reporting.</li>
  <li><strong>Lecture recommandée</strong> : <em>Architecture Patterns with Python</em> (Percival &amp; Gregory, en libre accès sur cosmicpython.com), la documentation FastAPI (sections « Advanced User Guide » et « Bigger Applications ») et <em>Clean Architecture</em> de Robert C. Martin (ISBN 978-0-13-449416-6, qui passe notre validation 😉).</li>
</ul>

${callout('fil', 'Bravo, le fil rouge est terminé ! 🏁', `<p>Tu as construit une API FastAPI en Clean Architecture : domaine pur et riche, use cases transactionnels, adaptateurs SQLAlchemy async, présentation fine avec Problem Details, configuration typée, tests à chaque niveau, sécurité JWT et image de production. Tu as désormais en Python les mêmes réflexes qu'en Java ou en C#.</p>`)}
`,
  exercise: {
    title: 'Passer à PostgreSQL avec Docker Compose',
    statement: `
<p>Écris un <code>compose.yaml</code> qui lance PostgreSQL 17 et l'API. Contraintes :</p>
<ul>
  <li>l'API attend que la base soit <em>healthy</em> avant de démarrer ;</li>
  <li>elle utilise le driver <code>asyncpg</code> ;</li>
  <li>elle tourne en <code>BIBLIO_ENVIRONMENT=prod</code> avec un vrai secret JWT.</li>
</ul>
<p>Rejoue ensuite le scénario de l'étape 10 contre cette pile. Le code applicatif ne doit pas changer d'une ligne : seule la configuration change.</p>`,
    hints: [
      "<code>uv add asyncpg</code>, puis une URL de la forme <code>postgresql+asyncpg://user:pass@db:5432/biblio</code>.",
      "<code>depends_on: db: condition: service_healthy</code> associé à un <code>healthcheck</code> qui exécute <code>pg_isready</code>.",
    ],
    solution: `
${sh`uv add asyncpg`}
${yaml.file('compose.yaml')`
services:
  db:
    image: postgres:17
    environment:
      POSTGRES_USER: biblio
      POSTGRES_PASSWORD: biblio
      POSTGRES_DB: biblio
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U biblio -d biblio"]
      interval: 5s
      retries: 10

  api:
    build: .
    ports:
      - "8000:8000"
    environment:
      BIBLIO_ENVIRONMENT: prod
      BIBLIO_DATABASE_URL: postgresql+asyncpg://biblio:biblio@db:5432/biblio
      BIBLIO_JWT_SECRET: remplace-moi-par-une-valeur-aleatoire-de-48-caracteres-min
      BIBLIO_CREATE_SCHEMA_ON_STARTUP: "true"   # démo uniquement : Alembic en vrai
    depends_on:
      db:
        condition: service_healthy

volumes:
  pgdata:
`}
${sh`
docker compose up --build
curl -s localhost:8000/health                       # {"status":"ok"}
`}
<p>C'est la démonstration finale de l'architecture : changer de moteur de base n'a touché <strong>que la configuration</strong>. Ni le domaine, ni les use cases, ni les routes n'ont bougé.</p>
<p>Avec PostgreSQL, les UUID sont natifs et <code>DateTime(timezone=True)</code> conserve réellement le fuseau. Le correctif <code>_as_utc</code> du mapper devient inutile, mais reste inoffensif.</p>`,
  },
  quiz: [
    {
      q: 'Quel outil remplace à lui seul flake8, isort et black dans ce tutoriel ?',
      options: ['mypy', 'Ruff', 'pytest', 'uv'],
      answer: 1,
      explain: '<code>ruff check</code> (lint, imports) et <code>ruff format</code> (formatage). mypy reste nécessaire pour la vérification des types.',
    },
    {
      q: "Pourquoi copier <code>pyproject.toml</code> et <code>uv.lock</code> puis lancer <code>uv sync --no-install-project</code> AVANT de copier <code>src/</code> ?",
      options: [
        'Parce que uv l\'exige',
        "Pour profiter du cache des couches Docker : les dépendances ne sont réinstallées que si le lockfile change, pas à chaque modification du code",
        'Pour réduire la taille de l\'image',
        'Pour la sécurité',
      ],
      answer: 1,
      explain: "C'est la même astuce que copier le <code>pom.xml</code> et faire <code>mvn dependency:go-offline</code> avant les sources.",
    },
    {
      q: 'Pourquoi exécuter le conteneur avec un utilisateur non-root (<code>USER biblio</code>) ?',
      options: [
        'Pour accélérer le démarrage',
        "Pour limiter l'impact d'une compromission de l'application (principe du moindre privilège)",
        'Parce que Python refuse de tourner en root',
        'Pour pouvoir écouter sur le port 8000',
      ],
      answer: 1,
      explain: 'Une faille dans l\'application ne donne alors pas les droits root dans le conteneur. C\'est une recommandation standard (CIS, Kubernetes Pod Security).',
    },
    {
      q: 'Avec 4 workers Uvicorn et <code>create_schema_on_startup=true</code>, quel est le risque ?',
      options: [
        'Aucun',
        'Chaque worker exécute le lifespan et tente de créer le schéma en même temps. En production, les migrations doivent être lancées une seule fois, hors de l\'application',
        'Les workers partagent la même session',
        "Le JWT devient invalide",
      ],
      answer: 1,
      explain: "D'où <code>alembic upgrade head</code> dans un job dédié du pipeline, ou un init container.",
    },
    {
      q: "Au passage de SQLite à PostgreSQL, qu'a-t-il fallu modifier dans Biblio ?",
      options: [
        'Les entités du domaine',
        'Les use cases et les routes',
        "Uniquement la configuration (URL de la base) et l'ajout du driver asyncpg",
        'Tout le projet',
      ],
      answer: 2,
      explain: "C'est la promesse tenue de la Clean Architecture : les détails (base, framework) sont interchangeables, le cœur est stable.",
    },
  ],
});
