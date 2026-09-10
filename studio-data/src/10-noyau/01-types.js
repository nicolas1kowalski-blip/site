        // ======================= NOYAU : MODÈLE DE DONNÉES (documentation JSDoc, aucun code exécuté) =======================
        // Les structures manipulées par toute l'application, telles qu'elles vivent dans `state` (10-noyau-etat.js)
        // et telles qu'elles sont sauvegardées (13-noyau-persistance-locale.js, 14-noyau-centre-de-sauvegarde.js).
        // Ce fichier ne déclare rien : il donne les types aux éditeurs (survol, complétion) et fixe le vocabulaire.
        // Règle : un champ ajouté à une structure est d'abord ajouté ici, avec sa signification et sa valeur par défaut.
        //
        // ---- Sources et modèle technique ----
        /**
         * Une source chargée (fichier CSV/XLSX, extraction, table conçue, jeu temporaire, connecteur). Clé de `state.tables`.
         * @typedef {Object} TableSource
         * @property {string} id            Identifiant technique (« t_… » côté DuckDB via duckTableName). Stable pour la session.
         * @property {string} name          Nom affiché et nom métier de la table (unique parmi les sources).
         * @property {'csv'|'xlsx'|'extraction'|'designed'|'api'|'merge'} type  Origine de la table.
         * @property {'loading'|'ready'|'error'} status                        Prête dans le moteur ou non.
         * @property {string[]} headers     Colonnes, dans l'ordre du fichier (la colonne technique « __rn » n'y figure jamais).
         * @property {Object} columnsMeta   Métadonnées par colonne (type détecté, format, statistiques rapides).
         * @property {Object} config        Options de lecture (séparateur, feuille, encodage…).
         * @property {number} size          Nombre de lignes (ou taille du fichier avant chargement).
         * @property {Object[]} [sampleData] Quelques lignes d'aperçu.
         * @property {string} [theme]       Domaine métier de rattachement.
         * @property {TableDesign} [design] Pour une table conçue : sa recette (sources, jointures, colonnes).
         * @property {boolean} [temp]       Jeu temporaire (V12.4) : non énuméré dans les sources, jamais sauvegardé.
         */
        /**
         * Lien du modèle de données entre deux tables (clé de jointure). Élément de `state.relations`.
         * @typedef {Object} Relation
         * @property {string} id
         * @property {string} sourceTable   Identifiant de la table côté « N » (ex. CONTRAT).
         * @property {string} sourceCol     Colonne de jointure côté source.
         * @property {string} targetTable   Identifiant de la table côté « 1 » (ex. CLIENT).
         * @property {string} targetCol     Colonne de jointure côté cible.
         * @property {'N-1'|'1-1'|'1-N'|'N-N'} [type]  Cardinalité déclarée.
         * @property {string} [label]       Sens métier du lien (« souscripteur », « bénéficiaire »…), utile quand deux liens relient les mêmes tables.
         */
        /**
         * Recette d'une table conçue (40-tables-concues.js).
         * @typedef {Object} TableDesign
         * @property {{src: string, role?: string}[]} sources  Sources contributrices (noms de tables).
         * @property {{src: string, viaSrc?: string, srcCol?: string, dstCol?: string}[]} joins  Jointures entre sources.
         * @property {Object[]} columns    Colonnes de sortie et leur expression.
         */
        //
        // ---- Gouvernance ----
        /**
         * Objet métier (« Contrat », « Personne »…). Élément de `state.governance.businessObjects`.
         * @typedef {Object} BusinessObject
         * @property {string} id
         * @property {string} name
         * @property {string} definition       Définition en langage métier.
         * @property {string} [domain]         Domaine métier (V10 : droits par domaine).
         * @property {string} globalOwner      Propriétaire (personne responsable).
         * @property {string[]} contributors
         * @property {string} [status]         Cycle de vie (brouillon, validé…).
         * @property {BusinessAttribute[]} elements   Attributs (V13 : « informations ») portés directement par l'objet.
         * @property {BusinessFacet[]} structure      Facettes / composants (V13 : « variantes ») : sous-structures rattachées à une table.
         * @property {{table: string, role: 'maitre'|'contributeur'|'destinataire'}[]} sources  Tables techniques et leur rôle.
         * @property {string[]} producedBy     Identifiants d'actifs (applications) qui produisent l'objet.
         * @property {string[]} consumedBy     Identifiants d'actifs qui le consomment.
         * @property {{boId: string, cardinality?: string}[]} [references]  Objets référencés.
         * @property {Object[]} [hierarchies]  Hiérarchies déclarées (parent/enfant).
         * @property {Object[]} [bizRules]     Règles métier.
         * @property {Object[]} [history]      Historique des modifications.
         */
        /**
         * Attribut d'un objet métier (V13 : « information »).
         * @typedef {Object} BusinessAttribute
         * @property {string} id
         * @property {string} name
         * @property {string} [definition]
         * @property {{table: string, col: string}[]} mappings   Colonnes techniques qui l'alimentent (« colonne du fichier »).
         * @property {string[]} usedBy          Identifiants d'actifs (applications, processus, restitutions) qui l'utilisent.
         * @property {string} [sourceApp]       Application source propre à l'attribut (sinon celle de l'objet).
         * @property {AttributeOrigin[]} [origins]  V12.6 : provenance depuis un attribut d'un autre objet.
         * @property {string} [owner]           Responsable propre à l'attribut.
         * @property {string} [sensitivity]     Confidentialité (RGPD…).
         * @property {string} [examples]        Exemples de valeurs.
         * @property {string} [term]            Terme du glossaire associé.
         */
        /**
         * Provenance d'un attribut depuis un attribut d'un autre objet (V12.6).
         * @typedef {Object} AttributeOrigin
         * @property {string} boId    Objet d'origine.
         * @property {string} elId    Attribut d'origine.
         * @property {'copy'|'derived'|'agg'} kind   Copie (valeur identique), dérivé (1 ligne → 1 valeur transformée), agrégé (N lignes → 1 valeur).
         * @property {string} [rule]  Règle de calcul en clair.
         */
        /**
         * Facette (composant) d'un objet métier : sous-structure rattachée à une table technique.
         * @typedef {Object} BusinessFacet
         * @property {string} id
         * @property {string} name
         * @property {string} table       Nom de la table technique.
         * @property {{id: string, name: string, col?: string, definition?: string, usedBy?: string[]}[]} elements
         */
        /**
         * Actif : application, processus ou restitution (V12.8). Élément de `state.governance.assets`.
         * @typedef {Object} Asset
         * @property {string} id
         * @property {string} name
         * @property {'app'|'process'|'report'} kind   Voir ASSET_KINDS.
         * @property {string} [description]
         * @property {string} [owner]
         * @property {string} [domain]
         * @property {string} [criticality]
         * @property {string[]} [sources]     Application : tables qu'elle PRODUIT (propriétaire du fichier).
         * @property {string[]} [tables]      Tables qu'elle LIT.
         * @property {{table: string, col: string}[]} [columns]  Colonnes qu'elle lit.
         * @property {string[]} [boIds]       Objets métier rattachés.
         * @property {string[]} [appIds]      Processus : applications sur lesquelles il s'appuie.
         * @property {string[]} [producedBy]  Restitution : actifs qui la génèrent.
         * @property {string[]} [deliveredTo] Restitution : actifs destinataires.
         * @property {string} [recipients]    Restitution : destinataires externes en clair.
         * @property {string} [frequency]     Restitution : fréquence.
         * @property {string} [format]        Restitution : forme (fichier, tableau de bord…).
         */
        /**
         * Terme du glossaire. Élément de `state.governance.glossary`.
         * @typedef {Object} GlossaryTerm
         * @property {string} id
         * @property {string} term
         * @property {string} definition
         * @property {string} [domain]
         * @property {string} [owner]
         */
        /**
         * Proposition de modification soumise à validation (2C-gouvernance-personnes-validation.js).
         * @typedef {Object} Proposal
         * @property {string} id
         * @property {'field'|'action'|'free'} kind
         * @property {string} domain
         * @property {Object} target       Ce qui est visé ({ boId, elId, field } ou { assetId, fn, sig }).
         * @property {string} label
         * @property {string} before
         * @property {string} after
         * @property {'pending'|'accepted'|'rejected'} status
         * @property {string} author
         * @property {string} date
         */
        /**
         * Racine de la gouvernance : `state.governance`.
         * @typedef {Object} Governance
         * @property {BusinessObject[]} businessObjects
         * @property {Asset[]} assets
         * @property {GlossaryTerm[]} glossary
         * @property {Proposal[]} proposals
         * @property {Object<string, {description?: string, sourceSystem?: string, owner?: string, columns: Object}>} dictionary  Dictionnaire par table technique.
         * @property {Object<string, {from: string[], date?: string, note?: string}>} lineage  Traçabilité des tables produites (extractions, recettes, connecteurs).
         * @property {{nodes: FlowNode[], edges: FlowEdge[], grain: 'bo'|'table', hideSources: boolean, showObjects: boolean}} flow  Carte des flux.
         * @property {Object[]} [perimeters]
         * @property {Object[]} [people]
         */
        //
        // ---- Lineage et graphes ----
        /**
         * Nœud de la carte des flux (31-lineage-carte-des-flux.js).
         * @typedef {Object} FlowNode
         * @property {string} id
         * @property {string} name
         * @property {'app'|'table'|'object'} [kind]   Par défaut « table ».
         * @property {string} [tableName]   Nœud dérivé d'une table chargée.
         * @property {string} [assetId]     Nœud dérivé d'un actif.
         * @property {string} [boId]        Nœud dérivé d'un objet métier.
         * @property {boolean} [derived]    Créé par la synchronisation (jamais saisi à la main).
         */
        /**
         * Lien de la carte des flux.
         * @typedef {Object} FlowEdge
         * @property {string} id
         * @property {string} source
         * @property {string} target
         * @property {'feeds'|'reads'|'writes'|'composes'|'diffuses'|'consolidates'|'transforms'} [rel]  Nature ; déduite des nœuds si absente (lfEdgeRel).
         * @property {number} [slaHours]
         * @property {string} [transformation]
         */
        /**
         * Nœud d'un graphe rendu par le moteur SVG (32-graphes-moteur-svg.js) — lineage, catalogue, modèle.
         * Identifiants conventionnels : « bo:<id> » objet, « attr:<id> » attribut, « as:<id> » actif, « tbl:<nom> » table,
         * « col:<i> » colonne, « use:<id> » consommateur, « grp:<clé> » groupe replié, « nosrc » / « nouse » rappels.
         * @typedef {Object} GraphNode
         * @property {string} id
         * @property {'studio-rich-node'|'studio-uml-node'} type
         * @property {string} title
         * @property {string} [content]
         * @property {string} [fill]
         * @property {string} [stroke]
         * @property {number} [deep]     V12.10 : niveau amont (2, 3…) d'un nœud ajouté par la remontée complète.
         * @property {boolean} [first]   V12.10 : premier maillon de la chaîne.
         */
        /**
         * Lien d'un graphe rendu par le moteur SVG.
         * @typedef {Object} GraphEdge
         * @property {string} id
         * @property {string} source
         * @property {string} target
         * @property {string} [label]
         * @property {{stroke?: string, lineWidth?: number, lineDash?: number[], endArrow?: Object}} [style]
         */
        //
        // ---- Extraction ----
        /**
         * Paramétrage de l'écran Extraire (`state.advExtract`, 80-extraction-avancee.js).
         * @typedef {Object} ExtractSpec
         * @property {string} baseId                Table de départ.
         * @property {ExtractColumn[]} columns
         * @property {ExtractFilter[]} filters
         * @property {{on: boolean, keys: string[], keep: 'first'|'last'}} dedup
         * @property {{on: boolean, aggs: Object[]}} group
         * @property {'left'|'inner'} joinType
         * @property {boolean} limit500
         * @property {string} [customSql]
         * @property {boolean} [graphMode]
         * @property {Object<string, string>} [joinChoice]   Lien retenu par paire de tables reliées plusieurs fois.
         */
        /**
         * Colonne en sortie d'une extraction.
         * @typedef {Object} ExtractColumn
         * @property {string} id
         * @property {'link'|'hier'|'calc'} [kind]   Absent : colonne d'une table. link = synthèse d'une table liée, hier = hiérarchie aplatie, calc = calculée.
         * @property {string} tableId
         * @property {string} [col]
         * @property {string} alias                 Nom en sortie.
         * @property {'none'|'trim'|'upper'|'lower'|'noaccent'} transform
         * @property {string} [via]                 Chemin de jointure (ids de liens joints par « > »), « any » = l'un ou l'autre lien (V12.5), '' = chemin par défaut.
         * @property {'count'|'countd'|'values'|'indexed'} [mode]  Synthèse : compter, valeurs uniques, transposer en texte, transposer en colonnes.
         * @property {number} [n]                   Synthèse « indexed » : nombre de colonnes (1..12).
         * @property {Object} [conf]                Hiérarchie : idCol, parentCol, labelCols, maxDepth…
         * @property {Object} [calc]                Colonne calculée : parts, a, b, op…
         */
        /**
         * Filtre d'une extraction.
         * @typedef {Object} ExtractFilter
         * @property {string} tableId
         * @property {string} col
         * @property {string} op        Clé de ADV_OPS (eq, ne, contains, in, between, list…).
         * @property {string} [val]
         * @property {string} [via]
         * @property {Object} [list]    Filtre « dans le fichier » (V12.3) : liste d'entrée et ses clés.
         */
