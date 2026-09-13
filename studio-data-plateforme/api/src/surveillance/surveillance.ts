/**
 * Surveillance des sources (amont) : quatre outils autour d'une source rafraîchie depuis une application.
 *   1. Moniteur : instantanés (volumétrie et schéma) et dérive entre les deux derniers ;
 *   2. Contrat de données : schéma attendu (colonnes, types simples, obligatoires) et vérification ;
 *   3. Suivi des changements : lignes ajoutées, supprimées, modifiées par rapport à des données figées ;
 *   4. Réconciliation amont / aval : volumétrie et clés orphelines entre deux sources.
 * Modèle : governance.srcWatch[nomTable] = { snaps: [{ ts, rows, schema }], contract, dataSnap }. Fonctions pures.
 */
import { identifiantSql } from '../espaces/moteur-duckdb';

export type ColonneSchema = { name: string; type: string };
export type Instantane = { ts: number; rows: number; schema: ColonneSchema[] };
export type Contrat = { cols: (ColonneSchema & { required: boolean })[]; at: number };
export type SurveillanceSource = { snaps: Instantane[]; contract: Contrat | null; dataSnap?: { ts: number; rows: number } | null };

/** Type simple lisible à partir d'un type DuckDB. */
export function typeSimple(typeDuckDB: string): string {
    const texte = String(typeDuckDB || '').toUpperCase();
    if (/INT|DECIMAL|DOUBLE|FLOAT|HUGE|NUMERIC|REAL/.test(texte)) return 'nombre';
    if (/DATE|TIME/.test(texte)) return 'date';
    if (/BOOL/.test(texte)) return 'booléen';
    return 'texte';
}

export type Derive = {
    added: string[];
    removed: string[];
    retyped: string[];
    rowsDelta: number;
    rowsPct: number | null;
    from: number;
    to: number;
    schemaChanged: boolean;
};

/** Dérive entre les deux derniers instantanés ; null s'il en manque. */
export function derive(instantanes: Instantane[]): Derive | null {
    if (instantanes.length < 2) return null;
    const avant = instantanes[instantanes.length - 2];
    const apres = instantanes[instantanes.length - 1];
    const typesAvant = new Map(avant.schema.map(colonne => [colonne.name, colonne.type]));
    const typesApres = new Map(apres.schema.map(colonne => [colonne.name, colonne.type]));
    const added = apres.schema.filter(colonne => !typesAvant.has(colonne.name)).map(colonne => colonne.name);
    const removed = avant.schema.filter(colonne => !typesApres.has(colonne.name)).map(colonne => colonne.name);
    const retyped = apres.schema
        .filter(colonne => typesAvant.has(colonne.name) && typesAvant.get(colonne.name) !== colonne.type)
        .map(colonne => `${colonne.name} (${typesAvant.get(colonne.name)}→${colonne.type})`);
    const rowsDelta = apres.rows - avant.rows;
    return {
        added,
        removed,
        retyped,
        rowsDelta,
        rowsPct: avant.rows ? (rowsDelta / avant.rows) * 100 : null,
        from: avant.ts,
        to: apres.ts,
        schemaChanged: added.length + removed.length + retyped.length > 0
    };
}

export type VerificationContrat = {
    missing: string[];
    extra: string[];
    retyped: string[];
    emptyRequired: { col: string; vides: number }[];
    conforme: boolean;
};

/** Écarts de structure entre le contrat et le schéma réel (les colonnes obligatoires vides sont comptées à part). */
export function comparerContrat(contrat: Contrat, schemaReel: ColonneSchema[]): Omit<VerificationContrat, 'emptyRequired' | 'conforme'> {
    const reel = new Map(schemaReel.map(colonne => [colonne.name, colonne.type]));
    const declare = new Map(contrat.cols.map(colonne => [colonne.name, colonne]));
    return {
        missing: contrat.cols.filter(colonne => !reel.has(colonne.name)).map(colonne => colonne.name),
        extra: schemaReel.filter(colonne => !declare.has(colonne.name)).map(colonne => colonne.name),
        retyped: contrat.cols
            .filter(colonne => reel.has(colonne.name) && reel.get(colonne.name) !== colonne.type)
            .map(colonne => `${colonne.name} (attendu ${colonne.type}, reçu ${reel.get(colonne.name)})`)
    };
}

/** Nombre de valeurs vides d'une colonne obligatoire. */
export function sqlVidesColonne(nomTable: string, colonne: string): string {
    return `SELECT COUNT(*)::BIGINT FROM ${identifiantSql(nomTable)} WHERE ${identifiantSql(colonne)} IS NULL OR TRIM(CAST(${identifiantSql(colonne)} AS VARCHAR)) = ''`;
}

const cleNormalisee = (alias: string, colonne: string) => `NULLIF(UPPER(TRIM(CAST(${alias}.${identifiantSql(colonne)} AS VARCHAR))), '')`;

/** Suivi des changements : lignes ajoutées, supprimées, modifiées, identiques entre la table courante et les données figées. */
export function sqlDelta(nomTableCourante: string, nomTableFigee: string, cle: string, colonnesCommunes: string[]): string {
    const empreinte = (alias: string) =>
        colonnesCommunes.length
            ? `md5(concat_ws(chr(1), ${colonnesCommunes.map(colonne => `COALESCE(CAST(${alias}.${identifiantSql(colonne)} AS VARCHAR), chr(0))`).join(', ')}))`
            : `''`;
    return (
        `WITH c AS (SELECT ${cleNormalisee('x', cle)} AS k, ${empreinte('x')} AS h FROM ${identifiantSql(nomTableCourante)} x), ` +
        `s AS (SELECT ${cleNormalisee('y', cle)} AS k, ${empreinte('y')} AS h FROM ${identifiantSql(nomTableFigee)} y) ` +
        `SELECT SUM(CASE WHEN s.k IS NULL THEN 1 ELSE 0 END)::BIGINT AS added, SUM(CASE WHEN c.k IS NULL THEN 1 ELSE 0 END)::BIGINT AS removed, ` +
        `SUM(CASE WHEN c.k IS NOT NULL AND s.k IS NOT NULL AND c.h <> s.h THEN 1 ELSE 0 END)::BIGINT AS changed, ` +
        `SUM(CASE WHEN c.k IS NOT NULL AND s.k IS NOT NULL AND c.h = s.h THEN 1 ELSE 0 END)::BIGINT AS same FROM c FULL OUTER JOIN s ON c.k = s.k`
    );
}

/** Réconciliation amont / aval : volumétrie des deux tables, clés seulement dans A, seulement dans B, communes. */
export function sqlReconciliationSources(nomTableA: string, cleA: string, nomTableB: string, cleB: string): string {
    const cleNormaliseeSansAlias = (colonne: string) => `NULLIF(UPPER(TRIM(CAST(${identifiantSql(colonne)} AS VARCHAR))), '')`;
    return (
        `WITH a AS (SELECT DISTINCT ${cleNormaliseeSansAlias(cleA)} AS k FROM ${identifiantSql(nomTableA)} WHERE ${cleNormaliseeSansAlias(cleA)} IS NOT NULL), ` +
        `b AS (SELECT DISTINCT ${cleNormaliseeSansAlias(cleB)} AS k FROM ${identifiantSql(nomTableB)} WHERE ${cleNormaliseeSansAlias(cleB)} IS NOT NULL) ` +
        `SELECT (SELECT COUNT(*) FROM ${identifiantSql(nomTableA)})::BIGINT AS ta, (SELECT COUNT(*) FROM ${identifiantSql(nomTableB)})::BIGINT AS tb, ` +
        `SUM(CASE WHEN b.k IS NULL THEN 1 ELSE 0 END)::BIGINT AS onlyA, SUM(CASE WHEN a.k IS NULL THEN 1 ELSE 0 END)::BIGINT AS onlyB, ` +
        `SUM(CASE WHEN a.k IS NOT NULL AND b.k IS NOT NULL THEN 1 ELSE 0 END)::BIGINT AS common FROM a FULL OUTER JOIN b ON a.k = b.k`
    );
}
