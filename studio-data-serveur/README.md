# Studio Data — version client / serveur

Même application que `studio-data/` (gouvernance, qualité, extraction, lineage… en français, V14), mais **installée
sur un serveur** : le moteur SQL et les données tournent côté serveur, le navigateur ne fait plus qu'afficher.

| | Mono-fichier (`studio-data/`) | Client / serveur (ce dossier) |
|---|---|---|
| Moteur SQL | DuckDB-Wasm dans le navigateur (1 thread, ≤ 4 Go) | **DuckDB natif** sur le serveur (tous les cœurs, RAM de la machine, débordement disque) |
| Fichiers sources | relus et ré-ingérés à chaque ouverture | **déposés une fois**, tables conservées dans la base du serveur |
| Ouverture | ré-ingestion de toutes les sources | **instantanée** : métadonnées relues, tables déjà là |
| Persistance | IndexedDB du poste | dossier de données du serveur (base `.duckdb`, fichiers, JSON) |
| Bibliothèques | CDN (internet au premier chargement) | servies par le serveur, versions épinglées, **aucun accès internet** |
| Utilisateurs | un poste | plusieurs postes sur le même espace de travail ; **authentification à venir** (voir plus bas) |

## Installation

Prérequis : Node 22+, Linux/macOS/Windows. Les sources de `studio-data/src` doivent être présentes à côté (même dépôt).

```bash
cd studio-data-serveur
npm install            # dépendances (DuckDB natif, Fastify, bibliothèques du front)
npm run construire     # assemble client/dist/ (index.html, tailwind.css, vendor/)
npm run demarrer       # écoute sur http://127.0.0.1:8420
```

Configuration par variables d'environnement (voir `.env.exemple`) : `SD_HOTE`, `SD_PORT`, `SD_DONNEES` (dossier de
données à sauvegarder), `SD_DUCKDB_THREADS`, `SD_DUCKDB_MEMOIRE`, `SD_LIMITE_LIGNES`, `SD_TAILLE_MAX_FICHIER_MO`,
`SD_AUTH_MODE`, `SD_JOURNAL`.

Déploiement : `deploiement/studio-data.service` (unité systemd) et `deploiement/nginx.conf` (reverse proxy TLS, dépôt de
fichiers sans limite de taille). Le serveur Node n'écoute qu'en local ; le TLS est terminé par le reverse proxy.

Sauvegarde : le dossier `SD_DONNEES` contient tout (`espaces/<espace>/studio.duckdb`, `fichiers/`, `etat/`, `tables/`).
Arrêter le service avant de copier la base, ou copier `etat/`, `tables/` et `fichiers/` à chaud (JSON et fichiers plats).

## Architecture

```
studio-data-serveur/
├── serveur/                      back-end Node (Fastify 5, ESM)
│   ├── serveur.mjs               point d'entrée (configuration, écoute, arrêt propre)
│   ├── application.mjs           assemblage : authentification, espaces, routes, front statique, erreurs
│   ├── configuration.mjs         variables d'environnement SD_* → objet de configuration
│   ├── espaces.mjs               espace de travail = moteur DuckDB + fichiers + documents (un par équipe demain)
│   ├── moteur/duckdb.mjs         DuckDB natif : executer(sql), flux(sql), file d'attente, réglages navigateur ignorés
│   ├── stockage/fichiers.mjs     dépôt de fichiers (écriture en flux, plages d'octets, noms vérifiés)
│   ├── stockage/documents.mjs    documents JSON (écriture atomique)
│   ├── auth/authentification.mjs point d'extension : pose request.utilisateur (mode « aucune » aujourd'hui)
│   └── routes/                   sante, sql, fichiers, etat, tables
├── client/
│   ├── construire.mjs            assemble le front à partir de ../studio-data/src (manifeste V14) + couche serveur
│   ├── manifest-serveur.json     ce qui change par rapport au mono-fichier (en-tête remplacé, modules ajoutés)
│   ├── src/00-entete-serveur.html   en-tête sans CDN ni DuckDB-Wasm
│   ├── src/98-couche-serveur/    C0 moteur distant · C1 persistance serveur · C2 version/pastille · 0X styles
│   └── dist/                     (généré) index.html, tailwind.css, vendor/
├── tests/                        api.test.mjs (node --test), e2e.test.mjs (Playwright + serveur réel)
├── deploiement/                  systemd, nginx
├── eslint.config.js · formater.mjs
└── package.json
```

### Le front réutilise les sources de `studio-data/src`, sans les copier

L'application mono-fichier ne parle au moteur qu'à travers deux contrats : `getDB()` → `{ db, conn }` (`conn.query`,
`conn.send`, `db.registerFile*`, `db.copyFileToBuffer`, `db.dropFile`) et le magasin IndexedDB (`idbGet`, `idbPut`,
`idbDel`, `idbKeys`, `idbClear`). La **couche serveur** (`client/src/98-couche-serveur`) fournit ces deux contrats
au-dessus de l'API HTTP, en remplaçant les fonctions concernées par `Studio.extend` — le mécanisme d'extension
introduit en V14. Le panneau « Architecture du code » de l'application (aide « ? ») montre la couche **Serveur** et
ses 22 extensions, et `Studio.selfCheck()` vérifie qu'elles sont toutes appliquées.

Ce que la couche serveur change (module `C1-serveur-persistance.js`) :

- **état** (`meta`) → `/api/etat/<clé>` ; **tables** → `/api/tables/<id>` : métadonnées seulement, les données sont
  dans la base DuckDB du serveur (`t_<id>`) et dans `fichiers/` (`src_<id>`, `pq_<id>.parquet`) ;
- **restoreSession** : relit les métadonnées, vérifie chaque table dans le moteur, ne renvoie aucun fichier ;
  les fichiers déposés deviennent des « fichiers distants » (`{ name, size, __distant }`) que `readFileAsText`,
  `readFileAsArrayBuffer` et `sniffFileEncoding` savent relire depuis le serveur (plage d'octets pour l'encodage) ;
- **ingestion CSV** : `row_number()` au lieu de `file_row_number` (absent de DuckDB natif), tables matérialisées
  jusqu'à 2 Go (vue au-delà) ;
- **optimisation et export Parquet** : `POST /api/tables/<id>/optimiser` et `/parquet`, exécutés sur le serveur ;
- dossier de secours local, OPFS, quota navigateur : sans objet, remplacés par des messages ou les volumes du serveur.

Le constructeur applique un seul patch aux sources d'origine : l'ajout de la couche `98-couche-serveur` dans la
table des couches de `10-noyau/00-studio.js` (le build s'arrête si cette table a changé).

### API HTTP (`/api`)

| Route | Rôle |
|---|---|
| `GET /sante` | version du serveur et de DuckDB, espace, nombre de tables et de fichiers, requêtes exécutées |
| `GET /moi` | utilisateur courant (mode d'authentification) |
| `POST /sql` `{ sql }` | résultat complet `{ colonnes: [{ nom, type }], lignes: [[…]] }` ; erreur DuckDB → 400 ; au-delà de `SD_LIMITE_LIGNES` → 413 |
| `POST /sql/flux` `{ sql }` | NDJSON : première ligne `{ colonnes }`, puis `{ lignes }` par paquet (exports, audits) |
| `PUT /fichiers/:nom` | dépôt en flux (jamais en mémoire), refus au-delà de `SD_TAILLE_MAX_FICHIER_MO` |
| `GET /fichiers/:nom` | lecture, `Range: bytes=a-b` pris en charge ; `HEAD`, `DELETE`, `GET /fichiers` (liste) |
| `GET/PUT/DELETE /etat/:cle` · `GET/DELETE /etat` | documents JSON (configuration, gouvernance, sauvegardes de secours) |
| `GET/PUT/DELETE /tables/:id` · `GET/DELETE /tables` | métadonnées des tables ; `DELETE /tables` = remise à zéro de l'espace |
| `POST /tables/:id/optimiser` | Parquet ZSTD sur le serveur + vue |
| `POST /tables/:id/parquet` | export Parquet (octets), fichier temporaire effacé |

Les noms de fichiers et de clés sont limités à `[A-Za-z0-9_.-]` (aucune traversée de répertoire). Les réglages que
l'application envoie pour DuckDB-Wasm (`SET memory_limit`, `SET temp_directory`, `PRAGMA threads`…) sont acceptés
sans être exécutés : sur le serveur, ils viennent de la configuration.

### Performance

- DuckDB natif : multi-threads, mémoire de la machine, débordement disque automatique — plus de « Out of Memory » à
  4 Go ni de « HTML FileReaders do not support writing ».
- Les fichiers ne transitent qu'une fois (dépôt en flux) ; les tables sont matérialisées dans la base, persistantes.
- Les lectures complètes (`conn.send`) sont servies en flux NDJSON par une connexion dédiée : la file principale
  n'est pas bloquée.
- Le front est identique à la version mono-fichier : les écrans qui construisaient de gros tableaux en JavaScript
  restent limités par le navigateur ; la marge de progression suivante est de déplacer ces calculs vers le serveur,
  module par module, derrière le même mécanisme `Studio.extend`.

### Authentification (à venir)

Le serveur est prêt à la recevoir sans changement de structure :

- `serveur/auth/authentification.mjs` pose `request.utilisateur = { id, nom, roles, espace }` sur chaque requête
  `/api` (mode `aucune` : utilisateur local, administrateur, espace `defaut`). Le module futur (mot de passe, OIDC,
  en-tête de reverse proxy…) n'a qu'à remplacer ce plugin : poser l'utilisateur ou répondre 401.
- l'**espace de travail** est résolu à partir de l'utilisateur (`request.espace()`) : une équipe = un espace = une
  base DuckDB + ses fichiers + ses documents, sous `donnees/espaces/<espace>/`. Plusieurs espaces peuvent coexister
  dans le même processus (`Espaces`).
- `GET /api/moi` renvoie déjà l'identité ; le front pourra l'afficher et adapter ses droits (`roles`).

Tant que le mode est `aucune`, **n'exposez le serveur qu'à un réseau de confiance** (écoute locale + reverse proxy
avec authentification, VPN…).

## Tests et qualité

```bash
npm run tester:api     # 15 tests d'API (node --test, application injectée, dossier temporaire)
npm run tester:e2e     # 26 assertions de bout en bout : serveur réel + Chromium (Playwright de l'environnement)
node formater.mjs --check
node /opt/node22/lib/node_modules/eslint/bin/eslint.js -c eslint.config.js .
```

Le test de bout en bout dépose deux CSV, exécute une jointure sur le serveur, lit en flux, sauvegarde la gouvernance,
recharge la page (aucun fichier renvoyé, mêmes identifiants de tables), relit un fichier distant, ré-ingère,
optimise en Parquet, exporte, supprime une table et remet l'espace à zéro. `SHOTS=1` produit une capture dans
`tests/captures/`.

## Limites connues

- Un seul espace de travail (`defaut`) et aucun utilisateur tant que l'authentification n'est pas livrée.
- La surveillance de dossiers locaux (`showDirectoryPicker`) reste une fonction du navigateur (Chrome/Edge) : les
  fichiers relus sont renvoyés au serveur à chaque rafraîchissement.
- Les fichiers NDJSON intermédiaires (`src_<id>.ndjson`, sources Excel/JSON/extractions) restent dans `fichiers/`
  après ingestion ; ils sont effacés avec la table.
- Le « mode sans persistance » n'écrit plus la configuration, mais les tables déjà déposées restent sur le serveur.
