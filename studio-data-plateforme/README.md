# Studio Data — plateforme (Angular · NestJS · PostgreSQL · DuckDB)

Migration de Studio Data vers la pile cible de l'entreprise : **front Angular**, **API NestJS** en TypeScript,
**PostgreSQL** pour le référentiel (utilisateurs, espaces, gouvernance, sources, journal) et **DuckDB natif** pour
le calcul analytique. Authentification par comptes et sessions, rôles par espace de travail, journal d'audit.

L'application complète existante (46 000 lignes, tous les écrans) reste disponible **dans la nouvelle coque**, sur
les mêmes données : chaque écran peut être réécrit en Angular à son rythme, sans période où une fonction manque.

## Démarrer en cinq minutes

```bash
cd studio-data-plateforme
npm run installer          # dépendances de l'API et du front
npm run construire         # API (TypeScript → dist), front Angular, application classique
SD_ADMIN_MOT_DE_PASSE=changez-moi npm run demarrer
```

Ouvrir http://127.0.0.1:8430 : identifiant `admin`, mot de passe choisi. Sans `SD_POSTGRES_URL`, l'API utilise
**PGlite** (PostgreSQL embarqué, fichiers dans `api/donnees/pglite`) : rien à installer pour développer. En
production, renseigner `SD_POSTGRES_URL` (voir `.env.exemple`) ; le schéma est créé et migré au démarrage.

Déploiement : `docker-compose.yml` (PostgreSQL + API + Caddy avec TLS automatique) et
`deploiement/oracle-cloud.md` (hébergement gratuit, pas à pas).

## Ce que contient la migration

| Domaine | État | Où |
|---|---|---|
| API complète : sessions, utilisateurs, espaces, rôles, documents, sources, fichiers, SQL (résultat et flux), gouvernance typée, journal, santé, OpenAPI | **livré** | `api/src` |
| Référentiel PostgreSQL (schéma Drizzle, migrations SQL versionnées, PGlite pour le développement) | **livré** | `api/src/base-de-donnees`, `api/migrations` |
| Moteur DuckDB natif par espace, fichiers déposés une fois, Parquet côté serveur | **livré** | `api/src/espaces` |
| Front Angular : connexion, coque, accueil, sources (dépôt, aperçu, optimisation, suppression), explorateur SQL (défilement virtuel, export CSV), glossaire, dictionnaire, journal, espaces et membres, utilisateurs, mon compte | **livré** | `web/src/app` |
| **Modèle de données** en Angular : liens entre sources, ajout manuel, détection par le contenu (colonnes de même nom, unicité, couverture), suppression — partagé avec l'application classique | **livré** | `api/src/modele`, `web/src/app/pages/modele` |
| **Extraction** en Angular : table de départ, tables liées d'après le modèle, colonnes (alias, transformation, agrégat), colonnes calculées (formule avec [colonne]), synthèses d'une table liée (nombre, distincts, liste, N premières valeurs, sans multiplier les lignes), hiérarchies aplaties (identifiant / parent → une colonne par niveau), filtres (13 opérateurs dont « dans une liste fournie » par fichier ou texte collé), regroupement, dédoublonnage, pré-remplissage depuis un objet métier, aperçu à défilement virtuel, comptage, export CSV en flux, SQL affiché, modèles enregistrés, résultat enregistré comme source | **livré** | `api/src/extraction`, `web/src/app/pages/extraction` |
| **Tables conçues** en Angular : recette de consolidation (sources contributrices avec correspondance des colonnes et filtres d'entrée, attributs renommés et ordonnés, clé, formats normalisés, enrichissements directs ou via une table de lien avec validité par statut ou période, colonnes calculées, clés étrangères), SQL affiché, aperçu, construction et reconstruction (automatique après mise à jour d'une source), contribution par source, rapport d'écarts entre sources — format de recette partagé avec l'application classique | **livré** | `api/src/tables-concues`, `web/src/app/pages/tables-concues` |
| **Exploitation** en Angular : tableaux de bord composables (tuiles barres, courbe, camembert, tableau, indicateur ; filtres globaux ; seuils et alertes ; graphiques SVG sans bibliothèque), comparateur de deux sources (clé simple ou composite, colonne par colonne, résultat matérialisé en source), séries temporelles (profil par série : pas, régularité, trous, doublons, plateaux, couverture, retard ; calendrier), rapprochement inter-sources (clé de blocage, similarités Jaro-Winkler / Levenshtein / égalité, seuils, décisions, golden record et table des liens) | **livré** | `api/src/exploitation`, `web/src/app/composants/graphique-svg.component.ts`, `web/src/app/pages/{tableaux-de-bord,comparateur,series-temporelles,rapprochement}` |
| **Lineage** en Angular : carte des flux dérivée des données (tables conçues, applications, dictionnaire, objets métier) et complétée à la main, rôles déduits (maître, source, référentiel, consommateur), fraîcheur (fréquence du dictionnaire, SLA du lien), réconciliation d'une alimentation dans DuckDB (clé, attributs contrôlés, transformations, écarts et exemples), contrôles de cohérence du modèle, parcours d'un attribut, amont et aval d'une table ; composant graphe SVG (couches, barycentre, zoom, déplacement) | **livré** | `api/src/lineage`, `web/src/app/composants/graphe-svg.component.ts`, `web/src/app/pages/lineage` |
| **Gouvernance** en Angular : objets métier (attributs alimentés par les colonnes, sources et rôles, actifs producteurs et consommateurs, références, complétude, historique, initialisation depuis une source), applications & processus & restitutions, périmètres, listes de valeurs (en clair ou par source, contrôle d'une colonne, rattachement au dictionnaire), sensibilité (classification par colonne, actions par niveau, détection RGPD), personnes & rôles & domaines, propositions à valider (dépôt, validation appliquée, refus, retrait, trace dans l'historique) — toutes dans le document appState partagé avec l'application classique | **livré** | `api/src/gouvernance`, `web/src/app/pages/{objets-metier,actifs,perimetres,listes-valeurs,sensibilite,personnes,propositions}` |
| **Qualité et audit** en Angular : profilage colonne par colonne (complétude, distinctes, longueurs, espaces parasites et multiples, bouche-trous, casses incohérentes, valeurs aberrantes, part numérique et date, motif majoritaire, valeurs fréquentes) sur un périmètre filtrable, inspecteur d'anomalies (voir et exporter les lignes concernées), doublons exacts et sur une clé, clés fonctionnelles composites (composants de la source ou d'une table liée, appariement strict / normalisé / flou) avec doublons approchés (Jaro-Winkler), règles de qualité (14 types dont condition « si… alors », cohérence entre colonnes, condition SQL, agrégat par groupe, fraîcheur, liste de valeurs de la gouvernance, unicité composite ; criticité, activation), lignes en échec d'une règle, score pondéré, audit d'un objet métier (table maître, règles du périmètre, cardinalité des facettes), exports CSV / JSON, historique des audits en PostgreSQL | **livré** | `api/src/qualite`, `web/src/app/pages/qualite` |
| **Catalogue** en Angular : recherche plein texte sur tout ce que l'espace décrit (objets métier, attributs, termes, applications, périmètres, listes de valeurs, règles, tableaux de bord, séries, rapprochements, tables, vues, colonnes), facettes vivantes (type, domaine, sensibilité, propriétaire), signaux de confiance (qualité mesurée par le dernier audit, sensibilité, validation), couche métier par défaut et couche technique à la demande, fiche et lien vers l'écran d'édition | **livré** | `api/src/catalogue`, `web/src/app/pages/catalogue` |
| **Surveillance des sources** en Angular : moniteur (instantanés de schéma et de volume, dérive entre deux instantanés, fraîcheur d'après la fréquence du dictionnaire), contrat de données (généré depuis la source, colonnes obligatoires, vérification : manquantes, en trop, retypées, obligatoires vides), suivi des changements (données figées dans DuckDB, delta par clé : ajoutées, supprimées, modifiées, identiques), réconciliation amont / aval (volumétries, clés orphelines) | **livré** | `api/src/surveillance`, `web/src/app/pages/surveillance` |
| **Sauvegarde et partage** en Angular : export de l'espace (documents partagés, métadonnées des sources, recettes) au format plateforme ou au format de l'application classique, import des deux formats avec reconstruction des tables conçues, dossier de gouvernance HTML autonome et imprimable | **livré** | `api/src/sauvegarde`, `web/src/app/pages/sauvegarde` |
| **Écran Sources** au niveau du classique : recherche (nom, domaine, colonne), domaine par source, nombre de lignes, colonnes dépliables, complétude du dernier audit, paramètres de lecture CSV (séparateur, encodage, guillemets, lignes en erreur) avec relecture immédiate, création d'un objet métier depuis une source | **livré** | `web/src/app/pages/sources`, route `POST /api/importation/relire` |
| **Modèle de données** au niveau du classique : graphe SVG des tables (couleur par domaine, vue compacte ou schéma complet), cardinalité déclarée et nature du lien (composition, agrégation, référence) modifiables, mesure d'un lien sur les données (cardinalité constatée, orphelins, écart avec le déclaré), règles métier sur les liens (cardinalités conditionnelles) testables avec lignes en défaut | **livré** | `api/src/modele/regles-liens.ts`, `web/src/app/pages/modele` |
| **Navigateur de données** (écran « Explorer » du classique) : filtre par colonne, tri par en-tête, saut vers la table liée par un clic sur une valeur reliée, export CSV ; **tableaux de bord** : dupliquer, tout actualiser, export HTML autonome, rapport global HTML (indicateurs et seuils, dernier score qualité) ; **comparateur** : rapport CSV complet ; **tables conçues** : export CSV ; **extraction** : fonctions « façon tableur » (CONCATENER, GAUCHE, STXT, SI, ANNEE…) qui remplissent la formule | **livré** | `web/src/app/pages/navigateur`, `web/src/app/pages/tableaux-de-bord/export-html.ts` |
| **Écran Qualité** au niveau du classique : analyse d'une colonne (type sémantique, quartiles, moyenne, écart-type, somme, dates extrêmes et futures, valeurs fréquentes et formats en barres, hygiène, signaux : clé candidate, constante, faible cardinalité, asymétrie), volume analysé (premières lignes d'une source volumineuse), export JSON de l'audit ; règles : exécution d'une seule règle, duplication, explication « quoi / comment » de chaque type, dettes qualité (échecs × poids de la criticité), tendance du score et comparaison de deux exécutions règle par règle, scorecard JSON | **livré** | `api/src/qualite/detail-colonne.ts`, `web/src/app/pages/qualite` |
| **Jeu de données de démonstration** : générateur reproductible et 14 Mo de fichiers prêts à charger — référentiel de 105 communes réelles, 2 500 clients et leurs établissements, 8 880 contacts avec trois familles de doublons (stricts, normalisés, flous), réseau commercial hiérarchisé, catalogue, trois ans de commandes saisonnières, lignes, factures, tickets et un an de relevés horaires ; défauts semés volontairement et comptés dans un manifeste, livraison ZIP et classeur Excel | **livré** | `donnees-demo` |
| **Finitions qualité, exploitation et confort** : exports des lignes en double par type (clés en double CSV, lignes en double CSV, classeur Excel à quatre onglets écrit sans dépendance), bilan qualité du résultat d'une extraction (complétude par colonne), assistant pas à pas des enrichissements d'une table conçue, barre d'outils des graphes (zoom, recentrer, plein écran, export PNG) et export image des graphiques, densité compacte mémorisée, liens croisés Sources → Dictionnaire / Lineage / Qualité, notifications limitées et fermables | **livré** | `api/src/commun/classeur-excel-ecriture.ts`, `web/src/app/composants`, `web/src/app/coeur/export-image.ts` |
| **Importation** : classeurs Excel lus côté serveur (feuille au choix, dates reconnues), mise à jour d'une source existante (même identifiant, colonnes disparues et impact signalés, tables conçues et préparations rejouées), fusion de fichiers et de sources (colonnes alignées par nom, provenance conservée), livraison ZIP (inventaire puis import ou mise à jour par fichier), import par adresse (CSV, JSON avec chemin, Parquet, Google Sheets ; en-tête d'authentification ; différentiel ajoutées / disparues / modifiées ; mode ajout des nouvelles clés) | **livré** | `api/src/importation`, `web/src/app/pages/sources` |
| **Analyse de couverture** : population filtrée × dimension (colonne de la base ou d'une table liée, par année) × présence d'éléments dans une table liée filtrée, seconde dimension, export CSV | **livré** | `api/src/exploitation/couverture.ts`, `web/src/app/pages/couverture` |
| **Cockpit** (accueil) : chiffres clés de l'espace, points d'attention (objets sans propriétaire, tables hors modèle ou sans domaine, sources anciennes), dernier audit qualité, score des règles, volumétrie par table | **livré** | `api/src/cockpit`, `web/src/app/pages/accueil` |
| **Préparation** en Angular : recettes de nettoyage reproductibles (filtrer, nettoyer, normaliser, standardiser téléphone / email, enrichir par référentiel embarqué avec taux d'appariement, colonne calculée, dédoublonner, renommer, supprimer), aperçu après chaque étape, table propre enregistrée comme source et rejouée à chaque mise à jour de la source, export / import JSON au format classique | **livré** | `api/src/preparation`, `web/src/app/pages/preparation` |
| **Statistiques** et **Explorateur 360°** en Angular : graphique dimension × agrégat calculé par le serveur ; exploration d'une valeur de table en table par les liens du modèle (graphe, détail, extension) | **livré** | `api/src/exploitation/exploration.ts`, `web/src/app/pages/{statistiques,explorateur-360}` |
| **Analyse d'impact** (onglet du lineage) : applications touchées directement, via le lineage des tables conçues, via les relations du modèle ; tables en aval | **livré** | `api/src/lineage/lineage.service.ts`, onglet « impact » de `web/src/app/pages/lineage` |
| Application classique (tous les écrans historiques) intégrée dans la coque, sur les mêmes données | **livré** | `web-classique`, route `/classique` |
| Tests : 114 tests d'API (PGlite et PostgreSQL, dont les constructeurs SQL, l'extraction jointe, la qualité et la qualité avancée, les tables conçues, la gouvernance, le lineage, l'exploitation, le catalogue, la surveillance, la sauvegarde et l'analyse d'impact, le cockpit, les préparations, les statistiques et l'explorateur 360°, l'importation et la couverture), 7 tests du générateur du jeu de démonstration, 105 assertions de bout en bout dans Chromium | **livré** | `api/test`, `donnees-demo`, `tests` |
| Docker, Caddy, guide Oracle Cloud, pile AWS CloudFormation (EC2 Graviton, RDS optionnel, S3, Systems Manager), TLS vérifié vers PostgreSQL (`SD_POSTGRES_CA`) | **livré** | `Dockerfile`, `docker-compose.yml`, `deploiement/oracle-cloud.md`, `deploiement/aws.md`, `deploiement/aws/pile.yaml` |
| Fonctions avancées restées dans l'application classique (liste ci-dessous) | **optionnel** | `web-classique` |
| Connexion à l'annuaire de l'entreprise (OpenID Connect) | à faire | remplacer `api/src/authentification` (contrat : poser `request.contexte`) |

## Architecture

```
studio-data-plateforme/
├── api/                          NestJS 11 sur Fastify, TypeScript strict
│   ├── migrations/               0001_structure_initiale.sql … (appliquées au démarrage, une fois chacune)
│   └── src/
│       ├── main.ts · application.ts · app.module.ts
│       ├── configuration/        variables SD_* validées par Zod
│       ├── base-de-donnees/      schéma Drizzle, connexion (PostgreSQL ou PGlite), migrations
│       ├── authentification/     mots de passe (scrypt), sessions (cookie httpOnly), garde global, décorateurs
│       ├── espaces/              espaces de travail, membres et rôles, moteur DuckDB, dépôt de fichiers
│       ├── utilisateurs/ · documents/ · sources/ · fichiers/ · sql/ · gouvernance/ · journal/ · sante/ · front/
│       └── commun/               erreurs (messages en français), validation Zod
├── web/                          Angular 20 : composants autonomes, signaux, formulaires, CDK (défilement virtuel)
│   └── src/app/
│       ├── coeur/                modèles, client d'API (une méthode par route), session, notifications, gardes
│       ├── coque/                connexion, coque (rail, en-tête, choix de l'espace)
│       └── pages/                accueil, sources, explorateur, glossaire, dictionnaire, journal, espaces, utilisateurs, compte, classique
├── web-classique/                constructeur de l'application complète (réutilise studio-data-serveur/client)
├── donnees-demo/                 générateur et fichiers du jeu de démonstration (clients, contacts, ventes, relevés)
├── tests/                        e2e.test.mjs (Playwright + API réelle), données d'essai
├── deploiement/                  Caddyfile, oracle-cloud.md
├── Dockerfile · docker-compose.yml · .env.exemple · eslint.config.js · formater.mjs
```

### Principes de code

- **Une langue, le français**, pour les noms de fichiers, de classes, de fonctions, de variables et de routes,
  avec deux exceptions assumées : les mots imposés par les cadres (`Controller`, `Injectable`, `signal`…) et les
  champs des documents hérités de l'application classique (`name`, `headers`, `term`, `sourceTable`…), conservés
  pour que les deux interfaces lisent les mêmes données (voir la note en tête de `web/src/app/coeur/modeles.ts`).
- **Pas de nom abrégé** : un audit (noms d'une ou deux lettres, abréviations `cfg`, `tmp`, `col`…, fichiers sans
  en-tête, fonctions de plus de 60 lignes) est rejouable ; seuls `id` et les paramètres nommés par les cadres restent.
- **Un fichier commence par expliquer son rôle** ; chaque route d'API a un résumé OpenAPI (`/api/docs`).
- **Les erreurs parlent à l'utilisateur** : chaque réponse d'erreur est `{ erreur: "phrase en français" }`, affichée
  telle quelle par le front.
- **Validation aux frontières** : Zod côté API (corps de requête, variables d'environnement), TypeScript strict
  partout, noms de fichiers et clés vérifiés avant tout accès disque.
- **Pas de magie** : migrations SQL lisibles, pas de génération de code, pas de décorateurs maison.

### Modèle de données (PostgreSQL)

`utilisateurs` (comptes, rôle global) · `espaces` · `membres` (rôle par espace : lecteur, editeur, administrateur) ·
`sessions` · `documents` (état de l'application et gouvernance, JSONB, une clé par document) · `sources`
(métadonnées des tables DuckDB) · `journal` (audit). Voir `api/src/base-de-donnees/schema.ts`.

Les données analytiques (contenu des sources) sont dans DuckDB : `SD_DONNEES/espaces/<code>/studio.duckdb`
et `fichiers/` (fichiers déposés, Parquet).

### Rôles

| Rôle | Peut |
|---|---|
| lecteur | consulter, interroger en SQL (lecture seule), lire la gouvernance |
| editeur | déposer et supprimer des sources, exécuter tout SQL, modifier la gouvernance |
| administrateur (espace) | gérer les membres, remise à zéro de l'espace |
| administrateur (plateforme) | créer utilisateurs et espaces ; a tous les droits dans tous les espaces |

### Une seule source de vérité pour la gouvernance

L'application classique lit et écrit un document `appState` (modèle, tables conçues, gouvernance). Les écrans
Angular (glossaire, dictionnaire) modifient **le même document** par des routes typées (`/api/gouvernance/*`) :
les deux interfaces voient les mêmes données. Quand tous les écrans seront en Angular, le document pourra être
éclaté en tables PostgreSQL sans changer les routes.

## Plan de reprise des écrans restants

Ordre conseillé, un écran à la fois, chacun validé par un test de bout en bout avant de retirer sa version
classique :

1. ~~**Modèle de données** et **Extraction**~~ — livrés (voir ci-dessus). Restent, pour l'extraction, les fonctions
   avancées de l'application classique : synthèses d'une table liée (compter, transposer), hiérarchies aplaties,
   colonnes calculées, filtre « dans le fichier ». Elles s'ajoutent au constructeur SQL (`constructeur-sql.ts`)
   sans changer l'écran.
2. ~~**Tables conçues**~~ — livré : recette exécutée par `tables-concues/constructeur-table-concue.ts` (fonctions
   pures testées), résultat matérialisé en table DuckDB `t_<id>` et enregistré comme source de type « designed ».
3. ~~**Qualité et audit**~~ — livré : profilage et audits en SQL côté serveur (`qualite/profilage.ts`, `qualite/regles.ts`,
   `qualite/anomalies.ts`, `qualite/cle-fonctionnelle.ts`, fonctions pures testées), règles et audits stockés dans
   PostgreSQL (`migrations/0002_qualite.sql`) ; profils de clé rangés dans le dictionnaire du document partagé.
4. ~~**Objets métier, applications, périmètres, listes de valeurs, sensibilité, personnes, propositions**~~ — livré :
   routes typées dans `gouvernance/` (`gouvernance.service.ts` pour l'accès au document, `propositions.ts`,
   `listes-valeurs.ts`, `sensibilite.ts` pour la logique pure testée). Restent, côté classique : le concepteur
   d'objets et les audits d'objet (hiérarchies, règles métier, couverture), l'import en masse, l'anonymisation.
5. ~~**Lineage**~~ — livré : `lineage/flux.ts` (synchronisation, rôles, fraîcheur, santé — fonctions pures testées),
   `lineage/reconciliation.ts` (SQL de réconciliation), composant `graphe-svg`. Restent, côté classique : repli
   de la carte par objet ou par application, journal des contrôles, surveillance des sources (étape suivante).
6. ~~**Tableaux de bord, comparateur, séries temporelles, rapprochement**~~ — livré : `exploitation/` (SQL pur testé
   pour chaque écran). Les statistiques BI de l'application classique sont couvertes par les tuiles des tableaux
   de bord ; les huit contrôles de règles sur séries (trou, saut, monotonie…) restent côté classique.
7. ~~**Catalogue, surveillance des sources, sauvegarde et partage, analyse d'impact**~~ — livré : `catalogue/catalogue.ts`
   (normalisation, pertinence, facettes — fonctions pures testées), `surveillance/surveillance.ts` (dérive, contrat,
   SQL de delta et de réconciliation), `sauvegarde/dossier.ts` (dossier HTML pur), état de surveillance dans
   `appState.governance.srcWatch` comme dans l'application classique.
8. ~~**Menu aligné sur l'application classique, cockpit, préparation, statistiques, explorateur 360°**~~ — livré :
   la navigation reprend les quatre phases du classique (Données & Modèle, Exploitation, Qualité & Audit,
   Gouvernance) ; `cockpit/cockpit.ts`, `preparation/recettes-preparation.ts` et `exploitation/exploration.ts`
   sont des fonctions pures testées.
9. ~~**Extraction avancée**~~ — livré : `extraction/constructeur-avance.ts` (formules, synthèses, hiérarchies, listes
   fournies — fonctions pures testées), route `POST /api/extraction/materialiser`.
10. Retrait de `web-classique` et éclatement du document `appState` en tables.

### Ce qui est migré et ce qui reste dans l'application classique

Tous les écrans du quotidien sont en Angular. L'application classique reste accessible dans la coque (`/classique`),
sur les mêmes données, pour les fonctions avancées suivantes, plus rares, qui n'ont pas été réécrites :

| Domaine | Migré en Angular | Resté dans l'application classique |
|---|---|---|
| Sources et exploration | dépôt (CSV, TXT, Parquet, JSON, Excel côté serveur) avec paramètres de lecture, domaine, mise à jour d'une source par un nouveau fichier, fusion de fichiers et de sources, livraison ZIP, import par adresse (CSV, JSON, Parquet, Google Sheets) avec différentiel, analyse de couverture, aperçu, optimisation, navigateur de données (filtres, tri, saut par les liens), explorateur SQL, export | dossier surveillé et rafraîchissement automatique (API du navigateur, propres à l'application classique) |
| Modèle et extraction | liens, détection, extraction jointe avec filtres et agrégats, colonnes calculées, synthèses de tables liées, hiérarchies, filtre sur liste fournie, pilotage par objet métier, résultat enregistré comme source, modèles enregistrés, préparation (recettes de nettoyage) | hiérarchie « via une table de liaison » avec dates de validité, choix du lien quand deux tables sont reliées plusieurs fois |
| Tables conçues | recette complète, construction, reconstruction, contributions, écarts | — |
| Qualité | profilage avec périmètre, inspecteur d'anomalies, doublons, clés fonctionnelles et doublons approchés, règles (14 types) et lignes en échec, score, audit d'objet métier, exports, historique | anonymisation |
| Gouvernance | objets métier, applications, périmètres, listes de valeurs, sensibilité, personnes, propositions, glossaire, dictionnaire | concepteur d'objets (hiérarchies, couverture), import en masse |
| Lineage | carte, parcours d'attribut, amont / aval, réconciliation d'un lien, impact | repli de la carte par objet ou par application, journal des contrôles |
| Exploitation | tableaux de bord, comparateur, séries temporelles et leurs huit règles (trou, doublon, plateau, saut, monotonie, fraîcheur, saisonnalité, couverture), rapprochement, statistiques, explorateur 360° | — |
| Catalogue, surveillance, sauvegarde | recherche et facettes, moniteur, contrat, delta, réconciliation, export / import, dossier | — |

Comment un écran est migré (méthode suivie pour le modèle et l'extraction) :
- la logique métier passe dans l'API, en TypeScript testé sans navigateur (fonctions pures quand c'est possible :
  `constructeur-sql.ts` a ses propres tests) ;
- l'écran Angular ne fait que composer une spécification et afficher ; les données restent au format de
  l'application classique quand elle les partage (liens dans `appState.relations`) ;
- une assertion de bout en bout par usage réel, et une vérification que l'application classique voit la même chose.

Les classeurs Excel sont pour l'instant déposés depuis l'application classique (lecture dans le navigateur) ;
l'écran Sources Angular accepte CSV, TXT, Parquet et JSON. Pour Excel côté serveur, l'extension DuckDB
`excel` (`read_xlsx`) est la voie prévue.

## Jeu de données de démonstration

`donnees-demo/fichiers/` contient une base complète et volontairement imparfaite : communes réelles, clients et
établissements situés dessus, contacts en doublon, réseau commercial, catalogue, trois ans de commandes et de
factures, tickets et relevés horaires. Elle sert à montrer toutes les fonctions de l'application, du profilage au
dédoublonnage approché, des séries temporelles au rapprochement. Le détail des fichiers, la liste des défauts
semés et un scénario de démonstration en douze temps sont dans [`donnees-demo/README.md`](donnees-demo/README.md).

```bash
npm run demo                                        # régénère le jeu (graine fixe : mêmes fichiers)
node donnees-demo/generer.mjs --taille grande       # 20 000 clients, 250 000 commandes
```

## Tests et qualité

```bash
npm run tester:api                                  # 114 tests, PGlite
SD_POSTGRES_URL_TEST=postgres://… npm run tester:api # les mêmes sur PostgreSQL
npm run tester:e2e                                  # 105 assertions, Chromium (Playwright de l'environnement)
npm run tester:demo                                 # 7 tests du générateur du jeu de démonstration
npm run verifier                                    # Prettier --check + ESLint (typescript-eslint)
```

Le test de bout en bout enchaîne : connexion, dépôt de deux CSV depuis Angular, aperçu, détection et ajout d'un
lien dans le modèle, extraction jointe avec filtre (aperçu, comptage, export CSV téléchargé, modèle enregistré),
qualité, table conçue, gouvernance (objets métier, applications, personnes, listes de valeurs, sensibilité,
propositions), lineage, tableaux de bord, comparateur, catalogue, surveillance, sauvegarde,
explorateur, glossaire, dictionnaire, création d'une utilisatrice, ajout comme lectrice, application classique
dans la coque (sources, lien et gouvernance identiques), journal, puis vérification des droits de la lectrice.

## Limites connues

- Sessions en base sans rotation ni limitation de tentatives de connexion : à ajouter avant une exposition
  publique (ou déléguer à l'annuaire via OpenID Connect).
- L'application classique et Angular écrivent le même document `appState` ; deux onglets ouverts en même temps
  peuvent se recouvrir (dernier écrit gagne), comme dans la version mono-fichier.
- Le lecteur SQL est en « lecture seule » par analyse du début de la requête (SELECT, WITH…) ; DuckDB ne
  propose pas de connexion en lecture seule par session.
