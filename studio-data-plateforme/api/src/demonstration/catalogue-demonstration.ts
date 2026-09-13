/**
 * Le contenu du mode démonstration : quels fichiers charger, sous quel identifiant et dans quel domaine, ce
 * qu'en dit le dictionnaire, quels liens déclarer dans le modèle, quelles listes de valeurs, quelles règles de
 * qualité, quel objet métier, quelle série temporelle et quels tableaux de bord installer.
 *
 * Tout est décrit ici, en données ; le service se contente de l'appliquer. C'est volontaire : pour enrichir la
 * démonstration, on modifie ce catalogue et rien d'autre. Les fichiers eux-mêmes sont ceux de `donnees-demo`
 * (voir donnees-demo/README.md) ; les identifiants de source sont fixes pour que tout se référence sans devoir
 * chercher les tables par leur nom.
 */

/** Un fichier du jeu, son identifiant de source, son domaine et sa fiche de dictionnaire. */
export type FichierDemonstration = {
    fichier: string;
    /** Identifiant de la source (et donc de la table DuckDB `t_<id>`) : fixe, pour que tout se référence. */
    id: string;
    domaine: string;
    description: string;
    /** Description de quelques colonnes : le dictionnaire n'a pas besoin d'être exhaustif pour être utile. */
    colonnes?: Record<string, string>;
};

export const FICHIERS: FichierDemonstration[] = [
    {
        fichier: 'communes.csv',
        id: 'tb_communes',
        domaine: 'Référentiel',
        description:
            'Référentiel géographique : communes réelles avec code INSEE, code postal, département, région et coordonnées. Table de contrôle des adresses.',
        colonnes: {
            code_insee: 'Code officiel de la commune (clé du référentiel).',
            code_postal: 'Code postal principal de la commune.',
            region: 'Région administrative, utilisée pour les regroupements.'
        }
    },
    {
        fichier: 'agences.csv',
        id: 'tb_agences',
        domaine: 'Commercial',
        description: 'Les douze agences du réseau, une par région, avec leur ville et leur directeur.'
    },
    {
        fichier: 'commerciaux.csv',
        id: 'tb_commerciaux',
        domaine: 'Commercial',
        description: 'Les vendeurs et leur rattachement hiérarchique : direction commerciale, directeurs d’agence, conseillers.',
        colonnes: { id_responsable: 'Le supérieur direct : trois niveaux de hiérarchie à plat dans une seule table.' }
    },
    {
        fichier: 'produits.csv',
        id: 'tb_produits',
        domaine: 'Catalogue',
        description: 'Catalogue des produits vendus : famille, sous-famille, unité, prix, taux de TVA.',
        colonnes: { reference: 'Référence commerciale au format ABC-0000 ; quelques-unes sont mal formées.' }
    },
    {
        fichier: 'clients.csv',
        id: 'tb_clients',
        domaine: 'Commercial',
        description:
            'Les clients, professionnels et particuliers, localisés dans les communes du référentiel. Fichier volontairement imparfait : c’est la matière du profilage.',
        colonnes: {
            siret: 'Numéro d’établissement, attendu pour les professionnels seulement.',
            statut: 'ACTIF, INACTIF, PROSPECT ou RESILIE.',
            date_maj: 'Dernière mise à jour de la fiche : sert au contrôle de fraîcheur.',
            chiffre_affaires: 'Chiffre d’affaires annuel estimé, en euros.'
        }
    },
    {
        fichier: 'sites.csv',
        id: 'tb_sites',
        domaine: 'Commercial',
        description: 'Les établissements des clients professionnels, avec leurs coordonnées et leur période d’activité.'
    },
    {
        fichier: 'contacts.csv',
        id: 'tb_contacts',
        domaine: 'Commercial',
        description:
            'Les personnes chez les clients. Fichier de démonstration du dédoublonnage : mêmes personnes saisies plusieurs fois, à l’identique ou presque.',
        colonnes: {
            email: 'Adresse professionnelle ; quelques variantes proches désignent la même personne.',
            optin_email: 'Consentement à recevoir des courriels, saisi de six façons différentes.'
        }
    },
    {
        fichier: 'commandes.csv',
        id: 'tb_commandes',
        domaine: 'Ventes',
        description: 'Trois ans de commandes, avec leur saisonnalité : creux d’août, pointe de fin d’année, week-ends calmes.',
        colonnes: {
            date_commande: 'Date de prise de commande ; une petite part est écrite à la française.',
            montant_ht: 'Montant hors taxes, somme des lignes de la commande.'
        }
    },
    {
        fichier: 'lignes_commande.csv',
        id: 'tb_lignes_commande',
        domaine: 'Ventes',
        description: 'Le détail des commandes : un produit, une quantité, un prix et une remise par ligne.'
    },
    {
        fichier: 'factures.csv',
        id: 'tb_factures',
        domaine: 'Finance',
        description: 'Les factures émises, avec leur échéance et leur règlement : la contrepartie des commandes pour le rapprochement.'
    },
    {
        fichier: 'tickets_support.csv',
        id: 'tb_tickets',
        domaine: 'Support',
        description: 'Les demandes reçues par le support : canal, catégorie, priorité, délai de résolution et satisfaction.'
    },
    {
        fichier: 'releves_consommation.csv',
        id: 'tb_releves',
        domaine: 'Exploitation',
        description: 'Un an de relevés horaires de consommation pour trois bâtiments : la série temporelle de la démonstration.',
        colonnes: {
            horodatage: 'Heure du relevé, au pas horaire.',
            energie_kwh: 'Énergie consommée sur l’heure, en kilowattheures.',
            qualite_mesure: 'valide, estimée ou douteuse selon le comportement du capteur.'
        }
    }
];

/** Les liens du modèle de données, tels que la démonstration les attend (côté N vers côté 1). */
export const LIENS = [
    { sourceTable: 'clients.csv', sourceCol: 'code_insee', targetTable: 'communes.csv', targetCol: 'code_insee', cardinality: 'N-1' },
    {
        sourceTable: 'clients.csv',
        sourceCol: 'id_commercial',
        targetTable: 'commerciaux.csv',
        targetCol: 'id_commercial',
        cardinality: 'N-1'
    },
    { sourceTable: 'commerciaux.csv', sourceCol: 'id_agence', targetTable: 'agences.csv', targetCol: 'id_agence', cardinality: 'N-1' },
    {
        sourceTable: 'sites.csv',
        sourceCol: 'id_client',
        targetTable: 'clients.csv',
        targetCol: 'id_client',
        cardinality: 'N-1',
        kind: 'composition'
    },
    {
        sourceTable: 'contacts.csv',
        sourceCol: 'id_client',
        targetTable: 'clients.csv',
        targetCol: 'id_client',
        cardinality: 'N-1',
        kind: 'composition'
    },
    { sourceTable: 'commandes.csv', sourceCol: 'id_client', targetTable: 'clients.csv', targetCol: 'id_client', cardinality: 'N-1' },
    { sourceTable: 'commandes.csv', sourceCol: 'id_site', targetTable: 'sites.csv', targetCol: 'id_site', cardinality: 'N-1' },
    {
        sourceTable: 'lignes_commande.csv',
        sourceCol: 'id_commande',
        targetTable: 'commandes.csv',
        targetCol: 'id_commande',
        cardinality: 'N-1',
        kind: 'composition'
    },
    {
        sourceTable: 'lignes_commande.csv',
        sourceCol: 'id_produit',
        targetTable: 'produits.csv',
        targetCol: 'id_produit',
        cardinality: 'N-1'
    },
    { sourceTable: 'factures.csv', sourceCol: 'id_commande', targetTable: 'commandes.csv', targetCol: 'id_commande', cardinality: 'N-1' },
    { sourceTable: 'tickets_support.csv', sourceCol: 'id_client', targetTable: 'clients.csv', targetCol: 'id_client', cardinality: 'N-1' },
    { sourceTable: 'releves_consommation.csv', sourceCol: 'id_site', targetTable: 'sites.csv', targetCol: 'id_site', cardinality: 'N-1' }
];

/** Les listes de valeurs de référence : elles servent aux règles et au vocabulaire de la gouvernance. */
export const LISTES_DE_VALEURS = [
    {
        id: 'lv_statut_client',
        name: 'Statuts client',
        kind: 'inline',
        values: [{ code: 'ACTIF' }, { code: 'INACTIF' }, { code: 'PROSPECT' }, { code: 'RESILIE' }]
    },
    {
        id: 'lv_statut_commande',
        name: 'États de commande',
        kind: 'inline',
        values: [{ code: 'enregistrée' }, { code: 'validée' }, { code: 'expédiée' }, { code: 'livrée' }, { code: 'annulée' }]
    },
    {
        id: 'lv_priorite_ticket',
        name: 'Priorités du support',
        kind: 'inline',
        values: [{ code: 'basse' }, { code: 'normale' }, { code: 'haute' }, { code: 'critique' }]
    },
    {
        id: 'lv_region',
        name: 'Régions (référentiel communes)',
        kind: 'table',
        table: 'communes.csv',
        col: 'region'
    }
];

/** Une règle de qualité prête à poser : le service y ajoute l'espace et l'identifiant de source. */
export type RegleDemonstration = {
    nom: string;
    source: string;
    colonne?: string;
    type: string;
    parametres: Record<string, unknown>;
    criticite: 'bloquante' | 'majeure' | 'mineure';
};

/**
 * Onze règles qui couvrent onze familles de contrôles : de quoi remplir l'écran « Règles & score » dès
 * l'installation, avec des règles qui passent et d'autres qui échouent — c'est tout l'intérêt.
 */
export const REGLES: RegleDemonstration[] = [
    {
        nom: 'Raison sociale renseignée',
        source: 'tb_clients',
        colonne: 'raison_sociale',
        type: 'nonVide',
        parametres: {},
        criticite: 'bloquante'
    },
    {
        nom: 'Identifiant client unique',
        source: 'tb_clients',
        colonne: 'id_client',
        type: 'unique',
        parametres: {},
        criticite: 'bloquante'
    },
    {
        nom: 'Adresse électronique bien formée',
        source: 'tb_clients',
        colonne: 'email',
        type: 'format',
        parametres: { expression: '^[^@\\s]+@[^@\\s]+\\.[A-Za-z]{2,}$' },
        criticite: 'majeure'
    },
    {
        nom: 'Statut dans le référentiel',
        source: 'tb_clients',
        colonne: 'statut',
        type: 'listeValeurs',
        parametres: { listeId: 'lv_statut_client' },
        criticite: 'majeure'
    },
    {
        nom: 'SIRET attendu pour les professionnels',
        source: 'tb_clients',
        colonne: 'type',
        type: 'condition',
        parametres: { siOperateur: 'dans', siValeurs: ['PRO'], alorsColonne: 'siret', alorsOperateur: 'renseigne' },
        criticite: 'bloquante'
    },
    {
        nom: 'Fiche client tenue à jour (2 ans)',
        source: 'tb_clients',
        colonne: 'date_maj',
        type: 'fraicheur',
        parametres: { jours: 730 },
        criticite: 'mineure'
    },
    {
        nom: 'Chiffre d’affaires plausible',
        source: 'tb_clients',
        colonne: 'chiffre_affaires',
        type: 'plage',
        parametres: { minimum: 0, maximum: 50000000 },
        criticite: 'majeure'
    },
    {
        nom: 'Livraison postérieure à la commande',
        source: 'tb_commandes',
        type: 'expression',
        parametres: { formule: '[date_livraison_reelle] >= [date_commande]' },
        criticite: 'majeure'
    },
    {
        nom: 'État de commande connu',
        source: 'tb_commandes',
        colonne: 'statut',
        type: 'listeValeurs',
        parametres: { listeId: 'lv_statut_commande' },
        criticite: 'majeure'
    },
    {
        nom: 'Total de ligne exact',
        source: 'tb_lignes_commande',
        type: 'sql',
        parametres: {
            condition:
                'ABS(CAST(montant_ligne AS DOUBLE) - ROUND(CAST(quantite AS DOUBLE) * CAST(prix_unitaire AS DOUBLE) * (1 - CAST(remise_pct AS DOUBLE) / 100), 2)) <= 0.01'
        },
        criticite: 'majeure'
    },
    {
        nom: 'Au plus 40 contacts par client',
        source: 'tb_contacts',
        type: 'groupe',
        parametres: { colonnesGroupe: ['id_client'], agregat: 'count', operateur: '<=', seuil: 40 },
        criticite: 'mineure'
    },
    {
        nom: 'Satisfaction entre 1 et 5',
        source: 'tb_tickets',
        colonne: 'satisfaction',
        type: 'plage',
        parametres: { minimum: 1, maximum: 5 },
        criticite: 'mineure'
    }
];

/** Le profil de clé fonctionnelle des contacts : prénom + nom + ville, la clé du dédoublonnage. */
export const PROFIL_CLE_CONTACTS = {
    id: 'cle_contact_nom_ville',
    scope: [],
    parts: [
        { table: 'contacts.csv', col: 'prenom', whereCol: '', whereVal: '', match: 'fuzzy' },
        { table: 'contacts.csv', col: 'nom', whereCol: '', whereVal: '', match: 'fuzzy' },
        { table: 'contacts.csv', col: 'ville', whereCol: '', whereVal: '', match: 'norm' }
    ]
};

/** L'objet métier « Client » : table maître, facettes, et quelques attributs alimentés par les colonnes. */
export const OBJET_METIER_CLIENT = {
    id: 'bo_client',
    name: 'Client',
    description: 'Une entreprise ou un particulier qui achète : son identité, ses établissements, ses contacts et ses commandes.',
    sources: [{ table: 'clients.csv', role: 'maitre' }],
    structure: [
        { id: 'fc_contacts', name: 'Contacts', table: 'contacts.csv' },
        { id: 'fc_sites', name: 'Établissements', table: 'sites.csv' },
        { id: 'fc_commandes', name: 'Commandes', table: 'commandes.csv' }
    ],
    attributes: [
        { id: 'at_raison_sociale', name: 'Raison sociale', table: 'clients.csv', col: 'raison_sociale' },
        { id: 'at_siret', name: 'SIRET', table: 'clients.csv', col: 'siret' },
        { id: 'at_ville', name: 'Ville', table: 'clients.csv', col: 'ville' },
        { id: 'at_statut', name: 'Statut', table: 'clients.csv', col: 'statut' }
    ]
};

/** La série temporelle : les relevés horaires, une série par site. */
export const SERIE_RELEVES = {
    id: 'serie_releves',
    name: 'Consommation horaire par site',
    table: 'releves_consommation.csv',
    keyCols: ['id_site'],
    tsCol: 'horodatage',
    valCol: 'energie_kwh',
    step: '3600',
    tol: 0.5,
    regMin: 0.7
};

/** Deux tableaux de bord prêts à ouvrir : l'activité commerciale et la qualité de service. */
export const TABLEAUX_DE_BORD = [
    {
        id: 'tdb_activite',
        name: 'Activité commerciale',
        filters: [],
        tiles: [
            {
                id: 'tu_commandes',
                title: 'Commandes par mois',
                table: 'commandes.csv',
                kind: 'bar',
                dim: 'date_commande',
                agg: 'count',
                topN: 40
            },
            {
                id: 'tu_ca_region',
                title: 'Chiffre d’affaires par canal',
                table: 'commandes.csv',
                kind: 'pie',
                dim: 'canal',
                agg: 'sum',
                aggCol: 'montant_ht',
                topN: 8
            },
            {
                id: 'tu_clients_region',
                title: 'Clients par région',
                table: 'clients.csv',
                kind: 'bar',
                dim: 'region',
                agg: 'count',
                topN: 14
            },
            {
                id: 'tu_panier',
                title: 'Panier moyen (€)',
                table: 'commandes.csv',
                kind: 'kpi',
                agg: 'avg',
                aggCol: 'montant_ht',
                topN: 12,
                thWarn: 400,
                thCrit: 250,
                thDir: 'min'
            }
        ]
    },
    {
        id: 'tdb_service',
        name: 'Qualité de service',
        filters: [],
        tiles: [
            {
                id: 'tu_tickets_categorie',
                title: 'Tickets par catégorie',
                table: 'tickets_support.csv',
                kind: 'bar',
                dim: 'categorie',
                agg: 'count',
                topN: 10
            },
            {
                id: 'tu_delai',
                title: 'Délai moyen de résolution (h)',
                table: 'tickets_support.csv',
                kind: 'kpi',
                agg: 'avg',
                aggCol: 'delai_resolution_h',
                topN: 12,
                thWarn: 48,
                thCrit: 72,
                thDir: 'max'
            },
            {
                id: 'tu_satisfaction',
                title: 'Satisfaction moyenne',
                table: 'tickets_support.csv',
                kind: 'kpi',
                agg: 'avg',
                aggCol: 'satisfaction',
                topN: 12,
                thWarn: 3.5,
                thCrit: 3,
                thDir: 'min'
            },
            {
                id: 'tu_factures',
                title: 'Factures par état de règlement',
                table: 'factures.csv',
                kind: 'pie',
                dim: 'statut_reglement',
                agg: 'count',
                topN: 6
            }
        ]
    }
];

/** Les applications qui produisent ou consomment ces données : de quoi peupler le lineage et le catalogue. */
export const APPLICATIONS = [
    {
        id: 'app_crm',
        name: 'CRM Vega',
        kind: 'application',
        owner: 'Direction commerciale',
        description: 'Le logiciel de relation client : produit les clients, les contacts et les commandes.'
    },
    {
        id: 'app_erp',
        name: 'ERP Atlas',
        kind: 'application',
        owner: 'Direction financière',
        description: 'La gestion commerciale et la facturation : produit les factures et le catalogue.'
    },
    {
        id: 'app_gtb',
        name: 'Supervision technique',
        kind: 'application',
        owner: 'Services généraux',
        description: 'La supervision des bâtiments : produit les relevés de consommation.'
    }
];

/** Quelques termes du glossaire : le vocabulaire que la démonstration emploie. */
export const GLOSSAIRE = [
    {
        id: 'gl_client',
        term: 'Client',
        definition: 'Personne morale ou physique ayant passé au moins une commande, ou identifiée comme prospect par un commercial.',
        domain: 'Commercial'
    },
    {
        id: 'gl_etablissement',
        term: 'Établissement',
        definition: 'Lieu physique rattaché à un client : siège, agence, entrepôt, usine ou point de vente.',
        domain: 'Commercial'
    },
    {
        id: 'gl_chiffre_affaires',
        term: 'Chiffre d’affaires',
        definition: 'Somme des montants hors taxes des commandes non annulées sur une période.',
        domain: 'Finance'
    },
    {
        id: 'gl_cle_fonctionnelle',
        term: 'Clé fonctionnelle',
        definition:
            'Ensemble de colonnes qui identifie une ligne au sens métier, en l’absence d’identifiant fiable : ici prénom + nom + ville pour un contact.',
        domain: 'Qualité'
    }
];

/** Les responsables des données : propriétaires et intendants cités dans les fiches. */
export const PERSONNES = [
    { id: 'pe_dpo', name: 'Direction des données', role: 'Propriétaire', email: 'donnees@studio-demo.fr' },
    { id: 'pe_commercial', name: 'Direction commerciale', role: 'Métier', email: 'commercial@studio-demo.fr' },
    { id: 'pe_finance', name: 'Direction financière', role: 'Métier', email: 'finance@studio-demo.fr' }
];

/** Sensibilité des colonnes : les données personnelles sont désignées d'emblée, pour l'écran Sensibilité. */
export const SENSIBILITE: Record<string, Record<string, string>> = {
    'contacts.csv': {
        prenom: 'personnel',
        nom: 'personnel',
        email: 'personnel',
        telephone_fixe: 'personnel',
        telephone_mobile: 'personnel'
    },
    'clients.csv': { email: 'personnel', telephone: 'personnel', siret: 'interne', chiffre_affaires: 'confidentiel' },
    'commerciaux.csv': { nom: 'personnel', prenom: 'personnel', email: 'personnel' }
};
