/**
 * Générateur du jeu de données de démonstration de Studio Data.
 *
 *   node donnees-demo/generer.mjs [--taille petite|demo|grande] [--dossier chemin] [--graine 20260910]
 *                                 [--date-reference AAAA-MM-JJ]
 *
 * Il écrit une dizaine de fichiers (CSV, une archive ZIP, un classeur Excel) formant une base de démonstration
 * cohérente : un référentiel géographique de communes réelles, des clients et leurs établissements situés dans
 * ces communes, des contacts volontairement en doublon, un réseau commercial hiérarchisé, un catalogue, trois
 * ans de commandes saisonnières avec leurs lignes et leurs factures, des tickets de support et une année de
 * relevés horaires. Toutes les entreprises, personnes et valeurs sont fictives ; seules les communes sont réelles.
 *
 * Le tirage est reproductible : à graine égale, les fichiers sont identiques au bit près, et le manifeste
 * (manifeste.json) publie le compte exact des défauts semés, que les tests vérifient.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creerTirage } from './aleatoire.mjs';
import { ajouterJours, jourDe } from './calendrier.mjs';
import { creerCompteur } from './deformations.mjs';
import { ecrireBinaire, ecrireCsv, texteCsv } from './ecriture.mjs';
import { genererAgences, genererCommerciaux, genererCommunes, genererProduits } from './generateur-referentiel.mjs';
import { genererClients, genererContacts, genererSites } from './generateur-clients.mjs';
import { genererCommandes, genererFactures, lignesDesCommandes } from './generateur-ventes.mjs';
import { genererReleves, genererTickets } from './generateur-exploitation.mjs';
import { genererCatalogueExcel, genererLivraisonZip, genererMiseAJourClients } from './generateur-livraisons.mjs';

/** Trois tailles : de quoi essayer vite, de quoi démontrer, de quoi éprouver la volumétrie. */
const TAILLES = {
    petite: {
        clients: 300,
        contacts: 900,
        commandes: 2000,
        tickets: 500,
        produits: 60,
        commerciaux: 24,
        joursDeReleves: 60,
        sitesSuivis: 2
    },
    demo: {
        clients: 2500,
        contacts: 8000,
        commandes: 24000,
        tickets: 6000,
        produits: 180,
        commerciaux: 60,
        joursDeReleves: 365,
        sitesSuivis: 3
    },
    grande: {
        clients: 20000,
        contacts: 70000,
        commandes: 250000,
        tickets: 60000,
        produits: 600,
        commerciaux: 240,
        joursDeReleves: 730,
        sitesSuivis: 8
    }
};
const JOURS_DE_VENTES = 1095;

/** Lecture des options de la ligne de commande, avec leurs valeurs par défaut. */
function lireOptions(arguments_) {
    const valeurDe = (nom, defaut) => {
        const position = arguments_.indexOf('--' + nom);
        return position >= 0 && arguments_[position + 1] ? arguments_[position + 1] : defaut;
    };
    const dossierParDefaut = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fichiers');
    const taille = valeurDe('taille', 'demo');
    if (!TAILLES[taille]) throw new Error(`Taille inconnue : ${taille} (attendu : ${Object.keys(TAILLES).join(', ')}).`);
    return {
        taille,
        dossier: path.resolve(valeurDe('dossier', dossierParDefaut)),
        graine: Number(valeurDe('graine', '20260910')),
        dateReference: jourDe(valeurDe('date-reference', '2026-09-10')),
        silencieux: arguments_.includes('--silencieux')
    };
}

/** Construit tout le jeu en mémoire : chaque table s'appuie sur les précédentes, comme dans un vrai système. */
function construireLeJeu(options) {
    const tirage = creerTirage(options.graine);
    const compteur = creerCompteur();
    const volumes = TAILLES[options.taille];
    const dateReference = options.dateReference;
    const communes = genererCommunes();
    const { agences, fichier: fichierAgences } = genererAgences(tirage);
    const { commerciaux, fichier: fichierCommerciaux } = genererCommerciaux(tirage, agences, volumes.commerciaux, dateReference);
    const { produits, fichier: fichierProduits } = genererProduits(tirage, volumes.produits, dateReference, compteur);
    const tiers = construireLesTiers(tirage, compteur, { volumes, commerciaux, dateReference });
    const { clients, sites, contacts } = tiers;
    const { fichierClients, fichierSites, fichierContacts } = tiers;
    const ventes = construireLesVentes(tirage, compteur, { clients, sites, produits, commerciaux, dateReference, volumes });
    const tickets = genererTickets(
        tirage,
        { clients, contacts, tickets: volumes.tickets, joursDeVentes: JOURS_DE_VENTES, dateReference },
        compteur
    );
    const releves = genererReleves(
        tirage,
        {
            sitesSuivis: sites.slice(0, volumes.sitesSuivis),
            joursDeReleves: volumes.joursDeReleves,
            dateDebutReleves: ajouterJours(dateReference, -volumes.joursDeReleves)
        },
        compteur
    );
    const arrivages = construireLesArrivages(tirage, compteur, { clients, contacts, commerciaux, produits, volumes, dateReference });
    return {
        compteur,
        tables: [
            { nom: 'communes.csv', ...communes },
            { nom: 'agences.csv', ...fichierAgences },
            { nom: 'commerciaux.csv', ...fichierCommerciaux },
            { nom: 'produits.csv', ...fichierProduits },
            { nom: 'clients.csv', ...fichierClients },
            { nom: 'sites.csv', ...fichierSites },
            { nom: 'contacts.csv', ...fichierContacts },
            { nom: 'commandes.csv', ...ventes.commandes },
            { nom: 'lignes_commande.csv', ...ventes.lignes },
            { nom: 'factures.csv', ...ventes.factures },
            { nom: 'tickets_support.csv', ...tickets },
            { nom: 'releves_consommation.csv', ...releves },
            { nom: 'clients-mise-a-jour.csv', ...arrivages.miseAJour }
        ],
        binaires: [
            { nom: 'livraison-mensuelle.zip', contenu: arrivages.livraison },
            { nom: 'catalogue-produits.xlsx', contenu: arrivages.catalogue }
        ]
    };
}

/**
 * Clients, établissements et contacts : les trois tables qui portent la plupart des défauts. Les proportions de
 * doublons sont fixées ici, en part du nombre de contacts, pour qu'elles suivent la taille demandée.
 */
function construireLesTiers(tirage, compteur, contexte) {
    const { volumes, commerciaux, dateReference } = contexte;
    const { clients, fichier: fichierClients } = genererClients(
        tirage,
        { ...volumes, commerciaux, dateReference, doublonsClients: Math.round(volumes.clients * 0.012), lignesVides: 12 },
        compteur
    );
    const { sites, fichier: fichierSites } = genererSites(tirage, clients, compteur, dateReference);
    const { contacts, fichier: fichierContacts } = genererContacts(
        tirage,
        clients,
        {
            contacts: volumes.contacts,
            dateReference,
            doublonsStricts: Math.round(volumes.contacts * 0.03),
            doublonsNormalises: Math.round(volumes.contacts * 0.035),
            doublonsFlous: Math.round(volumes.contacts * 0.03)
        },
        compteur
    );
    return { clients, sites, contacts, fichierClients, fichierSites, fichierContacts };
}

/** Commandes, lignes et factures : trois tables qui se répondent, avec leurs écarts volontaires. */
function construireLesVentes(tirage, compteur, contexte) {
    const { commandes, fichierLignes } = genererCommandes(
        tirage,
        {
            clients: contexte.clients,
            sites: contexte.sites,
            produits: contexte.produits,
            commerciaux: contexte.commerciaux,
            commandes: contexte.volumes.commandes,
            dateReference: contexte.dateReference,
            dateDebutVentes: ajouterJours(contexte.dateReference, -JOURS_DE_VENTES),
            joursDeVentes: JOURS_DE_VENTES
        },
        compteur
    );
    const colonnesCommandes = lignesDesCommandes(tirage, commandes, compteur, 0.03);
    return {
        commandes: { colonnes: fichierColonnesCommandes(), lignes: colonnesCommandes },
        lignes: fichierLignes,
        factures: genererFactures(tirage, commandes, compteur, contexte.dateReference)
    };
}

/** Les arrivages : mise à jour du fichier clients, livraison ZIP et catalogue Excel. */
function construireLesArrivages(tirage, compteur, contexte) {
    const options = {
        clients: contexte.volumes.clients,
        commerciaux: contexte.commerciaux,
        dateReference: contexte.dateReference,
        clientsNouveaux: Math.max(20, Math.round(contexte.volumes.clients * 0.02)),
        clientsLivres: Math.max(15, Math.round(contexte.volumes.clients * 0.015)),
        contactsLivres: Math.max(40, Math.round(contexte.volumes.contacts * 0.02)),
        contactsDejaConnus: Math.max(10, Math.round(contexte.volumes.contacts * 0.004))
    };
    return {
        miseAJour: genererMiseAJourClients(tirage, contexte.clients, options, compteur),
        livraison: genererLivraisonZip(tirage, contexte.clients, contexte.contacts, options, compteur),
        catalogue: genererCatalogueExcel(contexte.produits)
    };
}

/** Les colonnes du fichier des commandes (déclarées ici pour garder l'ordre d'écriture au même endroit). */
function fichierColonnesCommandes() {
    return [
        'id_commande',
        'reference',
        'id_client',
        'id_site',
        'id_commercial',
        'canal',
        'date_commande',
        'date_livraison_prevue',
        'date_livraison_reelle',
        'statut',
        'nombre_lignes',
        'montant_ht',
        'remise_pct',
        'montant_ttc',
        'devise'
    ];
}

/** Écrit les fichiers, le manifeste, et renvoie le résumé affiché à la fin. */
function ecrireLeJeu(jeu, options) {
    fs.mkdirSync(options.dossier, { recursive: true });
    const ecrits = jeu.tables.map(table => ecrireCsv(options.dossier, table.nom, table.colonnes, table.lignes));
    for (const binaire of jeu.binaires) ecrits.push(ecrireBinaire(options.dossier, binaire.nom, binaire.contenu));
    const manifeste = {
        genereLe: new Date().toISOString(),
        graine: options.graine,
        taille: options.taille,
        dateReference: options.dateReference.toISOString().slice(0, 10),
        fichiers: ecrits,
        defautsSemes: jeu.compteur.totaux()
    };
    fs.writeFileSync(path.join(options.dossier, 'manifeste.json'), JSON.stringify(manifeste, null, 2) + '\n', 'utf8');
    return manifeste;
}

/** Résumé lisible en fin de génération : un tableau des fichiers, puis les défauts semés. */
function afficherLeResume(manifeste) {
    const enMegaOctets = octets => (octets / 1048576).toFixed(2) + ' Mo';
    console.log(`Jeu de démonstration « ${manifeste.taille} » — graine ${manifeste.graine}, date de référence ${manifeste.dateReference}`);
    for (const fichier of manifeste.fichiers) {
        const volume = fichier.lignes === undefined ? '' : `${String(fichier.lignes).padStart(7)} lignes`;
        console.log(`  ${fichier.fichier.padEnd(28)} ${volume.padEnd(16)} ${enMegaOctets(fichier.octets)}`);
    }
    const total = manifeste.fichiers.reduce((somme, fichier) => somme + fichier.octets, 0);
    console.log(`  ${''.padEnd(28)} ${''.padEnd(16)} ${enMegaOctets(total)} au total`);
    console.log('Défauts semés (volontaires, décrits dans donnees-demo/README.md) :');
    for (const [nom, nombre] of Object.entries(manifeste.defautsSemes).sort()) console.log(`  ${nom.padEnd(46)} ${nombre}`);
}

/** Point d'entrée : construit, écrit, résume. Exporté pour que les tests génèrent un jeu dans un dossier à eux. */
export function genererLeJeuDeDemonstration(argumentsDeLigneDeCommande = []) {
    const options = lireOptions(argumentsDeLigneDeCommande);
    const jeu = construireLeJeu(options);
    const manifeste = ecrireLeJeu(jeu, options);
    if (!options.silencieux) afficherLeResume(manifeste);
    return { manifeste, options, texteDUneTable: nom => texteCsv(...tableNommee(jeu, nom)) };
}

/** Le contenu d'une table par son nom de fichier : les tests s'en servent sans relire le disque. */
function tableNommee(jeu, nom) {
    const table = jeu.tables.find(candidate => candidate.nom === nom);
    if (!table) throw new Error(`Table inconnue dans le jeu : ${nom}`);
    return [table.colonnes, table.lignes];
}

if (process.argv[1] && process.argv[1].endsWith('generer.mjs')) genererLeJeuDeDemonstration(process.argv.slice(2));
