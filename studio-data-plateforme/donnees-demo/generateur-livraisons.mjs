/**
 * Les fichiers « d'arrivage », ceux qui servent à montrer les imports répétés :
 *   • une mise à jour du fichier clients (mêmes identifiants, quelques valeurs corrigées, des clients nouveaux
 *     et une colonne en moins) pour l'écran Sources → « Mettre à jour » et l'analyse d'impact ;
 *   • une livraison mensuelle au format ZIP (clients et contacts nouveaux) pour l'import d'une archive ;
 *   • le catalogue de produits au format Excel, à deux feuilles, pour l'import de classeur côté serveur.
 */
import { ajouterJours, formatIso } from './calendrier.mjs';
import { FAMILLES_PRODUITS } from './referentiels.mjs';
import {
    COLONNES_CLIENTS,
    COLONNES_CONTACTS,
    construireClient,
    construireContact,
    ligneClient,
    ligneContact
} from './generateur-clients.mjs';
import { archiverZip, classeurExcel, texteCsv } from './ecriture.mjs';

/** La colonne retirée de la mise à jour : son absence est signalée à l'import, avec son impact. */
const COLONNE_RETIREE = 'consentement_rgpd';

/**
 * La mise à jour du fichier clients : les deux tiers des clients existants, dont une partie corrigée (statut
 * remis dans la liste, ville réécrite proprement, SIRET complété, date de mise à jour du jour), plus des clients
 * nouveaux — et une colonne en moins par rapport au fichier d'origine.
 */
export function genererMiseAJourClients(tirage, clients, options, compteur) {
    const colonnes = COLONNES_CLIENTS.filter(colonne => colonne !== COLONNE_RETIREE);
    const positionRetiree = COLONNES_CLIENTS.indexOf(COLONNE_RETIREE);
    const retenus = tirage.melanger(clients).slice(0, Math.round(clients.length * 0.66));
    const lignes = [];
    for (const client of retenus) {
        const corrige = { ...client };
        if (tirage.chance(0.35)) {
            corrige.statut = tirage.choisir(['ACTIF', 'INACTIF', 'PROSPECT', 'RESILIE']);
            corrige.ville = client.ville.trim().replace(/\s+/g, ' ');
            corrige.dateMiseAJour = formatIso(options.dateReference);
            if (client.type === 'PRO' && !client.siret)
                corrige.siret = String(tirage.entier(10000000, 99999999)) + String(tirage.entier(100000, 999999));
            compteur.ajouter('mise_a_jour.client_corrige');
        }
        lignes.push(ligneClient(corrige).filter((valeur, position) => position !== positionRetiree));
    }
    for (let rang = 1; rang <= options.clientsNouveaux; rang++) {
        const nouveau = construireClient(tirage, options.clients + rang, options.commerciaux, options.dateReference);
        nouveau.dateCreation = formatIso(ajouterJours(options.dateReference, -tirage.entier(1, 45)));
        nouveau.dateMiseAJour = formatIso(options.dateReference);
        lignes.push(ligneClient(nouveau).filter((valeur, position) => position !== positionRetiree));
        compteur.ajouter('mise_a_jour.client_nouveau');
    }
    return { colonnes, lignes: tirage.melanger(lignes) };
}

/**
 * La livraison mensuelle : une archive ZIP contenant deux fichiers, comme en reçoit un service de données —
 * des clients nouveaux et des contacts nouveaux, dont quelques-uns font doublon avec la base déjà chargée.
 */
export function genererLivraisonZip(tirage, clients, contacts, options, compteur) {
    const clientsNouveaux = [];
    const objetsNouveaux = [];
    for (let rang = 1; rang <= options.clientsLivres; rang++) {
        const client = construireClient(
            tirage,
            options.clients + options.clientsNouveaux + rang,
            options.commerciaux,
            options.dateReference
        );
        client.dateCreation = formatIso(ajouterJours(options.dateReference, -tirage.entier(1, 30)));
        client.dateMiseAJour = client.dateCreation;
        objetsNouveaux.push(client);
        clientsNouveaux.push(ligneClient(client));
    }
    const contactsLivres = [];
    for (let rang = 1; rang <= options.contactsLivres; rang++) {
        const client = tirage.chance(0.6) ? tirage.choisir(objetsNouveaux) : tirage.choisir(clients);
        contactsLivres.push(ligneContact(construireContact(tirage, 900000 + rang, client, options.dateReference)));
    }
    // Quelques contacts déjà présents dans la base reviennent dans la livraison : le doublon apparaîtra à l'import.
    for (const contact of tirage.melanger(contacts).slice(0, options.contactsDejaConnus)) {
        contactsLivres.push(ligneContact(contact));
        compteur.ajouter('livraison.contact_deja_connu');
    }
    const enUtf8 = texte => Buffer.from(texte, 'utf8');
    return archiverZip([
        { chemin: 'clients-nouveaux.csv', contenu: enUtf8(texteCsv(COLONNES_CLIENTS, clientsNouveaux)) },
        { chemin: 'contacts-nouveaux.csv', contenu: enUtf8(texteCsv(COLONNES_CONTACTS, tirage.melanger(contactsLivres))) }
    ]);
}

/** Le catalogue au format Excel : une feuille de produits, une feuille de familles avec leurs fourchettes de prix. */
export function genererCatalogueExcel(produits) {
    const feuilleProduits = [
        ['reference', 'libelle', 'famille', 'sous_famille', 'unite', 'prix_unitaire', 'taux_tva', 'actif'],
        ...produits.map(produit => [
            produit.reference,
            produit.libelle,
            produit.famille,
            produit.sousFamille,
            produit.unite,
            produit.prix,
            produit.tauxTva,
            produit.actif
        ])
    ];
    const feuilleFamilles = [
        ['famille', 'sous_familles', 'prix_minimum', 'prix_maximum', 'nombre_de_produits'],
        ...FAMILLES_PRODUITS.map(famille => [
            famille.famille,
            famille.sousFamilles.join(', '),
            famille.prixMinimum,
            famille.prixMaximum,
            produits.filter(produit => produit.famille === famille.famille).length
        ])
    ];
    return classeurExcel([
        { nom: 'Produits', lignes: feuilleProduits },
        { nom: 'Familles', lignes: feuilleFamilles }
    ]);
}
