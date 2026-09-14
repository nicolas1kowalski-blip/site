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
    Correspondance,
    FiltreFichier,
    LIGNES_FICHIER_MAXIMUM,
    colonnesRamenees,
    conditionDAppariement,
    conditionDExistence,
    cteDuFichier,
    demandeUneJointure,
    nomDeLaCte
} from './filtre-fichier';
import {
    ErreurFormule,
    Hierarchie,
    MODES_SYNTHESE,
    Synthese,
    conditionListe,
    cteHierarchie,
    cteValeursOrdonnees,
    expressionsHierarchie,
    expressionsSynthese,
    formuleEnSql,
    jointureValeursOrdonnees
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
    /** Route de cette table d'ancrage, quand elle est présente plusieurs fois. Vide = la première. */
    deRoute: z.string().default(''),
    deColonne: z.string().min(1),
    versColonne: z.string().min(1),
    mode: z.enum(Object.keys(MODES_SYNTHESE) as ['count', 'countd', 'values', 'first']).default('count'),
    nomColonne: z.string().default(''),
    n: z.number().int().min(1).max(12).default(3)
});
const schemaHierarchie = z.object({
    idColonne: z.string().min(1),
    /** Type « simple » : colonne parent dans la table elle-même. Requise dans ce cas, inutile avec une liaison. */
    parentColonne: z.string().default(''),
    attributs: z.array(z.string()).default([]),
    profondeur: z.number().int().min(1).max(20).default(5),
    type: z.enum(['simple', 'liaison']).default('simple'),
    /** Type « liaison » : table de rattachement enfant → parent, avec sa période de validité facultative. */
    liaisonTableId: z.string().default(''),
    liaisonEnfant: z.string().default(''),
    liaisonParent: z.string().default(''),
    valideDu: z.string().default(''),
    valideAu: z.string().default(''),
    dateReference: z.string().default('')
});
const schemaColonne = z.object({
    tableId: z.string().min(1),
    /**
     * Route de jointure d'où vient la colonne, quand la même table est ramenée plusieurs fois par des liens
     * différents (le nom du souscripteur ET celui du bénéficiaire). Vide = la première route sur cette table.
     */
    route: z.string().default(''),
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
    route: z.string().default(''),
    nomColonne: z.string().min(1),
    op: z.enum(['=', '!=', 'contains', 'startsWith', 'in', '>=', '<=', 'between', 'dfrom', 'dto', 'empty', 'notempty', 'list']),
    valeur: z.string().optional(),
    valeur2: z.string().optional(),
    /** Opérateur « list » : les valeurs fournies (fichier ou texte collé) et le sens (garder ou exclure). */
    liste: z.array(z.string()).max(200_000).default([]),
    exclure: z.boolean().default(false)
});
const schemaJointure = z.object({
    /**
     * Identité de cette jointure. Deux jointures vers la même table portent deux clés différentes : c'est ce qui
     * permet de ramener la même table par plusieurs liens à la fois. Vide = la table elle-même (cas habituel).
     */
    cle: z.string().default(''),
    /** Route d'où part cette jointure : la table de départ, ou la clé d'une autre jointure. Vide = deTableId. */
    depuis: z.string().default(''),
    /** Table déjà présente dans l'extraction. */
    deTableId: z.string().min(1),
    deColonne: z.string().min(1),
    /** Table ajoutée par cette jointure. */
    versTableId: z.string().min(1),
    versColonne: z.string().min(1)
});
/**
 * Critère d'une mesure : la même chose qu'un filtre, mais il ne s'applique qu'à cette mesure. C'est ce qui
 * reproduit NB.SI.ENS et SOMME.SI.ENS du tableur : « combien de commandes, mais seulement celles du Nord ».
 */
const schemaCritere = schemaFiltre;
/**
 * Mesure d'un regroupement, indépendante des colonnes en sortie : une fonction, la colonne mesurée (sauf pour
 * « nombre de lignes »), un nom en sortie et, facultativement, des critères.
 */
const schemaMesure = z.object({
    fn: z.enum(['count', 'countd', 'sum', 'avg', 'min', 'max']),
    /** Vide pour « nombre de lignes » ; sinon la colonne mesurée et sa table. */
    tableId: z.string().default(''),
    route: z.string().default(''),
    nomColonne: z.string().default(''),
    alias: z.string().trim().min(1, 'nom en sortie requis'),
    criteres: z.array(schemaCritere).default([])
});
/**
 * Filtre « dans le fichier » : le contenu déposé voyage avec la spécification (il ne devient pas une source),
 * avec les colonnes auxquelles il correspond et la façon de comparer.
 */
export const schemaFiltreFichier = z.object({
    nom: z.string().default(''),
    colonnes: z.array(z.string()).default([]),
    lignes: z.array(z.array(z.string())).max(LIGNES_FICHIER_MAXIMUM).default([]),
    correspondances: z
        .array(
            z.object({
                colonneFichier: z.string().min(1),
                tableId: z.string().min(1),
                route: z.string().default(''),
                nomColonne: z.string().min(1)
            })
        )
        .default([]),
    mode: z.enum(['garder', 'exclure']).default('garder'),
    comparaison: z.enum(['tolerante', 'exacte', 'normalisee']).default('tolerante'),
    /** Ramener aussi les autres colonnes du fichier (commentaire, référence interne…) dans le résultat. */
    joindreColonnes: z.boolean().default(false),
    /** Restituer les lignes dans l'ordre du fichier. */
    conserverOrdre: z.boolean().default(false)
});

/** Dédoublonnage par clé fonctionnelle : on garde une seule ligne par valeur de clé. */
const schemaDedoublonnage = z.object({
    actif: z.boolean().default(false),
    /** Noms en sortie des colonnes qui composent la clé. */
    cles: z.array(z.string()).default([]),
    garder: z.enum(['premiere', 'derniere']).default('premiere')
});
export const schemaSpecification = z.object({
    baseId: z.string().min(1, 'table de départ requise'),
    jointures: z.array(schemaJointure).default([]),
    typeJointure: z.enum(['left', 'inner']).default('left'),
    colonnes: z.array(schemaColonne).min(1, 'au moins une colonne'),
    filtres: z.array(schemaFiltre).default([]),
    /** Filtres par fichier déposé : « donne-moi telles données pour cette liste ». */
    fichiers: z.array(schemaFiltreFichier).default([]),
    regrouper: z.boolean().default(false),
    mesures: z.array(schemaMesure).default([]),
    /** Dédoublonnage simple : supprimer les lignes en tous points identiques (SELECT DISTINCT). */
    dedoublonner: z.boolean().default(false),
    dedoublonnage: schemaDedoublonnage.default({ actif: false, cles: [], garder: 'premiere' }),
    tri: z.array(z.object({ alias: z.string().min(1), sens: z.enum(['asc', 'desc']).default('asc') })).default([]),
    limite: z.number().int().positive().max(1_000_000).optional(),
    /**
     * Requête écrite à la main, qui remplace entièrement la requête construite. L'écran la propose après
     * « Voir le SQL » : on part de la requête générée et on l'ajuste. Seule la lecture est autorisée.
     */
    sqlPersonnalise: z.string().default('')
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

/**
 * Route particulière : « le lien renseigné, quel qu'il soit ». Quand une table est atteignable par plusieurs
 * chemins et qu'une seule de ces routes est renseignée par ligne (un contrat rattaché soit à une personne
 * physique, soit à une personne morale, jamais aux deux), on joint toutes les routes et on prend la première
 * valeur non vide. C'est le comportement par défaut proposé par l'écran : on ne force pas un choix inutile.
 */
export const ROUTE_INDIFFERENTE = 'any';

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

export function conditionFiltre(alias: string, filtre: FiltreSaisi, expressionColonne?: string): string {
    // `expressionColonne` sert au « lien renseigné, quel qu'il soit » : la colonne devient alors un COALESCE.
    const reference = expressionColonne ?? `${alias}.${identifiantSql(filtre.nomColonne)}`;
    const brut = `CAST(${reference} AS VARCHAR)`;
    const normalisee = `UPPER(TRIM(${brut}))`;
    const valeur = String(filtre.valeur ?? '');
    const nombre = `TRY_CAST(REPLACE(${brut}, ',', '.') AS DOUBLE)`;
    const date = `TRY_CAST(${brut} AS DATE)`;
    switch (filtre.op) {
        case 'empty':
            return `(${reference} IS NULL OR TRIM(${brut}) = '')`;
        case 'notempty':
            return `(${reference} IS NOT NULL AND TRIM(${brut}) <> '')`;
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
            return conditionListe(reference, filtre.liste || [], !!filtre.exclure);
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
    // Une requête écrite à la main remplace tout : c'est le mode « SQL personnalisé » de l'écran.
    if (specification.sqlPersonnalise.trim()) return { sql: specification.sqlPersonnalise.trim(), alias: [] };
    const aliasDe = new Map<string, string>([[specification.baseId, 't0']]);
    // Toutes les routes posées sur chaque table : c'est la matière du « lien renseigné, quel qu'il soit ».
    const aliasParTable = new Map<string, string[]>([[specification.baseId, ['t0']]]);
    const clausesFrom = [
        `${identifiantSql(contexte.nomTableDe(specification.baseId))} AS t0`,
        ...clausesJointures(specification, contexte, aliasDe, aliasParTable)
    ];
    const sortie = colonnesEnSortie(specification, contexte, aliasDe, aliasParTable);
    const { aliasSortie, selections, clesRegroupement, ctes, jointuresHierarchie } = sortie;
    if (!selections.length) throw new ErreurSpecification('Aucune colonne ni mesure en sortie.');
    clausesFrom.push(...jointuresHierarchie);
    const conditions: string[] = specification.filtres.map(filtre =>
        conditionFiltre('', filtre, expressionSource(filtre, aliasDe, aliasParTable, `Le filtre sur « ${filtre.nomColonne} »`))
    );
    // Les filtres par fichier : une table éphémère par fichier, jointe ou seulement consultée.
    const fichiers = clausesDesFichiers(specification, aliasDe, aliasParTable);
    ctes.push(...fichiers.ctes);
    clausesFrom.push(...fichiers.jointures);
    conditions.push(...fichiers.conditions);
    for (const colonne of fichiers.colonnes) {
        verifierNomLibre(aliasSortie, colonne.alias);
        aliasSortie.push(colonne.alias);
        selections.push(`${colonne.expression} AS ${identifiantSql(colonne.alias)}`);
    }
    const prologue = ctes.length ? `WITH RECURSIVE ${ctes.join(',\n')}\n` : '';
    const distinct = specification.dedoublonner && !specification.regrouper ? 'DISTINCT ' : '';
    // Les rangs des lignes d'origine servent à choisir « la première » ou « la dernière » lors du dédoublonnage.
    const parCle = dedoublonnageParCle(specification, aliasSortie);
    const ordres = parCle ? colonnesDOrdre(aliasDe) : [];
    const rang = ordres.length ? ', ' + ordres.map(ordre => `${ordre.aliasTable}."__rn" AS ${ordre.alias}`).join(', ') : '';
    let sql = `${prologue}SELECT ${distinct}${selections.join(', ')}${rang}\nFROM ${clausesFrom.join('\n')}`;
    if (conditions.length) sql += `\nWHERE ${conditions.join('\n  AND ')}`;
    if (specification.regrouper && clesRegroupement.length) sql += `\nGROUP BY ${clesRegroupement.join(', ')}`;
    if (parCle) sql = envelopperDedoublonnage(sql, parCle, aliasSortie, ordres, specification.dedoublonnage.garder);
    if (fichiers.ordre && !specification.tri.length && !parCle) sql += `\nORDER BY ${fichiers.ordre}`;
    return { sql: sql + clausesTriEtLimite(specification, aliasSortie), alias: aliasSortie };
}

/** Une colonne technique d'ordre : le rang d'origine d'une des tables présentes. */
type ColonneDOrdre = { aliasTable: string; alias: string };

/** Ce que produisent les colonnes et les mesures : les expressions du SELECT et ce qu'elles entraînent autour. */
type SortieConstruite = {
    aliasSortie: string[];
    selections: string[];
    clesRegroupement: string[];
    ctes: string[];
    jointuresHierarchie: string[];
};

/**
 * Parcourt les colonnes puis les mesures, dans l'ordre où elles ont été composées. Une colonne peut produire
 * plusieurs expressions (une synthèse « N premières », une hiérarchie) ; deux noms en sortie identiques sont
 * refusés, car le résultat serait ambigu.
 */
function colonnesEnSortie(
    specification: Specification,
    contexte: ContexteConstruction,
    aliasDe: Map<string, string>,
    aliasParTable: Map<string, string[]>
): SortieConstruite {
    const sortie: SortieConstruite = { aliasSortie: [], selections: [], clesRegroupement: [], ctes: [], jointuresHierarchie: [] };
    for (const colonne of specification.colonnes) {
        // Le résolveur est propre à la colonne : une formule parle d'abord de la route où elle est posée.
        const resoudreReference = resolveurDeReferences(specification, contexte, aliasDe, {
            route: colonne.route,
            tableId: colonne.tableId
        });
        const quoi = `La colonne « ${colonne.nomColonne || colonne.alias || colonne.genre} »`;
        const aliasTable = aliasDeRoute(aliasDe, colonne.route, colonne.tableId);
        if (!aliasTable) throw new ErreurSpecification(`${quoi} vient d'une table absente de l'extraction.`);
        const items = expressionsColonne(colonne, {
            aliasTable,
            expressionColonne: colonne.nomColonne ? expressionSource(colonne, aliasDe, aliasParTable, quoi) : '',
            alias: aliasParDefaut(colonne, specification, contexte),
            contexte,
            aliasDe,
            aliasParTable,
            resoudreReference,
            ctes: sortie.ctes,
            jointures: sortie.jointuresHierarchie
        });
        for (const item of items) ajouterExpression(sortie, specification, colonne, item);
    }
    if (specification.regrouper)
        for (const mesure of specification.mesures) {
            verifierNomLibre(sortie.aliasSortie, mesure.alias);
            sortie.aliasSortie.push(mesure.alias);
            sortie.selections.push(`${expressionMesure(mesure, aliasDe, aliasParTable)} AS ${identifiantSql(mesure.alias)}`);
        }
    return sortie;
}

/** Range une expression de colonne : mesure agrégée en mode regroupé, sinon clé de regroupement ou colonne simple. */
function ajouterExpression(sortie: SortieConstruite, specification: Specification, colonne: ColonneExtraction, item: ItemSortie): void {
    verifierNomLibre(sortie.aliasSortie, item.alias);
    sortie.aliasSortie.push(item.alias);
    let expression = item.expression;
    if (specification.regrouper && colonne.agregat && (colonne.genre === 'colonne' || colonne.genre === 'calcul'))
        expression = expressionAgregee(expression, colonne.agregat);
    else if (specification.regrouper) sortie.clesRegroupement.push(expression);
    sortie.selections.push(`${expression} AS ${identifiantSql(item.alias)}`);
}

function verifierNomLibre(aliasSortie: string[], alias: string): void {
    if (aliasSortie.includes(alias)) throw new ErreurSpecification(`Deux colonnes portent le même nom en sortie : « ${alias} ».`);
}

/** Ce que produit un filtre par fichier dans la requête. */
type ClausesFichier = {
    ctes: string[];
    jointures: string[];
    conditions: string[];
    colonnes: { expression: string; alias: string }[];
    ordre: string;
};

/**
 * Traduit les filtres par fichier. Quand on se contente de garder ou d'exclure des lignes, une sous-requête
 * d'existence suffit et ne multiplie jamais les lignes. Quand on veut aussi rapatrier les colonnes du fichier
 * ou conserver son ordre, il faut le joindre pour de bon.
 */
function clausesDesFichiers(
    specification: Specification,
    aliasDe: Map<string, string>,
    aliasParTable: Map<string, string[]>
): ClausesFichier {
    const resultat: ClausesFichier = { ctes: [], jointures: [], conditions: [], colonnes: [], ordre: '' };
    specification.fichiers.forEach((fichier, index) => {
        if (!fichier.correspondances.length) return;
        const nomCte = nomDeLaCte(index);
        const expressionDe = (correspondance: Correspondance) =>
            expressionSource(correspondance, aliasDe, aliasParTable, `Le filtre sur le fichier « ${fichier.nom} »`);
        resultat.ctes.push(cteDuFichier(nomCte, fichier as FiltreFichier));
        if (demandeUneJointure(fichier as FiltreFichier)) {
            resultat.jointures.push(`JOIN ${nomCte} ON ${conditionDAppariement(nomCte, fichier as FiltreFichier, expressionDe)}`);
            resultat.colonnes.push(...colonnesRamenees(nomCte, fichier as FiltreFichier));
            if (fichier.conserverOrdre) resultat.ordre = `${nomCte}.rang`;
        } else {
            resultat.conditions.push(conditionDExistence(nomCte, fichier as FiltreFichier, expressionDe));
        }
    });
    return resultat;
}

/** Ce qui suffit à désigner une colonne source : sa table, sa route et son nom. */
type ColonneDesignee = { tableId: string; route: string; nomColonne: string };

/**
 * Expression SQL d'une colonne source. Sur une route précise, c'est simplement « alias.colonne » ; avec la route
 * indifférente, toutes les routes posées sur la table sont mises bout à bout et la première valeur non vide
 * l'emporte — c'est le « lien renseigné, quel qu'il soit ».
 */
function expressionSource(
    designation: ColonneDesignee,
    aliasDe: Map<string, string>,
    aliasParTable: Map<string, string[]>,
    quoi: string
): string {
    const colonne = identifiantSql(designation.nomColonne);
    if (designation.route === ROUTE_INDIFFERENTE) {
        const alias = aliasParTable.get(designation.tableId) || [];
        if (!alias.length) throw new ErreurSpecification(`${quoi} vise une table absente de l'extraction.`);
        return alias.length > 1 ? `COALESCE(${alias.map(chaque => `${chaque}.${colonne}`).join(', ')})` : `${alias[0]}.${colonne}`;
    }
    const alias = aliasDeRoute(aliasDe, designation.route, designation.tableId);
    if (!alias) throw new ErreurSpecification(`${quoi} vise une table absente de l'extraction.`);
    return `${alias}.${colonne}`;
}

/** Alias SQL d'une route : la clé de jointure demandée, sinon la première route posée sur cette table. */
function aliasDeRoute(aliasDe: Map<string, string>, route: string, tableId: string): string | undefined {
    // Route indifférente : on retient la première route de la table (l'expression complète est bâtie à part).
    if (route === ROUTE_INDIFFERENTE) return aliasDe.get(tableId);
    return aliasDe.get(route || tableId);
}

/** Les clés de dédoublonnage retenues : celles qui désignent vraiment une colonne de la sortie. */
function dedoublonnageParCle(specification: Specification, aliasSortie: string[]): string[] | null {
    const { actif, cles } = specification.dedoublonnage;
    if (!actif || specification.regrouper) return null;
    const retenues = cles.filter(cle => aliasSortie.includes(cle));
    if (!retenues.length) return null;
    return retenues;
}

/**
 * Ne garder qu'une ligne par valeur de clé : on numérote les lignes de chaque groupe dans l'ordre de la table de
 * départ et on retient la première (ou la dernière). La colonne technique de tri ne ressort pas.
 */
function envelopperDedoublonnage(
    sql: string,
    cles: string[],
    aliasSortie: string[],
    ordres: ColonneDOrdre[],
    garder: 'premiere' | 'derniere'
): string {
    const partition = cles.map(identifiantSql).join(', ');
    const sortie = aliasSortie.map(identifiantSql).join(', ');
    const sens = garder === 'derniere' ? ' DESC' : '';
    const ordre = ordres.map(colonne => colonne.alias + sens).join(', ') || '1';
    return (
        `SELECT ${sortie} FROM (\n` +
        `SELECT *, ROW_NUMBER() OVER (PARTITION BY ${partition} ORDER BY ${ordre}) AS __rang FROM (\n${sql}\n) AS extraction\n` +
        `) AS dedoublonnee WHERE __rang = 1`
    );
}

/**
 * Colonnes techniques d'ordre : le rang d'origine de chaque table présente, la table de départ d'abord.
 * Avec une jointure qui multiplie les lignes, le seul rang de la table de départ ne suffirait pas à départager
 * « la première » de « la dernière » : les deux lignes d'un même client le partagent.
 */
function colonnesDOrdre(aliasDe: Map<string, string>): ColonneDOrdre[] {
    const aliasUniques = [...new Set(aliasDe.values())];
    const rang = (alias: string) => Number(alias.slice(1));
    return aliasUniques
        .sort((premier, second) => rang(premier) - rang(second))
        .map(aliasTable => ({ aliasTable, alias: `__ordre_${aliasTable}` }));
}

/** Une mesure de regroupement : la fonction demandée, restreinte aux lignes qui vérifient ses critères. */
function expressionMesure(
    mesure: Specification['mesures'][number],
    aliasDe: Map<string, string>,
    aliasParTable: Map<string, string[]>
): string {
    const quoi = `La mesure « ${mesure.alias} »`;
    let expression: string;
    if (mesure.fn === 'count' && !mesure.nomColonne) expression = 'COUNT(*)';
    else {
        if (!mesure.nomColonne) throw new ErreurSpecification(`${quoi} n'a pas de colonne à mesurer.`);
        expression = expressionAgregee(expressionSource(mesure, aliasDe, aliasParTable, quoi), mesure.fn);
    }
    if (!mesure.criteres.length) return expression;
    const conditions = mesure.criteres.map(critere =>
        conditionFiltre('', critere, expressionSource(critere, aliasDe, aliasParTable, `Un critère de ${quoi}`))
    );
    return `${expression} FILTER (WHERE ${conditions.join(' AND ')})`;
}

/**
 * Une clause JOIN par table liée. Chaque jointure porte une clé de route : deux jointures vers la même table par
 * des liens différents cohabitent (t2 et t3 sur la même table), ce qui permet de ramener côte à côte, par exemple,
 * le nom du souscripteur et celui du bénéficiaire.
 */
function clausesJointures(
    specification: Specification,
    contexte: ContexteConstruction,
    aliasDe: Map<string, string>,
    aliasParTable: Map<string, string[]>
): string[] {
    const jointure = specification.typeJointure === 'inner' ? 'INNER JOIN' : 'LEFT JOIN';
    return specification.jointures.map((lien, index) => {
        const cle = lien.cle || lien.versTableId;
        const aliasDepart = aliasDe.get(lien.depuis || lien.deTableId);
        if (!aliasDepart)
            throw new ErreurSpecification(
                `La jointure vers « ${contexte.nomSourceDe(lien.versTableId)} » part d'une table absente de l'extraction.`
            );
        if (aliasDe.has(cle))
            throw new ErreurSpecification(`La table « ${contexte.nomSourceDe(lien.versTableId)} » est jointe deux fois par le même lien.`);
        const alias = 't' + (index + 1);
        aliasDe.set(cle, alias);
        // La table reste aussi joignable par son seul identifiant : c'est la première route posée sur elle.
        if (!aliasDe.has(lien.versTableId)) aliasDe.set(lien.versTableId, alias);
        aliasParTable.set(lien.versTableId, [...(aliasParTable.get(lien.versTableId) || []), alias]);
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
 *
 * `routePreferee` est la route de la colonne calculée elle-même : quand la référence tombe sur la table de cette
 * route, on prend cette route plutôt que la première. Une formule posée sur le souscripteur parle donc bien du
 * souscripteur, même si la même table est aussi ramenée en bénéficiaire.
 */
function resolveurDeReferences(
    specification: Specification,
    contexte: ContexteConstruction,
    aliasDe: Map<string, string>,
    routePreferee?: { route: string; tableId: string }
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
        if (!tableId) return null;
        const surLaRoute = routePreferee && routePreferee.route && routePreferee.tableId === tableId;
        const alias = surLaRoute ? aliasDeRoute(aliasDe, routePreferee.route, tableId) : aliasDe.get(tableId);
        return `${alias}.${identifiantSql(colonne)}`;
    };
}

/** Tout ce dont la traduction d'une colonne a besoin, en plus de la colonne elle-même. */
type EntourageColonne = {
    /** Alias de la table d'où sort la colonne, par la route qu'elle a choisie. */
    aliasTable: string;
    /** Expression SQL de la colonne source (vide pour une synthèse, une hiérarchie ou un calcul). */
    expressionColonne: string;
    /** Nom que la colonne portera en sortie. */
    alias: string;
    contexte: ContexteConstruction;
    aliasDe: Map<string, string>;
    aliasParTable: Map<string, string[]>;
    resoudreReference: (reference: string) => string | null;
    /** Tables éphémères à déclarer avant la requête (hiérarchies, listes transposées). */
    ctes: string[];
    /** Jointures que ces tables éphémères demandent. */
    jointures: string[];
};

/** Les expressions produites par une colonne (une, ou plusieurs pour une synthèse « N premières » et une hiérarchie). */
function expressionsColonne(colonne: ColonneExtraction, entourage: EntourageColonne): ItemSortie[] {
    const { aliasTable, expressionColonne, alias: aliasColonne, contexte, aliasDe, aliasParTable, ctes } = entourage;
    const { resoudreReference, jointures: jointuresHierarchie } = entourage;
    try {
        switch (colonne.genre) {
            case 'calcul':
                return [{ expression: `(${formuleEnSql(colonne.formule || '', resoudreReference)})`, alias: aliasColonne }];
            case 'synthese': {
                const synthese = colonne.synthese as Synthese | undefined;
                if (!synthese) throw new ErreurSpecification('Synthèse incomplète : table liée et relation requises.');
                // La table d'ancrage peut être ramenée par plusieurs liens : « quel qu'il soit » les réunit.
                const expressionParent = expressionSource(
                    { tableId: synthese.deTableId, route: synthese.deRoute, nomColonne: synthese.deColonne },
                    aliasDe,
                    aliasParTable,
                    `La synthèse « ${aliasColonne} »`
                );
                // « N premières valeurs » : la table liée est lue une seule fois, rangée en liste ordonnée.
                let nomCteValeurs = '';
                if (synthese.mode === 'first') {
                    nomCteValeurs = 'transpose' + ctes.length;
                    ctes.push(cteValeursOrdonnees(nomCteValeurs, contexte.nomTableDe(synthese.tableId), synthese));
                    jointuresHierarchie.push(jointureValeursOrdonnees(nomCteValeurs, expressionParent));
                }
                return expressionsSynthese(synthese, contexte.nomTableDe(synthese.tableId), expressionParent, aliasColonne, nomCteValeurs);
            }
            case 'hierarchie': {
                const hierarchie = colonne.hierarchie as Hierarchie | undefined;
                if (!hierarchie) throw new ErreurSpecification('Hiérarchie incomplète : colonnes identifiant et parent requises.');
                // L'identifiant de la table de liaison reste côté spécification ; le module pur ne connaît que son nom.
                const liaisonTableId = colonne.hierarchie?.liaisonTableId || '';
                if (hierarchie.type === 'liaison' && !liaisonTableId)
                    throw new ErreurSpecification('Hiérarchie par table de liaison : choisissez la table de rattachement.');
                const nomCte = 'hierarchie' + ctes.length;
                const tableLiaison = hierarchie.type === 'liaison' ? contexte.nomTableDe(liaisonTableId) : undefined;
                ctes.push(...cteHierarchie(nomCte, contexte.nomTableDe(colonne.tableId), hierarchie, tableLiaison));
                jointuresHierarchie.push(
                    `LEFT JOIN ${nomCte} ON ${nomCte}.k = ${cleNormalisee(`${aliasTable}.${identifiantSql(hierarchie.idColonne)}`)}`
                );
                return expressionsHierarchie(nomCte, hierarchie, aliasColonne);
            }
            default: {
                if (!colonne.nomColonne) throw new ErreurSpecification('Colonne sans nom.');
                return [{ expression: expressionTransformee(expressionColonne, colonne.transformation), alias: aliasColonne }];
            }
        }
    } catch (erreur) {
        if (erreur instanceof ErreurFormule) throw new ErreurSpecification(erreur.message);
        throw erreur;
    }
}
