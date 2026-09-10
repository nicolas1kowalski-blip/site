# Conventions de code — Studio Data

Ces règles s'appliquent à tout nouveau code (V14 et suivantes) et servent de cible quand on retouche l'ancien.
Elles sont vérifiées, quand c'est possible, par ESLint (`studio-data/eslint.config.js`) et par `Studio.selfCheck()`.

## Langue et vocabulaire

- **Français** dans les commentaires, les messages, la documentation et les libellés ; **anglais** technique
  accepté dans les identifiants quand le terme est établi (`render`, `state`, `table`, `edge`). Un identifiant
  ne mélange pas les deux dans un même mot.
- Un nom dit **ce que c'est** ou **ce que ça fait**, jamais comment c'est stocké : `businessObjects` plutôt que
  `arr`, `upstreamNodes` plutôt que `up`, `isSpillWriteError` plutôt que `chk`.
- Les abréviations autorisées sont celles du métier ou du domaine technique : `bo` (objet métier), `attr`, `sql`,
  `csv`, `id`, `html`. Pas d'abréviation inventée (`nb`, `cnt`, `tbl`, `e2`, `s2`) dans le code nouveau.

## Fichiers et modules

- Un fichier = une responsabilité, nommé `NN-domaine-sujet.js` dans le dossier de son domaine.
- **En-tête obligatoire** : un bloc de commentaires qui répond à *quoi* (ce que fait le module), *pourquoi*
  (le besoin, la décision) et *comment* (les points d'entrée, ce qu'il étend). Les fichiers des couches V12/V13
  sont le modèle.
- Les fonctions déclarées au premier niveau sont **globales** (contrainte du `<script>` unique) : leur nom porte
  donc un **préfixe de module** — `adv` (extraction avancée), `lf` (carte des flux), `cat` (catalogue),
  `gov`/`bo` (gouvernance), `v11…`/`v12…`/`v13…`/`v14…` (couches). Un nouveau module choisit un préfixe court,
  unique, et s'y tient.
- L'état d'un écran vit dans un objet nommé (`govState`, `v12State`…), jamais dans des variables globales éparses.

## Fonctions

- Petites et nommées par un **verbe** : `buildBoLineageGraph`, `renderGovernance`, `openBoLineage`,
  `advPlanJoins`. Une fonction qui renvoie du HTML finit par `Html` ; un prédicat commence par `is`/`has`/`can`.
- Paramètres explicites plutôt que lecture de l'écran (`el('…').value`) au milieu d'une fonction métier : la
  lecture du DOM se fait dans le gestionnaire d'événement, le calcul dans une fonction pure et testable.
- Pas de nombre magique : une constante nommée (`V12_UP_MAX_DEPTH`, `ADV_LINK_MODES`).
- Retours homogènes : une fonction qui peut échouer renvoie `{ err }` ou lève une `Error` avec un message
  **en français, actionnable** (que faire ensuite), jamais un message brut du moteur seul.

## Étendre l'existant

```js
Studio.extend('nomDeLaFonction', (base) => function (…) { …; return base.apply(this, arguments); }, { motif: 'pourquoi' });
```

- Toujours **appeler la base** (sauf remplacement volontaire, documenté dans `motif`).
- Toujours renseigner `motif` : c'est ce que lit le panneau Architecture.
- Une extension ne dépend pas de l'ordre des autres extensions ; si l'ordre compte, le dire dans l'en-tête.
- Interdit : `fn = function …`, `window[nom] = …` (ESLint `no-func-assign`, revue).

## HTML et rendu

- Les écrans sont rendus par des fonctions `render…` qui produisent une chaîne HTML ; tout texte issu des données
  passe par `escapeHTML`. Les identifiants d'éléments sont en `kebab-case` (`adv-col-tbl`) ou `camelCase` historique
  (`advExtractBody`) — on garde le style du fichier que l'on modifie.
- Un attribut `data-ro="keep"` marque un élément à conserver lors des ré-organisations de la couche UX.
- Les styles d'une couche sont dans son fichier CSS (`0Z-v14-styles.css`), préfixés (`.v14-…`), avec leur variante
  sombre (`html[data-theme="dark"] …`).

## Lisibilité mesurée

- **Mise en forme** : Prettier (`tools/formater.mjs`), 120 colonnes, guillemets simples, pas de virgule finale ; une
  instruction par ligne. Lancer l'outil avant de livrer ; `--check` échoue si un fichier n'est pas formaté.
- **Seuils de non-régression** (`tools/lisibilite-mesurer.mjs --strict`, repris dans l'onglet Lisibilité du panneau
  Architecture) : ≤ 15 lignes de logique de plus de 160 caractères hors gabarit HTML et texte, 0 ligne à trois
  instructions ou plus, ≤ 15 % de variables locales à nom court. On ne remonte jamais au-dessus ; on abaisse quand on
  retouche un fichier.
- **Noms courts** : `tools/renommer-locales.mjs` renomme d'après l'initialiseur ou l'usage (`table`, `asset`,
  `governance`, `element`, `attributeRow`, `base`…) sans jamais créer de collision ; ce qu'il laisse demande une
  décision humaine — la prendre au moment où l'on modifie le code, pas en masse.
- **Gabarits HTML** : un retour à la ligne après chaque bloc (`tools/gabarits-aerer.mjs`) ; les gabarits très longs
  sont à extraire dans une fonction `…Html()` nommée d'après ce qu'elle rend.

## Tests

- Chaque évolution livre une suite dans `studio-data/tests/suites/vNNNN_sujet.mjs` (headless, autonome, `SD_FILE`).
- Une assertion = une phrase en français qui décrit le comportement attendu, lisible par un non-développeur.
- Les suites ne dépendent pas d'un numéro de version : elles vérifient `APP_VERSION === APP_CHANGELOG[0].v`.
- Avant de livrer : `node build.mjs --all`, ESLint, `node tests/run.mjs` (toutes cibles), V6 inchangée.

## Versions et journal

- Numérotation `majeur.mineur.correctif` par ligne (V7, V11, V12, V13, V14). Une couche reprend les correctifs de la
  ligne dont elle hérite et le note dans son journal.
- Chaque entrée du journal explique **le besoin** et **ce qui change pour l'utilisateur**, pas le détail technique.
