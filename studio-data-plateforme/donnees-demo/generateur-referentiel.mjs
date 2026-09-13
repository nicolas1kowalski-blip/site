/**
 * Référentiels du jeu de démonstration : communes (géographie), agences, commerciaux (avec leur hiérarchie sur
 * trois niveaux, de quoi montrer l'aplatissement des hiérarchies dans l'extraction) et catalogue de produits.
 * Ces quatre tables sont propres à dessein, sauf le catalogue où quelques références mal formées permettent de
 * montrer le contrôle de format.
 */
import { ajouterJours, formatIso } from './calendrier.mjs';
import {
    AGENCES,
    COMMUNES,
    FAMILLES_PRODUITS,
    NOMS_DE_FAMILLE,
    PRENOMS_FEMININS,
    PRENOMS_MASCULINS,
    communeNommee
} from './referentiels.mjs';
import { sansAccents } from './deformations.mjs';

const COLONNES_COMMUNES = [
    'code_insee',
    'commune',
    'code_postal',
    'departement',
    'nom_departement',
    'region',
    'latitude',
    'longitude',
    'population'
];

/** Le référentiel géographique, tel quel : il sert de table de contrôle (couverture, listes de valeurs, jointures). */
export function genererCommunes() {
    const lignes = COMMUNES.map(commune => [
        commune.codeInsee,
        commune.nom,
        commune.codePostal,
        commune.departement,
        commune.nomDepartement,
        commune.region,
        commune.latitude,
        commune.longitude,
        commune.population
    ]);
    return { colonnes: COLONNES_COMMUNES, lignes };
}

/** Identité fictive : prénom, nom et adresse électronique professionnelle qui en découle. */
export function identiteFictive(tirage, domaine) {
    const feminin = tirage.chance(0.5);
    const prenom = tirage.choisir(feminin ? PRENOMS_FEMININS : PRENOMS_MASCULINS);
    const nom = tirage.choisir(NOMS_DE_FAMILLE);
    const partieLocale = sansAccents(`${prenom}.${nom}`)
        .toLowerCase()
        .replace(/[^a-z.]/g, '');
    return { civilite: feminin ? 'Mme' : 'M.', prenom, nom, courriel: `${partieLocale}@${domaine}` };
}

/** Les douze agences du réseau, chacune posée sur une commune réelle. */
export function genererAgences(tirage) {
    const agences = AGENCES.map(agence => {
        const commune = communeNommee(agence.commune);
        const directeur = identiteFictive(tirage, 'studio-demo.fr');
        return { ...agence, commune, directeur: `${directeur.prenom} ${directeur.nom}` };
    });
    const colonnes = ['id_agence', 'libelle', 'ville', 'code_postal', 'region', 'latitude', 'longitude', 'directeur'];
    const lignes = agences.map(agence => [
        agence.id,
        agence.libelle,
        agence.commune.nom,
        agence.commune.codePostal,
        agence.commune.region,
        agence.commune.latitude,
        agence.commune.longitude,
        agence.directeur
    ]);
    return { agences, fichier: { colonnes, lignes } };
}

const COLONNES_COMMERCIAUX = ['id_commercial', 'nom', 'prenom', 'email', 'id_agence', 'id_responsable', 'role', 'date_entree', 'actif'];

/** Les commerciaux : un directeur national, un directeur par agence, puis les conseillers rattachés à leur agence. */
export function genererCommerciaux(tirage, agences, nombre, dateReference) {
    const commerciaux = [];
    const ajouter = (identite, agence, responsable, role) => {
        const numero = commerciaux.length + 1;
        commerciaux.push({
            id: 'COM-' + String(numero).padStart(4, '0'),
            ...identite,
            idAgence: agence ? agence.id : '',
            idResponsable: responsable,
            role,
            dateEntree: formatIso(ajouterJours(dateReference, -tirage.entier(200, 5200))),
            actif: tirage.chance(0.93) ? 'oui' : 'non'
        });
        return commerciaux[commerciaux.length - 1];
    };
    const national = ajouter(identiteFictive(tirage, 'studio-demo.fr'), null, '', 'Directeur commercial');
    const directeurs = agences.map(agence => ajouter(identiteFictive(tirage, 'studio-demo.fr'), agence, national.id, 'Directeur d’agence'));
    while (commerciaux.length < nombre) {
        const directeur = directeurs[commerciaux.length % directeurs.length];
        const agence = agences.find(candidate => candidate.id === directeur.idAgence);
        ajouter(identiteFictive(tirage, 'studio-demo.fr'), agence, directeur.id, 'Conseiller commercial');
    }
    const lignes = commerciaux.map(personne => [
        personne.id,
        personne.nom,
        personne.prenom,
        personne.courriel,
        personne.idAgence,
        personne.idResponsable,
        personne.role,
        personne.dateEntree,
        personne.actif
    ]);
    return { commerciaux, fichier: { colonnes: COLONNES_COMMERCIAUX, lignes } };
}

const COLONNES_PRODUITS = [
    'id_produit',
    'reference',
    'libelle',
    'famille',
    'sous_famille',
    'unite',
    'prix_unitaire',
    'taux_tva',
    'actif',
    'date_lancement'
];
const QUALIFICATIFS_PRODUIT = ['standard', 'renforcé', 'compact', 'premium', 'recyclé', 'grand format', 'économique', 'professionnel'];
const UNITES = ['pièce', 'lot de 10', 'carton', 'palette', 'mètre'];

/** Le catalogue : référence codée FAM-0000, prix par famille, et quelques références volontairement mal formées. */
export function genererProduits(tirage, nombre, dateReference, compteur) {
    const produits = [];
    for (let numero = 1; numero <= nombre; numero++) {
        const famille = tirage.choisir(FAMILLES_PRODUITS);
        const sousFamille = tirage.choisir(famille.sousFamilles);
        const prix = Math.round(tirage.reel(famille.prixMinimum, famille.prixMaximum) * 100) / 100;
        const codeFamille = sansAccents(famille.famille).slice(0, 3).toUpperCase();
        let reference = `${codeFamille}-${String(numero).padStart(4, '0')}`;
        // 2 % de références mal formées : la règle de format les repère tout de suite.
        if (tirage.chance(0.02)) {
            reference = tirage.chance(0.5) ? reference.toLowerCase() : reference.replace('-', '');
            compteur.ajouter('produits.reference_mal_formee');
        }
        produits.push({
            id: 'PRD-' + String(numero).padStart(4, '0'),
            reference,
            libelle: `${sousFamille} ${tirage.choisir(QUALIFICATIFS_PRODUIT)}`,
            famille: famille.famille,
            sousFamille,
            unite: tirage.choisir(UNITES),
            prix: tirage.chance(0.01) ? 0 : prix,
            tauxTva: tirage.chance(0.15) ? 5.5 : 20,
            actif: tirage.chance(0.88) ? 'oui' : 'non',
            dateLancement: formatIso(ajouterJours(dateReference, -tirage.entier(60, 3600)))
        });
        if (produits[produits.length - 1].prix === 0) compteur.ajouter('produits.prix_nul');
    }
    const lignes = produits.map(produit => [
        produit.id,
        produit.reference,
        produit.libelle,
        produit.famille,
        produit.sousFamille,
        produit.unite,
        produit.prix,
        produit.tauxTva,
        produit.actif,
        produit.dateLancement
    ]);
    return { produits, fichier: { colonnes: COLONNES_PRODUITS, lignes } };
}
