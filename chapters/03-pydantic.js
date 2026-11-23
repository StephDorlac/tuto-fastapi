registerChapter({
  id: 'ch03',
  title: 'Pydantic : schémas & validation',
  subtitle: 'Des DTO typés et validés : contraintes, validateurs, modèles distincts pour entrée et sortie, PATCH partiel et pagination générique.',
  duration: '45 min',
  objectives: [
    'Déclarer des schémas avec <code>Field</code>, <code>ConfigDict</code> et des validateurs.',
    "Séparer les schémas d'entrée (<code>BookCreate</code>, <code>BookUpdate</code>) et de sortie (<code>BookRead</code>).",
    'Maîtriser <code>model_dump</code>, <code>model_validate</code> et <code>exclude_unset</code>.',
    'Écrire un modèle générique <code>Page[T]</code>.',
  ],
  content: `
<h2>BaseModel en bref</h2>
<p>Un modèle Pydantic est une classe dont les champs sont typés. À l'instanciation, Pydantic <strong>valide et convertit</strong> les données, ou lève une <code>ValidationError</code>.</p>
${py`
from pydantic import BaseModel, ValidationError

class BookCreate(BaseModel):
    isbn: str
    title: str
    copies: int = 1

BookCreate(isbn="9780134494166", title="Clean Architecture", copies="2")
# -> copies=2 : la chaîne "2" est convertie en int (mode "lax" par défaut)

try:
    BookCreate(isbn="9780134494166", title="Clean Architecture", copies="deux")
except ValidationError as exc:
    print(exc.errors())   # [{'type': 'int_parsing', 'loc': ('copies',), ...}]
`}
${compare(['Pydantic v2', 'Java (Jackson + Bean Validation)', 'C# (System.Text.Json + DataAnnotations)'], [
  ['<code>Field(min_length=1, max_length=255)</code>', '<code>@Size(min=1, max=255)</code>', '<code>[StringLength(255, MinimumLength=1)]</code>'],
  ['<code>Field(ge=1, le=100)</code>', '<code>@Min(1) @Max(100)</code>', '<code>[Range(1, 100)]</code>'],
  ['<code>EmailStr</code>', '<code>@Email</code>', '<code>[EmailAddress]</code>'],
  ['<code>@field_validator</code>', '<code>ConstraintValidator</code>', '<code>IValidatableObject</code> / FluentValidation'],
  ['<code>model_dump()</code> / <code>model_dump_json()</code>', '<code>objectMapper.convertValue</code> / <code>writeValueAsString</code>', '<code>JsonSerializer.Serialize</code>'],
  ['<code>Model.model_validate(obj)</code>', '<code>objectMapper.convertValue(obj, X.class)</code>', '<code>JsonSerializer.Deserialize</code>'],
  ['<code>extra="forbid"</code>', '<code>FAIL_ON_UNKNOWN_PROPERTIES</code>', '<code>JsonUnmappedMemberHandling.Disallow</code>'],
])}

<h2>Les schémas du catalogue</h2>
<p>Règle d'or : <strong>un schéma par intention</strong>. Ce que le client envoie à la création, ce qu'il peut modifier et ce qu'on lui renvoie sont trois contrats différents.</p>
${py`
from typing import Annotated, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Title = Annotated[str, Field(min_length=1, max_length=255)]
Author = Annotated[str, Field(min_length=1, max_length=255)]


class BookCreate(BaseModel):
    """Corps de POST /books."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    isbn: Annotated[str, Field(min_length=10, max_length=17, examples=["978-0-13-449416-6"])]
    title: Title
    author: Author
    copies: Annotated[int, Field(ge=1, le=100)] = 1

    @field_validator("isbn")
    @classmethod
    def remove_separators(cls, value: str) -> str:
        return value.replace("-", "").replace(" ", "")


class BookUpdate(BaseModel):
    """Corps de PATCH /books/{id} : tous les champs sont optionnels."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: Title | None = None
    author: Author | None = None


class BookRead(BaseModel):
    """Représentation renvoyée au client."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    isbn: str
    title: str
    author: str
    total_copies: int
    available_copies: int
`}

${callout('clean', 'Alias de types réutilisables', `<p><code>Title = Annotated[str, Field(...)]</code> évite de dupliquer les contraintes. On définit la règle une seule fois, sous un nom métier explicite.</p>`)}

<h3>Les options de ConfigDict utiles</h3>
<ul>
  <li><code>extra="forbid"</code> : un champ inconnu (faute de frappe, tentative d'injecter <code>available_copies</code>…) provoque une 422 au lieu d'être ignoré en silence.</li>
  <li><code>str_strip_whitespace=True</code> : supprime les espaces en début et fin de chaîne.</li>
  <li><code>from_attributes=True</code> : permet <code>BookRead.model_validate(obj)</code> depuis un objet à attributs (entité, ligne ORM), et pas seulement depuis un <code>dict</code>.</li>
  <li><code>frozen=True</code> : instances immuables.</li>
</ul>

<h2>Validateurs</h2>
${py`
from pydantic import field_validator, model_validator

class LoanSearch(BaseModel):
    borrowed_after: date | None = None
    borrowed_before: date | None = None

    @model_validator(mode="after")           # validation multi-champs
    def check_range(self) -> Self:
        if self.borrowed_after and self.borrowed_before and self.borrowed_after > self.borrowed_before:
            raise ValueError("borrowed_after doit précéder borrowed_before")
        return self
`}
${callout('warn', 'Format ≠ règle métier', `
<p>Pydantic est parfait pour vérifier la <strong>forme</strong> : types, longueurs, plages. Mais la validité d'un ISBN (sa somme de contrôle) est une <strong>règle du domaine</strong> :
elle doit rester vraie que la donnée arrive par HTTP, par un import CSV ou par un script. Elle vivra dans un <em>value object</em> du domaine (étape 5), et non dans le schéma HTTP.</p>`)}

<h2>Sérialiser : model_dump et exclude_unset</h2>
${py`
patch = BookUpdate.model_validate({"title": "Clean Code"})

patch.model_dump()                    # {'title': 'Clean Code', 'author': None}
patch.model_dump(exclude_unset=True)  # {'title': 'Clean Code'}   <- seuls les champs ENVOYÉS
patch.model_fields_set                # {'title'}

BookRead.model_validate(book_entity)  # depuis un objet (from_attributes=True)
book_read.model_dump_json()           # str JSON
`}
<p><code>exclude_unset=True</code> est la clé d'un <strong>PATCH correct</strong> : il faut distinguer « champ absent » (ne pas toucher) de « champ envoyé à <code>null</code> ».</p>

<h2>Pagination générique : Page[T]</h2>
${py`
from typing import Generic, TypeVar
from pydantic import BaseModel

T = TypeVar("T")

class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int

@app.get("/books")
async def list_books(...) -> Page[BookRead]:
    ...
`}
<p>OpenAPI affichera un schéma nommé <code>Page[BookRead]</code>, avec <code>items</code> correctement typé. C'est l'équivalent d'un <code>Page&lt;BookDto&gt;</code> générique.</p>

<h2>response_model et filtrage</h2>
<p>Quand le type de retour annoncé est <code>BookRead</code>, FastAPI <strong>filtre</strong> la réponse selon ce schéma. Un champ sensible présent sur l'objet retourné (un hash de mot de passe, par exemple) n'est donc pas exposé s'il n'est pas déclaré.
Si tu dois retourner un type différent de celui que tu veux documenter, utilise <code>response_model=...</code> dans le décorateur.</p>

${callout('fil', 'Où vont vivre ces schémas ?', `<p>Dans l'architecture finale, ils seront rangés dans <code>biblio/presentation/schemas/</code>. Pydantic est un détail de la <strong>couche de présentation</strong>. Le domaine, lui, restera en dataclasses pures (choix discuté à l'étape 4).</p>`)}
`,
  exercise: {
    title: 'Un PATCH qui refuse le vide',
    statement: `
<p>Améliore <code>BookUpdate</code> pour qu'un PATCH <strong>sans aucun champ</strong> (<code>{}</code>) soit rejeté avec une 422.
Écris ensuite l'endpoint <code>PATCH /books/{book_id}</code> du prototype v0, qui ne modifie que les champs envoyés.</p>`,
    hints: [
      "Un <code>@model_validator(mode=\"after\")</code> a accès à <code>self.model_fields_set</code>.",
      "<code>model.model_copy(update={...})</code> crée une copie modifiée d'un modèle Pydantic.",
    ],
    solution: `
${py`
class BookUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: Title | None = None
    author: Author | None = None

    @model_validator(mode="after")
    def at_least_one_field(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("Au moins un champ doit être fourni")
        return self


@app.patch("/books/{book_id}", tags=["Livres"])
async def update_book(book_id: UUID, payload: BookUpdate) -> BookOut:
    book = _books.get(book_id)
    if book is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Livre introuvable")
    updated = book.model_copy(update=payload.model_dump(exclude_unset=True))
    _books[book_id] = updated
    return updated
`}
<p>Remarque : <code>{"title": null}</code> passe le validateur (le champ est bien « envoyé »). Selon ton contrat d'API, tu peux aussi refuser les <code>None</code> explicites, ce qu'on fera dans le use case de l'étape 6.</p>`,
  },
  quiz: [
    {
      q: 'Quelle méthode Pydantic v2 convertit un modèle en dictionnaire ?',
      options: ['<code>.dict()</code>', '<code>.model_dump()</code>', '<code>.to_dict()</code>', '<code>.serialize()</code>'],
      answer: 1,
      explain: "<code>.dict()</code> est l'ancienne API de Pydantic v1, aujourd'hui dépréciée. En v2, les méthodes sont préfixées par <code>model_</code> : <code>model_dump</code>, <code>model_validate</code>, <code>model_copy</code>…",
    },
    {
      q: 'Pour un PATCH, comment obtenir uniquement les champs réellement envoyés par le client ?',
      options: [
        '<code>model_dump(exclude_none=True)</code>',
        '<code>model_dump(exclude_unset=True)</code>',
        '<code>model_dump(exclude_defaults=True)</code>',
        '<code>model_dump(partial=True)</code>',
      ],
      answer: 1,
      explain: "<code>exclude_unset</code> s'appuie sur <code>model_fields_set</code>. <code>exclude_none</code> confondrait « absent » et « explicitement null ».",
    },
    {
      q: 'À quoi sert <code>ConfigDict(from_attributes=True)</code> ?',
      options: [
        "À rendre tous les champs optionnels",
        "À construire le modèle via <code>model_validate()</code> depuis un objet à attributs (entité, ORM), pas seulement un dict",
        'À générer les attributs SQL',
        'À autoriser les champs inconnus',
      ],
      answer: 1,
      explain: "C'est l'ancien <code>orm_mode</code>. Pydantic lit alors <code>obj.title</code> au lieu de <code>obj[\"title\"]</code>.",
    },
    {
      q: 'Avec <code>extra="forbid"</code>, que se passe-t-il si le client envoie <code>{"title": "X", "available_copies": 99}</code> sur un schéma sans ce champ ?',
      options: ['Le champ est ignoré', 'Le champ est ajouté au modèle', 'Une erreur de validation : la requête reçoit une 422', 'Une 500'],
      answer: 2,
      explain: 'Refuser les champs inconnus rend le contrat explicite et protège contre le « mass assignment ».',
    },
    {
      q: "Pourquoi ne pas placer la vérification de la somme de contrôle de l'ISBN dans le schéma Pydantic ?",
      options: [
        "Parce que Pydantic ne sait pas faire de calcul",
        "Parce que c'est une règle métier qui doit s'appliquer quelle que soit l'origine de la donnée : elle appartient au domaine",
        'Parce que cela ralentit la sérialisation',
        "On doit justement l'y placer",
      ],
      answer: 1,
      explain: "Le schéma valide la forme à la frontière HTTP. Les invariants métier vivent dans le domaine, pour être appliqués partout (HTTP, CLI, import…).",
    },
  ],
});
