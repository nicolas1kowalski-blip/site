/**
 * Défauts semés volontairement dans le jeu de démonstration. Ce sont eux qui donnent de la matière aux écrans
 * Qualité (profilage, anomalies, doublons approchés, règles) et à la Préparation : sans valeurs sales, un
 * profilage n'a rien à montrer. Chaque fonction abîme une valeur d'une façon précise et documentée ; c'est le
 * générateur qui décide de la proportion de lignes concernées, et le compteur qui tient les comptes.
 */

/** Valeurs qui font semblant de renseigner une colonne : le profilage les repère comme « bouche-trous ». */
export const BOUCHE_TROUS = ['N/A', '-', '?', 'NC', 'XXX', 'néant', 'inconnu'];

/** MAJUSCULES, minuscules ou Première Lettre En Capitale : la casse incohérente d'un même libellé. */
export function casseAleatoire(texte, tirage) {
    const forme = tirage.entier(1, 3);
    if (forme === 1) return texte.toUpperCase();
    if (forme === 2) return texte.toLowerCase();
    return texte.replace(/\b\p{L}/gu, lettre => lettre.toUpperCase());
}

/** Espace avant, espace après, ou double espace au milieu : invisible à l'œil, décisif pour un rapprochement. */
export function espacesParasites(texte, tirage) {
    const forme = tirage.entier(1, 3);
    if (forme === 1) return ' ' + texte;
    if (forme === 2) return texte + '  ';
    return texte.replace(' ', '  ');
}

/** « Génévrier » écrit « Genevrier » : l'accent perdu à l'import, classique des reprises de données. */
export function sansAccents(texte) {
    return texte.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Faute de frappe : deux lettres inversées, une lettre doublée ou une lettre manquante. */
export function fauteDeFrappe(texte, tirage) {
    if (texte.length < 4) return texte;
    const position = tirage.entier(1, texte.length - 2);
    const forme = tirage.entier(1, 3);
    if (forme === 1) return texte.slice(0, position) + texte[position + 1] + texte[position] + texte.slice(position + 2);
    if (forme === 2) return texte.slice(0, position) + texte[position] + texte.slice(position);
    return texte.slice(0, position) + texte.slice(position + 1);
}

/** Adresse électronique presque juste : extension changée, point oublié, domaine mal orthographié. */
export function courrielApproche(courriel, tirage) {
    const forme = tirage.entier(1, 3);
    if (forme === 1) return courriel.replace(/\.fr$/, '.com');
    if (forme === 2) return courriel.replace('.', '');
    return courriel.replace('@', tirage.chance(0.5) ? '@mail.' : '@');
}

/** Adresse électronique franchement fausse : arobase manquante, espace, domaine sans point. */
export function courrielInvalide(courriel, tirage) {
    const forme = tirage.entier(1, 3);
    if (forme === 1) return courriel.replace('@', ' at ');
    if (forme === 2) return courriel.split('@')[0];
    return courriel.replace(/\.[a-z]+$/, '');
}

/** Les quatre écritures d'un numéro de téléphone français que l'on trouve dans une même base. */
export function telephoneEcrit(chiffres, tirage) {
    const paires = chiffres.match(/.{2}/g) || [chiffres];
    const forme = tirage.entier(1, 4);
    if (forme === 1) return paires.join(' ');
    if (forme === 2) return paires.join('.');
    if (forme === 3) return chiffres;
    return '+33' + chiffres.slice(1);
}

/** Une date écrite tantôt AAAA-MM-JJ, tantôt JJ/MM/AAAA : le mélange que révèle l'analyse des formats. */
export function dateEcrite(date, tirage, partFrancaise, formatIso, formatFrancais) {
    return tirage.chance(partFrancaise) ? formatFrancais(date) : formatIso(date);
}

/** Compteur des défauts semés : le manifeste et la documentation publient ces totaux, les tests les vérifient. */
export function creerCompteur() {
    const totaux = {};
    return {
        ajouter(nom, nombre = 1) {
            totaux[nom] = (totaux[nom] || 0) + nombre;
        },
        totaux: () => ({ ...totaux })
    };
}
