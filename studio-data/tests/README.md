# Tests — Studio Data

Suite de tests rejouable. Trois niveaux ; **aucun** ne nécessite d'accès aux CDN
(les bibliothèques externes sont neutralisées pendant les tests headless).

## Prérequis

- Node 22+
- Chromium (Playwright). Adapter `EXEC` dans `run.sh` au chemin local si besoin.
- Pour les tests SQL et les empreintes SRI : `npm i --no-save @duckdb/node-api`
  et récupérer les paquets via `npm pack` (voir `run.sh`).

## Lancer

```bash
bash tests/run.sh
```

## Contenu

- **`test_static.mjs`** — sécurité statique : versions figées, présence et cohérence des
  empreintes SRI, directives CSP, échappement des messages, purge OPFS, mode sans persistance.
- **`test_func.mjs`** — headless (Chromium) : neutralisation XSS (toasts, bannière, cartes),
  CSP compatible avec les gestionnaires inline, navigation, filtres ET/OU, génération SQL des
  tables conçues et de l'analyse de couverture, mode sans persistance (zéro écriture).
- **`test_sql.mjs`** — exécution du SQL généré sur un **vrai DuckDB** : exactitude de la
  couverture, dédoublonnage/divergence des tables conçues, conformité de format, doublons hors
  clés techniques.

## Limite connue

Le **chargement réel des bibliothèques CDN** (G6, Chart.js, Lucide, SheetJS, DuckDB-Wasm)
n'est pas couvert : il se vérifie en ouvrant `StudioData.html` dans un navigateur
(graphes, icônes, graphiques, export Excel, import d'un CSV). Voir `../SECURITY.md`.
