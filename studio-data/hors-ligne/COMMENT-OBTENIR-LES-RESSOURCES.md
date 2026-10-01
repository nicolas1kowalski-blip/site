# Les ressources de la version hors ligne

La V13 ordinaire va chercher quatre choses sur internet au premier chargement. La version
hors ligne les range dans le fichier. Ce dossier contient ces quatre choses ; elles ne sont
**pas** suivies par git (le moteur de données pèse 34 Mo à lui seul), il faut donc les
reconstituer une fois sur une machine qui a accès au réseau.

## Ce qu'il faut, et pourquoi

| Fichier attendu | Ce que c'est |
|---|---|
| `tailwind.css` | La feuille de style, construite une fois pour toutes au lieu d'être calculée dans le navigateur |
| `xlsx.full.min.js` | Lecture et écriture des classeurs Excel |
| `chart.umd.js` | Les graphiques |
| `lucide.min.js` | Les icônes |
| `duckdb-navigateur.js` | Le moteur de données, côté page |
| `duckdb-ouvrier.js` | Le moteur de données, côté ouvrier (le fil d'exécution séparé) |
| `duckdb-moteur.wasm` | Le moteur de données lui-même, 34 Mo |

Les versions sont celles que la V13 charge aujourd'hui : garder les mêmes évite tout écart
de comportement entre la version en ligne et la version hors ligne.

## Les commandes

Depuis un dossier de travail quelconque, sur une machine connectée :

```bash
mkdir -p travail && cd travail
npm install @duckdb/duckdb-wasm@1.29.0 xlsx@0.18.5 chart.js@4.4.6 lucide@0.474.0 \
            tailwindcss@3 esbuild --no-audit --no-fund
```

**Le moteur de données.** La partie « côté page » importe la bibliothèque Arrow : il faut
donc la rassembler en un seul fichier.

```bash
echo 'import * as duckdb from "@duckdb/duckdb-wasm/dist/duckdb-browser.mjs"; window.duckdb = duckdb;' > entree.js
./node_modules/.bin/esbuild entree.js --bundle --format=iife --minify --target=es2020 \
    --outfile=duckdb-navigateur.js
cp node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js duckdb-ouvrier.js
cp node_modules/@duckdb/duckdb-wasm/dist/duckdb-eh.wasm             duckdb-moteur.wasm
```

Le choix de la variante `eh` (gestion des exceptions) plutôt que `mvp` est volontaire :
elle est plus petite (34 Mo contre 39) et tous les navigateurs actuels la prennent.

**La feuille de style.** Elle est construite en lisant `StudioDataV13.html`, pour ne garder
que les classes réellement employées.

```bash
printf '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n' > tw.css
node node_modules/tailwindcss/lib/cli.js -i tw.css -o tailwind.css \
     --content ../studio-data/StudioDataV13.html --minify
```

**Les trois bibliothèques.**

```bash
cp node_modules/xlsx/dist/xlsx.full.min.js      .
cp node_modules/chart.js/dist/chart.umd.js      .
cp node_modules/lucide/dist/umd/lucide.min.js   .
```

Puis déposer les sept fichiers dans `studio-data/hors-ligne/ressources/`.

## Construire

```bash
cd studio-data
node build.mjs --target v13      # si StudioDataV13.html n'est pas à jour
node tools/hors-ligne.mjs
```

L'outil s'arrête s'il reste la moindre adresse extérieure dans la page produite : une
version « hors ligne » qui irait encore chercher quelque chose dehors serait pire qu'inutile.

## Vérifier

```bash
node tests/suites/v1350_hors_ligne.mjs
```

Le contrôle ouvre le fichier depuis le disque, **met le navigateur hors ligne** et refuse
toute adresse http(s). Il vérifie que la page s'ouvre, que les bibliothèques et la feuille
de style sont là, que le moteur démarre, qu'une requête employant les tournures propres à
la V13 s'exécute, et qu'un fichier déposé est bien lu et chargé.
