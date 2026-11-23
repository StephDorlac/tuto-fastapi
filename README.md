# FastAPI Clean Lab

Tutoriel interactif (site one-page, HTML/CSS/JS sans dépendance ni build) pour apprendre à construire
une API REST **FastAPI** en **Clean Code / Clean Architecture**, à destination de développeurs Java / C#.

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
| 1 | Python pour devs Java/C# |
| 2 | Premiers pas FastAPI (prototype v0) |
| 3 | Pydantic : schémas & validation |
| 4 | Clean Architecture & import-linter |
| 5 | Domaine : entités, value objects, règles |
| 6 | Application : ports, use cases, Unit of Work |
| 7 | Infrastructure : SQLAlchemy 2 async, Alembic |
| 8 | Présentation : routers, Depends, Problem Details |
| 9 | Configuration & composition root |
| 10 | Tests : fakes, TestClient, intégration |
| 11 | Sécurité : OAuth2, JWT, rôles |
| 12 | Production : Ruff, mypy, Docker, CI |

Chaque étape : cours, encadrés « Côté Java / C# », exercice fil rouge avec solution, QCM (validé à 70 %).
La progression est stockée dans le `localStorage` du navigateur.

## Structure

```
index.html            # coquille de la page
assets/app.js         # moteur : rendu, coloration syntaxique, QCM, progression
assets/style.css      # thème clair/sombre
chapters/NN-*.js      # une étape par fichier (registerChapter({...}))
```

Pour ajouter une étape : créer `chapters/13-xxx.js` sur le modèle des autres et l'ajouter dans `index.html`.
