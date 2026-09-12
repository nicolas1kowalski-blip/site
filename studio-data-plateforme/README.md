# Studio Data — plateforme (Angular · NestJS · PostgreSQL · DuckDB)

Migration de Studio Data vers la pile cible de l'entreprise : **front Angular**, **API NestJS** en TypeScript,
**PostgreSQL** pour le référentiel (utilisateurs, espaces, gouvernance, sources, journal) et **DuckDB natif** pour
le calcul analytique. Authentification par comptes et sessions, rôles par espace de travail, journal d'audit.

L'application complète existante (46 000 lignes, tous les écrans) reste disponible **dans la nouvelle coque**, sur
les mêmes données : chaque écran peut être réécrit en Angular à son rythme, sans période où une fonction manque.

## Démarrer en cinq minutes

```bash
cd studio-data-plateforme
npm run installer          # dépendances de l'API et du front
npm run construire         # API (TypeScript → dist), front Angular, application classique
SD_ADMIN_MOT_DE_PASSE=changez-moi npm run demarrer
```

Ouvrir http://127.0.0.1:8430 : identifiant `admin`, mot de passe choisi. Sans `SD_POSTGRES_URL`, l'API utilise
**PGlite** (PostgreSQL embarqué, fichiers dans `api/donnees/pglite`) : rien à installer pour développer. En
production, renseigner `SD_POSTGRES_URL` (voir `.env.exemple`) ; le schéma est créé et migré au démarrage.

Déploiement : `docker-compose.yml` (PostgreSQL + API + Caddy avec TLS automatique) et
`deploiement/oracle-cloud.md` (hébergement gratuit, pas à pas).

## Ce que contient la migration

| Domaine | État | Où |
|---|---|---|
| API complète : sessions, utilisateurs, espaces, rôles, documents, sources, fichiers, SQL (résultat et flux), gouvernance typée, journal, santé, OpenAPI | **livré** | `api/src` |
| Référentiel PostgreSQL (schéma Drizzle, migrations SQL versionnées, PGlite pour le développement) | **livré** | `api/src/base-de-donnees`, `api/migrations` |
| Moteur DuckDB natif par espace, fichiers déposés une fois, Parquet côté serveur | **livré** | `api/src/espaces` |
| Front Angular : connexion, coque, accueil, sources (dépôt, aperçu, optimisation, suppression), explorateur SQL (défilement virtuel, export CSV), glossaire, dictionnaire, journal, espaces et membres, utilisateurs, mon compte | **livré** | `web/src/app` |
| **Modèle de données** en Angular : liens entre sources, ajout manuel, détection par le contenu (colonnes de même nom, unicité, couverture), suppression — partagé avec l'application classique | **livré** | `api/src/modele`, `web/src/app/pages/modele` |
| **Extraction** en Angular : table de départ, tables liées d'après le modèle, colonnes (alias, transformation, agrégat), filtres (12 opérateurs), regroupement, dédoublonnage, aperçu à défilement virtuel, comptage, export CSV en flux, SQL affiché, modèles enregistrés | **livré** | `api/src/extraction`, `web/src/app/pages/extraction` |
| Application classique (tous les écrans historiques) intégrée dans la coque, sur les mêmes données | **livré** | `web-classique`, route `/classique` |
| Tests : 33 tests d'API (PGlite et PostgreSQL, dont le constructeur SQL et l'extraction jointe), 29 assertions de bout en bout dans Chromium | **livré** | `api/test`, `tests` |
| Docker, Caddy, guide Oracle Cloud | **livré** | `Dockerfile`, `docker-compose.yml`, `deploiement` |
| Réécriture en Angular des écrans restants (tables conçues, qualité et audit, objets métier, lineage, tableaux de bord, extraction avancée : synthèses de tables liées, hiérarchies, colonnes calculées) | **à faire, écran par écran** | plan ci-dessous |
| Connexion à l'annuaire de l'entreprise (OpenID Connect) | à faire | remplacer `api/src/authentification` (contrat : poser `request.contexte`) |

## Architecture

```
studio-data-plateforme/
├── api/                          NestJS 11 sur Fastify, TypeScript strict
│   ├── migrations/               0001_structure_initiale.sql … (appliquées au démarrage, une fois chacune)
│   └── src/
│       ├── main.ts · application.ts · app.module.ts
│       ├── configuration/        variables SD_* validées par Zod
│       ├── base-de-donnees/      schéma Drizzle, connexion (PostgreSQL ou PGlite), migrations
│       ├── authentification/     mots de passe (scrypt), sessions (cookie httpOnly), garde global, décorateurs
│       ├── espaces/              espaces de travail, membres et rôles, moteur DuckDB, dépôt de fichiers
│       ├── utilisateurs/ · documents/ · sources/ · fichiers/ · sql/ · gouvernance/ · journal/ · sante/ · front/
│       └── commun/               erreurs (messages en français), validation Zod
├── web/                          Angular 20 : composants autonomes, signaux, formulaires, CDK (défilement virtuel)
│   └── src/app/
│       ├── coeur/                modèles, client d'API (une méthode par route), session, notifications, gardes
│       ├── coque/                connexion, coque (rail, en-tête, choix de l'espace)
│       └── pages/                accueil, sources, explorateur, glossaire, dictionnaire, journal, espaces, utilisateurs, compte, classique
├── web-classique/                constructeur de l'application complète (réutilise studio-data-serveur/client)
├── tests/                        e2e.test.mjs (Playwright + API réelle), données d'essai
├── deploiement/                  Caddyfile, oracle-cloud.md
├── Dockerfile · docker-compose.yml · .env.exemple · eslint.config.js · formater.mjs
```

### Principes de code

- **Une langue, le français**, pour les noms de fichiers, de classes, de fonctions, de variables et de routes,
  avec les seules exceptions imposées par les cadres (`Controller`, `Injectable`, `signal`…).
- **Un fichier commence par expliquer son rôle** ; chaque route d'API a un résumé OpenAPI (`/api/docs`).
- **Les erreurs parlent à l'utilisateur** : chaque réponse d'erreur est `{ erreur: "phrase en français" }`, affichée
  telle quelle par le front.
- **Validation aux frontières** : Zod côté API (corps de requête, variables d'environnement), TypeScript strict
  partout, noms de fichiers et clés vérifiés avant tout accès disque.
- **Pas de magie** : migrations SQL lisibles, pas de génération de code, pas de décorateurs maison.

### Modèle de données (PostgreSQL)

`utilisateurs` (comptes, rôle global) · `espaces` · `membres` (rôle par espace : lecteur, editeur, administrateur) ·
`sessions` · `documents` (état de l'application et gouvernance, JSONB, une clé par document) · `sources`
(métadonnées des tables DuckDB) · `journal` (audit). Voir `api/src/base-de-donnees/schema.ts`.

Les données analytiques (contenu des sources) sont dans DuckDB : `SD_DONNEES/espaces/<code>/studio.duckdb`
et `fichiers/` (fichiers déposés, Parquet).

### Rôles

| Rôle | Peut |
|---|---|
| lecteur | consulter, interroger en SQL (lecture seule), lire la gouvernance |
| editeur | déposer et supprimer des sources, exécuter tout SQL, modifier la gouvernance |
| administrateur (espace) | gérer les membres, remise à zéro de l'espace |
| administrateur (plateforme) | créer utilisateurs et espaces ; a tous les droits dans tous les espaces |

### Une seule source de vérité pour la gouvernance

L'application classique lit et écrit un document `appState` (modèle, tables conçues, gouvernance). Les écrans
Angular (glossaire, dictionnaire) modifient **le même document** par des routes typées (`/api/gouvernance/*`) :
les deux interfaces voient les mêmes données. Quand tous les écrans seront en Angular, le document pourra être
éclaté en tables PostgreSQL sans changer les routes.

## Plan de reprise des écrans restants

Ordre conseillé, un écran à la fois, chacun validé par un test de bout en bout avant de retirer sa version
classique :

1. ~~**Modèle de données** et **Extraction**~~ — livrés (voir ci-dessus). Restent, pour l'extraction, les fonctions
   avancées de l'application classique : synthèses d'une table liée (compter, transposer), hiérarchies aplaties,
   colonnes calculées, filtre « dans le fichier ». Elles s'ajoutent au constructeur SQL (`constructeur-sql.ts`)
   sans changer l'écran.
2. **Tables conçues** — recette (sources, jointures, colonnes renommées, formats, clé primaire) exécutée par le
   même constructeur SQL, résultat matérialisé en table DuckDB.
3. **Qualité et audit** — profilage et audits en SQL côté serveur, résultats stockés dans PostgreSQL.
4. **Objets métier, applications, lineage, tableaux de bord** — routes typées ajoutées à `gouvernance/` ; le moteur
   SVG de lineage encapsulé dans un composant.
5. Retrait de `web-classique` et éclatement du document `appState` en tables.

Comment un écran est migré (méthode suivie pour le modèle et l'extraction) :
- la logique métier passe dans l'API, en TypeScript testé sans navigateur (fonctions pures quand c'est possible :
  `constructeur-sql.ts` a ses propres tests) ;
- l'écran Angular ne fait que composer une spécification et afficher ; les données restent au format de
  l'application classique quand elle les partage (liens dans `appState.relations`) ;
- une assertion de bout en bout par usage réel, et une vérification que l'application classique voit la même chose.

Les classeurs Excel sont pour l'instant déposés depuis l'application classique (lecture dans le navigateur) ;
l'écran Sources Angular accepte CSV, TXT, Parquet et JSON. Pour Excel côté serveur, l'extension DuckDB
`excel` (`read_xlsx`) est la voie prévue.

## Tests et qualité

```bash
npm run tester:api                                  # 33 tests, PGlite
SD_POSTGRES_URL_TEST=postgres://… npm run tester:api # les mêmes sur PostgreSQL
npm run tester:e2e                                  # 29 assertions, Chromium (Playwright de l'environnement)
npm run verifier                                    # Prettier --check + ESLint (typescript-eslint)
```

Le test de bout en bout enchaîne : connexion, dépôt de deux CSV depuis Angular, aperçu, détection et ajout d'un
lien dans le modèle, extraction jointe avec filtre (aperçu, comptage, export CSV téléchargé, modèle enregistré),
explorateur, glossaire, dictionnaire, création d'une utilisatrice, ajout comme lectrice, application classique
dans la coque (sources, lien et gouvernance identiques), journal, puis vérification des droits de la lectrice.

## Limites connues

- Sessions en base sans rotation ni limitation de tentatives de connexion : à ajouter avant une exposition
  publique (ou déléguer à l'annuaire via OpenID Connect).
- L'application classique et Angular écrivent le même document `appState` ; deux onglets ouverts en même temps
  peuvent se recouvrir (dernier écrit gagne), comme dans la version mono-fichier.
- Le lecteur SQL est en « lecture seule » par analyse du début de la requête (SELECT, WITH…) ; DuckDB ne
  propose pas de connexion en lecture seule par session.
