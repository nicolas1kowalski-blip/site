/**
 * Filtre « dans le fichier » — repris de la V12.3 de l'application classique.
 *
 * « Donne-moi telles données pour cette liste » : on dépose un fichier (Excel, CSV, texte) ou on colle une
 * liste, on indique à quelle colonne — ou à quelles colonnes — elle correspond, et l'extraction ne garde (ou
 * exclut) que les lignes qui s'y trouvent.
 *
 * Le fichier ne devient pas une source : ses valeurs voyagent avec la spécification et sont posées dans une
 * table éphémère de la requête (une CTE VALUES). On peut aussi rapatrier ses autres colonnes dans le résultat
 * — un commentaire, une référence interne — et conserver son ordre.
 *
 * Trois façons de comparer, comme dans le classique :
 *   • tolérante  : majuscules / minuscules et espaces ignorés (le défaut, qui règle la plupart des cas) ;
 *   • exacte     : la valeur telle quelle, espaces de bord retirés ;
 *   • normalisée : accents, ponctuation, espaces et zéros de tête ignorés — pour des codes saisis à la main.
 *
 * Fonctions pures : elles produisent des morceaux de SQL à partir des valeurs reçues.
 */
import { identifiantSql, litteralSql } from '../espaces/moteur-duckdb';

export const COMPARAISONS_FICHIER = {
    tolerante: 'majuscules / minuscules et espaces ignorés',
    exacte: 'valeur exacte',
    normalisee: 'normalisé : accents, ponctuation, espaces et zéros de tête ignorés'
} as const;
export type ComparaisonFichier = keyof typeof COMPARAISONS_FICHIER;

export const MODES_FICHIER = { garder: 'garder ces lignes', exclure: 'exclure ces lignes' } as const;
export type ModeFichier = keyof typeof MODES_FICHIER;

/** Une colonne du fichier rattachée à une colonne d'une table de l'extraction. */
export type Correspondance = { colonneFichier: string; tableId: string; route: string; nomColonne: string };

/** Un filtre par fichier, tel qu'il voyage dans la spécification. */
export type FiltreFichier = {
    nom: string;
    colonnes: string[];
    lignes: string[][];
    correspondances: Correspondance[];
    mode: ModeFichier;
    comparaison: ComparaisonFichier;
    joindreColonnes: boolean;
    conserverOrdre: boolean;
};

/** Au-delà, la requête devient déraisonnable : mieux vaut charger le fichier comme source. */
export const LIGNES_FICHIER_MAXIMUM = 50_000;

/** Expression de comparaison d'une valeur, selon la tolérance demandée. */
export function expressionComparee(expression: string, comparaison: ComparaisonFichier): string {
    const texte = `CAST(${expression} AS VARCHAR)`;
    if (comparaison === 'exacte') return `TRIM(${texte})`;
    if (comparaison === 'normalisee')
        return `regexp_replace(regexp_replace(strip_accents(UPPER(${texte})), '[^A-Z0-9]', '', 'g'), '^0+(?=.)', '')`;
    return `UPPER(TRIM(${texte}))`;
}

/** Nom SQL d'une colonne du fichier dans la CTE : on numérote, les en-têtes pouvant être n'importe quoi. */
export function colonneDeLaCte(index: number): string {
    return `valeur${index}`;
}

/**
 * La CTE qui porte le contenu du fichier : une colonne par en-tête, plus un rang qui conserve l'ordre d'origine.
 * Un fichier vide produit une table vide mais valide, pour que la requête reste exécutable.
 */
export function cteDuFichier(nomCte: string, fichier: FiltreFichier): string {
    const colonnes = [...fichier.colonnes.map((_, index) => colonneDeLaCte(index)), 'rang'];
    const lignes = fichier.lignes.slice(0, LIGNES_FICHIER_MAXIMUM);
    if (!lignes.length) {
        const vides = fichier.colonnes.map(() => `NULL`).join(', ');
        return `${nomCte}(${colonnes.join(', ')}) AS (SELECT ${vides}${vides ? ', ' : ''}0 WHERE FALSE)`;
    }
    const valeurs = lignes
        .map((ligne, rang) => {
            const cellules = fichier.colonnes.map((_, index) => litteralSql(String(ligne[index] ?? '')));
            return `(${[...cellules, rang + 1].join(', ')})`;
        })
        .join(', ');
    return `${nomCte}(${colonnes.join(', ')}) AS (VALUES ${valeurs})`;
}

/**
 * La condition qui relie une ligne de l'extraction à une ligne du fichier : toutes les correspondances doivent
 * coïncider. `expressionDe` rend l'expression SQL de la colonne visée par une correspondance.
 */
export function conditionDAppariement(
    nomCte: string,
    fichier: FiltreFichier,
    expressionDe: (correspondance: Correspondance) => string
): string {
    const conditions = fichier.correspondances.map(correspondance => {
        const index = fichier.colonnes.indexOf(correspondance.colonneFichier);
        const cote = `${nomCte}.${colonneDeLaCte(index < 0 ? 0 : index)}`;
        return `${expressionComparee(expressionDe(correspondance), fichier.comparaison)} = ${expressionComparee(cote, fichier.comparaison)}`;
    });
    if (!conditions.length) return 'TRUE';
    return conditions.join(' AND ');
}

/**
 * Le filtre proprement dit, quand on ne fait que garder ou exclure : une sous-requête d'existence, qui ne
 * multiplie jamais les lignes même si le fichier contient plusieurs fois la même valeur.
 */
export function conditionDExistence(
    nomCte: string,
    fichier: FiltreFichier,
    expressionDe: (correspondance: Correspondance) => string
): string {
    const appariement = conditionDAppariement(nomCte, fichier, expressionDe);
    const existe = `EXISTS (SELECT 1 FROM ${nomCte} WHERE ${appariement})`;
    return fichier.mode === 'exclure' ? `NOT ${existe}` : existe;
}

/**
 * Les colonnes du fichier à ramener dans le résultat : les colonnes de correspondance toujours (on veut voir
 * sur quelle valeur la ligne a été retenue), les autres seulement si on a demandé à les joindre.
 */
export function colonnesRamenees(nomCte: string, fichier: FiltreFichier): { expression: string; alias: string }[] {
    const cles = new Set(fichier.correspondances.map(correspondance => correspondance.colonneFichier));
    return fichier.colonnes
        .map((entete, index) => ({ entete, index }))
        .filter(colonne => cles.has(colonne.entete) || fichier.joindreColonnes)
        .map(colonne => ({
            expression: `${nomCte}.${colonneDeLaCte(colonne.index)}`,
            alias: `${fichier.nom || 'fichier'}.${colonne.entete}`
        }));
}

/** Vrai quand le fichier doit être joint (et non seulement consulté) : pour ramener ses colonnes ou son ordre. */
export function demandeUneJointure(fichier: FiltreFichier): boolean {
    return fichier.mode === 'garder' && (fichier.joindreColonnes || fichier.conserverOrdre);
}

/**
 * Les valeurs du fichier absentes de la table visée par la première correspondance. C'est la question que
 * l'on se pose vraiment en déposant une liste : « sur mes 400 SIREN, combien sont inconnus ici ? ».
 * `avecLimite` à faux compte toutes les valeurs absentes ; à vrai, il en donne les premières.
 */
export function sqlValeursAbsentes(nomCte: string, fichier: FiltreFichier, nomTable: string, exemples: number): string {
    const premiere = fichier.correspondances[0];
    if (!premiere) return `SELECT NULL AS valeur WHERE FALSE`;
    const index = Math.max(0, fichier.colonnes.indexOf(premiere.colonneFichier));
    const cote = `${nomCte}.${colonneDeLaCte(index)}`;
    const dansLaTable = `SELECT 1 FROM ${identifiantSql(nomTable)} source WHERE ${expressionComparee(`source.${identifiantSql(premiere.nomColonne)}`, fichier.comparaison)} = ${expressionComparee(cote, fichier.comparaison)}`;
    const absentes =
        `WITH ${cteDuFichier(nomCte, fichier)}\n` +
        `SELECT DISTINCT ${cote} AS valeur, MIN(${nomCte}.rang) AS rang FROM ${nomCte}\n` +
        `WHERE NOT EXISTS (${dansLaTable}) GROUP BY 1`;
    if (!exemples) return `SELECT COUNT(*)::BIGINT FROM (${absentes}) AS absentes`;
    return `SELECT valeur FROM (${absentes}) AS absentes ORDER BY rang LIMIT ${exemples}`;
}

/** Nom de la CTE d'un filtre fichier : numéroté, pour que plusieurs fichiers cohabitent. */
export function nomDeLaCte(index: number): string {
    return `fichier${index}`;
}

/** Identifiant SQL sûr pour l'alias d'une colonne ramenée du fichier. */
export function aliasSur(alias: string): string {
    return identifiantSql(alias);
}
