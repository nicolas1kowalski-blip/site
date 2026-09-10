# Tests — Studio Data

Suites headless (Playwright + Chromium) rejouables, versionnées avec les sources. Aucune ne nécessite d'accès aux
CDN : les bibliothèques externes sont neutralisées pendant les tests et Tailwind est fourni (`suites/tw/tw_built.css`).

## Prérequis

- Node 22+ ; Playwright et Chromium (chemins par défaut de l'environnement de développement, surchargeables :
  `PLAYWRIGHT_INDEX`, `CHROMIUM`).
- Facultatif, pour exécuter réellement le SQL généré (suite `v12111_extract_fix`) : `npm i --no-save @duckdb/node-api`
  dans ce dossier, ou `DUCKDB_NODE_API=<chemin>`. Sans lui, ces vérifications sont ignorées avec un message.

## Lancer

```bash
node studio-data/tests/run.mjs                    # chaque suite sur sa cible d'origine + régression V6/V7
node studio-data/tests/run.mjs --target v14       # toutes les suites applicables à la V14 (V12, V13, V14)
node studio-data/tests/run.mjs --target v12 --filter extract
node studio-data/tests/run.mjs --list
```

Le lanceur lit `SD_FILE` (fichier construit) et `SD_ROOT` (racine `studio-data/`) pour chaque suite ; une suite peut
aussi être lancée seule : `SD_FILE=studio-data/StudioDataV14.html node studio-data/tests/suites/v1400_architecture.mjs`.
`SHOTS=1` produit les captures d'écran (fichiers `.png` ignorés par git).

## Contenu

- **`suites/vNNNN_sujet.mjs`** — une suite par évolution ; le préfixe donne la cible minimale (v860…v1021 → V7,
  v11xx → V11, v12xx → V12, v13xx → V13, v14xx → V14). Une suite écrite pour V12 est rejouée sur V13 et V14
  (les couches héritent). Chaque assertion est une phrase en français.
- **`regression/test_*_v6|v7.mjs`** + **`.fail`** — régression des lignes figées : le fichier `.fail` liste les échecs
  connus et acceptés (empreintes npm absentes hors ligne) ; tout écart est signalé.
- **`test_static.mjs`, `test_func.mjs`, `test_sql.mjs`, `test_svg.mjs`, `run.sh`** — anciens tests de la ligne V6/V7,
  conservés tels quels.

## Écrire une suite

Copier une suite proche (`v1400_architecture.mjs` est la plus courte), garder le préambule (chemins, Playwright),
semer l'état directement dans la page (`state.tables`, `state.governance`…), tester par les fonctions globales et le
DOM, et vérifier la version par `APP_CHANGELOG[0].v === APP_VERSION` (jamais un numéro codé en dur).
