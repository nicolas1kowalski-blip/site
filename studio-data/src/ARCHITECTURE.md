# Architecture de Studio Data (V14)

Studio Data est une application **100 % locale, en un seul fichier HTML** : aucun serveur, aucun paquet à
installer pour l'utiliser. Cette contrainte structure tout le reste — ce document explique comment le code
est organisé pour rester maintenable malgré elle.

## 1. Un seul fichier livré, des sources découpées

- Les sources vivent dans `studio-data/src/`, rangées **par domaine** (un dossier = un domaine, un fichier = une
  responsabilité). Le préfixe numérique d'un fichier sert au tri visuel, pas à l'ordre d'assemblage.
- `studio-data/build.mjs` **concatène** les parties listées dans un manifeste (`manifest-v14.json`…) : HTML et CSS
  d'abord, puis tous les fichiers JS dans **un seul `<script>` classique** (pas de modules ES : les gestionnaires
  `onclick="…"` du HTML appellent des fonctions globales).
- Chaque cible a son manifeste et son fichier livré : `manifest.json` → V7 (ligne stable), `manifest-v11.json` → V11,
  `manifest-v12.json` → V12, `manifest-v13.json` → V13, `manifest-v14.json` → V14. Une cible = la précédente **plus une
  couche**. V6 (`StudioDataV6.html`) est figée et n'est pas construite.

```
src/
  00-squelette/           entête HTML (CSP, bibliothèques, amorce DuckDB), styles de base, thème V7, corps de page
  10-noyau/               00-studio (architecture), 01-types (modèle de données), état, moteur DuckDB, persistance,
                          navigation, drawer, cockpit, guide, version/journal, défilement
  20-gouvernance/         dictionnaire, listes de valeurs, objets métier, périmètres, applications & processus,
                          glossaire, impact, historique, surveillance, import en masse, dossier, personnes, catalogue
  30-lineage-graphes/     lineage par attribut, carte des flux, moteur SVG universel
  40-modele-sources/      tables conçues, couverture, fusion, déduction des liens, rapprochement, connecteurs, ZIP, MAJ, rendu SVG du modèle
  50-sensibilite/         détection RGPD, anonymisation
  60-tableaux-preparation/ tableaux de bord, KPI/alertes, recettes
  70-qualite/             séries temporelles, règles et score, audit, profilage et doublons
  80-extraction-exploration/ extraction avancée, statistiques, explorateur 360, navigateur, comparateur
  90-couche-v11/          ergonomie (fiches lecture, palette, accueil, saisie)
  92-couche-v12/          « toute l'application » (plan de travail Extraire, listes d'entrée, jeux temporaires, l'un ou l'autre lien,
                          origines, lineage objet, restitutions, amont complet, liens lisibles, correctifs Extraire)
  94-couche-v13/          gouvernance simple (vocabulaire métier, proposer, fiche en 3 questions, question, domaine/accueil)
  96-couche-v14/          version technique : panneau Architecture
```

## 2. Le mécanisme d'extension : `Studio.extend`

Une couche **n'écrit jamais par-dessus** une fonction existante ; elle l'**étend** :

```js
Studio.extend('renderGovernance', (base) => function () {
    const result = base.apply(this, arguments);   // comportement d'origine conservé
    v12AfterGovernance();                          // ajout de la couche
    return result;
}, { motif: 'bandeau de synthèse après le rendu' });
```

- `10-noyau/00-studio.js` remplace la fonction globale par sa version enrichie et **enregistre** l'extension : nom,
  module (fichier) appelant, couche, motif, base.
- Le build pose `Studio.beginModule('<fichier>')` devant chaque fichier JS et, en fin de script,
  `Studio.registerModules([...])` avec les fonctions déclarées par chaque fichier.
- `Studio.extensionsOf(nom)` donne la chaîne complète ; `Studio.selfCheck()` détecte une extension sans base, une
  fonction déclarée deux fois, une extension non appliquée ; `Studio.apiMap()` alimente `API.md` et l'export JSON.
- Le panneau **Architecture du code** (aide « ? » ou palette) montre tout cela dans l'application.
- ESLint interdit l'ancien motif (`no-func-assign`) : `fn = function …` ne passe plus.

Pourquoi des extensions plutôt qu'une réécriture ? Chaque ligne (V7, V11, V12, V13) reste livrable et testable seule,
et une correction du noyau profite à toutes les lignes sans fusion manuelle.

## 3. État et modèle de données

- Tout l'état applicatif est dans `state` (`10-noyau/10-noyau-etat.js`) : `state.tables`, `state.relations`,
  `state.governance`, `state.advExtract`… Les états d'écran vivent dans des objets dédiés (`govState`, `v11State`,
  `v12State`, `v13State`, `v14State`).
- Le modèle de données est **documenté par des typedefs JSDoc** dans `10-noyau/01-types.js` (aucun code exécuté) :
  `TableSource`, `Relation`, `BusinessObject`, `BusinessAttribute`, `Asset`, `Proposal`, `Governance`, `FlowNode`,
  `GraphNode`, `ExtractSpec`… Un champ nouveau se déclare d'abord là.
- Les données sont dans DuckDB-Wasm (une table `t_<id>` par source, colonne technique `__rn` = numéro de ligne) ; la
  persistance locale (IndexedDB / OPFS) est dans `13-noyau-persistance-locale.js`.

## 4. Vérification

| Outil | Commande | Ce qu'il garantit |
|---|---|---|
| Build | `node studio-data/build.mjs --all` / `--check` | fichiers livrés = sources |
| Index de l'API | `node studio-data/build.mjs --api` | `src/API.md` à jour |
| Globales | `node studio-data/tools/globales-generer.mjs` | `eslint.globals.json` à jour (à relancer après ajout d'une globale) |
| ESLint | `node <eslint>/bin/eslint.js -c studio-data/eslint.config.js studio-data/src` | références inter-fichiers valides, pas de réassignation de fonction, pas de clé dupliquée |
| Tests | `node studio-data/tests/run.mjs [--target v14] [--filter mot]` | 47 suites headless + régression V6/V7 |
| Mise en forme | `node studio-data/tools/formater.mjs [--check]` | Prettier, 120 colonnes, marge de 8 espaces conservée |
| Renommage | `node studio-data/tools/renommer-locales.mjs [--dry-run]` | variables locales à nom court renommées par portée, sans collision |
| Gabarits | `node studio-data/tools/gabarits-aerer.mjs [--dry-run]` | retours à la ligne après les blocs HTML des gabarits longs |
| Lisibilité | `node studio-data/tools/lisibilite-mesurer.mjs [--strict] [--list]` | mesures par fichier (`src/LISIBILITE.json`), seuils de non-régression |
| Auto-contrôle | dans l'application : Architecture → Auto-contrôle | extensions et déclarations cohérentes |

## 5. Ajouter une fonctionnalité (V14+)

1. Créer un fichier dans le domaine concerné (ou dans `96-couche-v14/` si c'est une couche) avec un en-tête qui dit
   **quoi, pourquoi, comment** (voir CONVENTIONS.md).
2. L'ajouter au(x) manifeste(s) : les déclarations doivent précéder leurs usages au chargement ; une extension doit
   venir après le fichier qui déclare la base.
3. Étendre l'existant avec `Studio.extend(...)`, jamais par assignation.
4. Documenter les champs nouveaux dans `01-types.js`, la version dans `0Z-v14-version.js`.
5. `node tools/formater.mjs`, `node tools/globales-generer.mjs`, ESLint, `node tools/lisibilite-mesurer.mjs --strict`, `node build.mjs --all`, `node tests/run.mjs`, puis une suite dédiée dans `tests/suites/`.
