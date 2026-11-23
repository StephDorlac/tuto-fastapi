registerChapter({
  id: 'ch09',
  title: 'Configuration & composition root',
  subtitle: "Typer la configuration avec pydantic-settings, gérer le cycle de vie avec lifespan et tout câbler dans une fabrique create_app().",
  duration: '35 min',
  objectives: [
    'Charger une configuration typée et validée depuis l\'environnement et un fichier <code>.env</code>.',
    'Gérer les ressources (moteur SQL) au démarrage et à l\'arrêt avec <code>lifespan</code>.',
    "Écrire le composition root : le seul endroit qui connaît les implémentations concrètes.",
    'Lancer enfin l\'API complète et la tester dans Swagger.',
  ],
  content: `
<h2>Une configuration typée : pydantic-settings</h2>
${py.file('src/biblio/config.py')`
from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="BIBLIO_", env_file=".env", extra="ignore")

    app_name: str = "Biblio API"
    environment: Literal["dev", "test", "prod"] = "dev"
    database_url: str = "sqlite+aiosqlite:///./biblio.db"
    db_echo: bool = False
    create_schema_on_startup: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
`}
${ini.file('.env')`
# Ne pas committer : ajouter .env au .gitignore (fournir un .env.example)
BIBLIO_ENVIRONMENT=dev
BIBLIO_DATABASE_URL=sqlite+aiosqlite:///./biblio.db
BIBLIO_DB_ECHO=true
`}
<p>Ordre de priorité : <strong>variables d'environnement</strong> &gt; fichier <code>.env</code> &gt; valeurs par défaut. Chaque valeur est <strong>validée et convertie</strong> : <code>BIBLIO_DB_ECHO=true</code> devient un <code>bool</code>, et <code>BIBLIO_ENVIRONMENT=staging</code> fait échouer le démarrage. C'est un <em>fail fast</em> salutaire.</p>
${compare(['Python', 'Spring Boot', 'ASP.NET Core'], [
  ['<code>BaseSettings</code>', '<code>@ConfigurationProperties</code>', '<code>IOptions&lt;T&gt;</code>'],
  ['<code>env_prefix="BIBLIO_"</code>', 'préfixe <code>biblio.*</code>', 'section <code>Biblio</code>'],
  ['<code>.env</code>', '<code>application-dev.yml</code>', '<code>appsettings.Development.json</code>'],
  ['<code>SecretStr</code>', 'propriété masquée par Actuator', 'User Secrets / Key Vault'],
  ['<code>@lru_cache get_settings()</code>', 'bean singleton', '<code>AddSingleton</code>'],
])}

<h2>Le cycle de vie : lifespan</h2>
<p>Le <em>lifespan</em> est un context manager asynchrone : le code <strong>avant</strong> <code>yield</code> s'exécute au démarrage, le code <strong>après</strong> à l'arrêt. On y crée le moteur SQL (pool de connexions), qu'on libère proprement à la fin.</p>
${callout('java', 'Équivalents', `<p>Avant <code>yield</code> : <code>ApplicationRunner</code> / <code>@PostConstruct</code> en Spring, ou <code>IHostedService.StartAsync</code> en .NET. Après <code>yield</code> : <code>@PreDestroy</code> / <code>StopAsync</code>. Les anciens décorateurs <code>@app.on_event("startup")</code> sont dépréciés.</p>`)}

<h2>Le composition root : main.py</h2>
${py.file('src/biblio/main.py')`
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from biblio.application.ports import UnitOfWork
from biblio.config import Settings, get_settings
from biblio.infrastructure.clock import SystemClock
from biblio.infrastructure.db.engine import create_engine_and_session_factory, create_schema
from biblio.infrastructure.db.unit_of_work import SqlAlchemyUnitOfWork
from biblio.presentation.errors import register_error_handlers
from biblio.presentation.routers import api_router


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine, session_factory = create_engine_and_session_factory(
            settings.database_url, echo=settings.db_echo
        )
        if settings.create_schema_on_startup:
            await create_schema(engine)

        def uow_factory() -> UnitOfWork:              # mypy vérifie ici la conformité au port
            return SqlAlchemyUnitOfWork(session_factory)

        app.state.uow_factory = uow_factory
        app.state.clock = SystemClock()
        yield
        await engine.dispose()

    app = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        description="API de gestion d'une médiathèque — fil rouge Clean Architecture",
        lifespan=lifespan,
    )
    app.include_router(api_router)
    register_error_handlers(app)

    @app.get("/health", tags=["Supervision"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
`}
${callout('clean', 'Pourquoi une fabrique create_app() ?', `
<ul>
  <li><strong>Tests</strong> : chaque test peut créer une application neuve avec ses propres <code>Settings</code>, sans état partagé.</li>
  <li><strong>Lisibilité</strong> : tout le câblage est visible en un seul endroit, comme un <code>Program.cs</code> ou une classe <code>@Configuration</code>.</li>
  <li><strong>Architecture</strong> : c'est le seul module autorisé à importer à la fois <code>infrastructure</code> et <code>presentation</code> (contrat import-linter de l'étape 4).</li>
</ul>`)}
${callout('info', 'Le typage, garde-fou de l\'assemblage', `<p>La ligne <code>def uow_factory() -&gt; UnitOfWork: return SqlAlchemyUnitOfWork(...)</code> est l'endroit où mypy vérifie que l'adaptateur respecte le port. Si tu oublies <code>count_active_for_member</code> dans le repository des emprunts, <code>mypy --strict</code> échoue ici, avant même l'exécution.</p>`)}

<h2>Lancer l'API complète</h2>
${sh`
uv run fastapi dev src/biblio/main.py
# ou, avec la fabrique :
uv run uvicorn biblio.main:create_app --factory --reload
`}
<p>Ouvre <code>http://127.0.0.1:8000/docs</code> et déroule le scénario complet :</p>
${sh`
# 1. Un livre
curl -s -X POST localhost:8000/api/v1/books -H 'content-type: application/json' \
  -d '{"isbn":"978-0-13-449416-6","title":"Clean Architecture","author":"Robert C. Martin","copies":1}'

# 2. Un adhérent
curl -s -X POST localhost:8000/api/v1/members -H 'content-type: application/json' \
  -d '{"full_name":"Alice Martin","email":"alice@example.org"}'

# 3. Un emprunt (remplace les identifiants)
curl -s -X POST localhost:8000/api/v1/loans -H 'content-type: application/json' \
  -d '{"book_id":"<BOOK_ID>","member_id":"<MEMBER_ID>"}'

# 4. Un second emprunt du même livre -> 409 NoCopyAvailable
# 5. Un ISBN invalide -> 422 InvalidIsbn ; un ISBN déjà présent -> 409 DuplicateIsbn
`}
${callout('fil', 'Jalon atteint 🎉', `<p>Biblio API est fonctionnelle de bout en bout, en Clean Architecture. Les étapes suivantes la rendent <strong>fiable</strong> (tests), <strong>sûre</strong> (authentification) et <strong>déployable</strong> (qualité, Docker, CI).</p>`)}
`,
  exercise: {
    title: 'CORS configurable',
    statement: `
<p>Un front-end hébergé sur <code>http://localhost:5173</code> doit appeler l'API. Ajoute :</p>
<ol>
  <li>un réglage <code>cors_origins: list[str]</code> dans <code>Settings</code>, vide par défaut ;</li>
  <li>le middleware <code>CORSMiddleware</code> dans <code>create_app</code>, ajouté <strong>uniquement</strong> si la liste n'est pas vide ;</li>
  <li>la valeur correspondante dans <code>.env</code>.</li>
</ol>`,
    hints: [
      'pydantic-settings lit les listes au format JSON : <code>BIBLIO_CORS_ORIGINS=["http://localhost:5173"]</code>.',
      '<code>from fastapi.middleware.cors import CORSMiddleware</code>, puis <code>app.add_middleware(CORSMiddleware, allow_origins=...)</code>.',
    ],
    solution: `
${py.file('src/biblio/config.py')`
class Settings(BaseSettings):
    ...
    cors_origins: list[str] = []
`}
${py.file('src/biblio/main.py (dans create_app)')`
from fastapi.middleware.cors import CORSMiddleware

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_methods=["GET", "POST", "PATCH", "DELETE"],
            allow_headers=["Authorization", "Content-Type"],
        )
`}
${ini.file('.env')`
BIBLIO_CORS_ORIGINS=["http://localhost:5173"]
`}
<p>Évite <code>allow_origins=["*"]</code> si l'API utilise des cookies ou des identifiants : liste explicitement les origines autorisées.</p>`,
  },
  quiz: [
    {
      q: 'Avec <code>env_prefix="BIBLIO_"</code>, quelle variable d\'environnement alimente <code>database_url</code> ?',
      options: ['<code>DATABASE_URL</code>', '<code>BIBLIO_DATABASE_URL</code>', '<code>biblio.database_url</code>', '<code>BIBLIO-DATABASE-URL</code>'],
      answer: 1,
      explain: 'Préfixe + nom du champ. La correspondance ignore la casse par défaut.',
    },
    {
      q: 'Dans une fonction <code>lifespan</code>, quand s\'exécute le code situé après <code>yield</code> ?',
      options: ['À chaque requête', "À l'arrêt de l'application", 'Au démarrage, après le code d\'avant yield', 'Jamais'],
      answer: 1,
      explain: "Avant <code>yield</code> : démarrage. Après : arrêt. C'est l'endroit idéal pour <code>await engine.dispose()</code>.",
    },
    {
      q: 'À quoi sert <code>@lru_cache</code> sur <code>get_settings()</code> ?',
      options: [
        'À recharger la configuration à chaque appel',
        "À ne construire et valider les Settings qu'une seule fois, puis à réutiliser l'instance (singleton paresseux)",
        'À chiffrer les secrets',
        'À rendre la fonction asynchrone',
      ],
      answer: 1,
      explain: "Lire l'environnement et valider à chaque requête serait coûteux. La fonction peut aussi servir de dépendance FastAPI, et être surchargée en test.",
    },
    {
      q: 'Pourquoi exposer une fabrique <code>create_app(settings)</code> plutôt qu\'une seule variable <code>app</code> globale ?',
      options: [
        'FastAPI l\'exige',
        'Pour créer des applications isolées avec des configurations différentes, notamment en test, et centraliser le câblage',
        'Pour améliorer les performances',
        'Pour pouvoir lancer plusieurs workers',
      ],
      answer: 1,
      explain: "C'est le pattern <em>application factory</em>. La variable <code>app = create_app()</code> reste disponible pour <code>fastapi dev</code> et <code>fastapi run</code>.",
    },
    {
      q: 'Quel module est le seul à importer à la fois les adaptateurs de <code>infrastructure</code> et les routers de <code>presentation</code> ?',
      options: ['<code>biblio.application.ports</code>', '<code>biblio.presentation.dependencies</code>', '<code>biblio.main</code> (composition root)', '<code>biblio.domain.entities</code>'],
      answer: 2,
      explain: "Les dépendances de la présentation ne voient que les ports, via <code>app.state</code>. Le composition root branche les implémentations concrètes.",
    },
  ],
});
