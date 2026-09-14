/**
 * La gouvernance du mode démonstration : objets métier, applications, processus et restitutions, périmètres,
 * personnes, glossaire et propositions en attente.
 *
 * Ce fichier existe pour une raison précise : une démonstration de gouvernance ne se fait pas avec des
 * fichiers, elle se fait avec du sens. Les douze sources du jeu ne parlent à personne tant qu'on n'a pas dit
 * ce qu'elles décrivent (l'objet Client, l'objet Commande…), qui les produit (le CRM, l'ERP), qui les lit
 * (la déclaration de TVA, le tableau de bord commercial), et ce qui est personnel au sens du RGPD.
 *
 * Tout est écrit ici **au format des écrans** (celui des modèles TypeScript du front), et non au format
 * interne de l'application classique : c'est ce qui permet aux fiches d'afficher leurs informations, à la
 * complétude de se calculer, au parcours de la donnée de se dessiner et à l'écran « À valider » d'avoir
 * quelque chose à valider.
 *
 * Quelques trous sont laissés **volontairement** : une information sans définition, un objet sans
 * responsable, une restitution sans domaine. Une démonstration où tout est parfait ne montre rien ; ici, les
 * feux tricolores, la complétude et l'écran « À valider » ont de quoi s'exprimer.
 */

/** Une information d'objet métier, au format de la fiche (V13 : « information » plutôt qu'« attribut »). */
type Information = {
    id: string;
    name: string;
    definition?: string;
    mappings?: { table: string; col: string }[];
    usedBy?: string[];
    owner?: string;
    sensitivity?: string;
    term?: string;
    examples?: string;
    origins?: { boId: string; elId: string; kind: 'copie' | 'derive' | 'agrege'; rule?: string }[];
};

/** Raccourci d'écriture : une information alimentée par une seule colonne d'un seul fichier. */
function information(
    id: string,
    name: string,
    definition: string,
    table: string,
    col: string,
    complements: Partial<Information> = {}
): Information {
    return { id, name, definition, mappings: table ? [{ table, col }] : [], usedBy: [], ...complements };
}

/**
 * Les sept objets métier de la démonstration. Ils forment une chaîne complète — Commune alimente Client,
 * Client alimente Commande, Commande alimente Facture — pour que « le parcours de la donnée » et la
 * remontée « jusqu'au début » aient une histoire à raconter.
 */
export const OBJETS_METIER = [
    {
        id: 'bo_commune',
        name: 'Commune',
        definition: 'La commune française où se trouve une adresse, telle que l’INSEE la publie.',
        domain: 'Référentiel',
        globalOwner: 'Direction des données',
        contributors: [],
        status: 'Validé',
        sources: [{ table: 'communes.csv', role: 'maitre' as const }],
        elements: [
            information(
                'be_commune_insee',
                'Code INSEE',
                'Code officiel de la commune : la clé du référentiel.',
                'communes.csv',
                'code_insee',
                {
                    usedBy: ['as_crm'],
                    term: 'Code INSEE'
                }
            ),
            information('be_commune_nom', 'Nom de la commune', 'Nom officiel de la commune.', 'communes.csv', 'nom_commune', {
                usedBy: ['as_crm']
            }),
            information(
                'be_commune_region',
                'Région',
                'Région administrative, employée pour tous les regroupements géographiques.',
                'communes.csv',
                'region',
                {
                    usedBy: ['as_rapport_commercial']
                }
            )
        ],
        producedBy: ['as_insee'],
        consumedBy: ['as_crm'],
        references: []
    },
    {
        id: 'bo_client',
        name: 'Client',
        definition: 'Une entreprise ou un particulier qui achète : son identité, ses établissements, ses contacts et ses commandes.',
        domain: 'Commercial',
        globalOwner: 'Direction commerciale',
        contributors: ['Direction des données'],
        status: 'Validé',
        sources: [
            { table: 'clients.csv', role: 'maitre' as const },
            { table: 'sites.csv', role: 'contributeur' as const },
            { table: 'contacts.csv', role: 'contributeur' as const }
        ],
        elements: [
            information(
                'be_client_id',
                'Identifiant client',
                'Identifiant technique attribué par le CRM à la création de la fiche.',
                'clients.csv',
                'id_client',
                {
                    usedBy: ['as_crm', 'as_erp'],
                    term: 'Client'
                }
            ),
            information(
                'be_client_raison',
                'Raison sociale',
                'Nom sous lequel le client est immatriculé, ou nom et prénom pour un particulier.',
                'clients.csv',
                'raison_sociale',
                {
                    usedBy: ['as_crm', 'as_rapport_commercial'],
                    owner: 'Direction commerciale'
                }
            ),
            information(
                'be_client_siret',
                'SIRET',
                'Numéro d’établissement à quatorze chiffres, attendu pour les professionnels seulement.',
                'clients.csv',
                'siret',
                {
                    usedBy: ['as_erp'],
                    sensitivity: 'interne'
                }
            ),
            information('be_client_courriel', 'Adresse électronique', 'Adresse de contact principale du client.', 'clients.csv', 'email', {
                usedBy: ['as_crm', 'as_campagne'],
                sensitivity: 'personnel',
                owner: 'Direction commerciale'
            }),
            // Laissée sans définition : c'est le trou que « Sans définition » et la complétude signalent.
            information('be_client_statut', 'Statut', '', 'clients.csv', 'statut', { usedBy: ['as_crm'] }),
            information(
                'be_client_ca',
                'Chiffre d’affaires',
                'Chiffre d’affaires annuel estimé, en euros, servant à la segmentation.',
                'clients.csv',
                'chiffre_affaires',
                {
                    usedBy: ['as_rapport_commercial'],
                    sensitivity: 'confidentiel',
                    term: 'Chiffre d’affaires'
                }
            ),
            {
                id: 'be_client_commune',
                name: 'Commune',
                definition: 'La commune du siège, reprise telle quelle du référentiel géographique.',
                mappings: [{ table: 'clients.csv', col: 'code_insee' }],
                usedBy: ['as_rapport_commercial'],
                origins: [{ boId: 'bo_commune', elId: 'be_commune_insee', kind: 'copie' as const, rule: 'même code, repris tel quel' }]
            }
        ],
        producedBy: ['as_crm'],
        consumedBy: ['as_erp', 'as_rapport_commercial', 'as_campagne'],
        references: [{ boId: 'bo_commune', cardinality: 'N-1' }]
    },
    {
        id: 'bo_contact',
        name: 'Contact',
        definition: 'Une personne physique chez un client : celle que l’on appelle ou à qui l’on écrit.',
        domain: 'Commercial',
        globalOwner: 'Direction commerciale',
        contributors: [],
        status: 'À valider',
        sources: [{ table: 'contacts.csv', role: 'maitre' as const }],
        elements: [
            information('be_contact_nom', 'Nom', 'Nom de famille de la personne.', 'contacts.csv', 'nom', {
                sensitivity: 'personnel',
                usedBy: ['as_crm']
            }),
            information('be_contact_prenom', 'Prénom', 'Prénom de la personne.', 'contacts.csv', 'prenom', {
                sensitivity: 'personnel',
                usedBy: ['as_crm']
            }),
            information('be_contact_courriel', 'Adresse électronique', 'Adresse professionnelle de la personne.', 'contacts.csv', 'email', {
                sensitivity: 'personnel',
                usedBy: ['as_crm', 'as_campagne']
            }),
            information(
                'be_contact_optin',
                'Consentement courriel',
                'Accord donné pour recevoir des courriels commerciaux : sans lui, aucune campagne.',
                'contacts.csv',
                'optin_email',
                {
                    sensitivity: 'personnel',
                    usedBy: ['as_campagne'],
                    term: 'Consentement'
                }
            ),
            information('be_contact_client', 'Client', 'Le client chez qui la personne travaille.', 'contacts.csv', 'id_client', {
                usedBy: ['as_crm'],
                origins: [{ boId: 'bo_client', elId: 'be_client_id', kind: 'copie' as const, rule: 'identifiant repris du CRM' }]
            })
        ],
        producedBy: ['as_crm'],
        consumedBy: ['as_campagne'],
        references: [{ boId: 'bo_client', cardinality: 'N-1' }]
    },
    {
        id: 'bo_site',
        name: 'Établissement',
        definition: 'Un lieu physique rattaché à un client : siège, agence, entrepôt, usine ou point de vente.',
        domain: 'Commercial',
        // Laissé sans responsable : c'est ce que le feu tricolore et l'accueil « Mes tâches » signalent.
        globalOwner: '',
        contributors: [],
        status: 'Brouillon',
        sources: [{ table: 'sites.csv', role: 'maitre' as const }],
        elements: [
            information('be_site_id', 'Identifiant du site', 'Identifiant attribué par le CRM.', 'sites.csv', 'id_site', {
                usedBy: ['as_crm']
            }),
            information('be_site_libelle', 'Libellé', 'Nom donné à l’établissement dans le CRM.', 'sites.csv', 'libelle', {
                usedBy: ['as_crm']
            }),
            information('be_site_client', 'Client', 'Le client auquel l’établissement appartient.', 'sites.csv', 'id_client', {
                origins: [{ boId: 'bo_client', elId: 'be_client_id', kind: 'copie' as const, rule: 'identifiant repris du CRM' }]
            }),
            // Ni colonne ni origine : l'information dont « on ne sait pas d'où elle vient ».
            {
                id: 'be_site_surface',
                name: 'Surface',
                definition: 'Surface du site en mètres carrés, telle que déclarée au bail.',
                mappings: [],
                usedBy: []
            }
        ],
        producedBy: ['as_crm'],
        consumedBy: ['as_supervision'],
        references: [{ boId: 'bo_client', cardinality: 'N-1' }]
    },
    {
        id: 'bo_produit',
        name: 'Produit',
        definition: 'Un article du catalogue, vendu à l’unité ou au kilogramme.',
        domain: 'Catalogue',
        globalOwner: 'Direction des achats',
        contributors: [],
        status: 'Validé',
        sources: [{ table: 'produits.csv', role: 'maitre' as const }],
        elements: [
            information('be_produit_ref', 'Référence', 'Référence commerciale au format ABC-0000.', 'produits.csv', 'reference', {
                usedBy: ['as_erp'],
                term: 'Référence produit'
            }),
            information('be_produit_libelle', 'Libellé', 'Nom commercial du produit.', 'produits.csv', 'libelle', { usedBy: ['as_erp'] }),
            information(
                'be_produit_famille',
                'Famille',
                'Famille de produits, employée pour les regroupements du catalogue.',
                'produits.csv',
                'famille',
                {
                    usedBy: ['as_rapport_commercial']
                }
            ),
            information(
                'be_produit_prix',
                'Prix unitaire',
                'Prix de vente hors taxes conseillé, en euros.',
                'produits.csv',
                'prix_unitaire',
                {
                    usedBy: ['as_erp']
                }
            )
        ],
        producedBy: ['as_erp'],
        consumedBy: ['as_rapport_commercial'],
        references: []
    },
    {
        id: 'bo_commande',
        name: 'Commande',
        definition: 'Un engagement d’achat pris par un client à une date donnée, détaillé en lignes de commande.',
        domain: 'Ventes',
        globalOwner: 'Direction commerciale',
        contributors: ['Direction financière'],
        status: 'Validé',
        sources: [
            { table: 'commandes.csv', role: 'maitre' as const },
            { table: 'lignes_commande.csv', role: 'contributeur' as const }
        ],
        elements: [
            information(
                'be_commande_id',
                'Numéro de commande',
                'Identifiant de la commande, unique et non réutilisé.',
                'commandes.csv',
                'id_commande',
                {
                    usedBy: ['as_erp', 'as_rapport_commercial']
                }
            ),
            information(
                'be_commande_date',
                'Date de commande',
                'Date à laquelle le client a passé commande.',
                'commandes.csv',
                'date_commande',
                {
                    usedBy: ['as_rapport_commercial']
                }
            ),
            information(
                'be_commande_montant',
                'Montant hors taxes',
                'Somme des lignes de la commande, hors taxes, en euros.',
                'commandes.csv',
                'montant_ht',
                {
                    usedBy: ['as_erp', 'as_rapport_commercial'],
                    term: 'Chiffre d’affaires'
                }
            ),
            information(
                'be_commande_canal',
                'Canal',
                'Par où la commande est arrivée : agence, téléphone, site web.',
                'commandes.csv',
                'canal',
                {
                    usedBy: ['as_rapport_commercial']
                }
            ),
            information('be_commande_client', 'Client', 'Le client qui a passé la commande.', 'commandes.csv', 'id_client', {
                usedBy: ['as_erp'],
                origins: [{ boId: 'bo_client', elId: 'be_client_id', kind: 'copie' as const, rule: 'identifiant repris du CRM' }]
            }),
            {
                id: 'be_commande_lignes',
                name: 'Nombre de lignes',
                definition: 'Combien de produits différents la commande comporte.',
                mappings: [],
                usedBy: ['as_rapport_commercial'],
                origins: [
                    {
                        boId: 'bo_produit',
                        elId: 'be_produit_ref',
                        kind: 'agrege' as const,
                        rule: 'compte des références distinctes de la commande'
                    }
                ]
            }
        ],
        producedBy: ['as_crm'],
        consumedBy: ['as_erp', 'as_rapport_commercial'],
        references: [
            { boId: 'bo_client', cardinality: 'N-1' },
            { boId: 'bo_produit', cardinality: 'N-N' }
        ]
    },
    {
        id: 'bo_facture',
        name: 'Facture',
        definition: 'La demande de paiement adressée au client après livraison, et son règlement.',
        domain: 'Finance',
        globalOwner: 'Direction financière',
        contributors: [],
        status: 'Validé',
        sources: [{ table: 'factures.csv', role: 'maitre' as const }],
        elements: [
            information(
                'be_facture_numero',
                'Numéro de facture',
                'Numéro séquentiel exigé par l’administration fiscale.',
                'factures.csv',
                'id_facture',
                {
                    usedBy: ['as_erp', 'as_tva']
                }
            ),
            information('be_facture_echeance', 'Échéance', 'Date à laquelle le règlement est attendu.', 'factures.csv', 'date_echeance', {
                usedBy: ['as_erp']
            }),
            {
                id: 'be_facture_ttc',
                name: 'Montant toutes taxes comprises',
                definition: 'Montant réclamé au client, taxes comprises.',
                mappings: [{ table: 'factures.csv', col: 'montant_ttc' }],
                usedBy: ['as_tva', 'as_erp'],
                term: 'Chiffre d’affaires',
                origins: [
                    {
                        boId: 'bo_commande',
                        elId: 'be_commande_montant',
                        kind: 'derive' as const,
                        rule: 'montant hors taxes de la commande, augmenté de la TVA du produit'
                    }
                ]
            },
            information(
                'be_facture_reglement',
                'Date de règlement',
                'Date à laquelle le client a effectivement payé ; vide tant qu’il n’a pas payé.',
                'factures.csv',
                'date_reglement',
                {
                    usedBy: ['as_erp']
                }
            )
        ],
        producedBy: ['as_erp'],
        consumedBy: ['as_tva'],
        references: [{ boId: 'bo_commande', cardinality: 'N-1' }]
    }
];

/**
 * Les applications, processus et restitutions. Les **sources** d'un actif sont les fichiers qu'il produit
 * (c'est de là que naît la carte des flux), ses **tables** sont ceux qu'il se contente de lire.
 */
export const ACTIFS = [
    {
        id: 'as_insee',
        name: 'Référentiel géographique INSEE',
        kind: 'app' as const,
        description: 'Le référentiel officiel des communes, réceptionné chaque année : le début de la chaîne géographique.',
        owner: 'Direction des données',
        domain: 'Référentiel',
        criticality: 'Faible',
        sources: ['communes.csv'],
        tables: [],
        columns: [],
        boIds: ['bo_commune'],
        appIds: [],
        producedBy: [],
        deliveredTo: []
    },
    {
        id: 'as_crm',
        name: 'CRM Vega',
        kind: 'app' as const,
        description: 'Le logiciel de relation client : il crée les clients, leurs établissements, leurs contacts et leurs commandes.',
        owner: 'Direction commerciale',
        domain: 'Commercial',
        criticality: 'Critique',
        sources: ['clients.csv', 'contacts.csv', 'sites.csv', 'commandes.csv', 'lignes_commande.csv'],
        tables: ['communes.csv'],
        columns: [],
        boIds: ['bo_client', 'bo_contact', 'bo_site', 'bo_commande'],
        appIds: [],
        producedBy: [],
        deliveredTo: []
    },
    {
        id: 'as_erp',
        name: 'ERP Atlas',
        kind: 'app' as const,
        description: 'La gestion commerciale et la facturation : il tient le catalogue et émet les factures.',
        owner: 'Direction financière',
        domain: 'Finance',
        criticality: 'Haute',
        sources: ['produits.csv', 'factures.csv'],
        tables: ['commandes.csv', 'lignes_commande.csv', 'clients.csv'],
        columns: [],
        boIds: ['bo_produit', 'bo_facture'],
        appIds: [],
        producedBy: [],
        deliveredTo: []
    },
    {
        id: 'as_annuaire',
        name: 'Annuaire des ventes',
        kind: 'app' as const,
        description: 'L’annuaire du réseau : les agences et les commerciaux, avec leur rattachement hiérarchique.',
        owner: 'Direction commerciale',
        domain: 'Commercial',
        criticality: 'Moyenne',
        sources: ['agences.csv', 'commerciaux.csv'],
        tables: [],
        columns: [],
        boIds: [],
        appIds: [],
        producedBy: [],
        deliveredTo: []
    },
    {
        id: 'as_support',
        name: 'Outil de support Helpi',
        kind: 'app' as const,
        description: 'La prise en charge des demandes des clients : canal, catégorie, délai de résolution, satisfaction.',
        owner: 'Service support',
        domain: 'Support',
        criticality: 'Moyenne',
        sources: ['tickets_support.csv'],
        tables: ['clients.csv'],
        columns: [],
        boIds: [],
        appIds: [],
        producedBy: [],
        deliveredTo: []
    },
    {
        id: 'as_supervision',
        name: 'Supervision technique',
        kind: 'app' as const,
        description: 'La supervision des bâtiments : elle relève la consommation de chaque site, heure par heure.',
        owner: 'Exploitation technique',
        domain: 'Exploitation',
        criticality: 'Moyenne',
        sources: ['releves_consommation.csv'],
        tables: ['sites.csv'],
        columns: [],
        boIds: [],
        appIds: [],
        producedBy: [],
        deliveredTo: []
    },
    {
        id: 'as_prise_commande',
        name: 'Prise de commande',
        kind: 'process' as const,
        description: 'Du devis à la commande confirmée : le commercial saisit dans le CRM, l’ERP prend le relais pour la facturation.',
        owner: 'Direction commerciale',
        domain: 'Ventes',
        criticality: 'Critique',
        sources: [],
        tables: ['commandes.csv', 'lignes_commande.csv'],
        columns: [],
        boIds: ['bo_commande'],
        appIds: ['as_crm', 'as_erp'],
        producedBy: [],
        deliveredTo: []
    },
    {
        id: 'as_facturation',
        name: 'Facturation mensuelle',
        kind: 'process' as const,
        description: 'Chaque début de mois, les commandes livrées deviennent des factures, puis partent en recouvrement.',
        owner: 'Direction financière',
        domain: 'Finance',
        criticality: 'Critique',
        sources: [],
        tables: ['factures.csv', 'commandes.csv'],
        columns: [],
        boIds: ['bo_facture'],
        appIds: ['as_erp'],
        producedBy: [],
        deliveredTo: []
    },
    {
        id: 'as_campagne',
        name: 'Campagne de courriels',
        kind: 'process' as const,
        description:
            'L’envoi commercial aux contacts ayant donné leur consentement : c’est le traitement le plus surveillé au titre du RGPD.',
        owner: 'Direction commerciale',
        domain: 'Commercial',
        criticality: 'Haute',
        sources: [],
        tables: ['contacts.csv', 'clients.csv'],
        columns: [
            { table: 'contacts.csv', col: 'email' },
            { table: 'contacts.csv', col: 'optin_email' }
        ],
        boIds: ['bo_contact'],
        appIds: ['as_crm'],
        producedBy: [],
        deliveredTo: []
    },
    {
        id: 'as_rapport_commercial',
        name: 'Tableau de bord commercial',
        kind: 'report' as const,
        description: 'Le suivi hebdomadaire des ventes par région, par famille de produits et par canal.',
        owner: 'Direction commerciale',
        domain: 'Ventes',
        criticality: 'Haute',
        sources: [],
        tables: ['commandes.csv', 'clients.csv', 'produits.csv', 'communes.csv'],
        columns: [],
        boIds: ['bo_commande', 'bo_client'],
        appIds: ['as_erp'],
        producedBy: ['as_erp'],
        deliveredTo: ['Comité de direction'],
        recipients: 'Comité de direction, directeurs d’agence',
        frequency: 'hebdomadaire',
        format: 'Tableau de bord en ligne'
    },
    {
        id: 'as_tva',
        name: 'Déclaration de TVA',
        kind: 'report' as const,
        description: 'La déclaration mensuelle transmise à l’administration fiscale : aucune erreur n’est tolérée.',
        owner: 'Direction financière',
        domain: 'Finance',
        criticality: 'Critique',
        sources: [],
        tables: ['factures.csv'],
        columns: [],
        boIds: ['bo_facture'],
        appIds: ['as_erp'],
        producedBy: ['as_erp'],
        deliveredTo: ['Administration fiscale'],
        recipients: 'Administration fiscale',
        frequency: 'mensuelle',
        format: 'Fichier réglementaire'
    },
    {
        id: 'as_rapport_energie',
        name: 'Rapport de consommation énergétique',
        kind: 'report' as const,
        description: 'Le bilan trimestriel de consommation des bâtiments, transmis au comité environnement.',
        owner: 'Exploitation technique',
        // Laissé sans domaine : la fiche est incomplète, et l'écran le dit.
        domain: '',
        criticality: 'Faible',
        sources: [],
        tables: ['releves_consommation.csv', 'sites.csv'],
        columns: [],
        boIds: [],
        appIds: ['as_supervision'],
        producedBy: ['as_supervision'],
        deliveredTo: ['Comité environnement'],
        recipients: 'Comité environnement',
        frequency: 'trimestrielle',
        format: 'Document'
    }
];

/** Les périmètres : des ensembles de tables et d'objets que l'on regarde ensemble. */
export const PERIMETRES = [
    {
        id: 'pm_rgpd',
        name: 'Données personnelles (RGPD)',
        description:
            'Tout ce qui désigne une personne physique : contacts, clients particuliers, commerciaux. Périmètre de référence pour les demandes d’effacement.',
        tables: ['contacts.csv', 'clients.csv', 'commerciaux.csv'],
        boIds: ['bo_contact', 'bo_client']
    },
    {
        id: 'pm_finance',
        name: 'Reporting financier',
        description: 'Ce qui alimente la déclaration de TVA et le suivi du chiffre d’affaires : la moindre correction s’y voit.',
        tables: ['factures.csv', 'commandes.csv', 'lignes_commande.csv', 'produits.csv'],
        boIds: ['bo_facture', 'bo_commande', 'bo_produit']
    },
    {
        id: 'pm_referentiels',
        name: 'Référentiels partagés',
        description: 'Les tables de référence employées par plusieurs domaines : elles ne se modifient pas à la légère.',
        tables: ['communes.csv', 'produits.csv', 'agences.csv'],
        boIds: ['bo_commune', 'bo_produit']
    }
];

/** Les personnes et leurs rôles par domaine : c'est ce qui décide qui valide quoi. */
export const PERSONNES = [
    {
        id: 'pe_donnees',
        name: 'Direction des données',
        email: 'donnees@studio-demo.fr',
        roles: [{ domain: '', role: 'admin' as const }]
    },
    {
        id: 'pe_commercial',
        name: 'Direction commerciale',
        email: 'commercial@studio-demo.fr',
        roles: [
            { domain: 'Commercial', role: 'owner' as const },
            { domain: 'Ventes', role: 'owner' as const }
        ]
    },
    {
        id: 'pe_finance',
        name: 'Direction financière',
        email: 'finance@studio-demo.fr',
        roles: [{ domain: 'Finance', role: 'owner' as const }]
    },
    {
        id: 'pe_achats',
        name: 'Direction des achats',
        email: 'achats@studio-demo.fr',
        roles: [{ domain: 'Catalogue', role: 'owner' as const }]
    },
    {
        id: 'pe_support',
        name: 'Service support',
        email: 'support@studio-demo.fr',
        roles: [{ domain: 'Support', role: 'contrib' as const }]
    },
    {
        id: 'pe_exploitation',
        name: 'Exploitation technique',
        email: 'exploitation@studio-demo.fr',
        roles: [{ domain: 'Exploitation', role: 'owner' as const }]
    }
];

/** Le vocabulaire de la démonstration : ce que les mots veulent dire ici, et pas ailleurs. */
export const GLOSSAIRE = [
    {
        id: 'gl_client',
        term: 'Client',
        definition: 'Personne morale ou physique ayant passé au moins une commande, ou identifiée comme prospect par un commercial.',
        domain: 'Commercial',
        owner: 'Direction commerciale'
    },
    {
        id: 'gl_etablissement',
        term: 'Établissement',
        definition: 'Lieu physique rattaché à un client : siège, agence, entrepôt, usine ou point de vente.',
        domain: 'Commercial',
        owner: 'Direction commerciale'
    },
    {
        id: 'gl_chiffre_affaires',
        term: 'Chiffre d’affaires',
        definition: 'Somme des montants hors taxes des commandes non annulées sur une période.',
        domain: 'Finance',
        synonyms: 'CA, revenu',
        owner: 'Direction financière'
    },
    {
        id: 'gl_consentement',
        term: 'Consentement',
        definition: 'Accord libre et explicite d’une personne pour être contactée : sans lui, aucune campagne ne peut l’atteindre.',
        domain: 'Commercial',
        owner: 'Direction des données'
    },
    {
        id: 'gl_cle_fonctionnelle',
        term: 'Clé fonctionnelle',
        definition:
            'Ensemble de colonnes qui identifie une ligne au sens métier, faute d’identifiant fiable : ici prénom + nom + ville pour un contact.',
        domain: 'Qualité',
        owner: 'Direction des données'
    },
    {
        id: 'gl_code_insee',
        term: 'Code INSEE',
        definition: 'Code officiel à cinq caractères qui désigne une commune française. À ne pas confondre avec le code postal.',
        domain: 'Référentiel',
        owner: 'Direction des données'
    },
    {
        id: 'gl_reference_produit',
        term: 'Référence produit',
        definition:
            'Code commercial d’un article, au format ABC-0000. Une référence ne se réemploie jamais, même après retrait du catalogue.',
        domain: 'Catalogue',
        owner: 'Direction des achats'
    },
    {
        id: 'gl_encours',
        term: 'Encours client',
        definition: 'Somme des factures émises et non encore réglées pour un client, à une date donnée.',
        domain: 'Finance',
        owner: 'Direction financière'
    }
];

/**
 * Trois propositions en attente : l'écran « À valider » a ainsi de quoi se montrer, et chacune illustre un
 * cas différent — une définition manquante, un mot du glossaire à préciser, une criticité contestée.
 */
export const PROPOSITIONS = [
    {
        id: 'pr_statut_client',
        kind: 'attr' as const,
        field: 'definition',
        target: { boId: 'bo_client', elId: 'be_client_statut' },
        label: 'Client › Statut',
        before: '',
        after: 'ACTIF, INACTIF, PROSPECT ou RESILIE : où en est la relation commerciale avec ce client.',
        domain: 'Commercial',
        status: 'pending' as const,
        by: 'demo',
        byName: 'Service support',
        at: '2026-09-01T09:12:00.000Z'
    },
    {
        id: 'pr_terme_encours',
        kind: 'term' as const,
        field: 'definition',
        target: { termId: 'gl_encours' },
        label: 'Encours client',
        before: 'Somme des factures émises et non encore réglées pour un client, à une date donnée.',
        after: 'Somme des factures émises et non encore réglées pour un client, à une date donnée, hors litiges déclarés.',
        domain: 'Finance',
        status: 'pending' as const,
        by: 'demo',
        byName: 'Direction financière',
        at: '2026-09-03T14:40:00.000Z'
    },
    {
        id: 'pr_criticite_support',
        kind: 'asset' as const,
        field: 'criticality',
        target: { assetId: 'as_support' },
        label: 'Outil de support Helpi',
        before: 'Moyenne',
        after: 'Haute',
        domain: 'Support',
        status: 'pending' as const,
        by: 'demo',
        byName: 'Service support',
        at: '2026-09-05T08:05:00.000Z'
    }
];

/**
 * La confidentialité des colonnes. Les niveaux employés sont ceux des écrans : « personnel » déclenche le
 * périmètre RGPD, « confidentiel » restreint la diffusion, « interne » signale ce qui ne sort pas.
 */
export const CONFIDENTIALITE: Record<string, Record<string, string>> = {
    'contacts.csv': {
        prenom: 'personnel',
        nom: 'personnel',
        email: 'personnel',
        telephone_fixe: 'personnel',
        telephone_mobile: 'personnel',
        optin_email: 'personnel'
    },
    'clients.csv': { email: 'personnel', telephone: 'personnel', siret: 'interne', chiffre_affaires: 'confidentiel' },
    'commerciaux.csv': { nom: 'personnel', prenom: 'personnel', email: 'personnel' },
    'factures.csv': { montant_ttc: 'confidentiel' }
};
