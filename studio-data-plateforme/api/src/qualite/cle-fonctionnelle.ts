/**
 * Clé fonctionnelle composite et doublons approchés (reprise de l'application classique).
 *
 * La clé fonctionnelle d'une table est composée de plusieurs composants : une colonne de la table auditée, ou une
 * colonne d'une table directement liée par le modèle de données (avec une condition facultative sur cette table).
 * Chaque composant a un mode d'appariement : « exact » (strict), « norm » (casse, accents et ponctuation ignorés),
 * « fuzzy » (ressemblance tolérée). Un profil de clé = un périmètre facultatif (conditions sur la table) + une
 * composition ; les profils sont rangés dans le dictionnaire de gouvernance (governance.dictionary[table].keyProfiles).
 *
 * L'analyse produit, par profil : les groupes de clés strictement identiques, les groupes de clés identiques une
 * fois normalisées mais écrites différemment, et les paires de clés ressemblantes (similarité de Jaro-Winkler).
 */
import { z } from 'zod';
import { identifiantSql, litteralSql } from '../espaces/moteur-duckdb';
import { FiltreSource, conditionFiltreSource } from '../tables-concues/constructeur-table-concue';

export const MODES_APPARIEMENT = {
    exact: 'strict',
    norm: 'normalisé (casse, accents, ponctuation ignorés)',
    fuzzy: 'ressemblance tolérée'
} as const;
export type ModeAppariement = keyof typeof MODES_APPARIEMENT;

const schemaComposant = z.object({
    /** Table du composant : la table auditée elle-même, ou une table liée. */
    table: z.string().min(1),
    col: z.string().min(1),
    /** Condition facultative sur la table liée (ex. type = 'GENERAL'). */
    whereCol: z.string().default(''),
    whereVal: z.string().default(''),
    match: z.enum(['exact', 'norm', 'fuzzy']).default('fuzzy')
});
export const schemaProfilCle = z.object({
    id: z.string().min(1),
    scope: z.array(z.object({ col: z.string(), op: z.string().default('eq'), val: z.string().default('') })).default([]),
    parts: z.array(schemaComposant).default([])
});
export type ComposantCle = z.infer<typeof schemaComposant>;
export type ProfilCle = z.infer<typeof schemaProfilCle>;

export type RelationCle = { tableLiee: string; colonneBase: string; colonneLiee: string };
export type ContexteCle = {
    /** Nom de la table DuckDB d'une source (par nom de source). */
    nomTableDe: (nomSource: string) => string | null;
    /** Relation directe du modèle entre la table auditée et une table liée, ou null. */
    relationVers: (nomTableLiee: string) => RelationCle | null;
};

/** Séparateur entre composants d'une clé concaténée (ASCII 31, « unit separator »), utilisé par chr(31) côté SQL. */
export const SEPARATEUR_COMPOSANTS = String.fromCharCode(31);

const cleNormalisee = (expression: string) => `NULLIF(UPPER(TRIM(CAST(${expression} AS VARCHAR))), '')`;
const exacte = (expression: string) => `COALESCE(TRIM(CAST(${expression} AS VARCHAR)), '')`;
const normalisee = (expression: string) =>
    `regexp_replace(strip_accents(UPPER(COALESCE(TRIM(CAST(${expression} AS VARCHAR)), ''))), '[^A-Z0-9]', '', 'g')`;

/**
 * Requête « source » d'un profil : une ligne par ligne auditée avec quatre clés : ke (exacte), kn (normalisée
 * selon le mode de chaque composant), kb (blocage : composants non flous, normalisés) et kf (composants flous).
 * En mode « lignes », toutes les colonnes de la table sont conservées, plus les composants venus des tables liées.
 */
export function sqlSourceCle(
    nomTableAuditee: string,
    nomSourceAuditee: string,
    profil: ProfilCle,
    contexte: ContexteCle,
    avecLignes: boolean
): string {
    const jointures: string[] = [];
    const expressions: string[] = [];
    const colonnesLiees: string[] = [];
    profil.parts.forEach((composant, index) => {
        if (composant.table === nomSourceAuditee) {
            expressions.push(`b.${identifiantSql(composant.col)}`);
            return;
        }
        const nomTableLiee = contexte.nomTableDe(composant.table);
        const relation = contexte.relationVers(composant.table);
        if (!nomTableLiee) throw new Error(`Table « ${composant.table} » non chargée.`);
        if (!relation)
            throw new Error(
                `Aucune relation du modèle de données entre « ${nomSourceAuditee} » et « ${composant.table} » : ce composant de clé ne peut pas être joint.`
            );
        const alias = 'f' + index;
        const condition = composant.whereCol
            ? ` AND UPPER(TRIM(CAST(x.${identifiantSql(composant.whereCol)} AS VARCHAR))) = ${litteralSql(composant.whereVal.toUpperCase())}`
            : '';
        jointures.push(
            `LEFT JOIN (SELECT * FROM ${identifiantSql(nomTableLiee)} x WHERE 1=1${condition} QUALIFY ROW_NUMBER() OVER (PARTITION BY ${cleNormalisee('x.' + identifiantSql(relation.colonneLiee))} ORDER BY x."__rn") = 1) ${alias}` +
                ` ON ${cleNormalisee(alias + '.' + identifiantSql(relation.colonneLiee))} = ${cleNormalisee('b.' + identifiantSql(relation.colonneBase))}`
        );
        expressions.push(`${alias}.${identifiantSql(composant.col)}`);
        colonnesLiees.push(`${alias}.${identifiantSql(composant.col)} AS ${identifiantSql(composant.col + ' · ' + composant.table)}`);
    });
    const perimetre = profil.scope
        .filter(condition => condition.col)
        .map(condition => conditionFiltreSource(condition as FiltreSource))
        .filter(Boolean);
    const where = perimetre.length ? ` WHERE ${perimetre.join(' AND ')}` : '';
    const modeDe = (index: number) => profil.parts[index].match || 'fuzzy';
    const clesExactes = expressions.map(exacte);
    const clesNormalisees = expressions.map((expression, index) =>
        modeDe(index) === 'exact' ? exacte(expression) : normalisee(expression)
    );
    const clesBlocage = expressions.filter((_, index) => modeDe(index) !== 'fuzzy').map(normalisee);
    const clesFloues = expressions.filter((_, index) => modeDe(index) === 'fuzzy').map(normalisee);
    const concat = (liste: string[]) => (liste.length ? `concat_ws(chr(31), ${liste.join(', ')})` : `''`);
    const colonnes = avecLignes ? `b.*${colonnesLiees.length ? ', ' + colonnesLiees.join(', ') : ''}, ` : '';
    return (
        `SELECT ${colonnes}${concat(clesExactes)} AS ke, ${concat(clesNormalisees)} AS kn, ${concat(clesBlocage)} AS kb, ${concat(clesFloues)} AS kf` +
        `\nFROM (SELECT * FROM ${identifiantSql(nomTableAuditee)}${where}) b\n${jointures.join('\n')}`
    );
}

const CLE_RENSEIGNEE = `TRIM(REPLACE(ke, chr(31), '')) <> ''`;

/** Les requêtes d'analyse d'un profil, toutes bâties sur la requête source (`WITH src AS (...)`). */
export function sqlAnalyseCle(sqlSource: string, seuilFlou: number, avecFlou: boolean) {
    /** Préfixe la requête par la CTE source ; `ctesSupplementaires` s'ajoutent après elle (« , d AS (...) »). */
    const avec = (requete: string, ctesSupplementaires = '') => `WITH src AS (${sqlSource})${ctesSupplementaires}\n${requete}`;
    return {
        total: avec(`SELECT COUNT(*)::BIGINT AS n FROM src`),
        exactes: avec(
            `SELECT COUNT(*)::BIGINT AS groupes, COALESCE(SUM(c), 0)::BIGINT AS lignes FROM (SELECT ke, COUNT(*) AS c FROM src WHERE ${CLE_RENSEIGNEE} GROUP BY 1 HAVING COUNT(*) > 1) d`
        ),
        exactesExemples: avec(
            `SELECT ke, COUNT(*)::BIGINT AS c FROM src WHERE ${CLE_RENSEIGNEE} GROUP BY 1 HAVING COUNT(*) > 1 ORDER BY c DESC LIMIT 10`
        ),
        prochesNombre: avec(
            `SELECT COUNT(*)::BIGINT AS n FROM (SELECT kn FROM src WHERE ${CLE_RENSEIGNEE} GROUP BY 1 HAVING COUNT(*) > 1 AND COUNT(DISTINCT ke) > 1) d`
        ),
        prochesExemples: avec(
            `SELECT kn, COUNT(*)::BIGINT AS c, list(DISTINCT ke) AS exemples FROM src WHERE ${CLE_RENSEIGNEE} GROUP BY 1 HAVING COUNT(*) > 1 AND COUNT(DISTINCT ke) > 1 ORDER BY c DESC LIMIT 10`
        ),
        floues: avecFlou
            ? avec(
                  `SELECT a.exemple AS e1, b.exemple AS e2, a.n AS n1, b.n AS n2, jaro_winkler_similarity(a.kf, b.kf) AS s` +
                      ` FROM d a JOIN d b ON a.kb = b.kb AND left(a.kf, 4) = left(b.kf, 4) AND a.kf < b.kf` +
                      ` WHERE jaro_winkler_similarity(a.kf, b.kf) >= ${seuilFlou} ORDER BY s DESC LIMIT 100`,
                  `, d AS (SELECT kb, kf, MIN(ke) AS exemple, COUNT(*)::BIGINT AS n FROM src WHERE ${CLE_RENSEIGNEE} AND LENGTH(kf) >= 3 GROUP BY 1, 2)`
              )
            : null
    };
}
