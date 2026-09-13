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
import {
    ErreurFormule,
    Hierarchie,
    MODES_SYNTHESE,
    Synthese,
    conditionListe,
    cteHierarchie,
    expressionsHierarchie,
    expressionsSynthese,
    formuleEnSql
} from './constructeur-avance';

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
    notempty: "n'est pas vide",
    list: 'dans une liste fournie (fichier ou texte collé)'
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

export const GENRES_COLONNE = {
    colonne: "colonne d'une table",
    calcul: 'colonne calculée (formule)',
    synthese: "synthèse d'une table liée",
    hierarchie: 'hiérarchie aplatie'
} as const;

const schemaSynthese = z.object({
    /** Table résumée (non jointe : les lignes ne sont pas multipliées). */
    tableId: z.string().min(1),
    /** Table présente dans l'extraction qui porte la clé, et les deux colonnes de la relation. */
    deTableId: z.string().min(1),
    deColonne: z.string().min(1),
    versColonne: z.string().min(1),
    mode: z.enum(Object.keys(MODES_SYNTHESE) as ['count', 'countd', 'values', 'first']).default('count'),
    nomColonne: z.string().default(''),
    n: z.number().int().min(1).max(12).default(3)
});
const schemaHierarchie = z.object({
    idColonne: z.string().min(1),
    parentColonne: z.string().min(1),
    attributs: z.array(z.string()).default([]),
    profondeur: z.number().int().min(1).max(20).default(5)
});
const schemaColonne = z.object({
    tableId: z.string().min(1),
    /** Vide pour une colonne calculée, une synthèse ou une hiérarchie. */
    nomColonne: z.string().default(''),
    genre: z.enum(['colonne', 'calcul', 'synthese', 'hierarchie']).default('colonne'),
    /** Colonne calculée : formule avec les colonnes entre crochets, [ville] ou [commandes.montant]. */
    formule: z.string().optional(),
    synthese: schemaSynthese.optional(),
    hierarchie: schemaHierarchie.optional(),
    alias: z.string().trim().min(1).optional(),
    transformation: z.enum(['none', 'trim', 'upper', 'lower', 'noaccent']).default('none'),
    /** Renseigné en mode regroupé : la colonne devient une mesure ; absent : elle fait partie de la clé de regroupement. */
    agregat: z.enum(['count', 'countd', 'sum', 'avg', 'min', 'max', 'values']).optional()
});
const schemaFiltre = z.object({
    tableId: z.string().min(1),
    nomColonne: z.string().min(1),
    op: z.enum(['=', '!=', 'contains', 'startsWith', 'in', '>=', '<=', 'between', 'dfrom', 'dto', 'empty', 'notempty', 'list']),
    valeur: z.string().optional(),
    valeur2: z.string().optional(),
    /** Opérateur « list » : les valeurs fournies (fichier ou texte collé) et le sens (garder ou exclure). */
    liste: z.array(z.string()).max(200_000).default([]),
    exclure: z.boolean().default(false)
});
const schemaJointure = z.object({
    /** Table déjà présente dans l'extraction. */
    deTableId: z.string().min(1),
    deColonne: z.string().min(1),
    /** Table ajoutée par cette jointure. */
    versTableId: z.string().min(1),
    versColonne: z.string().min(1)
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
    /** Colonnes d'une source (pour résoudre les [références] des formules) ; facultatif. */
    colonnesDe?: (tableId: string) => string[];
};

export class ErreurSpecification extends Error {}

/** Alias SQL d'une colonne : celui demandé, sinon « colonne » pour la table de départ et « table.colonne » ailleurs. */
export function aliasParDefaut(colonne: ColonneExtraction, specification: Specification, contexte: ContexteConstruction): string {
    if (colonne.alias) return colonne.alias;
    if (colonne.genre === 'calcul') return 'calcul';
    if (colonne.genre === 'synthese') return contexte.nomSourceDe(colonne.synthese?.tableId || colonne.tableId).replace(/\.[^.]+$/, '');
    if (colonne.genre === 'hierarchie') return contexte.nomSourceDe(colonne.tableId).replace(/\.[^.]+$/, '') + '_hier';
    const nomColonne = colonne.agregat && colonne.agregat !== 'values' ? `${colonne.nomColonne}_${colonne.agregat}` : colonne.nomColonne;
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
export type FiltreSaisi = Pick<FiltreExtraction, 'nomColonne' | 'op' | 'valeur' | 'valeur2'> &
    Partial<Pick<FiltreExtraction, 'tableId' | 'liste' | 'exclure'>>;

export function conditionFiltre(alias: string, filtre: FiltreSaisi): string {
    const brut = `CAST(${alias}.${identifiantSql(filtre.nomColonne)} AS VARCHAR)`;
    const normalisee = `UPPER(TRIM(${brut}))`;
    const valeur = String(filtre.valeur ?? '');
    const nombre = `TRY_CAST(REPLACE(${brut}, ',', '.') AS DOUBLE)`;
    const date = `TRY_CAST(${brut} AS DATE)`;
    switch (filtre.op) {
        case 'empty':
            return `(${alias}.${identifiantSql(filtre.nomColonne)} IS NULL OR TRIM(${brut}) = '')`;
        case 'notempty':
            return `(${alias}.${identifiantSql(filtre.nomColonne)} IS NOT NULL AND TRIM(${brut}) <> '')`;
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
        case 'list':
            return conditionListe(`${alias}.${identifiantSql(filtre.nomColonne)}`, filtre.liste || [], !!filtre.exclure);
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
    const clausesFrom = [
        `${identifiantSql(contexte.nomTableDe(specification.baseId))} AS t0`,
        ...clausesJointures(specification, contexte, aliasDe)
    ];
    const aliasSortie: string[] = [];
    const selections: string[] = [];
    const clesRegroupement: string[] = [];
    const ctes: string[] = [];
    const jointuresHierarchie: string[] = [];
    const resoudreReference = resolveurDeReferences(specification, contexte, aliasDe);
    for (const colonne of specification.colonnes) {
        const aliasTable = aliasDe.get(colonne.tableId);
        if (!aliasTable)
            throw new ErreurSpecification(
                `La colonne « ${colonne.nomColonne || colonne.alias || colonne.genre} » vient d'une table absente de l'extraction.`
            );
        const aliasColonne = aliasParDefaut(colonne, specification, contexte);
        const items = expressionsColonne(
            colonne,
            aliasTable,
            aliasColonne,
            contexte,
            aliasDe,
            resoudreReference,
            ctes,
            jointuresHierarchie
        );
        for (const item of items) {
            if (aliasSortie.includes(item.alias))
                throw new ErreurSpecification(`Deux colonnes portent le même nom en sortie : « ${item.alias} ».`);
            aliasSortie.push(item.alias);
            let expression = item.expression;
            if (specification.regrouper && colonne.agregat && (colonne.genre === 'colonne' || colonne.genre === 'calcul'))
                expression = expressionAgregee(expression, colonne.agregat);
            else if (specification.regrouper) clesRegroupement.push(expression);
            selections.push(`${expression} AS ${identifiantSql(item.alias)}`);
        }
    }
    clausesFrom.push(...jointuresHierarchie);
    const conditions = specification.filtres.map(filtre => {
        const aliasTable = aliasDe.get(filtre.tableId);
        if (!aliasTable) throw new ErreurSpecification(`Le filtre sur « ${filtre.nomColonne} » vise une table absente de l'extraction.`);
        return conditionFiltre(aliasTable, filtre);
    });
    const prologue = ctes.length ? `WITH RECURSIVE ${ctes.join(',\n')}\n` : '';
    const distinct = specification.dedoublonner && !specification.regrouper ? 'DISTINCT ' : '';
    let sql = `${prologue}SELECT ${distinct}${selections.join(', ')}\nFROM ${clausesFrom.join('\n')}`;
    if (conditions.length) sql += `\nWHERE ${conditions.join('\n  AND ')}`;
    if (specification.regrouper && clesRegroupement.length) sql += `\nGROUP BY ${clesRegroupement.join(', ')}`;
    return { sql: sql + clausesTriEtLimite(specification, aliasSortie), alias: aliasSortie };
}

/** Une clause JOIN par table liée ; attribue les alias t1, t2… et refuse une jointure incohérente. */
function clausesJointures(specification: Specification, contexte: ContexteConstruction, aliasDe: Map<string, string>): string[] {
    const jointure = specification.typeJointure === 'inner' ? 'INNER JOIN' : 'LEFT JOIN';
    return specification.jointures.map((lien, index) => {
        const aliasDepart = aliasDe.get(lien.deTableId);
        if (!aliasDepart)
            throw new ErreurSpecification(
                `La jointure vers « ${contexte.nomSourceDe(lien.versTableId)} » part d'une table absente de l'extraction.`
            );
        if (aliasDe.has(lien.versTableId))
            throw new ErreurSpecification(`La table « ${contexte.nomSourceDe(lien.versTableId)} » est jointe deux fois.`);
        const alias = 't' + (index + 1);
        aliasDe.set(lien.versTableId, alias);
        return `${jointure} ${identifiantSql(contexte.nomTableDe(lien.versTableId))} AS ${alias} ON ${cleNormalisee(`${alias}.${identifiantSql(lien.versColonne)}`)} = ${cleNormalisee(`${aliasDepart}.${identifiantSql(lien.deColonne)}`)}`;
    });
}

/** ORDER BY et LIMIT ; un tri doit viser une colonne de la sortie. */
function clausesTriEtLimite(specification: Specification, aliasSortie: string[]): string {
    let sql = '';
    if (specification.tri.length) {
        for (const critere of specification.tri)
            if (!aliasSortie.includes(critere.alias))
                throw new ErreurSpecification(`Tri sur une colonne absente de la sortie : « ${critere.alias} ».`);
        sql += `\nORDER BY ${specification.tri.map(critere => `${identifiantSql(critere.alias)} ${critere.sens.toUpperCase()}`).join(', ')}`;
    }
    if (specification.limite) sql += `\nLIMIT ${specification.limite}`;
    return sql;
}

type ItemSortie = { expression: string; alias: string };

/**
 * Résout une [référence] de formule : « colonne » cherche d'abord dans la table de départ puis dans les tables
 * jointes ; « table.colonne » vise une table présente par son nom (avec ou sans extension de fichier).
 */
function resolveurDeReferences(
    specification: Specification,
    contexte: ContexteConstruction,
    aliasDe: Map<string, string>
): (reference: string) => string | null {
    const tables = [specification.baseId, ...specification.jointures.map(jointure => jointure.versTableId)];
    const nomsDe = (tableId: string) => {
        const nom = contexte.nomSourceDe(tableId);
        return [nom, nom.replace(/\.[^.]+$/, '')].map(candidat => candidat.toLowerCase());
    };
    const possede = (tableId: string, colonne: string) => !contexte.colonnesDe || contexte.colonnesDe(tableId).includes(colonne);
    return reference => {
        const point = reference.lastIndexOf('.');
        const tableCherchee = point > 0 ? reference.slice(0, point).trim().toLowerCase() : null;
        const colonne = point > 0 ? reference.slice(point + 1).trim() : reference;
        const candidates = tableCherchee ? tables.filter(tableId => nomsDe(tableId).includes(tableCherchee)) : tables;
        const tableId =
            candidates.find(candidat => possede(candidat, colonne)) ??
            (tableCherchee ? null : contexte.colonnesDe ? null : specification.baseId);
        return tableId ? `${aliasDe.get(tableId)}.${identifiantSql(colonne)}` : null;
    };
}

/** Les expressions produites par une colonne (une, ou plusieurs pour une synthèse « N premières » et une hiérarchie). */
function expressionsColonne(
    colonne: ColonneExtraction,
    aliasTable: string,
    aliasColonne: string,
    contexte: ContexteConstruction,
    aliasDe: Map<string, string>,
    resoudreReference: (reference: string) => string | null,
    ctes: string[],
    jointuresHierarchie: string[]
): ItemSortie[] {
    try {
        switch (colonne.genre) {
            case 'calcul':
                return [{ expression: `(${formuleEnSql(colonne.formule || '', resoudreReference)})`, alias: aliasColonne }];
            case 'synthese': {
                const synthese = colonne.synthese as Synthese | undefined;
                if (!synthese) throw new ErreurSpecification('Synthèse incomplète : table liée et relation requises.');
                const aliasParent = aliasDe.get(synthese.deTableId);
                if (!aliasParent)
                    throw new ErreurSpecification(`La synthèse « ${aliasColonne} » s'ancre sur une table absente de l'extraction.`);
                return expressionsSynthese(
                    synthese,
                    contexte.nomTableDe(synthese.tableId),
                    `${aliasParent}.${identifiantSql(synthese.deColonne)}`,
                    aliasColonne
                );
            }
            case 'hierarchie': {
                const hierarchie = colonne.hierarchie as Hierarchie | undefined;
                if (!hierarchie) throw new ErreurSpecification('Hiérarchie incomplète : colonnes identifiant et parent requises.');
                const nomCte = 'hierarchie' + ctes.length;
                ctes.push(cteHierarchie(nomCte, contexte.nomTableDe(colonne.tableId), hierarchie));
                jointuresHierarchie.push(
                    `LEFT JOIN ${nomCte} ON ${nomCte}.k = ${cleNormalisee(`${aliasTable}.${identifiantSql(hierarchie.idColonne)}`)}`
                );
                return expressionsHierarchie(nomCte, hierarchie, aliasColonne);
            }
            default: {
                if (!colonne.nomColonne) throw new ErreurSpecification('Colonne sans nom.');
                return [
                    {
                        expression: expressionTransformee(`${aliasTable}.${identifiantSql(colonne.nomColonne)}`, colonne.transformation),
                        alias: aliasColonne
                    }
                ];
            }
        }
    } catch (erreur) {
        if (erreur instanceof ErreurFormule) throw new ErreurSpecification(erreur.message);
        throw erreur;
    }
}
