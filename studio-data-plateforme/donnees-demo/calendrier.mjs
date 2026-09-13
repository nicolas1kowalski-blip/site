/**
 * Dates du jeu de démonstration : tout est calculé en temps universel pour que la génération donne le même
 * résultat quel que soit le fuseau horaire de la machine. Trois écritures sont produites — AAAA-MM-JJ (la
 * référence), JJ/MM/AAAA (l'écriture française, semée volontairement dans quelques fichiers pour donner à voir
 * les mélanges de formats) et l'horodatage AAAA-MM-JJ HH:MM:SS des relevés.
 */

export const MILLISECONDES_PAR_JOUR = 86400000;

/** Date à minuit (temps universel) à partir d'un texte AAAA-MM-JJ. */
export function jourDe(texte) {
    return new Date(texte + 'T00:00:00Z');
}

export function ajouterJours(date, nombreDeJours) {
    return new Date(date.getTime() + nombreDeJours * MILLISECONDES_PAR_JOUR);
}

export function ajouterHeures(date, nombreDHeures) {
    return new Date(date.getTime() + nombreDHeures * 3600000);
}

export function joursEntre(debut, fin) {
    return Math.round((fin.getTime() - debut.getTime()) / MILLISECONDES_PAR_JOUR);
}

const deuxChiffres = nombre => String(nombre).padStart(2, '0');

/** AAAA-MM-JJ : l'écriture attendue partout dans l'application. */
export function formatIso(date) {
    return `${date.getUTCFullYear()}-${deuxChiffres(date.getUTCMonth() + 1)}-${deuxChiffres(date.getUTCDate())}`;
}

/** JJ/MM/AAAA : l'écriture française, celle des exports de logiciels de gestion. */
export function formatFrancais(date) {
    return `${deuxChiffres(date.getUTCDate())}/${deuxChiffres(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

/** AAAA-MM-JJ HH:MM:SS : l'horodatage des relevés de consommation. */
export function formatHorodatage(date) {
    const heure = `${deuxChiffres(date.getUTCHours())}:${deuxChiffres(date.getUTCMinutes())}:${deuxChiffres(date.getUTCSeconds())}`;
    return `${formatIso(date)} ${heure}`;
}

/** Samedi ou dimanche : l'activité commerciale et la consommation d'énergie y sont plus faibles. */
export function estWeekEnd(date) {
    const jourDeLaSemaine = date.getUTCDay();
    return jourDeLaSemaine === 0 || jourDeLaSemaine === 6;
}

/** Numéro du mois (1 à 12), utilisé par les coefficients de saison. */
export function moisDe(date) {
    return date.getUTCMonth() + 1;
}
