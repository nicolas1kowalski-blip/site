/**
 * Clients, établissements et contacts — le cœur du jeu de démonstration.
 *
 * Les clients portent l'essentiel des défauts de qualité (SIRET manquant sur des professionnels, villes écrites
 * de trois façons, statuts hors liste, codes postaux incohérents avec le département, adresses électroniques
 * fausses, dates de mise à jour très anciennes, chiffres d'affaires négatifs ou aberrants, lignes vides et
 * lignes strictement dupliquées).
 *
 * Les contacts portent les doublons, semés en trois familles pour montrer les trois rapprochements de
 * l'écran Clé fonctionnelle : stricts (la même ligne deux fois), normalisés (même personne écrite autrement :
 * casse, accents, espaces) et flous (faute de frappe sur le nom, prénom abrégé, adresse électronique voisine).
 */
import { ajouterJours, formatIso, joursEntre } from './calendrier.mjs';
import {
    COMMUNES,
    FONCTIONS_CONTACT,
    FORMES_JURIDIQUES,
    MOTS_ENSEIGNE,
    MOTS_METIER,
    RUES,
    SEGMENTS,
    SERVICES_CONTACT,
    SOURCES_ACQUISITION,
    STATUTS_HORS_LISTE,
    TYPES_SITE
} from './referentiels.mjs';
import {
    BOUCHE_TROUS,
    casseAleatoire,
    courrielApproche,
    courrielInvalide,
    espacesParasites,
    fauteDeFrappe,
    sansAccents,
    telephoneEcrit
} from './deformations.mjs';
import { identiteFictive } from './generateur-referentiel.mjs';

export const COLONNES_CLIENTS = [
    'id_client',
    'raison_sociale',
    'type',
    'segment',
    'siret',
    'adresse',
    'code_postal',
    'ville',
    'code_insee',
    'departement',
    'region',
    'latitude',
    'longitude',
    'email',
    'telephone',
    'date_creation',
    'date_maj',
    'statut',
    'effectif',
    'chiffre_affaires',
    'id_commercial',
    'consentement_rgpd'
];

const numeroSiret = tirage => Array.from({ length: 14 }, () => tirage.entier(0, 9)).join('');
const domaineDe = raisonSociale =>
    sansAccents(raisonSociale)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 14) + '.fr';

/** Une commune tirée au sort, avec des coordonnées légèrement décalées pour ne pas empiler les points. */
function adresseFictive(tirage) {
    const commune = tirage.choisir(COMMUNES);
    return {
        commune,
        adresse: `${tirage.entier(1, 180)} ${tirage.choisir(RUES)}`,
        latitude: Math.round((commune.latitude + tirage.reel(-0.05, 0.05)) * 10000) / 10000,
        longitude: Math.round((commune.longitude + tirage.reel(-0.05, 0.05)) * 10000) / 10000
    };
}

/** Un client propre : c'est la ligne « vraie », que la fonction suivante se charge d'abîmer parfois. */
export function construireClient(tirage, numero, commerciaux, dateReference) {
    const professionnel = tirage.chance(0.72);
    const lieu = adresseFictive(tirage);
    const identite = identiteFictive(tirage, 'courriel-demo.fr');
    const raisonSociale = professionnel
        ? `${tirage.choisir(MOTS_ENSEIGNE)} ${tirage.choisir(MOTS_METIER)} ${tirage.choisir(FORMES_JURIDIQUES)}`
        : `${identite.civilite} ${identite.prenom} ${identite.nom}`;
    const dateCreation = ajouterJours(dateReference, -tirage.entier(30, 4000));
    return {
        id: 'CLI-' + String(numero).padStart(5, '0'),
        raisonSociale,
        type: professionnel ? 'PRO' : 'PART',
        segment: professionnel ? tirage.choisir(SEGMENTS.slice(0, 4)) : 'Particulier',
        siret: professionnel ? numeroSiret(tirage) : '',
        adresse: lieu.adresse,
        codePostal: lieu.commune.codePostal,
        ville: lieu.commune.nom,
        codeInsee: lieu.commune.codeInsee,
        departement: lieu.commune.departement,
        region: lieu.commune.region,
        latitude: lieu.latitude,
        longitude: lieu.longitude,
        courriel: professionnel ? `contact@${domaineDe(raisonSociale)}` : identite.courriel,
        telephone: telephoneEcrit('0' + tirage.entier(100000000, 799999999), tirage),
        dateCreation: formatIso(dateCreation),
        dateMiseAJour: formatIso(ajouterJours(dateCreation, tirage.entier(0, joursEntre(dateCreation, dateReference)))),
        statut: tirage.choisirSelonPoids([
            { valeur: 'ACTIF', poids: 70 },
            { valeur: 'PROSPECT', poids: 14 },
            { valeur: 'INACTIF', poids: 10 },
            { valeur: 'RESILIE', poids: 6 }
        ]),
        effectif: professionnel ? String(Math.max(1, Math.round(tirage.normale(60, 90)))) : '',
        chiffreAffaires: professionnel ? Math.round(tirage.normale(180000, 150000) + 20000) : Math.round(tirage.reel(150, 4000)),
        idCommercial: tirage.choisir(commerciaux).id,
        consentement: tirage.chance(0.78) ? 'oui' : 'non'
    };
}

/** Les défauts semés sur un client : chacun est compté, pour que la documentation et les tests s'y retrouvent. */
function abimerClient(client, tirage, compteur, dateReference) {
    if (client.type === 'PRO' && tirage.chance(0.07)) {
        client.siret = '';
        compteur.ajouter('clients.siret_manquant_sur_professionnel');
    } else if (client.type === 'PRO' && tirage.chance(0.02)) {
        client.siret = tirage.choisir(BOUCHE_TROUS);
        compteur.ajouter('clients.siret_bouche_trous');
    }
    if (tirage.chance(0.08)) {
        client.ville = casseAleatoire(client.ville, tirage);
        compteur.ajouter('clients.ville_casse_incoherente');
    }
    if (tirage.chance(0.02)) {
        client.raisonSociale = espacesParasites(client.raisonSociale, tirage);
        compteur.ajouter('clients.raison_sociale_espaces');
    }
    if (tirage.chance(0.015)) {
        client.statut = tirage.choisir(STATUTS_HORS_LISTE);
        compteur.ajouter('clients.statut_hors_liste');
    }
    if (tirage.chance(0.02)) {
        client.codePostal = tirage.choisir(COMMUNES).codePostal;
        compteur.ajouter('clients.code_postal_incoherent');
    }
    if (tirage.chance(0.04)) {
        client.courriel = courrielInvalide(client.courriel, tirage);
        compteur.ajouter('clients.email_invalide');
    }
    if (tirage.chance(0.05)) {
        // Fiche laissée de côté depuis des années : la date reste postérieure à la création (les dates ISO se comparent comme du texte).
        const ancienne = formatIso(ajouterJours(dateReference, -tirage.entier(800, 2500)));
        client.dateMiseAJour = ancienne > client.dateCreation ? ancienne : client.dateCreation;
        compteur.ajouter('clients.date_maj_ancienne');
    } else if (tirage.chance(0.003)) {
        client.dateMiseAJour = formatIso(ajouterJours(dateReference, tirage.entier(10, 300)));
        compteur.ajouter('clients.date_maj_future');
    }
    if (client.type === 'PRO' && tirage.chance(0.004)) {
        client.chiffreAffaires = -client.chiffreAffaires;
        compteur.ajouter('clients.chiffre_affaires_negatif');
    } else if (client.type === 'PRO' && tirage.chance(0.002)) {
        client.chiffreAffaires *= 1000;
        compteur.ajouter('clients.chiffre_affaires_aberrant');
    }
    return client;
}

export const ligneClient = client => [
    client.id,
    client.raisonSociale,
    client.type,
    client.segment,
    client.siret,
    client.adresse,
    client.codePostal,
    client.ville,
    client.codeInsee,
    client.departement,
    client.region,
    client.latitude,
    client.longitude,
    client.courriel,
    client.telephone,
    client.dateCreation,
    client.dateMiseAJour,
    client.statut,
    client.effectif,
    client.chiffreAffaires,
    client.idCommercial,
    client.consentement
];

/** La table des clients : lignes propres, lignes abîmées, puis lignes dupliquées et lignes vides. */
export function genererClients(tirage, options, compteur) {
    const clients = [];
    for (let numero = 1; numero <= options.clients; numero++) {
        clients.push(
            abimerClient(
                construireClient(tirage, numero, options.commerciaux, options.dateReference),
                tirage,
                compteur,
                options.dateReference
            )
        );
    }
    const lignes = clients.map(ligneClient);
    // Doublons stricts : la même ligne deux fois (identifiant compris), ce que le profilage appelle « doublon exact ».
    for (const client of tirage.melanger(clients).slice(0, options.doublonsClients)) {
        lignes.push(ligneClient(client));
        compteur.ajouter('clients.ligne_dupliquee');
    }
    // Lignes entièrement vides : le résidu d'un export mal découpé, que l'inspecteur d'anomalies isole.
    for (let vide = 0; vide < options.lignesVides; vide++) {
        lignes.push(COLONNES_CLIENTS.map(() => ''));
        compteur.ajouter('clients.ligne_vide');
    }
    return { clients, fichier: { colonnes: COLONNES_CLIENTS, lignes: tirage.melanger(lignes) } };
}

export const COLONNES_SITES = [
    'id_site',
    'id_client',
    'libelle',
    'type_site',
    'adresse',
    'code_postal',
    'ville',
    'code_insee',
    'region',
    'latitude',
    'longitude',
    'surface_m2',
    'date_ouverture',
    'date_fermeture',
    'actif'
];

/** Les établissements des clients professionnels : un à quatre par client, avec leurs coordonnées. */
export function genererSites(tirage, clients, compteur, dateReference) {
    const sites = [];
    for (const client of clients.filter(candidat => candidat.type === 'PRO')) {
        const nombre = tirage.choisirSelonPoids([
            { valeur: 1, poids: 55 },
            { valeur: 2, poids: 25 },
            { valeur: 3, poids: 13 },
            { valeur: 4, poids: 7 }
        ]);
        for (let rang = 1; rang <= nombre; rang++) {
            const lieu = rang === 1 ? null : adresseFictive(tirage);
            const ouverture = ajouterJours(dateReference, -tirage.entier(100, 3800));
            const ferme = tirage.chance(0.08);
            const typeSite = rang === 1 ? 'Siège' : tirage.choisir(TYPES_SITE.slice(1));
            sites.push({
                id: 'SIT-' + String(sites.length + 1).padStart(5, '0'),
                idClient: client.id,
                libelle: `${typeSite} ${lieu ? lieu.commune.nom : client.ville}`,
                typeSite,
                adresse: lieu ? lieu.adresse : client.adresse,
                codePostal: lieu ? lieu.commune.codePostal : client.codePostal,
                ville: lieu ? lieu.commune.nom : client.ville,
                codeInsee: lieu ? lieu.commune.codeInsee : client.codeInsee,
                region: lieu ? lieu.commune.region : client.region,
                latitude: lieu ? lieu.latitude : client.latitude,
                longitude: lieu ? lieu.longitude : client.longitude,
                surface: Math.max(40, Math.round(tirage.normale(900, 800))),
                ouverture,
                fermeture: ferme ? ajouterJours(ouverture, tirage.entier(200, 2000)) : null
            });
        }
    }
    return { sites, fichier: { colonnes: COLONNES_SITES, lignes: lignesSites(sites, tirage, compteur) } };
}

/** Les lignes des établissements, avec deux défauts : coordonnées manquantes et période fermée avant d'ouvrir. */
function lignesSites(sites, tirage, compteur) {
    return sites.map(site => {
        let latitude = site.latitude;
        let longitude = site.longitude;
        if (tirage.chance(0.005)) {
            latitude = '';
            longitude = '';
            compteur.ajouter('sites.coordonnees_manquantes');
        }
        let fermeture = site.fermeture ? formatIso(site.fermeture) : '';
        if (site.fermeture && tirage.chance(0.08)) {
            fermeture = formatIso(ajouterJours(site.ouverture, -tirage.entier(30, 400)));
            compteur.ajouter('sites.periode_incoherente');
        }
        return [
            site.id,
            site.idClient,
            site.libelle,
            site.typeSite,
            site.adresse,
            site.codePostal,
            site.ville,
            site.codeInsee,
            site.region,
            latitude,
            longitude,
            site.surface,
            formatIso(site.ouverture),
            fermeture,
            site.fermeture ? 'non' : 'oui'
        ];
    });
}

export const COLONNES_CONTACTS = [
    'id_contact',
    'id_client',
    'civilite',
    'prenom',
    'nom',
    'fonction',
    'service',
    'email',
    'telephone_fixe',
    'telephone_mobile',
    'ville',
    'code_postal',
    'date_creation',
    'source_acquisition',
    'optin_email'
];

/** Un contact rattaché à un client : son adresse électronique suit le domaine de l'entreprise. */
export function construireContact(tirage, numero, client, dateReference) {
    const identite = identiteFictive(tirage, domaineDe(client.raisonSociale));
    return {
        id: 'CTC-' + String(numero).padStart(6, '0'),
        idClient: client.id,
        civilite: identite.civilite,
        prenom: identite.prenom,
        nom: identite.nom,
        fonction: tirage.choisir(FONCTIONS_CONTACT),
        service: tirage.choisir(SERVICES_CONTACT),
        courriel: identite.courriel,
        telephoneFixe: telephoneEcrit('0' + tirage.entier(100000000, 599999999), tirage),
        telephoneMobile: tirage.chance(0.85) ? telephoneEcrit('06' + tirage.entier(10000000, 99999999), tirage) : '',
        ville: client.ville,
        codePostal: client.codePostal,
        dateCreation: formatIso(ajouterJours(dateReference, -tirage.entier(10, 3000))),
        source: tirage.choisir(SOURCES_ACQUISITION),
        optin: tirage.choisir(['oui', 'non', 'OUI', 'O', 'N', '1', '0'])
    };
}

export const ligneContact = contact => [
    contact.id,
    contact.idClient,
    contact.civilite,
    contact.prenom,
    contact.nom,
    contact.fonction,
    contact.service,
    contact.courriel,
    contact.telephoneFixe,
    contact.telephoneMobile,
    contact.ville,
    contact.codePostal,
    contact.dateCreation,
    contact.source,
    contact.optin
];

/** Copie normalisée : la même personne, écrite autrement (casse, accents, espaces) — un doublon à l'œil nu. */
function copieNormalisee(contact, tirage, numero) {
    return {
        ...contact,
        id: 'CTC-' + String(numero).padStart(6, '0'),
        prenom: tirage.chance(0.5) ? casseAleatoire(contact.prenom, tirage) : sansAccents(contact.prenom),
        nom: tirage.chance(0.6) ? contact.nom.toUpperCase() : espacesParasites(contact.nom, tirage),
        ville: casseAleatoire(contact.ville, tirage),
        courriel: contact.courriel.toUpperCase(),
        telephoneMobile: contact.telephoneMobile ? telephoneEcrit(contact.telephoneMobile.replace(/\D/g, ''), tirage) : ''
    };
}

/** Copie floue : faute de frappe sur le nom, prénom abrégé, adresse électronique voisine — un quasi-doublon. */
function copieFloue(contact, tirage, numero) {
    return {
        ...contact,
        id: 'CTC-' + String(numero).padStart(6, '0'),
        prenom: tirage.chance(0.4) ? contact.prenom[0] + '.' : fauteDeFrappe(contact.prenom, tirage),
        nom: fauteDeFrappe(contact.nom, tirage),
        courriel: courrielApproche(contact.courriel, tirage),
        telephoneFixe: telephoneEcrit(contact.telephoneFixe.replace(/\D/g, ''), tirage)
    };
}

/** La table des contacts : les contacts d'origine, puis les trois familles de doublons et quelques orphelins. */
export function genererContacts(tirage, clients, options, compteur) {
    const contacts = [];
    const clientsPonderes = clients.filter(client => client.type === 'PRO' || tirage.chance(0.35));
    while (contacts.length < options.contacts) {
        const client = tirage.choisir(clientsPonderes);
        contacts.push(construireContact(tirage, contacts.length + 1, client, options.dateReference));
    }
    const lignes = contacts.map(ligneContact);
    const ajouterCopies = (nombre, fabriquer, nomDuDefaut) => {
        for (const contact of tirage.melanger(contacts).slice(0, nombre)) {
            lignes.push(ligneContact(fabriquer(contact, tirage, contacts.length + lignes.length)));
            compteur.ajouter(nomDuDefaut);
        }
    };
    ajouterCopies(options.doublonsStricts, contact => contact, 'contacts.doublon_strict');
    ajouterCopies(options.doublonsNormalises, copieNormalisee, 'contacts.doublon_normalise');
    ajouterCopies(options.doublonsFlous, copieFloue, 'contacts.doublon_flou');
    // Contacts orphelins : rattachés à un client qui n'existe pas (reprise partielle d'un ancien outil).
    for (const contact of tirage.melanger(contacts).slice(0, Math.round(options.contacts * 0.015))) {
        lignes.push(
            ligneContact({
                ...contact,
                id: 'CTC-9' + String(lignes.length).padStart(5, '0'),
                idClient: 'CLI-99' + String(tirage.entier(100, 999))
            })
        );
        compteur.ajouter('contacts.client_inconnu');
    }
    return { contacts, fichier: { colonnes: COLONNES_CONTACTS, lignes: tirage.melanger(lignes) } };
}
