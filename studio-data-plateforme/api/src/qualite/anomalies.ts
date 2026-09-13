/**
 * Inspecteur d'anomalies : à partir d'un profil de source, la liste des anomalies détectées, chacune avec la
 * requête qui renvoie LES LIGNES concernées (pour les voir à l'écran ou les exporter). Fonctions pures : la
 * requête est reconstruite à partir d'une clé d'anomalie et d'une colonne, jamais reçue du navigateur.
 */
import { identifiantSql } from '../espaces/moteur-duckdb';
import { ProfilColonne, ProfilSource } from './profilage';

export const GENRES_ANOMALIE = {
    lignesIdentiques: 'Lignes strictement identiques',
    lignesVides: 'Lignes entièrement vides',
    espacesParasites: 'Espaces en début ou en fin',
    espacesMultiples: 'Espaces multiples',
    boucheTrous: 'Valeurs bouche-trous (N/A, -, ?…)',
    casseIncoherente: 'Casse incohérente (même valeur, casses différentes)',
    aberrantes: 'Valeurs aberrantes (hors moyenne ± 3 écarts-types)',
    valeursVides: 'Valeurs vides'
} as const;
export type GenreAnomalie = keyof typeof GENRES_ANOMALIE;

export type Anomalie = { genre: GenreAnomalie; colonne: string; libelle: string; nombre: number };

const BOUCHE_TROUS = [
    'N/A',
    'NA',
    'NULL',
    '-',
    '--',
    '?',
    'X',
    'XX',
    'INCONNU',
    'NC',
    'TBD',
    'NONE',
    'AUCUN',
    'VIDE',
    '#N/A',
    'SANS',
    'A DEFINIR',
    'À DÉFINIR'
];

const brut = (colonne: string) => `CAST(${identifiantSql(colonne)} AS VARCHAR)`;
const sansEspaces = (colonne: string) => `TRIM(${brut(colonne)})`;
const renseignee = (colonne: string) => `(${identifiantSql(colonne)} IS NOT NULL AND ${sansEspaces(colonne)} <> '')`;

/** Condition SQL des valeurs bouche-trous d'une colonne (réutilisée par le profilage). */
export function conditionBoucheTrous(colonne: string): string {
    return `(${renseignee(colonne)} AND UPPER(${sansEspaces(colonne)}) IN (${BOUCHE_TROUS.map(valeur => `'${valeur}'`).join(', ')}))`;
}

/** Les anomalies d'un profil, avec leur nombre ; seules celles qui ont au moins une ligne sont listées. */
export function anomaliesDuProfil(profil: ProfilSource, colonnes: string[]): Anomalie[] {
    const anomalies: Anomalie[] = [];
    const ajouter = (genre: GenreAnomalie, colonne: string, nombre: number) => {
        if (nombre > 0) anomalies.push({ genre, colonne, libelle: GENRES_ANOMALIE[genre], nombre });
    };
    ajouter('lignesIdentiques', '(toute la ligne)', profil.doublonsExacts);
    ajouter('lignesVides', '(toute la ligne)', profil.lignesVides || 0);
    for (const colonne of profil.colonnes) {
        if (!colonnes.includes(colonne.colonne)) continue;
        ajouter('espacesParasites', colonne.colonne, colonne.espacesParasites);
        ajouter('espacesMultiples', colonne.colonne, colonne.espacesMultiples || 0);
        ajouter('boucheTrous', colonne.colonne, colonne.boucheTrous || 0);
        ajouter('casseIncoherente', colonne.colonne, colonne.cassesIncoherentes || 0);
        ajouter('aberrantes', colonne.colonne, colonne.aberrantes || 0);
        ajouter('valeursVides', colonne.colonne, colonne.vides);
    }
    return anomalies;
}

/**
 * Requête des lignes d'une anomalie. Pour les valeurs aberrantes, la moyenne et l'écart-type viennent du profil
 * (colonne) ; pour les lignes identiques, la clé est l'ensemble des colonnes.
 */
export function sqlLignesAnomalie(
    genre: GenreAnomalie,
    nomTable: string,
    colonnes: string[],
    colonne: string,
    profilColonne?: ProfilColonne
): string {
    const table = identifiantSql(nomTable);
    const selection = (condition: string) => `SELECT * EXCLUDE (__rn) FROM ${table} WHERE ${condition}`;
    switch (genre) {
        case 'lignesIdentiques': {
            const empreinte = `md5(concat_ws(chr(1), ${colonnes.map(nom => `COALESCE(${brut(nom)}, chr(0))`).join(', ')}))`;
            return `SELECT * EXCLUDE (__rn) FROM ${table} WHERE ${empreinte} IN (SELECT ${empreinte} FROM ${table} GROUP BY 1 HAVING COUNT(*) > 1) ORDER BY ${empreinte}`;
        }
        case 'lignesVides':
            return selection(colonnes.map(nom => `(${identifiantSql(nom)} IS NULL OR ${sansEspaces(nom)} = '')`).join(' AND '));
        case 'espacesParasites':
            return selection(
                `${identifiantSql(colonne)} IS NOT NULL AND ${brut(colonne)} <> '' AND ${brut(colonne)} <> ${sansEspaces(colonne)}`
            );
        case 'espacesMultiples':
            return selection(`${renseignee(colonne)} AND regexp_matches(${sansEspaces(colonne)}, '  +')`);
        case 'boucheTrous':
            return selection(conditionBoucheTrous(colonne));
        case 'casseIncoherente':
            return selection(
                `${renseignee(colonne)} AND UPPER(${sansEspaces(colonne)}) IN (SELECT UPPER(${sansEspaces(colonne)}) FROM ${table} WHERE ${renseignee(colonne)} GROUP BY 1 HAVING COUNT(DISTINCT ${sansEspaces(colonne)}) > 1)`
            );
        case 'aberrantes': {
            const moyenne = profilColonne?.moyenne ?? 0;
            const ecartType = profilColonne?.ecartType ?? 0;
            const nombre = `TRY_CAST(REPLACE(${sansEspaces(colonne)}, ',', '.') AS DOUBLE)`;
            return selection(
                `${nombre} IS NOT NULL AND (${nombre} < ${moyenne - 3 * ecartType} OR ${nombre} > ${moyenne + 3 * ecartType})`
            );
        }
        case 'valeursVides':
            return selection(`NOT ${renseignee(colonne)}`);
    }
}
