/**
 * Profilage d'une source : pour chaque colonne, des mesures calculées par DuckDB en une requête par colonne.
 * Fonctions pures de construction SQL (testables) et lecture des résultats.
 *
 * Mesures par colonne :
 *   • complétude : part des valeurs non vides (NULL ou chaîne vide après suppression des espaces) ;
 *   • valeurs distinctes ;
 *   • longueurs minimale et maximale ;
 *   • espaces parasites (valeurs qui changent quand on retire les espaces autour) ;
 *   • part de valeurs numériques et de dates reconnues ;
 *   • motif majoritaire : chaque chiffre devient « 9 », chaque lettre « A » (ex. « 75001 » → « 99999 »),
 *     avec sa fréquence et le nombre de motifs distincts ;
 *   • les cinq valeurs les plus fréquentes ;
 *   • hygiène (reprise de l'application classique) : espaces multiples, valeurs bouche-trous (N/A, -, ?…), casses
 *     incohérentes (même valeur écrite avec des casses différentes), valeurs aberrantes (nombres hors moyenne
 *     ± 3 écarts-types, avec la moyenne et l'écart-type mesurés).
 */
import { identifiantSql } from '../espaces/moteur-duckdb';
import { conditionBoucheTrous } from './anomalies';

export type ProfilColonne = {
    colonne: string;
    total: number;
    vides: number;
    completude: number;
    distinctes: number;
    longueurMin: number | null;
    longueurMax: number | null;
    espacesParasites: number;
    partNumerique: number;
    partDate: number;
    motifMajoritaire: string | null;
    partMotifMajoritaire: number;
    motifsDistincts: number;
    valeursFrequentes: { valeur: string | null; nombre: number }[];
    espacesMultiples?: number;
    boucheTrous?: number;
    cassesIncoherentes?: number;
    aberrantes?: number;
    moyenne?: number | null;
    ecartType?: number | null;
};

export type ProfilSource = {
    sourceId: string;
    sourceNom: string;
    lignes: number;
    colonnes: ProfilColonne[];
    completudeMoyenne: number;
    doublonsExacts: number;
    lignesVides?: number;
    /** Filtres d'audit appliqués (périmètre), vide si toute la source. */
    filtres?: { col: string; op: string; val: string }[];
};

/** Expression SQL du motif d'une valeur (chiffres → 9, lettres → A), limité à 40 caractères pour rester lisible. */
export function expressionMotif(expression: string): string {
    return `left(regexp_replace(regexp_replace(${expression}, '[0-9]', '9', 'g'), '[A-Za-zÀ-ÿ]', 'A', 'g'), 40)`;
}

/** Requête des mesures principales d'une colonne (une ligne de résultat). */
export function sqlMesuresColonne(nomTable: string, colonne: string): string {
    const valeur = `CAST(${identifiantSql(colonne)} AS VARCHAR)`;
    const nonVide = `(${valeur} IS NOT NULL AND TRIM(${valeur}) <> '')`;
    return `SELECT
        COUNT(*)::BIGINT AS total,
        COUNT(*) FILTER (WHERE NOT ${nonVide})::BIGINT AS vides,
        COUNT(DISTINCT ${valeur}) FILTER (WHERE ${nonVide})::BIGINT AS distinctes,
        MIN(length(${valeur})) FILTER (WHERE ${nonVide}) AS longueur_min,
        MAX(length(${valeur})) FILTER (WHERE ${nonVide}) AS longueur_max,
        COUNT(*) FILTER (WHERE ${nonVide} AND TRIM(${valeur}) <> ${valeur})::BIGINT AS espaces_parasites,
        COUNT(*) FILTER (WHERE ${nonVide} AND TRY_CAST(REPLACE(${valeur}, ',', '.') AS DOUBLE) IS NOT NULL)::BIGINT AS numeriques,
        COUNT(*) FILTER (WHERE ${nonVide} AND TRY_CAST(${valeur} AS DATE) IS NOT NULL)::BIGINT AS dates
    FROM ${identifiantSql(nomTable)}`;
}

/** Requête d'hygiène d'une colonne : espaces multiples, bouche-trous, casses incohérentes, aberrantes (moyenne, écart-type). */
export function sqlHygieneColonne(nomTable: string, colonne: string): string {
    const table = identifiantSql(nomTable);
    const valeur = `TRIM(CAST(${identifiantSql(colonne)} AS VARCHAR))`;
    const nonVide = `(${identifiantSql(colonne)} IS NOT NULL AND ${valeur} <> '')`;
    const nombre = `TRY_CAST(REPLACE(${valeur}, ',', '.') AS DOUBLE)`;
    return `WITH statistiques AS (SELECT AVG(${nombre}) AS moyenne, STDDEV_POP(${nombre}) AS ecart_type FROM ${table} WHERE ${nombre} IS NOT NULL)
    SELECT
        COUNT(*) FILTER (WHERE ${nonVide} AND regexp_matches(${valeur}, '  +'))::BIGINT AS espaces_multiples,
        COUNT(*) FILTER (WHERE ${conditionBoucheTrous(colonne)})::BIGINT AS bouche_trous,
        COUNT(*) FILTER (WHERE ${nonVide} AND UPPER(${valeur}) IN (SELECT UPPER(${valeur}) FROM ${table} WHERE ${nonVide} GROUP BY 1 HAVING COUNT(DISTINCT ${valeur}) > 1))::BIGINT AS casses_incoherentes,
        COUNT(*) FILTER (WHERE ${nombre} IS NOT NULL AND statistiques.ecart_type > 0 AND ABS(${nombre} - statistiques.moyenne) > 3 * statistiques.ecart_type)::BIGINT AS aberrantes,
        MAX(statistiques.moyenne) AS moyenne,
        MAX(statistiques.ecart_type) AS ecart_type
    FROM ${table}, statistiques`;
}

/** Nombre de lignes dont toutes les colonnes sont vides. */
export function sqlLignesVides(nomTable: string, colonnes: string[]): string {
    const conditions = colonnes.map(
        colonne => `(${identifiantSql(colonne)} IS NULL OR TRIM(CAST(${identifiantSql(colonne)} AS VARCHAR)) = '')`
    );
    return `SELECT COUNT(*)::BIGINT FROM ${identifiantSql(nomTable)} WHERE ${conditions.join(' AND ') || 'FALSE'}`;
}

/** Requête des motifs : le motif majoritaire, sa fréquence et le nombre de motifs distincts. */
export function sqlMotifs(nomTable: string, colonne: string): string {
    const valeur = `TRIM(CAST(${identifiantSql(colonne)} AS VARCHAR))`;
    return `WITH motifs AS (
        SELECT ${expressionMotif(valeur)} AS motif, COUNT(*)::BIGINT AS nombre
        FROM ${identifiantSql(nomTable)} WHERE ${valeur} IS NOT NULL AND ${valeur} <> ''
        GROUP BY 1
    )
    SELECT (SELECT motif FROM motifs ORDER BY nombre DESC, motif LIMIT 1) AS motif,
           (SELECT nombre FROM motifs ORDER BY nombre DESC, motif LIMIT 1) AS nombre,
           (SELECT COUNT(*)::BIGINT FROM motifs) AS distincts`;
}

/** Requête des valeurs les plus fréquentes. */
export function sqlValeursFrequentes(nomTable: string, colonne: string, limite = 5): string {
    const valeur = `CAST(${identifiantSql(colonne)} AS VARCHAR)`;
    return `SELECT ${valeur} AS valeur, COUNT(*)::BIGINT AS nombre FROM ${identifiantSql(nomTable)}
        WHERE ${valeur} IS NOT NULL AND TRIM(${valeur}) <> ''
        GROUP BY 1 ORDER BY nombre DESC, valeur LIMIT ${limite}`;
}

/** Nombre de lignes strictement identiques en trop (toutes colonnes sauf __rn) : 0 s'il n'y a aucun doublon exact. */
export function sqlDoublonsExacts(nomTable: string, colonnes: string[]): string {
    const liste = colonnes.map(identifiantSql).join(', ');
    return `SELECT COALESCE(SUM(nombre - 1), 0)::BIGINT FROM (SELECT COUNT(*) AS nombre FROM ${identifiantSql(nomTable)} GROUP BY ${liste} HAVING COUNT(*) > 1) AS groupes`;
}

/** Doublons sur une clé : nombre de groupes, lignes concernées, et les groupes les plus fréquents. */
export function sqlDoublonsParCle(nomTable: string, cle: string[], limiteExemples = 20): { synthese: string; exemples: string } {
    const expressions = cle.map(colonne => `NULLIF(UPPER(TRIM(CAST(${identifiantSql(colonne)} AS VARCHAR))), '')`);
    const groupes = `SELECT ${expressions.map((expression, index) => `${expression} AS cle_${index}`).join(', ')}, COUNT(*)::BIGINT AS nombre
        FROM ${identifiantSql(nomTable)} WHERE ${expressions.map(expression => `${expression} IS NOT NULL`).join(' AND ')}
        GROUP BY ${expressions.map((_, index) => index + 1).join(', ')} HAVING COUNT(*) > 1`;
    return {
        synthese: `SELECT COUNT(*)::BIGINT AS groupes, COALESCE(SUM(nombre), 0)::BIGINT AS lignes FROM (${groupes}) AS g`,
        exemples: `SELECT * FROM (${groupes}) AS g ORDER BY nombre DESC LIMIT ${limiteExemples}`
    };
}

export function nombre(valeur: unknown): number {
    return valeur === null || valeur === undefined ? 0 : Number(valeur);
}
