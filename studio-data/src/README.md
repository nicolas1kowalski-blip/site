# Sources de Studio Data

Le fichier livré `../StudioDataV7.html` est **construit** à partir de ce dossier :

```
node studio-data/build.mjs          # assemble les sources -> StudioDataV7.html
node studio-data/build.mjs --check  # vérifie que le fichier livré est à jour
```

Règle : **on modifie les sources, jamais le fichier construit.** L'ordre d'assemblage est celui de `manifest.json`
(les préfixes numériques des fichiers reflètent le regroupement par domaine, pas l'ordre d'assemblage).
Tout le code est en fonctions globales dans un même `<script>` : l'assemblage est une simple concaténation,
le résultat est strictement équivalent à l'ancien fichier monolithique.

## Découpage par fonctionnalité

### Squelette HTML et styles

- `00-entete.html` — En-tête HTML : métadonnées, politique de sécurité (CSP), chargement des bibliothèques externes, amorçage DuckDB-Wasm
- `01-styles-base.css` — Styles de base de l'application (jetons de design, composants UX)
- `02-styles-theme-v7.css` — Thème V7 : rail latéral, en-tête, mode sombre, contrastes, composants gouvernance
- `03-page.html` — Corps de la page : structure des écrans (sources, modèle, extraction, qualité, gouvernance…)

### Noyau

- `10-noyau-etat.js` — Noyau : état global de l'application
- `11-noyau-moteur-duckdb.js` — Noyau : moteur de données DuckDB-Wasm, lecture des fichiers CSV/XLSX, auto-réparation
- `12-modele-donnees-graphe.js` — Modèle de données : vue graphique, domaines de sources, création et suppression des liens, plein écran
- `13-noyau-persistance-locale.js` — Noyau : persistance locale (IndexedDB), sources optimisées Parquet
- `14-noyau-centre-de-sauvegarde.js` — Noyau : centre de sauvegarde (export / import de l'application)
- `15-noyau-navigation-theme.js` — Noyau : navigation à deux niveaux, rail latéral, icônes vectorielles, thème clair / sombre
- `16-noyau-ux-drawer-contexte.js` — Noyau : helpers visuels, barre de contexte, panneau latéral (drawer)
- `17-noyau-cockpit.js` — Noyau : cockpit d'accueil
- `18-noyau-mode-consultation.js` — Noyau : mode consultation de la gouvernance
- `19-noyau-guide-assistant.js` — Noyau : guide pas à pas sur l'écran réel, assistant
- `1A-noyau-version-changelog.js` — Noyau : version de l'application et notes de version
- `1B-noyau-ux-scroll-focus.js` — Noyau : préservation du défilement et du focus

### Gouvernance

- `20-gouvernance-dictionnaire.js` — Gouvernance : dictionnaire des données (par objet métier et par table technique)
- `21-gouvernance-listes-de-valeurs.js` — Gouvernance : listes de valeurs (référentiels de codes)
- `22-gouvernance-objets-metier.js` — Gouvernance : objets métier — structure, facettes, fiche, attributs, hiérarchies, audit global, règles de cardinalité, assistants
- `23-gouvernance-perimetres.js` — Gouvernance : périmètres métier
- `24-gouvernance-applications-processus.js` — Gouvernance : applications et processus, rattachement des sources, réconciliation objets ↔ applications
- `25-gouvernance-glossaire.js` — Gouvernance : glossaire — termes en tags, liens vers attributs, objets, applications, processus
- `26-gouvernance-analyse-impact.js` — Gouvernance : analyse d'impact (cas d'usage fusionnés dans Applis & processus)
- `27-gouvernance-historique.js` — Gouvernance : historique qualité
- `28-gouvernance-surveillance-sources.js` — Gouvernance : surveillance des sources (amont)
- `29-gouvernance-import-en-masse.js` — Gouvernance : sauvegarde et partage, import en masse
- `2A-gouvernance-dossier-export.js` — Gouvernance : dossier de gouvernance exportable
- `2C-gouvernance-personnes-validation.js` — Gouvernance : personnes, rôles par domaine, propositions et validation (démonstrateur)
- `2B-gouvernance-catalogue.js` — Gouvernance : catalogue de données (recherche, facettes, couche métier, fiches navigables)

### Lineage et graphes

- `30-lineage-par-attribut.js` — Lineage : vue par attribut (colonnes provenance → consommation)
- `31-lineage-carte-des-flux.js` — Lineage : carte des flux augmentée, réconciliation DuckDB, synchronisation depuis les données, transformations rejouables
- `32-graphes-moteur-svg.js` — Graphes : moteur SVG universel

### Modèle de données, tables conçues et sources

- `40-tables-concues.js` — Tables conçues : couche de consolidation, formats, rapport d'écarts, vue graphique du concepteur
- `41-analyse-couverture.js` — Analyse de couverture (trois tables)
- `42-sources-fusion-fichiers.js` — Sources : fusion de fichiers (une source = plusieurs fichiers)
- `43-modele-deduction-liens.js` — Modèle de données : déduction automatique des liens
- `44-rapprochement-inter-sources.js` — Rapprochement inter-sources (record linkage)
- `45-modele-analyse-impact.js` — Modèle de données : analyse d'impact
- `46-sources-connecteurs.js` — Sources : connecteurs API / JSON / Parquet / Google Sheets
- `47-sources-livraison-zip.js` — Sources : livraison ZIP
- `48-sources-mises-a-jour.js` — Sources : mises à jour et rafraîchissement
- `49-modele-rendu-svg.js` — Modèle de données : rendu SVG et interactions

### Sensibilité

- `50-sensibilite-rgpd-detection.js` — Sensibilité : détection RGPD / données personnelles
- `51-sensibilite-anonymisation.js` — Sensibilité : classification et anonymisation

### Tableaux de bord, KPI, préparation

- `60-tableaux-de-bord.js` — Tableaux de bord composables
- `61-kpi-alertes-rapport.js` — KPI, seuils, alertes et rapport global
- `62-preparation-recettes.js` — Préparation : recettes de transformation reproductibles

### Qualité et séries temporelles

- `70-series-temporelles.js` — Séries temporelles : maille, profil, calendrier, contrôles
- `71-qualite-regles-score.js` — Qualité : règles déclaratives, compilateur d'expression, score pondéré et tendance
- `72-qualite-audit.js` — Qualité : audit par lots, profilage d'un objet, filtres, inspecteur d'anomalies
- `73-qualite-profilage-doublons.js` — Qualité : clé fonctionnelle, doublons approchés, profilage, rapport, export

### Extraction et exploration

- `80-extraction-avancee.js` — Extraction avancée : SQL et gouvernance, paramétrages, vue graphique, plein écran
- `81-stats-bi.js` — Statistiques BI
- `82-explorateur-360.js` — Explorateur 360
- `83-navigateur-donnees.js` — Navigateur de données
- `84-comparateur.js` — Comparateur de tables

## Ajouter une fonctionnalité

1. Créer ou compléter le fichier du domaine concerné dans `src/`.
2. Si c'est un nouveau fichier, l'ajouter dans `manifest.json` à la position voulue (les fonctions sont globales, mais les
   constantes et le code exécuté au chargement doivent précéder leurs premiers usages).
3. Mettre à jour `APP_VERSION` et `APP_CHANGELOG` dans `1A-noyau-version-changelog.js`.
4. `node studio-data/build.mjs`, puis lancer les tests.
