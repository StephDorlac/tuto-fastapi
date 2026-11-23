registerChapter({
  id: 'ch12',
  title: 'Sécurité : OAuth2, JWT & rôles',
  subtitle: "Authentifier les bibliothécaires (flux OAuth2 password + JWT), hacher les mots de passe avec Argon2 et protéger les routes par rôle, sans salir le domaine.",
  duration: '60 min',
  objectives: [
    'Modéliser utilisateurs et rôles, et définir les ports <code>PasswordHasher</code> et <code>TokenService</code>.',
    'Implémenter le use case <code>Authenticate</code> et l\'endpoint <code>/auth/token</code>.',
    'Écrire les adaptateurs PyJWT et pwdlib (Argon2).',
    'Protéger les routes avec des dépendances <code>get_current_claims</code> et <code>require_roles</code>.',
    'Adapter les tests (overrides, 401/403).',
  ],
  content: `
<h2>Vue d'ensemble</h2>
${compare(['Élément', 'Couche', 'Rôle'], [
  ['<code>User</code>, <code>Role</code>', 'domain', 'Un membre du personnel et son rôle'],
  ['<code>InvalidCredentials</code>, <code>InvalidToken</code>', 'domain', 'Erreurs d\'authentification (→ 401)'],
  ['<code>PasswordHasher</code>, <code>TokenService</code>, <code>UserRepository</code>', 'application (ports)', 'Besoins exprimés sans technologie'],
  ['<code>Authenticate</code>', 'application', 'Vérifier les identifiants et émettre un jeton'],
  ['<code>Argon2PasswordHasher</code>, <code>JwtTokenService</code>', 'infrastructure', 'pwdlib, PyJWT'],
  ['<code>OAuth2PasswordBearer</code>, <code>require_roles</code>', 'presentation', 'Extraire le jeton, contrôler les droits'],
])}
${sh`uv add pyjwt "pwdlib[argon2]"`}
${callout('java', 'Spring Security, en explicite', `<p>Pas de chaîne de filtres configurée par DSL : la sécurité est faite de <strong>dépendances FastAPI</strong>, que l'on attache aux routes ou aux routers. <code>require_roles(Role.LIBRARIAN)</code> joue le rôle de <code>@PreAuthorize("hasRole('LIBRARIAN')")</code> ou de <code>[Authorize(Roles = "Librarian")]</code>.</p>`)}

<h2>Domaine : utilisateurs et rôles</h2>
${py.file('src/biblio/domain/entities.py (ajout)')`
from enum import StrEnum


class Role(StrEnum):
    LIBRARIAN = "librarian"
    ADMIN = "admin"


@dataclass(kw_only=True, eq=False)
class User(Entity):
    username: str
    password_hash: str           # jamais le mot de passe en clair
    role: Role

    @classmethod
    def create(cls, *, username: str, password_hash: str, role: Role) -> Self:
        return cls(id=uuid4(), username=_require_text(username, "username").lower(), password_hash=password_hash, role=role)
`}
${explain([
  [`class Role(StrEnum):`, `Les rôles possibles. Chaque membre est aussi une chaîne, ce qui simplifie le stockage et le jeton JWT.`],
  [`class User(Entity):`, `Une nouvelle entité, sur le modèle de <code>Book</code> et <code>Member</code>.`],
  [`password_hash: str`, `On stocke uniquement le <strong>hash</strong> du mot de passe, jamais le mot de passe lui-même.`],
  [`_require_text(username, "username").lower()`, `Vérifie que l'identifiant n'est pas vide, puis le met en minuscules.`],
])}
${py.file('src/biblio/domain/exceptions.py (ajout)')`
class AuthenticationError(DomainError):
    """L'identité de l'appelant n'a pas pu être établie."""


class InvalidCredentials(AuthenticationError):
    def __init__(self) -> None:
        super().__init__("Identifiant ou mot de passe incorrect")


class InvalidToken(AuthenticationError):
    def __init__(self) -> None:
        super().__init__("Jeton invalide ou expiré")
`}

<h2>Application : ports et use case</h2>
${py.file('src/biblio/application/ports.py (ajout)')`
from dataclasses import dataclass

from biblio.domain.entities import Role, User


class UserRepository(Protocol):
    async def get_by_username(self, username: str) -> User | None: ...
    async def add(self, user: User) -> None: ...


class PasswordHasher(Protocol):
    def hash(self, password: str) -> str: ...
    def verify(self, password: str, password_hash: str) -> bool: ...


@dataclass(frozen=True, slots=True)
class TokenClaims:
    user_id: UUID
    role: Role


class TokenService(Protocol):
    def issue(self, user: User) -> str: ...
    def decode(self, token: str) -> TokenClaims: ...      # lève InvalidToken


class UnitOfWork(Protocol):
    ...
    @property
    def users(self) -> UserRepository: ...
`}
${explain([
  [`class PasswordHasher(Protocol):
    def hash(self, password: str) -> str: ...
    def verify(self, password: str, password_hash: str) -> bool: ...`, `Un port pour le hachage. Ces méthodes ne sont <strong>pas</strong> <code>async</code> : le calcul se fait en mémoire, sans attente d'I/O.`],
  [`class TokenClaims:
    user_id: UUID
    role: Role`, `Les informations extraites d'un jeton valide : qui est l'appelant, et avec quel rôle.`],
  [`def decode(self, token: str) -> TokenClaims: ...`, `Le commentaire précise le contrat : en cas de jeton invalide, la méthode lève <code>InvalidToken</code> (Python n'a pas de clause <code>throws</code> pour le dire).`],
  [`class UnitOfWork(Protocol):
    ...`, `Le <code>...</code> remplace ici les membres déjà présentés : on n'ajoute que la propriété <code>users</code>.`],
])}
${py.file('src/biblio/application/use_cases/auth.py')`
from biblio.application.ports import PasswordHasher, TokenService, UnitOfWork
from biblio.domain.exceptions import InvalidCredentials


class Authenticate:
    def __init__(self, uow: UnitOfWork, hasher: PasswordHasher, tokens: TokenService) -> None:
        self._uow = uow
        self._hasher = hasher
        self._tokens = tokens

    async def execute(self, username: str, password: str) -> str:
        async with self._uow as uow:
            user = await uow.users.get_by_username(username.strip().lower())

        if user is None:
            self._hasher.hash(password)          # même coût de calcul : ne révèle pas si le compte existe
            raise InvalidCredentials()
        if not self._hasher.verify(password, user.password_hash):
            raise InvalidCredentials()
        return self._tokens.issue(user)
`}
${explain([
  [`def __init__(self, uow: UnitOfWork, hasher: PasswordHasher, tokens: TokenService) -> None:`, `Trois dépendances, toutes des <strong>ports</strong> : le use case ignore tout de JWT et d'Argon2.`],
  [`async with self._uow as uow:
    user = await uow.users.get_by_username(username.strip().lower())`, `On cherche l'utilisateur avec un identifiant normalisé, puis on referme la transaction aussitôt.`],
  [`self._hasher.hash(password)`, `Le résultat est ignoré : cet appel sert uniquement à <strong>prendre le même temps</strong> que la vérification d'un vrai compte.`],
  [`raise InvalidCredentials()`, `Les parenthèses créent l'instance de l'exception, qui n'a pas de paramètre.`],
  [`return self._tokens.issue(user)`, `Renvoie le jeton signé : une chaîne.`],
])}
${callout('warn', 'Messages d\'erreur et énumération', `<p>Que l'identifiant soit inconnu ou que le mot de passe soit faux, la réponse est <strong>identique</strong> (même message, même temps de calcul). Sinon, un attaquant pourrait découvrir quels comptes existent.</p>`)}

<h2>Infrastructure : Argon2 et JWT</h2>
${py.file('src/biblio/infrastructure/security.py')`
from datetime import timedelta
from uuid import UUID

import jwt
from pwdlib import PasswordHash

from biblio.application.ports import Clock, TokenClaims
from biblio.domain.entities import Role, User
from biblio.domain.exceptions import InvalidToken


class Argon2PasswordHasher:
    def __init__(self) -> None:
        self._password_hash = PasswordHash.recommended()     # Argon2id

    def hash(self, password: str) -> str:
        return self._password_hash.hash(password)

    def verify(self, password: str, password_hash: str) -> bool:
        return self._password_hash.verify(password, password_hash)


class JwtTokenService:
    _ALGORITHM = "HS256"

    def __init__(self, *, secret: str, clock: Clock, ttl: timedelta, issuer: str = "biblio-api") -> None:
        self._secret = secret
        self._clock = clock
        self._ttl = ttl
        self._issuer = issuer

    def issue(self, user: User) -> str:
        now = self._clock.now()
        payload = {
            "sub": str(user.id),
            "role": user.role.value,
            "iss": self._issuer,
            "iat": now,
            "exp": now + self._ttl,
        }
        return jwt.encode(payload, self._secret, algorithm=self._ALGORITHM)

    def decode(self, token: str) -> TokenClaims:
        try:
            payload = jwt.decode(
                token,
                self._secret,
                algorithms=[self._ALGORITHM],      # TOUJOURS fixer la liste : évite l'attaque "alg: none"
                issuer=self._issuer,
                options={"require": ["sub", "exp", "iss"]},
            )
            return TokenClaims(user_id=UUID(payload["sub"]), role=Role(payload["role"]))
        except (jwt.PyJWTError, KeyError, ValueError) as exc:
            raise InvalidToken() from exc
`}
${explain([
  [`import jwt
from pwdlib import PasswordHash`, `Deux bibliothèques externes (à ajouter avec <code>uv add pyjwt pwdlib[argon2]</code>). Le paquet s'appelle <code>pyjwt</code>, mais il s'importe sous le nom <code>jwt</code>.`],
  [`self._password_hash = PasswordHash.recommended()`, `Une fabrique de la bibliothèque qui renvoie la configuration conseillée : Argon2id.`],
  [`_ALGORITHM = "HS256"`, `Une constante de classe privée.`],
  [`def __init__(self, *, secret: str, clock: Clock, ttl: timedelta, issuer: str = "biblio-api") -> None:`, `Tous les paramètres sont nommés (<code>*</code>) : pas de risque d'inverser <code>secret</code> et <code>issuer</code>, qui sont deux <code>str</code>.`],
  [`payload = {
    "sub": str(user.id),
    ...
}`, `Le contenu du jeton : un dictionnaire de <em>claims</em> standards. <code>sub</code> désigne le sujet (l'id), <code>iss</code> l'émetteur, <code>iat</code> la date d'émission et <code>exp</code> l'expiration.`],
  [`"role": user.role.value`, `<code>.value</code> donne la chaîne de l'enum, par exemple <code>"librarian"</code>.`],
  [`jwt.encode(payload, self._secret, algorithm=self._ALGORITHM)`, `Signe le jeton avec la clé secrète. Le résultat est une chaîne de la forme <code>xxx.yyy.zzz</code>.`],
  [`jwt.decode(
    token,
    self._secret,
    algorithms=[self._ALGORITHM],
    issuer=self._issuer,
    options={"require": ["sub", "exp", "iss"]},
)`, `Vérifie la signature, l'expiration et l'émetteur, ainsi que la présence des claims obligatoires, puis renvoie le dictionnaire de claims. Une erreur lève une exception <code>jwt.PyJWTError</code>.`],
  [`TokenClaims(user_id=UUID(payload["sub"]), role=Role(payload["role"]))`, `Reconvertit en types forts : <code>UUID(…)</code> lève <code>ValueError</code> si le format est faux, <code>Role(…)</code> fait de même pour un rôle inconnu, et <code>payload["role"]</code> lève <code>KeyError</code> si le claim est absent.`],
  [`except (jwt.PyJWTError, KeyError, ValueError) as exc:
    raise InvalidToken() from exc`, `Un tuple d'exceptions attrape <strong>plusieurs types</strong> à la fois. On les traduit toutes en une erreur métier unique, en gardant la cause d'origine.`],
])}
<p>Côté persistance, ajoute un <code>UserModel</code> (<code>username</code> unique, <code>password_hash</code>, <code>role: Mapped[str]</code>), ses mappers, un <code>SqlAlchemyUserRepository</code> et l'attribut <code>users</code> dans <code>SqlAlchemyUnitOfWork</code>, sur le modèle de l'étape 8.
N'oublie pas <code>users</code> dans la <code>FakeUnitOfWork</code>.</p>

<h2>Configuration et assemblage</h2>
${py.file('src/biblio/config.py (ajout)')`
from typing import Self

from pydantic import SecretStr, model_validator

_DEV_SECRET = "dev-only-secret-change-me-0123456789abcdef"


class Settings(BaseSettings):
    ...
    jwt_secret: SecretStr = SecretStr(_DEV_SECRET)
    jwt_ttl_minutes: int = 30

    @model_validator(mode="after")
    def require_real_secret_in_prod(self) -> Self:
        if self.environment == "prod" and self.jwt_secret.get_secret_value() == _DEV_SECRET:
            raise ValueError("BIBLIO_JWT_SECRET doit être défini en production")
        return self
`}
${explain([
  [`jwt_secret: SecretStr = SecretStr(_DEV_SECRET)`, `<code>SecretStr</code> masque la valeur dans les logs et les messages d'erreur (<code>**********</code>). Elle est lue dans <code>BIBLIO_JWT_SECRET</code>.`],
  [`@model_validator(mode="after")
def require_real_secret_in_prod(self) -> Self:`, `Une validation sur l'ensemble de la configuration : elle s'exécute dès le démarrage.`],
  [`self.jwt_secret.get_secret_value()`, `La seule façon de lire la vraie valeur, ce qui rend chaque usage visible dans le code.`],
])}
${py.file('src/biblio/main.py (lifespan, ajout)')`
        clock = SystemClock()
        app.state.clock = clock
        app.state.password_hasher = Argon2PasswordHasher()
        app.state.token_service = JwtTokenService(
            secret=settings.jwt_secret.get_secret_value(),
            clock=clock,
            ttl=timedelta(minutes=settings.jwt_ttl_minutes),
        )
`}
${explain([
  [`clock = SystemClock()
app.state.clock = clock`, `On crée une seule horloge, partagée par l'application et le service de jetons.`],
  [`JwtTokenService(
    secret=settings.jwt_secret.get_secret_value(),
    ...
)`, `On assemble l'adaptateur JWT avec sa configuration. Seul le composition root connaît ces détails.`],
])}
${callout('tip', 'SecretStr', `<p><code>SecretStr</code> s'affiche <code>'**********'</code> dans les <code>repr</code> et les logs. Il faut appeler <code>.get_secret_value()</code> pour lire la valeur : c'est un rappel explicite qu'on manipule un secret. Génère un vrai secret avec <code>python -c "import secrets; print(secrets.token_urlsafe(48))"</code>.</p>`)}

<h2>Présentation : jeton, utilisateur courant, rôles</h2>
${py.file('src/biblio/presentation/security.py')`
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer

from biblio.application.ports import TokenClaims, TokenService
from biblio.domain.entities import Role
from biblio.domain.exceptions import InvalidToken

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")


def get_token_service(request: Request) -> TokenService:
    tokens: TokenService = request.app.state.token_service
    return tokens


def get_current_claims(
    token: Annotated[str, Depends(oauth2_scheme)],
    tokens: Annotated[TokenService, Depends(get_token_service)],
) -> TokenClaims:
    try:
        return tokens.decode(token)
    except InvalidToken:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Jeton invalide ou expiré",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None


CurrentClaims = Annotated[TokenClaims, Depends(get_current_claims)]


def require_roles(*allowed: Role) -> Callable[[TokenClaims], TokenClaims]:
    def checker(claims: CurrentClaims) -> TokenClaims:
        if claims.role not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Droits insuffisants")
        return claims

    return checker


LibrarianOnly = Depends(require_roles(Role.LIBRARIAN, Role.ADMIN))
`}
${explain([
  [`oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")`, `Une dépendance fournie par FastAPI. Elle lit l'en-tête <code>Authorization: Bearer &lt;jeton&gt;</code> et répond 401 s'il est absent. Elle ajoute aussi le bouton « Authorize » dans Swagger.`],
  [`def get_current_claims(
    token: Annotated[str, Depends(oauth2_scheme)],
    tokens: Annotated[TokenService, Depends(get_token_service)],
) -> TokenClaims:`, `Une dépendance qui en utilise deux autres : le jeton brut, et le service qui sait le décoder.`],
  [`raise HTTPException(...) from None`, `<code>from None</code> masque l'exception d'origine dans la trace : on ne veut pas exposer de détails sur le jeton.`],
  [`headers={"WWW-Authenticate": "Bearer"}`, `En-tête exigé par la norme HTTP pour une réponse 401.`],
  [`def require_roles(*allowed: Role) -> Callable[[TokenClaims], TokenClaims]:`, `<code>*allowed</code> accepte <strong>autant de rôles qu'on veut</strong> : <code>require_roles(Role.ADMIN)</code> ou <code>require_roles(Role.LIBRARIAN, Role.ADMIN)</code>. Dans la fonction, <code>allowed</code> est un tuple. Le type de retour indique que la fonction <strong>renvoie une fonction</strong>, qui prend des <code>TokenClaims</code> et renvoie des <code>TokenClaims</code>.`],
  [`def checker(claims: CurrentClaims) -> TokenClaims:`, `Une fonction définie <em>dans</em> <code>require_roles</code>. Elle « se souvient » de <code>allowed</code> : c'est une <strong>closure</strong>. C'est elle que FastAPI exécutera comme dépendance.`],
  [`if claims.role not in allowed:`, `Le rôle de l'appelant fait-il partie des rôles autorisés ?`],
  [`return checker`, `On renvoie la fonction elle-même, sans l'appeler.`],
  [`LibrarianOnly = Depends(require_roles(Role.LIBRARIAN, Role.ADMIN))`, `Une dépendance prête à l'emploi : « bibliothécaire ou administrateur ».`],
])}
${py.file('src/biblio/presentation/routers/auth.py')`
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel

from biblio.presentation.dependencies import AuthenticateDep

router = APIRouter(prefix="/auth", tags=["Authentification"])


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/token")
async def issue_token(
    form: Annotated[OAuth2PasswordRequestForm, Depends()], use_case: AuthenticateDep
) -> TokenResponse:
    return TokenResponse(access_token=await use_case.execute(form.username, form.password))
`}
${explain([
  [`form: Annotated[OAuth2PasswordRequestForm, Depends()]`, `<code>Depends()</code> sans argument demande à FastAPI de construire la classe indiquée dans le type, ici à partir des champs du <strong>formulaire</strong> <code>username</code> et <code>password</code> (format standard OAuth2).`],
  [`TokenResponse(access_token=await use_case.execute(form.username, form.password))`, `On attend le jeton, puis on le place dans la réponse : <code>{"access_token": "…", "token_type": "bearer"}</code>.`],
])}
${py.file('src/biblio/presentation/dependencies.py (ajout)')`
def get_password_hasher(request: Request) -> PasswordHasher:
    hasher: PasswordHasher = request.app.state.password_hasher
    return hasher


def get_authenticate(
    uow: UowDep,
    hasher: Annotated[PasswordHasher, Depends(get_password_hasher)],
    tokens: Annotated[TokenService, Depends(get_token_service)],
) -> Authenticate:
    return Authenticate(uow, hasher, tokens)


AuthenticateDep = Annotated[Authenticate, Depends(get_authenticate)]
`}
${py.file('src/biblio/presentation/errors.py (ajout)')`
_STATUS_BY_ERROR: dict[type[DomainError], HTTPStatus] = {
    AuthenticationError: HTTPStatus.UNAUTHORIZED,
    NotFoundError: HTTPStatus.NOT_FOUND,
    BusinessRuleViolation: HTTPStatus.CONFLICT,
    InvalidValue: HTTPStatus.UNPROCESSABLE_ENTITY,
}
`}

<h2>Protéger les routes</h2>
${py`
# Une route précise (catalogue : lecture publique, écriture protégée)
@router.post("", status_code=status.HTTP_201_CREATED, dependencies=[LibrarianOnly])
async def register_book(...): ...

@router.patch("/{book_id}", dependencies=[LibrarianOnly])
async def rename_book(...): ...

# Un router entier
router = APIRouter(prefix="/loans", tags=["Emprunts"], dependencies=[LibrarianOnly])
router = APIRouter(prefix="/members", tags=["Adhérents"], dependencies=[LibrarianOnly])

# Et pour connaître l'appelant dans une route :
async def borrow_book(payload: LoanCreate, use_case: BorrowBookDep, claims: CurrentClaims) -> LoanRead: ...
`}
${explain([
  [`dependencies=[LibrarianOnly]`, `Une liste de dépendances exécutées <strong>avant</strong> la route, dont le résultat n'est pas utilisé. Elles servent de garde, comme <code>@PreAuthorize</code> ou <code>[Authorize(Roles = …)]</code>.`],
  [`async def register_book(...): ...`, `Signature abrégée dans l'exemple : le contenu ne change pas.`],
  [`APIRouter(prefix="/loans", tags=["Emprunts"], dependencies=[LibrarianOnly])`, `Sur un router, la garde s'applique à toutes ses routes.`],
  [`claims: CurrentClaims`, `Pour connaître l'appelant, on demande les claims comme n'importe quelle autre dépendance.`],
])}
<p>N'oublie pas d'ajouter <code>auth.router</code> dans <code>api_router</code>. Dans Swagger, le bouton <strong>Authorize</strong> apparaît : il appelle <code>/api/v1/auth/token</code> puis envoie <code>Authorization: Bearer …</code> à chaque requête.</p>

<h2>Adapter les tests d'API</h2>
${py.file('tests/api/conftest.py (mise à jour)')`
from uuid import uuid4

from biblio.application.ports import TokenClaims
from biblio.domain.entities import Role
from biblio.presentation.security import get_current_claims


@pytest.fixture
def client(uow: FakeUnitOfWork, clock: FixedClock) -> TestClient:
    app = create_app(Settings(environment="test", create_schema_on_startup=False))
    app.dependency_overrides[get_uow] = lambda: uow
    app.dependency_overrides[get_clock] = lambda: clock
    app.dependency_overrides[get_current_claims] = lambda: TokenClaims(user_id=uuid4(), role=Role.LIBRARIAN)
    return TestClient(app)
`}
${explain([
  [`app.dependency_overrides[get_current_claims] = lambda: TokenClaims(...)`, `En test, on remplace l'authentification par une identité fixe de bibliothécaire, sans jeton. Les gardes de rôle utilisent ces claims.`],
])}
${callout('info', 'Override en profondeur', `<p><code>require_roles</code> dépend de <code>get_current_claims</code> : surcharger ce dernier suffit, et tout le graphe en profite. C'est l'équivalent de <code>@WithMockUser</code> en Spring Security.</p>`)}

${callout('clean', 'Check-list sécurité (OWASP API Top 10)', `
<ul>
  <li>HTTPS obligatoire en production (terminaison TLS au reverse proxy).</li>
  <li>Durée de vie courte des jetons (30 min), et rotation par refresh token si nécessaire.</li>
  <li>Secrets uniquement dans l'environnement ou un coffre (Vault, Secret Manager), jamais dans git.</li>
  <li>Limitation de débit sur <code>/auth/token</code> (reverse proxy ou <code>slowapi</code>) contre le brute-force.</li>
  <li><code>extra="forbid"</code> sur les schémas (mass assignment), et pagination bornée (<code>le=100</code>) contre l'épuisement de ressources.</li>
  <li>Pas de détail technique dans les réponses d'erreur 500.</li>
</ul>`)}
`,
  exercise: {
    title: 'Créer le premier bibliothécaire et tester les accès',
    statement: `
<ol>
  <li>Écris <code>scripts/create_user.py</code> : il demande un identifiant et un mot de passe (<code>getpass</code>), puis crée un <code>User</code> de rôle <code>admin</code> en base.</li>
  <li>Écris un test d'API qui vérifie qu'un client <strong>sans jeton</strong> reçoit une 401 sur <code>POST /api/v1/books</code>, alors que <code>GET /api/v1/books</code> reste accessible.</li>
  <li>Écris un test unitaire de <code>require_roles(Role.ADMIN)</code> qui vérifie qu'un bibliothécaire reçoit une 403.</li>
</ol>`,
    hints: [
      'Le script peut réutiliser <code>create_engine_and_session_factory</code>, <code>SqlAlchemyUnitOfWork</code> et <code>Argon2PasswordHasher</code> : c\'est un autre adaptateur d\'entrée, au même titre que l\'API.',
      'Pour le test 401, crée un client <em>sans</em> override de <code>get_current_claims</code>.',
    ],
    solution: `
${py.file('scripts/create_user.py')`
import asyncio
from getpass import getpass

from biblio.config import get_settings
from biblio.domain.entities import Role, User
from biblio.infrastructure.db.engine import create_engine_and_session_factory, create_schema
from biblio.infrastructure.db.unit_of_work import SqlAlchemyUnitOfWork
from biblio.infrastructure.security import Argon2PasswordHasher


async def main() -> None:
    username = input("Identifiant : ")
    password = getpass("Mot de passe : ")
    settings = get_settings()
    engine, session_factory = create_engine_and_session_factory(settings.database_url)
    await create_schema(engine)
    user = User.create(username=username, password_hash=Argon2PasswordHasher().hash(password), role=Role.ADMIN)
    async with SqlAlchemyUnitOfWork(session_factory) as uow:
        await uow.users.add(user)
        await uow.commit()
    await engine.dispose()
    print(f"Utilisateur {user.username} créé ({user.role})")


asyncio.run(main())
`}
${explain([
  [`username = input("Identifiant : ")`, `Affiche le texte, puis lit une ligne au clavier.`],
  [`password = getpass("Mot de passe : ")`, `Même chose, sans afficher les caractères saisis.`],
  [`Argon2PasswordHasher().hash(password)`, `Crée le hasher et calcule le hash en une seule expression.`],
])}
${py.file('tests/api/test_security.py')`
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from biblio.application.ports import TokenClaims
from biblio.config import Settings
from biblio.domain.entities import Role
from biblio.main import create_app
from biblio.presentation.dependencies import get_uow
from biblio.presentation.security import require_roles
from tests.fakes import FakeUnitOfWork


@pytest.fixture
def anonymous_client(uow: FakeUnitOfWork) -> TestClient:
    app = create_app(Settings(environment="test", create_schema_on_startup=False))
    app.dependency_overrides[get_uow] = lambda: uow
    return TestClient(app)


def test_writing_requires_a_token(anonymous_client: TestClient) -> None:
    response = anonymous_client.post(
        "/api/v1/books", json={"isbn": "9780134494166", "title": "Clean Architecture", "author": "R. C. Martin"}
    )
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_catalogue_is_public(anonymous_client: TestClient) -> None:
    assert anonymous_client.get("/api/v1/books").status_code == 200


def test_librarian_cannot_access_admin_only() -> None:
    checker = require_roles(Role.ADMIN)
    with pytest.raises(HTTPException) as error:
        checker(TokenClaims(user_id=uuid4(), role=Role.LIBRARIAN))
    assert error.value.status_code == 403
`}
${explain([
  [`def anonymous_client(uow: FakeUnitOfWork) -> TestClient:`, `Un client <strong>sans</strong> override de l'authentification, pour vérifier les refus.`],
  [`assert response.headers["www-authenticate"] == "Bearer"`, `Vérifie l'en-tête renvoyé avec la réponse 401.`],
  [`checker = require_roles(Role.ADMIN)`, `On récupère la fonction de vérification pour la tester <strong>directement</strong>, sans passer par HTTP.`],
  [`with pytest.raises(HTTPException) as error:`, `<code>as error</code> donne accès à l'exception capturée après le bloc, via <code>error.value</code>.`],
])}`,
  },
  quiz: [
    {
      q: 'Pourquoi passer <code>algorithms=["HS256"]</code> à <code>jwt.decode()</code> ?',
      options: [
        'Pour accélérer le décodage',
        "Pour n'accepter que l'algorithme attendu : sinon un attaquant pourrait forger un jeton avec un autre algorithme (<code>none</code>, confusion RS/HS)",
        "C'est facultatif et purement documentaire",
        'Pour chiffrer le jeton',
      ],
      answer: 1,
      explain: "Faire confiance à l'en-tête <code>alg</code> du jeton est une vulnérabilité classique. PyJWT exige d'ailleurs ce paramètre.",
    },
    {
      q: 'Un JWT signé en HS256 est-il chiffré ?',
      options: [
        'Oui, son contenu est illisible sans le secret',
        "Non : il est seulement signé. Son contenu (payload en base64url) est lisible par quiconque, il ne faut donc jamais y mettre de données sensibles",
        'Oui, en AES',
        'Seulement le champ sub',
      ],
      answer: 1,
      explain: "La signature garantit l'intégrité et l'authenticité, pas la confidentialité. Pour chiffrer, il faudrait un JWE.",
    },
    {
      q: 'Quelle est la différence entre 401 et 403 ?',
      options: [
        'Aucune',
        "401 : l'identité n'est pas établie (jeton absent ou invalide). 403 : l'identité est connue, mais elle n'a pas les droits",
        "401 : droits insuffisants. 403 : non authentifié",
        '403 est réservé aux administrateurs',
      ],
      answer: 1,
      explain: "Une 401 doit s'accompagner de l'en-tête <code>WWW-Authenticate</code>.",
    },
    {
      q: "Pourquoi le use case <code>Authenticate</code> calcule-t-il un hash même quand l'utilisateur n'existe pas ?",
      options: [
        'Pour remplir un cache',
        "Pour que le temps de réponse soit le même dans les deux cas et ne révèle pas l'existence du compte (énumération)",
        "Pour créer l'utilisateur à la volée",
        "C'est une erreur",
      ],
      answer: 1,
      explain: 'Argon2 est volontairement lent : sans ce calcul factice, une réponse rapide trahirait un identifiant inconnu.',
    },
    {
      q: 'Comment simuler un bibliothécaire authentifié dans les tests d\'API ?',
      options: [
        'Générer un vrai JWT dans chaque test',
        '<code>app.dependency_overrides[get_current_claims] = lambda: TokenClaims(user_id=uuid4(), role=Role.LIBRARIAN)</code>',
        'Désactiver la sécurité via une variable d\'environnement',
        'Modifier <code>oauth2_scheme</code>',
      ],
      answer: 1,
      explain: "Surcharger la dépendance racine suffit : <code>require_roles</code> reçoit les claims simulées. On garde un test dédié (sans override) pour le flux réel.",
    },
  ],
});
