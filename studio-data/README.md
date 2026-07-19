# Studio Data — atelier de gouvernance des données

Application **mono-fichier** (`StudioData.html`) de gouvernance, qualité et exploitation de
données : elle s'ouvre dans un navigateur (Chrome/Edge recommandés), sans installation ni
serveur. Les données restent **sur le poste** (moteur SQL dans le navigateur + stockage local).

## Ouvrir l'application

Double-cliquer sur `StudioData.html` (ou le déposer dans un navigateur). Un accès internet est
nécessaire au premier chargement pour récupérer les bibliothèques (CDN) — voir « Limites ».

## Ce que fait l'application

Organisée en 4 phases :

1. **① Données & Modèle**
   - **Sources** : import CSV / TXT (`;`, `|`…) / Excel, fusion multi-fichiers, mise à jour
     manuelle ou par dossiers surveillés (auto-rafraîchissement), optimisation Parquet,
     thèmes (groupes de sources).
   - **🧱 Tables** : tables *conçues* à partir d'une ou plusieurs sources — mapping et
     renommage métier des colonnes, ordre des colonnes, filtres à l'entrée, enrichissements
     par jointure, attributs calculés, **formats déclarés** (date, décimal, booléen, code) avec
     normalisation tolérante et comptage des non-conformes, **clé primaire** (dédoublonnage des
     lignes strictement identiques, rapport d'écarts entre sources), **clés étrangères**
     (lien modèle créé automatiquement + contrôle d'orphelins), traçabilité `SOURCE_ORIGINE`,
     reconstruction automatique quand une source est mise à jour.
   - **Modèle de données** : liens entre tables (création graphique par clic ou glisser,
     suppression au clic sur un lien, déduction automatique depuis le contenu), deux périmètres
     séparés (modèle des sources / modèle des tables conçues), vue compacte ou schéma complet,
     zones et couleurs par thème, plein écran, règles métier conditionnelles, hiérarchies.
2. **② Exploitation** : extraction multi-tables (jointures automatiques via le modèle,
   fonctions type Excel, NB.SI.ENS…), comparateur, explorateur, **statistiques** dont
   l'**analyse de couverture** (population filtrée × dimensions 1-2 × présence d'éléments liés).
3. **③ Qualité & Audit** : profiling complet (complétude, cardinalité, hygiène de saisie,
   formats, doublons stricts **et hors clés techniques**), filtres et volume d'analyse,
   audit d'objet métier (règles, hiérarchies, facettes), consultation/export des anomalies.
4. **④ Gouvernance** : dictionnaire, objets métier (sources et rôles, structure, facettes avec
   applicabilité, hiérarchies à parents admis), modèle objet, périmètres, glossaire, cas
   d'usage, lineage, historique qualité, sauvegarde/partage.

## Architecture technique

- **Un seul fichier HTML** : HTML + CSS (Tailwind) + JS vanilla (~8 000 lignes).
- **Moteur SQL : DuckDB-Wasm** (module chargé en tête de fichier) — tout le calcul est fait en
  SQL dans le navigateur ; gros fichiers gérés par « lecture directe » (vues sur fichier),
  Parquet ZSTD, base adossée au disque (OPFS) quand le navigateur le permet.
- **Persistance : IndexedDB** (données + configuration), restauration de session automatique.
- **Graphes : G6 (AntV)** · **Graphiques : Chart.js** · **Excel : SheetJS**.

## Limites connues / points d'attention

- Bibliothèques chargées depuis des **CDN** (jsDelivr…), désormais en **versions figées avec
  contrôle d'intégrité (SRI)** : nécessite internet au premier chargement. Voir `SECURITY.md`
  pour l'audit complet et la piste « entreprise 100 % autonome ».
- Volumétrie : confortable jusqu'à ~5-10 M de lignes (au-delà : Parquet/OPFS, puis la piste
  bureau `studio-desktop/`).
- Outil **local mono-utilisateur** : pas d'authentification ni de traçabilité multi-utilisateurs
  (le partage se fait par export de bundles).

## `studio-desktop/`

Squelette **Tauri** (DuckDB natif, sans limite mémoire navigateur) pour une future version
bureau — chantier en pause, voir son README.
