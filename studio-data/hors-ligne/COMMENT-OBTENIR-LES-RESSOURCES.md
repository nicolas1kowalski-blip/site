# Construire la version hors ligne

La V13 ordinaire va chercher sept choses sur internet au premier chargement : la feuille
de style, trois bibliothèques (tableur, graphiques, icônes) et le moteur de données. La
version hors ligne les range **dans** le fichier.

Ces sept choses ne sont pas suivies par git — le moteur pèse 34 Mo à lui seul — il faut
donc les reconstituer **une fois**, sur une machine connectée à internet.

## Ce qu'il faut avoir

**Node.js, version 22 ou plus.** C'est tout. Rien d'autre à installer.

- Windows : <https://nodejs.org> → le bouton « LTS » → installer → **fermer la fenêtre de
  commandes et en ouvrir une nouvelle**. Une fenêtre ouverte avant l'installation ne
  connaît pas encore le nouveau programme ; c'est la cause la plus fréquente du message
  *« npm n'est pas reconnu en tant que commande interne ou externe »*.
- macOS : <https://nodejs.org>, ou `brew install node`.
- Linux : le gestionnaire de paquets de la distribution.

Pour vérifier, dans une fenêtre **neuve** :

```
node --version
```

Il doit répondre quelque chose comme `v22.11.0`. S'il ne répond rien, Node.js n'est pas
installé ou la fenêtre est trop ancienne.

## Les trois commandes

Dans le dossier `studio-data` du projet :

```
node build.mjs --target v13
node tools/hors-ligne-preparer.mjs
node tools/hors-ligne.mjs
```

C'est tout, et c'est **identique sous Windows, macOS et Linux**.

| Commande | Ce qu'elle fait | Durée |
|---|---|---|
| `build.mjs --target v13` | construit `StudioDataV13.html` à partir des sources | quelques secondes |
| `hors-ligne-preparer.mjs` | va chercher les sept ressources et les prépare | 1 à 3 minutes |
| `hors-ligne.mjs` | range les sept ressources dans la page | quelques secondes |

Le résultat est **`StudioDataV13-hors-ligne.html`**, un seul fichier d'environ 14 Mo.
Il s'ouvre par un double-clic, sans serveur et sans réseau.

La deuxième commande peut être relancée autant de fois que nécessaire : elle recommence
proprement et efface son dossier de travail à la fin.

## Ce que la préparation fait, et pourquoi

| Ressource | Ce que c'est |
|---|---|
| `tailwind.css` | la feuille de style, construite une fois pour toutes au lieu d'être calculée dans le navigateur |
| `xlsx.full.min.js` | lecture et écriture des classeurs Excel |
| `chart.umd.js` | les graphiques |
| `lucide.min.js` | les icônes |
| `duckdb-navigateur.js` | le moteur de données, côté page |
| `duckdb-ouvrier.js` | le moteur de données, côté ouvrier (le fil d'exécution séparé) |
| `duckdb-moteur.wasm` | le moteur de données lui-même, 34 Mo |

Deux points méritent une explication :

- **La feuille de style est construite en lisant `StudioDataV13.html`**, pour n'y garder
  que les classes réellement employées. C'est pourquoi la V13 doit être construite
  *avant* : une feuille complète pèserait bien plus lourd.
- **La variante `eh` du moteur** (gestion des exceptions) est préférée à `mvp` : elle est
  plus petite — 34 Mo contre 39 — et tous les navigateurs actuels la prennent.

Les versions installées sont exactement celles que la V13 charge aujourd'hui depuis
internet. Les garder identiques évite tout écart de comportement entre la version en ligne
et la version hors ligne.

La dernière commande **s'arrête** s'il reste la moindre adresse extérieure dans la page
produite : une version « hors ligne » qui irait encore chercher quelque chose dehors
serait pire qu'inutile.

## Vérifier

```
node tests/suites/v1350_hors_ligne.mjs
```

Le contrôle ouvre le fichier depuis le disque, **met le navigateur hors ligne** et refuse
toute adresse http(s). Il vérifie que la page s'ouvre, que les bibliothèques et la feuille
de style sont là, que le moteur démarre, qu'une requête employant les tournures propres à
la V13 s'exécute, et qu'un fichier déposé est bien lu et chargé. Huit contrôles.

## Si quelque chose ne va pas

| Ce qui s'affiche | Ce qu'il faut faire |
|---|---|
| `'npm' n'est pas reconnu…` | Node.js n'est pas installé, **ou** la fenêtre a été ouverte avant son installation : ouvrez-en une nouvelle |
| `'node' n'est pas reconnu…` | idem |
| `StudioDataV13.html est absent` | lancez d'abord `node build.mjs --target v13` |
| `Ressources manquantes dans …` | lancez `node tools/hors-ligne-preparer.mjs` |
| `Des adresses extérieures subsistent` | une ressource n'a pas été remplacée ; relancez la préparation |

**N'essayez pas de recopier des commandes à la main.** La marche à suivre manuelle qui
figurait ici auparavant employait des tournures propres à Linux — la barre oblique
inverse en fin de ligne, `cp`, `mkdir -p` — qui ne veulent rien dire dans l'invite de
commandes Windows. Le script fait la même chose, correctement, sur chaque système.
