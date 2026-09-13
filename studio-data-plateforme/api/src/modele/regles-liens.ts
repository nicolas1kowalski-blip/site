/**
 * Règles métier sur les liens du modèle (cardinalités conditionnelles), reprises de l'application classique :
 * « 1 emplacement doit avoir exactement 1 accès de type GÉNÉRAL ». Une règle désigne un parent (table, colonne clé),
 * des enfants (table, colonne qui pointe vers le parent), une condition facultative sur les enfants, un opérateur
 * (exactement, au plus, au moins) et un nombre N. Elle est contrôlée ici, dans l'audit qualité et dans l'audit
 * d'un objet métier. Stockage : governance.rules du document partagé. Fonctions pures.
 */
import { z } from 'zod';
import { identifiantSql, litteralSql } from '../espaces/moteur-duckdb';

export const OPERATEURS_ATTENDU = { '=': 'exactement', '<=': 'au plus', '>=': 'au moins' } as const;
export const OPERATEURS_CONDITION_LIEN = {
    '=': '=',
    '!=': '≠',
    contains: 'contient',
    empty: 'est vide',
    notempty: "n'est pas vide"
} as const;

export const schemaRegleLien = z.object({
    parentTable: z.string().min(1, 'table parent requise'),
    parentCol: z.string().min(1, 'colonne parent requise'),
    childTable: z.string().min(1, 'table enfant requise'),
    childCol: z.string().min(1, 'colonne enfant requise'),
    cond: z
        .object({ col: z.string(), op: z.string().default('='), val: z.string().default('') })
        .nullable()
        .default(null),
    expect: z.enum(['=', '<=', '>=']).default('='),
    n: z.number().int().min(0).default(1),
    label: z.string().default('')
});
export type RegleLien = z.infer<typeof schemaRegleLien> & { id: string };
export type ResultatRegleLien = { total: number; violations: number; exemples: string[] };

/** Libellé lisible : le libellé saisi, sinon la phrase « 1 parent doit avoir … N enfant [condition] ». */
export function libelleRegleLien(regle: RegleLien): string {
    if (regle.label) return regle.label;
    const attendu = OPERATEURS_ATTENDU[regle.expect] || 'exactement';
    const condition = regle.cond?.col
        ? ` [${regle.cond.col} ${OPERATEURS_CONDITION_LIEN[regle.cond.op as keyof typeof OPERATEURS_CONDITION_LIEN] || regle.cond.op} "${regle.cond.val}"]`
        : '';
    return `1 ${regle.parentTable} doit avoir ${attendu} ${regle.n} ${regle.childTable}${condition}`;
}

/** Condition SQL sur la table des enfants (alias x), même vocabulaire que les périmètres de l'application classique. */
export function conditionEnfants(condition: { col: string; op: string; val: string } | null): string {
    if (!condition || !condition.col) return '';
    const colonne = 'x.' + identifiantSql(condition.col);
    const brut = `CAST(${colonne} AS VARCHAR)`;
    const normalise = `UPPER(TRIM(${brut}))`;
    if (condition.op === 'empty') return ` AND (${colonne} IS NULL OR TRIM(${brut}) = '')`;
    if (condition.op === 'notempty') return ` AND (${colonne} IS NOT NULL AND TRIM(${brut}) <> '')`;
    if (condition.op === 'contains')
        return ` AND LOWER(COALESCE(${brut}, '')) LIKE '%' || ${litteralSql(String(condition.val).toLowerCase())} || '%'`;
    if (condition.op === '!=') return ` AND COALESCE(${normalise}, '') <> ${litteralSql(String(condition.val).toUpperCase())}`;
    return ` AND ${normalise} = ${litteralSql(String(condition.val).toUpperCase())}`;
}

const normalisee = (alias: string, colonne: string) => `NULLIF(UPPER(TRIM(CAST(${alias}.${identifiantSql(colonne)} AS VARCHAR))), '')`;

/** Comptage des enfants par parent, la CTE commune des deux requêtes. */
function cteComptage(regle: RegleLien, nomTableEnfant: string): string {
    return `cnt AS (SELECT ${normalisee('x', regle.childCol)} AS k, COUNT(*)::BIGINT AS c FROM ${identifiantSql(nomTableEnfant)} x WHERE ${normalisee('x', regle.childCol)} IS NOT NULL${conditionEnfants(regle.cond)} GROUP BY 1)`;
}

/** Requête de test : total de parents, violations, cinq exemples. */
export function sqlTestRegleLien(regle: RegleLien, nomTableParent: string, nomTableEnfant: string): string {
    const attendu = `COALESCE(cnt.c, 0) ${regle.expect} ${Math.max(0, Math.round(regle.n))}`;
    return (
        `WITH par AS (SELECT ${normalisee('p', regle.parentCol)} AS k, MIN(TRIM(CAST(p.${identifiantSql(regle.parentCol)} AS VARCHAR))) AS affichage FROM ${identifiantSql(nomTableParent)} p WHERE ${normalisee('p', regle.parentCol)} IS NOT NULL GROUP BY 1),\n` +
        `${cteComptage(regle, nomTableEnfant)}\n` +
        `SELECT (SELECT COUNT(*) FROM par)::BIGINT AS total, SUM(CASE WHEN NOT (${attendu}) THEN 1 ELSE 0 END)::BIGINT AS violations,\n` +
        `list(par.affichage) FILTER (WHERE NOT (${attendu})) AS exemples FROM par LEFT JOIN cnt ON par.k = cnt.k`
    );
}

/** Lignes du parent en défaut (pour l'inspecteur). */
export function sqlLignesEnDefautRegleLien(regle: RegleLien, nomTableParent: string, nomTableEnfant: string): string {
    const attendu = `COALESCE(cnt.c, 0) ${regle.expect} ${Math.max(0, Math.round(regle.n))}`;
    return (
        `WITH ${cteComptage(regle, nomTableEnfant)}\n` +
        `SELECT p.* EXCLUDE (__rn), COALESCE(cnt.c, 0) AS nombre_enfants FROM ${identifiantSql(nomTableParent)} p LEFT JOIN cnt ON ${normalisee('p', regle.parentCol)} = cnt.k\n` +
        `WHERE ${normalisee('p', regle.parentCol)} IS NOT NULL AND NOT (${attendu})`
    );
}

/** Mesure d'un lien sur les données réelles : totaux, maximum de lignes par clé de chaque côté, orphelins. */
export type MesureRelation = {
    stotal: number;
    ttotal: number;
    smax: number;
    tmax: number;
    sorph: number;
    torph: number;
    suggested: string;
    date: string;
};

export function sqlMesureRelation(nomTableSource: string, colonneSource: string, nomTableCible: string, colonneCible: string): string {
    const cles = (nomTable: string, colonne: string) =>
        `SELECT NULLIF(UPPER(TRIM(CAST(${identifiantSql(colonne)} AS VARCHAR))), '') AS k FROM ${identifiantSql(nomTable)}`;
    return (
        `WITH sk AS (${cles(nomTableSource, colonneSource)}), tk AS (${cles(nomTableCible, colonneCible)}),\n` +
        `sc AS (SELECT k, COUNT(*) AS c FROM sk WHERE k IS NOT NULL GROUP BY 1), tc AS (SELECT k, COUNT(*) AS c FROM tk WHERE k IS NOT NULL GROUP BY 1)\n` +
        `SELECT (SELECT COUNT(*) FROM sk)::BIGINT, (SELECT COUNT(*) FROM tk)::BIGINT, (SELECT COALESCE(MAX(c), 0) FROM sc)::BIGINT, (SELECT COALESCE(MAX(c), 0) FROM tc)::BIGINT,\n` +
        `(SELECT COALESCE(SUM(sc.c), 0) FROM sc LEFT JOIN tc ON sc.k = tc.k WHERE tc.k IS NULL)::BIGINT, (SELECT COALESCE(SUM(tc.c), 0) FROM tc LEFT JOIN sc ON tc.k = sc.k WHERE sc.k IS NULL)::BIGINT`
    );
}

/** Interprète la ligne de résultat de sqlMesureRelation. */
export function mesureDepuisLigne(ligne: unknown[]): MesureRelation {
    const [stotal, ttotal, smax, tmax, sorph, torph] = ligne.map(Number);
    return {
        stotal,
        ttotal,
        smax,
        tmax,
        sorph,
        torph,
        suggested: `${smax <= 1 ? '1' : 'N'}-${tmax <= 1 ? '1' : 'N'}`,
        date: new Date().toISOString()
    };
}
