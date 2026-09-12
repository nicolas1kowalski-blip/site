/**
 * Constructeur SQL d'une extraction : transforme une spécification (table de départ, tables liées, colonnes,
 * filtres, regroupement) en une requête DuckDB. Fonction pure, sans accès au moteur : testable seule.
 *
 * Conventions reprises de l'application classique :
 *   • toutes les valeurs sont du texte ; les clés de jointure et les comparaisons d'égalité sont normalisées
 *     (majuscules, sans espaces autour, vide = NULL) ;
 *   • la colonne technique __rn n'est jamais exportée ;
 *   • chaque table reçoit un alias court (t0, t1…) ; la table de départ est t0.
 */
import { z } from 'zod';
import { identifiantSql, litteralSql } from '../espaces/moteur-duckdb';
import { cleNormalisee } from '../modele/modele.service';

export const OPERATEURS_FILTRE = {
    '=': 'égal à',
    '!=': 'différent de',
    contains: 'contient',
    startsWith: 'commence par',
    in: 'dans la liste (séparateur ;)',
    '>=': 'supérieur ou égal à (nombre)',
    '<=': 'inférieur ou égal à (nombre)',
    between: 'entre deux nombres',
    dfrom: 'à partir du (date AAAA-MM-JJ)',
    dto: "jusqu'au (date AAAA-MM-JJ)",
    empty: 'est vide',
    notempty: "n'est pas vide"
} as const;

export const TRANSFORMATIONS = {
    none: 'aucune',
    trim: 'sans espaces autour',
    upper: 'MAJUSCULES',
    lower: 'minuscules',
    noaccent: 'sans accents'
} as const;
export const AGREGATS = {
    count: 'nombre',
    countd: 'nombre de valeurs distinctes',
    sum: 'somme',
    avg: 'moyenne',
    min: 'minimum',
    max: 'maximum',
    values: 'valeurs (liste)'
} as const;

const schemaColonne = z.object({
    tableId: z.string().min(1),
    col: z.string().min(1),
    alias: z.string().trim().min(1).optional(),
    transformation: z.enum(['none', 'trim', 'upper', 'lower', 'noaccent']).default('none'),
    /** Renseigné en mode regroupé : la colonne devient une mesure ; absent : elle fait partie de la clé de regroupement. */
    agregat: z.enum(['count', 'countd', 'sum', 'avg', 'min', 'max', 'values']).optional()
});
const schemaFiltre = z.object({
    tableId: z.string().min(1),
    col: z.string().min(1),
    op: z.enum(['=', '!=', 'contains', 'startsWith', 'in', '>=', '<=', 'between', 'dfrom', 'dto', 'empty', 'notempty']),
    valeur: z.string().optional(),
    valeur2: z.string().optional()
});
const schemaJointure = z.object({
    /** Table déjà présente dans l'extraction. */
    deTableId: z.string().min(1),
    deCol: z.string().min(1),
    /** Table ajoutée par cette jointure. */
    versTableId: z.string().min(1),
    versCol: z.string().min(1)
});
export const schemaSpecification = z.object({
    baseId: z.string().min(1, 'table de départ requise'),
    jointures: z.array(schemaJointure).default([]),
    typeJointure: z.enum(['left', 'inner']).default('left'),
    colonnes: z.array(schemaColonne).min(1, 'au moins une colonne'),
    filtres: z.array(schemaFiltre).default([]),
    regrouper: z.boolean().default(false),
    dedoublonner: z.boolean().default(false),
    tri: z.array(z.object({ alias: z.string().min(1), sens: z.enum(['asc', 'desc']).default('asc') })).default([]),
    limite: z.number().int().positive().max(1_000_000).optional()
});
export type Specification = z.infer<typeof schemaSpecification>;
export type ColonneExtraction = z.infer<typeof schemaColonne>;
export type FiltreExtraction = z.infer<typeof schemaFiltre>;

export type ContexteConstruction = {
    /** Nom de table DuckDB pour chaque identifiant de source. */
    nomTableDe: (tableId: string) => string;
    /** Nom lisible d'une source (pour les alias par défaut et les messages). */
    nomSourceDe: (tableId: string) => string;
};

export class ErreurSpecification extends Error {}

/** Alias SQL d'une colonne : celui demandé, sinon « colonne » pour la table de départ et « table.colonne » ailleurs. */
export function aliasParDefaut(colonne: ColonneExtraction, specification: Specification, contexte: ContexteConstruction): string {
    if (colonne.alias) return colonne.alias;
    const nomColonne = colonne.agregat && colonne.agregat !== 'values' ? `${colonne.col}_${colonne.agregat}` : colonne.col;
    return colonne.tableId === specification.baseId
        ? nomColonne
        : `${contexte.nomSourceDe(colonne.tableId).replace(/\.[^.]+$/, '')}.${nomColonne}`;
}

function expressionTransformee(expression: string, transformation: ColonneExtraction['transformation']): string {
    const texte = `CAST(${expression} AS VARCHAR)`;
    switch (transformation) {
        case 'trim':
            return `TRIM(${texte})`;
        case 'upper':
            return `UPPER(${texte})`;
        case 'lower':
            return `LOWER(${texte})`;
        case 'noaccent':
            return `strip_accents(${texte})`;
        default:
            return expression;
    }
}

function expressionAgregee(expression: string, agregat: NonNullable<ColonneExtraction['agregat']>): string {
    switch (agregat) {
        case 'count':
            return `COUNT(${expression})`;
        case 'countd':
            return `COUNT(DISTINCT ${expression})`;
        case 'sum':
            return `SUM(TRY_CAST(${expression} AS DOUBLE))`;
        case 'avg':
            return `AVG(TRY_CAST(${expression} AS DOUBLE))`;
        case 'min':
            return `MIN(${expression})`;
        case 'max':
            return `MAX(${expression})`;
        case 'values':
            return `string_agg(DISTINCT CAST(${expression} AS VARCHAR), ' | ' ORDER BY CAST(${expression} AS VARCHAR))`;
    }
}

/** Condition SQL d'un filtre, avec la même tolérance que l'application classique (texte normalisé, nombres et dates convertis). */
export function conditionFiltre(alias: string, filtre: FiltreExtraction): string {
    const brut = `CAST(${alias}.${identifiantSql(filtre.col)} AS VARCHAR)`;
    const normalisee = `UPPER(TRIM(${brut}))`;
    const valeur = String(filtre.valeur ?? '');
    const nombre = `TRY_CAST(REPLACE(${brut}, ',', '.') AS DOUBLE)`;
    const date = `TRY_CAST(${brut} AS DATE)`;
    switch (filtre.op) {
        case 'empty':
            return `(${alias}.${identifiantSql(filtre.col)} IS NULL OR TRIM(${brut}) = '')`;
        case 'notempty':
            return `(${alias}.${identifiantSql(filtre.col)} IS NOT NULL AND TRIM(${brut}) <> '')`;
        case '=':
            return `${normalisee} = ${litteralSql(valeur.trim().toUpperCase())}`;
        case '!=':
            return `COALESCE(${normalisee}, '') <> ${litteralSql(valeur.trim().toUpperCase())}`;
        case 'contains':
            return `LOWER(COALESCE(${brut}, '')) LIKE '%' || ${litteralSql(valeur.toLowerCase())} || '%'`;
        case 'startsWith':
            return `LOWER(COALESCE(${brut}, '')) LIKE ${litteralSql(valeur.toLowerCase())} || '%'`;
        case 'in': {
            const valeurs = valeur
                .split(';')
                .map(partie => partie.trim())
                .filter(Boolean);
            return valeurs.length ? `${normalisee} IN (${valeurs.map(partie => litteralSql(partie.toUpperCase())).join(', ')})` : 'TRUE';
        }
        case '>=':
            return `${nombre} >= ${nombreSql(valeur)}`;
        case '<=':
            return `${nombre} <= ${nombreSql(valeur)}`;
        case 'between':
            return `${nombre} BETWEEN ${nombreSql(valeur)} AND ${nombreSql(String(filtre.valeur2 ?? ''))}`;
        case 'dfrom':
            return `${date} >= ${litteralSql(valeur)}::DATE`;
        case 'dto':
            return `${date} <= ${litteralSql(valeur)}::DATE`;
    }
}

function nombreSql(texte: string): string {
    const nombre = Number(String(texte).replace(',', '.').trim());
    if (!Number.isFinite(nombre)) throw new ErreurSpecification(`Valeur numérique attendue : « ${texte} ».`);
    return String(nombre);
}

/**
 * Construit la requête. Les alias de tables sont attribués dans l'ordre : t0 = table de départ, puis une table
 * par jointure. Une jointure doit partir d'une table déjà présente ; sinon la spécification est refusée.
 */
export function construireSql(specification: Specification, contexte: ContexteConstruction): { sql: string; alias: string[] } {
    const aliasDe = new Map<string, string>([[specification.baseId, 't0']]);
    const clausesFrom = [`${identifiantSql(contexte.nomTableDe(specification.baseId))} AS t0`];
    const jointure = specification.typeJointure === 'inner' ? 'INNER JOIN' : 'LEFT JOIN';
    specification.jointures.forEach((lien, index) => {
        const aliasDepart = aliasDe.get(lien.deTableId);
        if (!aliasDepart)
            throw new ErreurSpecification(
                `La jointure vers « ${contexte.nomSourceDe(lien.versTableId)} » part d'une table absente de l'extraction.`
            );
        if (aliasDe.has(lien.versTableId))
            throw new ErreurSpecification(`La table « ${contexte.nomSourceDe(lien.versTableId)} » est jointe deux fois.`);
        const alias = 't' + (index + 1);
        aliasDe.set(lien.versTableId, alias);
        clausesFrom.push(
            `${jointure} ${identifiantSql(contexte.nomTableDe(lien.versTableId))} AS ${alias} ON ${cleNormalisee(`${alias}.${identifiantSql(lien.versCol)}`)} = ${cleNormalisee(`${aliasDepart}.${identifiantSql(lien.deCol)}`)}`
        );
    });
    const aliasSortie: string[] = [];
    const selections: string[] = [];
    const clesRegroupement: string[] = [];
    for (const colonne of specification.colonnes) {
        const aliasTable = aliasDe.get(colonne.tableId);
        if (!aliasTable) throw new ErreurSpecification(`La colonne « ${colonne.col} » vient d'une table absente de l'extraction.`);
        const aliasColonne = aliasParDefaut(colonne, specification, contexte);
        if (aliasSortie.includes(aliasColonne))
            throw new ErreurSpecification(`Deux colonnes portent le même nom en sortie : « ${aliasColonne} ».`);
        aliasSortie.push(aliasColonne);
        let expression = expressionTransformee(`${aliasTable}.${identifiantSql(colonne.col)}`, colonne.transformation);
        if (specification.regrouper && colonne.agregat) expression = expressionAgregee(expression, colonne.agregat);
        else if (specification.regrouper) clesRegroupement.push(expression);
        selections.push(`${expression} AS ${identifiantSql(aliasColonne)}`);
    }
    const conditions = specification.filtres.map(filtre => {
        const aliasTable = aliasDe.get(filtre.tableId);
        if (!aliasTable) throw new ErreurSpecification(`Le filtre sur « ${filtre.col} » vise une table absente de l'extraction.`);
        return conditionFiltre(aliasTable, filtre);
    });
    let sql = `SELECT ${specification.dedoublonner && !specification.regrouper ? 'DISTINCT ' : ''}${selections.join(', ')}\nFROM ${clausesFrom.join('\n')}`;
    if (conditions.length) sql += `\nWHERE ${conditions.join('\n  AND ')}`;
    if (specification.regrouper && clesRegroupement.length) sql += `\nGROUP BY ${clesRegroupement.join(', ')}`;
    if (specification.tri.length) {
        for (const critere of specification.tri)
            if (!aliasSortie.includes(critere.alias))
                throw new ErreurSpecification(`Tri sur une colonne absente de la sortie : « ${critere.alias} ».`);
        sql += `\nORDER BY ${specification.tri.map(critere => `${identifiantSql(critere.alias)} ${critere.sens.toUpperCase()}`).join(', ')}`;
    }
    if (specification.limite) sql += `\nLIMIT ${specification.limite}`;
    return { sql, alias: aliasSortie };
}
