# FastAPI Clean Lab

Tutoriel interactif (site one-page, HTML/CSS/JS sans dépendance ni build) pour apprendre à construire
une API REST **FastAPI** en **Clean Code / Clean Architecture**, à destination de développeurs Java / C#, **sans prérequis Python**.

Fil rouge : **Biblio API**, gestion d'une médiathèque (livres, adhérents, emprunts, retards, JWT).

## Lancer

Ouvrir `index.html` dans un navigateur (double-clic). C'est tout.

Optionnel, via un petit serveur local :

```bash
python3 -m http.server 8080   # puis http://localhost:8080
```

## Contenu

| Étape | Thème |
|------:|-------|
| 0 | Bienvenue, uv, pyproject |
| 1 | Python de zéro : syntaxe, types, fonctions, classes, imports |
| 2 | Python idiomatique pour devs Java/C# |
| 3 | Premiers pas FastAPI (prototype v0) |
| 4 | Pydantic : schémas & validation |
| 5 | Clean Architecture & import-linter |
| 6 | Domaine : entités, value objects, règles |
| 7 | Application : ports, use cases, Unit of Work |
| 8 | Infrastructure : SQLAlchemy 2 async, Alembic |
| 9 | Présentation : routers, Depends, Problem Details |
| 10 | Configuration & composition root |
| 11 | Tests : fakes, TestClient, intégration |
| 12 | Sécurité : OAuth2, JWT, rôles |
| 13 | Production : Ruff, mypy, Docker, CI |

Chaque étape : cours, encadrés « Côté Java / C# », exercice fil rouge avec solution, QCM (validé à 70 %).

Aides pour débuter en Python :

- **infobulles** : dans les blocs de code, chaque mot-clé, fonction native ou notion connue est souligné en pointillé, avec sa définition et son équivalent Java / C# au survol ;
- **🔎 Décryptage ligne à ligne** sous les extraits importants ;
- **📖 Lexique** (`#/lexique`) : toutes les notions, avec recherche.
La progression est stockée dans le `localStorage` du navigateur.

## Structure

```
index.html            # coquille de la page
assets/glossary.js    # lexique Python (infobulles + page #/lexique)
assets/app.js         # moteur : rendu, coloration syntaxique, QCM, progression
assets/style.css      # thème clair/sombre
chapters/NN-*.js      # une étape par fichier (registerChapter({...}))
```

Pour ajouter une étape : créer `chapters/14-xxx.js` sur le modèle des autres et l'ajouter dans `index.html`.

Helpers disponibles dans les chapitres : `py`/`sh`/`toml`… (blocs de code), `explain([[code, texte], …])` (décryptage),
`define(terme, texte)`, `callout(type, titre, texte)`, `compare(entêtes, lignes)`, `tree(texte)`.
Pour ajouter une infobulle, il suffit d'ajouter une entrée dans `assets/glossary.js`.
