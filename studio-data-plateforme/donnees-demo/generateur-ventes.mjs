/**
 * Ventes : commandes, lignes de commande et factures, étalées sur trois ans avec une vraie saisonnalité
 * (creux d'août, pointe de fin d'année, week-ends calmes, croissance d'environ 8 % par an). De quoi alimenter
 * les tableaux de bord, les statistiques, les séries temporelles et le rapprochement entre commandes et
 * factures. Les défauts semés ici sont ceux d'une chaîne de facturation : commandes orphelines, références en
 * double, dates écrites à la française, montants négatifs ou aberrants, lignes dont le total ne tombe pas juste,
 * factures sans commande et factures dont le montant s'écarte de la commande.
 */
import { ajouterJours, estWeekEnd, formatFrancais, formatIso, moisDe } from './calendrier.mjs';
import { CANAUX_VENTE, MODES_REGLEMENT, STATUTS_COMMANDE } from './referentiels.mjs';

/** Coefficient de saison, mois par mois (janvier à décembre) : l'été creuse, la fin d'année remplit. */
const COEFFICIENTS_MENSUELS = [0.85, 0.9, 1.0, 1.0, 0.95, 1.0, 0.8, 0.55, 1.1, 1.15, 1.3, 1.25];
const CROISSANCE_ANNUELLE = 0.08;

/** Poids de chaque jour de la période : saison, jour de la semaine et croissance de l'activité. */
export function poidsDesJours(dateDebut, nombreDeJours) {
    const jours = [];
    for (let rang = 0; rang < nombreDeJours; rang++) {
        const date = ajouterJours(dateDebut, rang);
        const saison = COEFFICIENTS_MENSUELS[moisDe(date) - 1];
        const semaine = estWeekEnd(date) ? 0.25 : 1;
        const croissance = 1 + (CROISSANCE_ANNUELLE * rang) / 365;
        jours.push({ date, poids: saison * semaine * croissance });
    }
    return jours;
}

/** Tire des dates de commande selon ces poids, puis les range dans l'ordre chronologique. */
function tirerLesDates(tirage, jours, nombre) {
    const entrees = jours.map(jour => ({ valeur: jour.date, poids: jour.poids }));
    const dates = [];
    for (let commande = 0; commande < nombre; commande++) dates.push(tirage.choisirSelonPoids(entrees));
    return dates.sort((premiere, seconde) => premiere.getTime() - seconde.getTime());
}

export const COLONNES_COMMANDES = [
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
export const COLONNES_LIGNES = [
    'id_ligne',
    'id_commande',
    'id_produit',
    'libelle_produit',
    'quantite',
    'prix_unitaire',
    'remise_pct',
    'montant_ligne'
];

/** Les lignes d'une commande : un à six produits, avec quantités, remises et quelques totaux faux. */
function lignesDUneCommande(tirage, identifiantCommande, produits, compteur, lignes) {
    const nombreDeProduits = tirage.choisirSelonPoids([
        { valeur: 1, poids: 30 },
        { valeur: 2, poids: 28 },
        { valeur: 3, poids: 20 },
        { valeur: 4, poids: 12 },
        { valeur: 5, poids: 7 },
        { valeur: 6, poids: 3 }
    ]);
    let total = 0;
    for (let rang = 0; rang < nombreDeProduits; rang++) {
        const produit = tirage.choisir(produits);
        let quantite = Math.max(1, Math.round(tirage.normale(6, 8)));
        const remise = tirage.chance(0.25) ? tirage.choisir([5, 10, 15, 20]) : 0;
        if (tirage.chance(0.003)) {
            quantite = tirage.chance(0.5) ? 0 : -quantite;
            compteur.ajouter('lignes_commande.quantite_invalide');
        }
        const juste = Math.round(quantite * produit.prix * (1 - remise / 100) * 100) / 100;
        let montant = juste;
        if (tirage.chance(0.01)) {
            // Total qui ne tombe pas juste : on s'assure qu'il diffère vraiment, même quand la ligne vaut zéro.
            montant = juste === 0 ? 12.5 : Math.round(juste * tirage.reel(1.05, 1.4) * 100) / 100;
            compteur.ajouter('lignes_commande.total_incoherent');
        }
        total += montant;
        lignes.push([
            'LIG-' + String(lignes.length + 1).padStart(7, '0'),
            identifiantCommande,
            produit.id,
            produit.libelle,
            quantite,
            produit.prix,
            remise,
            montant
        ]);
    }
    return { montant: Math.round(total * 100) / 100, nombreDeLignes: nombreDeProduits };
}

/** L'état d'une commande dépend de son âge : les récentes sont en cours, les anciennes livrées ou annulées. */
function statutSelonLAge(tirage, joursDepuisLaCommande) {
    if (tirage.chance(0.04)) return 'annulée';
    if (joursDepuisLaCommande > 30) return 'livrée';
    if (joursDepuisLaCommande > 12) return tirage.chance(0.7) ? 'livrée' : 'expédiée';
    if (joursDepuisLaCommande > 4) return tirage.chance(0.5) ? 'expédiée' : 'validée';
    return tirage.chance(0.5) ? 'enregistrée' : 'validée';
}

/** Les commandes et leurs lignes : le montant de la commande est la somme de ses lignes, remise comprise. */
export function genererCommandes(tirage, options, compteur) {
    const jours = poidsDesJours(options.dateDebutVentes, options.joursDeVentes);
    const dates = tirerLesDates(tirage, jours, options.commandes);
    const clientsActifs = options.clients.filter(client => client.statut !== 'PROSPECT');
    const sitesParClient = new Map();
    for (const site of options.sites) {
        if (!sitesParClient.has(site.idClient)) sitesParClient.set(site.idClient, []);
        sitesParClient.get(site.idClient).push(site);
    }
    const commandes = [];
    const lignesCommande = [];
    dates.forEach((date, rang) => {
        const client = tirage.choisir(clientsActifs);
        const identifiant = 'CMD-' + String(rang + 1).padStart(6, '0');
        const sites = sitesParClient.get(client.id) || [];
        const contenu = lignesDUneCommande(tirage, identifiant, options.produits, compteur, lignesCommande);
        const age = Math.round((options.dateReference.getTime() - date.getTime()) / 86400000);
        commandes.push({
            id: identifiant,
            reference: `C${date.getUTCFullYear()}-${String(rang + 1).padStart(6, '0')}`,
            idClient: client.id,
            idSite: sites.length ? tirage.choisir(sites).id : '',
            idCommercial: tirage.chance(0.9) ? client.idCommercial : tirage.choisir(options.commerciaux).id,
            canal: tirage.choisir(CANAUX_VENTE),
            date,
            statut: statutSelonLAge(tirage, age),
            nombreDeLignes: contenu.nombreDeLignes,
            montant: contenu.montant
        });
    });
    return { commandes, lignesCommande, fichierLignes: { colonnes: COLONNES_LIGNES, lignes: lignesCommande } };
}

/** Les lignes du fichier des commandes, avec leurs défauts (orphelines, références en double, dates mélangées). */
export function lignesDesCommandes(tirage, commandes, compteur, partDatesFrancaises) {
    const lignes = [];
    for (const commande of commandes) {
        const prevue = ajouterJours(commande.date, tirage.entier(3, 15));
        const livree = commande.statut === 'livrée';
        let reelle = livree ? ajouterJours(prevue, tirage.entier(-2, 12)) : null;
        if (reelle && tirage.chance(0.01)) {
            reelle = ajouterJours(commande.date, -tirage.entier(1, 20));
            compteur.ajouter('commandes.livraison_avant_commande');
        }
        let identifiantClient = commande.idClient;
        if (tirage.chance(0.006)) {
            identifiantClient = 'CLI-99' + String(tirage.entier(100, 999));
            compteur.ajouter('commandes.client_inconnu');
        }
        let statut = commande.statut;
        if (tirage.chance(0.01)) {
            statut = tirage.choisir(['LIVREE', 'en cours', 'Annulee']);
            compteur.ajouter('commandes.statut_hors_liste');
        }
        let montant = commande.montant;
        if (tirage.chance(0.003)) {
            montant = -montant;
            compteur.ajouter('commandes.montant_negatif');
        } else if (tirage.chance(0.001)) {
            montant = Math.round(montant * 100 * 100) / 100;
            compteur.ajouter('commandes.montant_aberrant');
        }
        const remise = tirage.chance(0.2) ? tirage.choisir([2, 5, 10]) : 0;
        // Une petite part des dates est écrite à la française : c'est ce mélange que révèle l'analyse des formats.
        const enFrancais = tirage.chance(partDatesFrancaises);
        if (enFrancais) compteur.ajouter('commandes.date_a_la_francaise');
        lignes.push([
            commande.id,
            commande.reference,
            identifiantClient,
            commande.idSite,
            commande.idCommercial,
            commande.canal,
            enFrancais ? formatFrancais(commande.date) : formatIso(commande.date),
            formatIso(prevue),
            reelle ? formatIso(reelle) : '',
            statut,
            commande.nombreDeLignes,
            montant,
            remise,
            Math.round(montant * 1.2 * 100) / 100,
            'EUR'
        ]);
    }
    ajouterReferencesEnDouble(tirage, lignes, compteur);
    return lignes;
}

/** Quelques commandes reprennent la référence d'une autre : un même bon de commande saisi deux fois. */
function ajouterReferencesEnDouble(tirage, lignes, compteur) {
    const nombre = Math.max(1, Math.round(lignes.length * 0.004));
    for (const ligne of tirage.melanger(lignes).slice(0, nombre)) {
        const autre = tirage.choisir(lignes);
        ligne[1] = autre[1];
        compteur.ajouter('commandes.reference_en_double');
    }
}

export const COLONNES_FACTURES = [
    'id_facture',
    'numero',
    'id_commande',
    'id_client',
    'date_facture',
    'date_echeance',
    'date_reglement',
    'montant_ht',
    'montant_ttc',
    'statut_reglement',
    'mode_reglement'
];

/** Les factures : une par commande livrée ou expédiée, plus des écarts de montant et des factures sans commande. */
export function genererFactures(tirage, commandes, compteur, dateReference) {
    const lignes = [];
    const facturables = commandes.filter(commande => commande.statut === 'livrée' || commande.statut === 'expédiée');
    for (const commande of facturables) {
        const dateFacture = ajouterJours(commande.date, tirage.entier(5, 25));
        if (dateFacture.getTime() > dateReference.getTime()) continue;
        const echeance = ajouterJours(dateFacture, 30);
        const numero = 'FAC-' + dateFacture.getUTCFullYear() + '-' + String(lignes.length + 1).padStart(6, '0');
        let montant = commande.montant;
        if (tirage.chance(0.02)) {
            montant = Math.round(montant * tirage.reel(0.9, 1.1) * 100) / 100;
            compteur.ajouter('factures.montant_different_de_la_commande');
        }
        let identifiantCommande = commande.id;
        if (tirage.chance(0.012)) {
            identifiantCommande = 'CMD-99' + String(tirage.entier(1000, 9999));
            compteur.ajouter('factures.commande_inconnue');
        }
        const retard = tirage.choisirSelonPoids([
            { valeur: 0, poids: 62 },
            { valeur: tirage.entier(1, 20), poids: 25 },
            { valeur: tirage.entier(25, 90), poids: 13 }
        ]);
        const reglement = tirage.chance(0.86) ? ajouterJours(echeance, retard - tirage.entier(0, 20)) : null;
        const regleeAVenir = reglement && reglement.getTime() > dateReference.getTime();
        lignes.push([
            'FAC-' + String(lignes.length + 1).padStart(6, '0'),
            numero,
            identifiantCommande,
            commande.idClient,
            formatIso(dateFacture),
            formatIso(echeance),
            reglement && !regleeAVenir ? formatIso(reglement) : '',
            montant,
            Math.round(montant * 1.2 * 100) / 100,
            statutDuReglement(reglement, regleeAVenir, echeance, dateReference),
            tirage.choisir(MODES_REGLEMENT)
        ]);
    }
    return { colonnes: COLONNES_FACTURES, lignes };
}

/** L'état d'une facture : payée, en attente avant l'échéance, en retard après, ou en litige de temps en temps. */
function statutDuReglement(reglement, regleeAVenir, echeance, dateReference) {
    if (reglement && !regleeAVenir) return 'payée';
    if (echeance.getTime() < dateReference.getTime()) return 'en retard';
    return 'en attente';
}

/** Les états de commande connus : publiés ici pour que la documentation et les listes de valeurs les reprennent. */
export const ETATS_COMMANDE_CONNUS = STATUTS_COMMANDE;
