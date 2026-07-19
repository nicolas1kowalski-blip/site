# Studio Data — version bureau (Tauri + DuckDB natif)

Squelette **phase 1** pour porter l'application web `StudioData.html` en application de
bureau, afin de lever le plafond mémoire du navigateur (≈ 2 Go) et gérer des dizaines de
millions de lignes : la mémoire devient celle du PC, le débordement se fait sur le vrai disque,
et tous les cœurs sont utilisés.

L'idée directrice : **on ne réécrit pas l'application.** Toute l'appli parle déjà SQL à une
couche unique (`getDB().conn.query(sql)`). On remplace juste cette couche par un pont vers un
**DuckDB natif** exécuté côté Rust. La même interface, les mêmes fonctionnalités.

## Ce que contient ce squelette (phase 1)

```
studio-desktop/
├── README.md                      ← ce fichier (feuille de route)
├── src/
│   ├── index.html                 ← charge l'app + le pont natif (à remplir avec StudioData.html)
│   └── native-duck.js             ← PONT : remplace window.__duckdbPromise par le backend natif
└── src-tauri/
    ├── Cargo.toml                 ← dépendances Rust (tauri, duckdb, arrow)
    ├── build.rs                   ← script de build Tauri standard
    ├── tauri.conf.json            ← config de la fenêtre / du bundle
    └── src/
        ├── main.rs                ← point d'entrée
        └── db.rs                  ← commandes DuckDB (open, query, load_csv, export_parquet)
```

## Prérequis (à installer sur le poste, une fois)

- **Rust** : https://rustup.rs
- **Tauri CLI v2** : `cargo install tauri-cli --version "^2"`
- Dépendances système Tauri (WebView2 sur Windows, WebKitGTK sur Linux) : voir
  https://tauri.app/start/prerequisites/

> ⚠️ Ce squelette n'a **pas** pu être compilé dans l'environnement de préparation (pas de
> toolchain Rust ni d'accès réseau aux registres). Le code est écrit pour Tauri v2 + le crate
> `duckdb` ; la première compilation ajustera peut-être une version de dépendance.

## Lancer en développement

```bash
cd studio-desktop
cargo tauri dev
```

## Construire l'exécutable

```bash
cargo tauri build
# -> src-tauri/target/release/ (+ installeurs dans .../bundle/)
```

## Feuille de route (on avance « doucement », phase par phase)

- **Phase 1 — Fondation (ce squelette).** Fenêtre Tauri, backend DuckDB natif, commandes
  `db_query` / `db_load_csv` / `db_export_parquet`, et le pont `native-duck.js` qui expose un
  faux `window.__duckdbPromise` compatible avec le code existant. Objectif : afficher l'appli
  et exécuter une requête SQL réelle sur DuckDB natif.
- **Phase 2 — Chargement de fichiers par chemin.** Sélecteur de fichiers natif → `read_csv_auto`
  directement sur le chemin disque (aucune copie en mémoire). Remplace `registerFileHandle`.
- **Phase 3 — Streaming & export.** Pagination par curseur (`db_query_stream`) et export CSV/
  Parquet via le disque, pour brancher `duckStreamRows` et les exports.
- **Phase 4 — Persistance.** Base DuckDB sur fichier (`studio.duckdb`) au lieu d'IndexedDB :
  les sources et la gouvernance survivent nativement, sans quota navigateur.
- **Phase 5 — Finitions.** Menu natif, glisser-déposer de fichiers, mises à jour auto.

## Comment le front est réutilisé

`src/index.html` charge d'abord `native-duck.js` (qui pose `window.__duckdbPromise`), puis le
contenu de `StudioData.html`. Comme l'appli attend justement `window.__duckdbPromise`, elle
fonctionne telle quelle — il suffira, à terme, de coller le corps de `StudioData.html` dans
`src/index.html` (ou de le charger), en retirant le `<script type="module">` d'init DuckDB-Wasm
puisque le pont natif le remplace.
