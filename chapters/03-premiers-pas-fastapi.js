registerChapter({
  id: 'ch03',
  title: 'Premiers pas avec FastAPI',
  subtitle: "Un prototype naïf de Biblio API : routes, paramètres de chemin et de requête, corps JSON, codes HTTP et Swagger.",
  duration: '40 min',
  objectives: [
    'Lancer une application FastAPI avec <code>fastapi dev</code> et explorer <code>/docs</code>.',
    'Déclarer des paramètres de chemin, de requête et de corps, avec leur validation.',
    'Choisir entre <code>async def</code> et <code>def</code> pour une opération.',
    "Identifier ce qui ne va pas dans un prototype « tout-en-un » (motivation de l'étape 5).",
  ],
  content: `
<h2>Hello Biblio</h2>
${py.file('src/biblio/main.py')`
from fastapi import FastAPI

app = FastAPI(title="Biblio API", version="0.1.0")

@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
`}
${explain([
  [`from fastapi import FastAPI`, `Importe la classe <code>FastAPI</code> depuis le paquet <code>fastapi</code>, installé à l'étape 0.`],
  [`app = FastAPI(title="Biblio API", version="0.1.0")`, `Crée l'<strong>application</strong>. Le titre et la version apparaissent dans la documentation Swagger. La variable <code>app</code> est celle que le serveur va chercher.`],
  [`@app.get("/health")`, `Décorateur de route : la fonction juste en dessous répondra à <code>GET /health</code>. C'est l'équivalent de <code>@GetMapping("/health")</code>.`],
  [`async def health() -> dict[str, str]:`, `Une fonction asynchrone sans paramètre qui renvoie un dictionnaire de chaînes. On la nomme ici <em>endpoint</em> (ou <em>path operation</em>).`],
  [`return {"status": "ok"}`, `Le <code>dict</code> renvoyé est automatiquement sérialisé en JSON : <code>{"status": "ok"}</code>, avec un statut 200 par défaut.`],
])}
${sh`
uv run fastapi dev src/biblio/main.py     # rechargement à chaud, port 8000
# -> http://127.0.0.1:8000/health
# -> http://127.0.0.1:8000/docs     (Swagger UI)
# -> http://127.0.0.1:8000/redoc    (ReDoc)
# -> http://127.0.0.1:8000/openapi.json
`}
<p><code>fastapi dev</code> lance Uvicorn en mode développement. En production, on utilisera <code>fastapi run</code> (étape 13).
Ouvre <code>/docs</code> : l'endpoint y figure déjà, avec le schéma de sa réponse, déduit de l'annotation <code>-&gt; dict[str, str]</code>.</p>

<h2>Prototype v0 : un CRUD de livres en mémoire</h2>
<p>Commençons par la version la plus directe possible, celle que l'on voit dans beaucoup de tutoriels. Elle fonctionne, mais tu vas voir qu'elle pose problème.</p>
${py.file('src/biblio/main.py')`
from uuid import UUID, uuid4

from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel

app = FastAPI(title="Biblio API (v0)")


class BookIn(BaseModel):
    isbn: str
    title: str
    author: str


class BookOut(BookIn):
    id: UUID


_books: dict[UUID, BookOut] = {}   # "base de données" en mémoire


@app.post("/books", status_code=status.HTTP_201_CREATED)
async def create_book(payload: BookIn) -> BookOut:
    book = BookOut(id=uuid4(), **payload.model_dump())
    _books[book.id] = book
    return book


@app.get("/books")
async def list_books(q: str | None = None, limit: int = 20) -> list[BookOut]:
    books = list(_books.values())
    if q:
        books = [b for b in books if q.lower() in b.title.lower()]
    return books[:limit]


@app.get("/books/{book_id}")
async def get_book(book_id: UUID) -> BookOut:
    book = _books.get(book_id)
    if book is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Livre introuvable")
    return book
`}
${explain([
  [`from uuid import UUID, uuid4`, `<code>UUID</code> est le type identifiant (≈ <code>UUID</code> / <code>Guid</code>). <code>uuid4()</code> en génère un aléatoire.`],
  [`class BookIn(BaseModel):`, `Un <strong>schéma Pydantic</strong> : la classe hérite de <code>BaseModel</code>. Elle décrit le JSON attendu en entrée, comme un DTO annoté <code>@Valid</code>.`],
  [`isbn: str
title: str
author: str`, `Les champs du schéma. Sans valeur par défaut, ils sont <strong>obligatoires</strong>. Un JSON sans <code>title</code> sera rejeté avec une erreur 422.`],
  [`class BookOut(BookIn):`, `<code>BookOut</code> hérite de <code>BookIn</code> : il a les mêmes champs, plus <code>id</code>.`],
  [`_books: dict[UUID, BookOut] = {}`, `Un dictionnaire global qui sert de « base de données » en mémoire. Le <code>_</code> initial signale qu'il est interne au module.`],
  [`@app.post("/books", status_code=status.HTTP_201_CREATED)`, `Route <code>POST /books</code> qui répond <strong>201 Created</strong> en cas de succès. <code>status.HTTP_201_CREATED</code> est simplement la constante <code>201</code>.`],
  [`async def create_book(payload: BookIn) -> BookOut:`, `Le paramètre <code>payload</code> est de type <code>BookIn</code> (un modèle Pydantic). FastAPI comprend qu'il faut le lire dans le <strong>corps JSON</strong> de la requête et le valider.`],
  [`BookOut(id=uuid4(), **payload.model_dump())`, `<code>payload.model_dump()</code> convertit le modèle en dictionnaire <code>{"isbn": …, "title": …, "author": …}</code>. <code>**</code> <strong>déplie</strong> ce dictionnaire en arguments nommés. La ligne équivaut donc à <code>BookOut(id=…, isbn=…, title=…, author=…)</code>.`],
  [`_books[book.id] = book`, `Range le livre dans le dictionnaire, avec son id comme clé.`],
  [`async def list_books(q: str | None = None, limit: int = 20) -> list[BookOut]:`, `<code>q</code> et <code>limit</code> ne figurent pas dans le chemin et sont de type simple : FastAPI les lit dans la <strong>query string</strong> (<code>?q=clean&amp;limit=5</code>). Leurs valeurs par défaut les rendent facultatifs.`],
  [`list(_books.values())`, `<code>.values()</code> donne les valeurs du dictionnaire, et <code>list(…)</code> les copie dans une vraie liste.`],
  [`if q:`, `Vrai si <code>q</code> n'est ni <code>None</code> ni une chaîne vide.`],
  [`[b for b in books if q.lower() in b.title.lower()]`, `Filtre les livres dont le titre contient <code>q</code>, sans tenir compte de la casse. <code>in</code> teste ici la présence d'une sous-chaîne.`],
  [`return books[:limit]`, `Slicing : les <code>limit</code> premiers éléments.`],
  [`@app.get("/books/{book_id}")`, `<code>{book_id}</code> est une variable de chemin. Comme la fonction a un paramètre du même nom, FastAPI y place la valeur et la convertit en <code>UUID</code> (une erreur 422 si ce n'est pas un UUID).`],
  [`book = _books.get(book_id)`, `<code>get</code> renvoie <code>None</code> si la clé est absente, au lieu de lever une erreur.`],
  [`raise HTTPException(status_code=..., detail="Livre introuvable")`, `Lever une <code>HTTPException</code> interrompt la fonction et renvoie une réponse 404 avec <code>{"detail": "Livre introuvable"}</code>.`],
])}

<h3>Comment FastAPI interprète la signature</h3>
<ul>
  <li><code>book_id: UUID</code> figure dans le chemin <code>{book_id}</code> : c'est un <strong>paramètre de chemin</strong>, converti et validé. <code>/books/abc</code> renvoie une <strong>422</strong>.</li>
  <li><code>q: str | None = None</code> et <code>limit: int = 20</code> sont des types simples absents du chemin : ce sont des <strong>paramètres de requête</strong> (<code>?q=clean&amp;limit=5</code>). Un paramètre avec une valeur par défaut est optionnel.</li>
  <li><code>payload: BookIn</code> est un modèle Pydantic : il est lu dans le <strong>corps JSON</strong>.</li>
  <li>Le type de retour sert de <strong>modèle de réponse</strong> : FastAPI valide la sortie, <em>filtre</em> les champs non déclarés et documente le schéma.</li>
</ul>

${compare(['Concept', 'FastAPI', 'Spring MVC', 'ASP.NET Core'], [
  ['Route GET', '<code>@app.get("/books/{id}")</code>', '<code>@GetMapping("/books/{id}")</code>', '<code>[HttpGet("books/{id}")]</code> / <code>MapGet</code>'],
  ['Paramètre de chemin', '<code>book_id: UUID</code>', '<code>@PathVariable UUID id</code>', '<code>[FromRoute] Guid id</code>'],
  ['Paramètre de requête', '<code>q: str | None = None</code>', '<code>@RequestParam(required=false)</code>', '<code>[FromQuery] string? q</code>'],
  ['Corps JSON', '<code>payload: BookIn</code>', '<code>@RequestBody @Valid BookIn</code>', '<code>[FromBody] BookIn</code>'],
  ['Statut de succès', '<code>status_code=201</code>', '<code>@ResponseStatus(CREATED)</code>', '<code>Results.Created(...)</code>'],
  ['Erreur HTTP', '<code>raise HTTPException(404)</code>', '<code>throw new ResponseStatusException(NOT_FOUND)</code>', '<code>return NotFound()</code>'],
  ['Regroupement de routes', '<code>APIRouter</code>', '<code>@RestController</code> + <code>@RequestMapping</code>', '<code>Controller</code> / <code>MapGroup</code>'],
])}

<h2>Valider les paramètres avec Annotated</h2>
<p>Pour ajouter des contraintes et de la documentation, on utilise <code>Annotated[type, métadonnées]</code>. C'est la forme recommandée, car le type reste propre pour mypy :</p>
${py`
from typing import Annotated
from fastapi import Path, Query

@app.get("/books")
async def list_books(
    q: Annotated[str | None, Query(max_length=100, description="Recherche dans le titre")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[BookOut]:
    books = sorted(_books.values(), key=lambda b: b.title)
    if q:
        books = [b for b in books if q.lower() in b.title.lower()]
    return books[offset : offset + limit]

@app.get("/books/{book_id}")
async def get_book(book_id: Annotated[UUID, Path(description="Identifiant du livre")]) -> BookOut:
    ...
`}
${explain([
  [`q: Annotated[str | None, Query(max_length=100, description="...")] = None`, `<code>Annotated[Type, info]</code> se lit « un <code>Type</code>, accompagné de cette info ». mypy ne voit que <code>str | None</code>. FastAPI lit <code>Query(…)</code> : « paramètre de query string, 100 caractères maximum, avec cette description dans Swagger ».`],
  [`limit: Annotated[int, Query(ge=1, le=100)] = 20`, `<code>ge</code> signifie <em>greater or equal</em> (≥ 1) et <code>le</code> <em>less or equal</em> (≤ 100). <code>?limit=500</code> renvoie donc une 422.`],
  [`sorted(_books.values(), key=lambda b: b.title)`, `<code>sorted</code> renvoie une nouvelle liste triée. <code>key=lambda b: b.title</code> trie par titre. <code>lambda b: b.title</code> est une fonction anonyme (≈ <code>b -&gt; b.getTitle()</code>).`],
  [`books[offset : offset + limit]`, `Slicing pour paginer : les éléments de <code>offset</code> inclus à <code>offset + limit</code> exclu.`],
  [`Annotated[UUID, Path(description="...")]`, `Même principe pour un paramètre de <strong>chemin</strong> : <code>Path(…)</code> sert à le documenter ou à le contraindre.`],
  [`...`, `Le corps est omis dans l'exemple : il est identique à la version précédente.`],
])}

<h2>Ce que renvoie une erreur de validation</h2>
${http`
GET /books?limit=500

HTTP/1.1 422 Unprocessable Entity
content-type: application/json

{
  "detail": [
    {
      "type": "less_than_equal",
      "loc": ["query", "limit"],
      "msg": "Input should be less than or equal to 100",
      "input": "500",
      "ctx": {"le": 100}
    }
  ]
}
`}
<p>Tu n'as écrit aucune ligne pour obtenir cette erreur : elle est générée automatiquement. Le champ <code>loc</code> indique précisément l'origine (<code>query</code>, <code>path</code>, <code>body</code>…).</p>

<h2>async def ou def ?</h2>
${compare(['Déclaration', 'Exécution', 'Quand l\'utiliser'], [
  ['<code>async def</code>', "Directement sur la boucle d'événements", 'Code non bloquant : drivers async, <code>httpx</code>, <code>await</code>…'],
  ['<code>def</code>', 'Dans un pool de threads géré par FastAPI', 'Code bloquant inévitable : bibliothèque synchrone, SDK legacy…'],
])}
${callout('tip', 'Règle simple', `<p>Toute notre pile (SQLAlchemy async, aiosqlite) est asynchrone : nos opérations seront donc toutes en <code>async def</code>.
Le seul vrai danger, c'est d'appeler du code bloquant dans une coroutine.</p>`)}

<h2>Ce qui ne va pas dans ce prototype</h2>
<p>Ce code tient en 40 lignes et fonctionne. Pourtant, imagine-le avec les emprunts, les retards, les adhérents et l'authentification :</p>
<ul>
  <li><strong>Règles métier dans les routes</strong> : où placer « 3 emprunts maximum » ? Directement dans la route, mélangé au HTTP.</li>
  <li><strong>Le modèle HTTP est le modèle métier</strong> : <code>BookOut</code> sert à la fois de DTO, d'entité et de ligne en base.</li>
  <li><strong>Stockage couplé</strong> : passer du <code>dict</code> à PostgreSQL oblige à réécrire chaque route.</li>
  <li><strong>Testabilité</strong> : impossible de tester une règle sans passer par HTTP.</li>
  <li><strong>État global</strong> : <code>_books</code> est une variable de module partagée entre tests et requêtes.</li>
</ul>
${callout('fil', 'Suite du fil rouge', `<p>Garde ce prototype : à l'étape 4, on améliore ses schémas Pydantic. À l'étape 5, on le <strong>découpe</strong> selon la Clean Architecture.</p>`)}
`,
  exercise: {
    title: 'Compléter le CRUD v0',
    statement: `
<p>Ajoute au prototype :</p>
<ol>
  <li><code>DELETE /books/{book_id}</code>, qui renvoie <strong>204 No Content</strong>, ou <strong>404</strong> si le livre n'existe pas.</li>
  <li>Le paramètre <code>offset</code> sur la liste, avec <code>ge=0</code>.</li>
  <li>Un <code>tags=["Livres"]</code> sur les routes, pour regrouper la documentation Swagger.</li>
</ol>
<p>Teste avec Swagger (<code>/docs</code> → <em>Try it out</em>) ou avec <code>curl</code>.</p>`,
    hints: [
      'Un endpoint 204 ne renvoie pas de corps : annote le retour avec <code>-&gt; None</code>.',
      '<code>dict.pop(key, None)</code> renvoie <code>None</code> si la clé est absente.',
    ],
    solution: `
${py`
@app.delete("/books/{book_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Livres"])
async def delete_book(book_id: UUID) -> None:
    if _books.pop(book_id, None) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Livre introuvable")
`}
${explain([
  [`@app.delete(..., status_code=status.HTTP_204_NO_CONTENT, tags=["Livres"])`, `Route <code>DELETE</code> qui répond 204 (sans corps). <code>tags</code> regroupe les routes par rubrique dans Swagger.`],
  [`-> None`, `La fonction ne renvoie rien, ce qui est cohérent avec un 204.`],
  [`_books.pop(book_id, None)`, `<code>pop</code> retire la clé et renvoie sa valeur, ou <code>None</code> (le second argument) si la clé n'existait pas. On supprime et on vérifie l'existence en une seule opération.`],
])}
${sh`
curl -s -X POST localhost:8000/books -H 'content-type: application/json' \
     -d '{"isbn":"9780134494166","title":"Clean Architecture","author":"Robert C. Martin"}'
curl -i -X DELETE localhost:8000/books/<id>      # HTTP/1.1 204 No Content
curl -i -X DELETE localhost:8000/books/<id>      # HTTP/1.1 404 Not Found
`}`,
  },
  quiz: [
    {
      q: 'Quelle URL affiche par défaut la documentation Swagger interactive ?',
      options: ['<code>/swagger-ui.html</code>', '<code>/docs</code>', '<code>/api-docs</code>', '<code>/openapi</code>'],
      answer: 1,
      explain: "<code>/docs</code> (Swagger UI) et <code>/redoc</code> sont fournis par défaut, et le schéma brut est servi sur <code>/openapi.json</code>.",
    },
    {
      q: 'Avec <code>@app.get("/books/{book_id}")</code> et <code>book_id: UUID</code>, que renvoie <code>GET /books/abc</code> ?',
      options: ['404 Not Found', '400 Bad Request', '422 Unprocessable Entity', '500 Internal Server Error'],
      answer: 2,
      explain: "La conversion vers UUID échoue avant même l'appel de la fonction. FastAPI renvoie une 422, avec <code>loc: [\"path\", \"book_id\"]</code>.",
    },
    {
      q: "Un paramètre de fonction <code>limit: int = 20</code> qui n'apparaît pas dans le chemin est interprété comme…",
      options: ['un champ du corps JSON', 'un paramètre de requête optionnel', 'un en-tête HTTP', 'une dépendance'],
      answer: 1,
      explain: 'Les types simples absents du chemin sont des query params. La valeur par défaut les rend optionnels.',
    },
    {
      q: 'Comment FastAPI exécute-t-il une opération déclarée avec <code>def</code> (sans async) ?',
      options: [
        "Sur la boucle d'événements, ce qui la bloque",
        'Dans un pool de threads, pour ne pas bloquer la boucle',
        'Dans un processus séparé',
        "Il refuse de démarrer",
      ],
      answer: 1,
      explain: "FastAPI délègue les fonctions synchrones à un threadpool (via AnyIO). C'est la solution de repli pour du code bloquant.",
    },
    {
      q: 'Quel est le défaut principal du prototype v0 du point de vue architecture ?',
      options: [
        "Il n'utilise pas assez de décorateurs",
        "Les règles métier, le modèle HTTP et le stockage sont mélangés dans les routes : difficile à faire évoluer et à tester",
        'Il utilise des UUID au lieu d\'entiers',
        'Il est asynchrone',
      ],
      answer: 1,
      explain: "C'est exactement ce que la Clean Architecture va corriger : séparer le domaine, les cas d'utilisation, les adaptateurs et la présentation.",
    },
  ],
});
