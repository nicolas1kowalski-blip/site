/**
 * Constructeur SQL d'une table conçue. Une table conçue est une RECETTE : des sources contributrices
 * (chacune avec sa correspondance de colonnes et ses filtres d'entrée), des attributs (les colonnes de la
 * table, renommées en libellés métier), des formats déclarés, des enrichissements (colonnes ramenées d'une
 * autre source par une clé, directement ou via une table de lien), des colonnes calculées, une clé et des
 * clés étrangères déclarées. La recette est exécutée en une seule requête DuckDB puis matérialisée.
 *
 * Fonctions pures, sans accès au moteur : testables seules.
 *
 * Le format de la recette est CELUI DE L'APPLICATION CLASSIQUE (champs en anglais : sources, attrs, calcs,
 * key, formats, joins, fks…), pour que les tables conçues restent lisibles et modifiables depuis les deux
 * interfaces. Le vocabulaire est traduit ici :
 *   sources[].src        nom de la source contributrice          sources[].map    attribut → colonne source
 *   sources[].filters    filtres d'entrée { col, op, val }         attrs            attributs (colonnes) de la table
 *   calcs[]              colonnes calculées { name, formula }     key              attributs formant la clé
 *   formats              attribut → format ('int', 'dec', 'date', 'bool', 'code')
 *   joins[]              enrichissements : src (source cible), srcKey (sa clé), attr (colonne d'accroche),
 *                        col (colonne ramenée), as (nom dans la table), viaSrc/viaIn/viaOut (table de lien),
 *                        validMode/vCol/vOp/vVal/vStart/vEnd (lignes valides par statut ou période)
 *   fks[]                clés étrangères déclarées { attr, table, col }
 *   targetId             identifiant de la table matérialisée ; lastRows, lastBuild, lastConform, lastFk :
 *                        résultats de la dernière construction.
 */
import { z } from 'zod';
import { identifiantSql, litteralSql } from '../espaces/moteur-duckdb';

export const COLONNE_ORIGINE = 'SOURCE_ORIGINE';
export const COLONNE_NUMERO_LIGNE = '__rn';

export const FORMATS_ATTRIBUT = {
    '': 'Texte',
    int: 'Entier',
    dec: 'Décimal',
    date: 'Date (AAAA-MM-JJ)',
    bool: 'Booléen (OUI/NON)',
    code: 'Code (MAJUSCULES)'
} as const;
export type FormatAttribut = keyof typeof FORMATS_ATTRIBUT;

export const OPERATEURS_FILTRE_SOURCE = {
    eq: '= égal à',
    neq: '≠ différent de',
    contains: 'contient',
    ncontains: 'ne contient pas',
    starts: 'commence par',
    ends: 'finit par',
    empty: 'est vide',
    nempty: "n'est pas vide",
    gt: '> supérieur à',
    gte: '≥ supérieur ou égal',
    lt: '< inférieur à',
    lte: '≤ inférieur ou égal'
} as const;
export type OperateurFiltreSource = keyof typeof OPERATEURS_FILTRE_SOURCE;

export const MODES_VALIDITE = { '': 'toutes les lignes', status: 'valides par statut', period: "période active (aujourd'hui)" } as const;

const schemaFiltreSource = z.object({
    col: z.string().default(''),
    op: z.enum(['eq', 'neq', 'contains', 'ncontains', 'starts', 'ends', 'empty', 'nempty', 'gt', 'gte', 'lt', 'lte']).default('eq'),
    val: z.string().default('')
});
const schemaSourceContributrice = z.object({
    src: z.string().min(1, 'nom de source requis'),
    map: z.record(z.string(), z.string()).default({}),
    filters: z.array(schemaFiltreSource).default([])
});
const schemaEnrichissement = z.object({
    src: z.string().default(''),
    srcKey: z.string().default(''),
    attr: z.string().default(''),
    col: z.string().default(''),
    as: z.string().default(''),
    viaSrc: z.string().default(''),
    viaIn: z.string().default(''),
    viaOut: z.string().default(''),
    validMode: z.enum(['', 'status', 'period']).default(''),
    vCol: z.string().default(''),
    vOp: z.enum(['eq', 'neq', 'contains', 'ncontains', 'starts', 'ends', 'empty', 'nempty', 'gt', 'gte', 'lt', 'lte']).default('eq'),
    vVal: z.string().default(''),
    vStart: z.string().default(''),
    vEnd: z.string().default('')
});
const schemaCleEtrangere = z.object({ attr: z.string().default(''), table: z.string().default(''), col: z.string().default('') });

export const schemaRecette = z.object({
    name: z.string().trim().min(1, 'nom de table requis').max(200),
    sources: z.array(schemaSourceContributrice).min(1, 'au moins une source'),
    attrs: z.array(z.string().trim().min(1)).min(1, 'au moins un attribut'),
    calcs: z.array(z.object({ name: z.string().default(''), formula: z.string().default('') })).default([]),
    key: z.array(z.string()).default([]),
    formats: z.record(z.string(), z.enum(['', 'int', 'dec', 'date', 'bool', 'code'])).default({}),
    joins: z.array(schemaEnrichissement).default([]),
    fks: z.array(schemaCleEtrangere).default([]),
    targetId: z.string().nullable().optional(),
    lastRows: z.number().optional(),
    lastBuild: z.string().optional(),
    lastConform: z.record(z.string(), z.number()).optional(),
    lastFk: z.array(z.unknown()).optional()
});
export type Recette = z.infer<typeof schemaRecette>;
export type FiltreSource = z.infer<typeof schemaFiltreSource>;
export type Enrichissement = z.infer<typeof schemaEnrichissement>;
export type CleEtrangere = z.infer<typeof schemaCleEtrangere>;

export type ContexteRecette = {
    /** Nom de table DuckDB d'une source désignée par son NOM lisible ; lève une erreur si elle est inconnue. */
    nomTableDe: (nomSource: string) => string;
    /** Colonnes d'une source désignée par son nom lisible. */
    colonnesDe: (nomSource: string) => string[];
};

export class ErreurRecette extends Error {}

const cleNormalisee = (expression: string) => `NULLIF(UPPER(TRIM(CAST(${expression} AS VARCHAR))), '')`;

/**
 * Expression de normalisation vers le format canonique ; NULL si la valeur est inconvertible. La source reste du
 * texte : dates en AAAA-MM-JJ, décimaux à point, booléens OUI/NON, codes en majuscules.
 */
export function expressionNormalisation(format: string, expression: string): string | null {
    const texte = `TRIM(${expression})`;
    switch (format) {
        case 'int':
            return `CAST(TRY_CAST(REPLACE(REPLACE(${texte}, ' ', ''), chr(160), '') AS BIGINT) AS VARCHAR)`;
        case 'dec':
            return `CAST(TRY_CAST(REPLACE(REPLACE(REPLACE(${texte}, ' ', ''), chr(160), ''), ',', '.') AS DOUBLE) AS VARCHAR)`;
        case 'date':
            return (
                'CAST(COALESCE(' +
                ['%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y', '%d.%m.%Y', '%Y/%m/%d']
                    .map(motif => `TRY_CAST(TRY_STRPTIME(${texte}, '${motif}') AS DATE)`)
                    .join(', ') +
                ') AS VARCHAR)'
            );
        case 'bool':
            return `CASE WHEN UPPER(${texte}) IN ('1','O','OUI','Y','YES','TRUE','VRAI') THEN 'OUI' WHEN UPPER(${texte}) IN ('0','N','NON','NO','FALSE','FAUX') THEN 'NON' ELSE NULL END`;
        case 'code':
            return `NULLIF(UPPER(${texte}), '')`;
        default:
            return null;
    }
}

const expressionDate = (expression: string) => `TRY_CAST(${expressionNormalisation('date', expression)} AS DATE)`;

/** Condition SQL d'un filtre d'entrée ; chaîne vide si le filtre est incomplet. `prefixe` qualifie la colonne (« lk. »). */
export function conditionFiltreSource(filtre: FiltreSource, prefixe = ''): string {
    if (!filtre.col || !filtre.op) return '';
    if (!['empty', 'nempty'].includes(filtre.op) && !String(filtre.val || '').length) return '';
    const colonne = prefixe + identifiantSql(filtre.col);
    const brut = `CAST(${colonne} AS VARCHAR)`;
    const valeur = litteralSql(filtre.val ?? '');
    switch (filtre.op) {
        case 'eq':
            return `${brut} = ${valeur}`;
        case 'neq':
            return `${brut} IS DISTINCT FROM ${valeur}`;
        case 'contains':
            return `${brut} ILIKE ${litteralSql('%' + filtre.val + '%')}`;
        case 'ncontains':
            return `(${brut} NOT ILIKE ${litteralSql('%' + filtre.val + '%')} OR ${colonne} IS NULL)`;
        case 'starts':
            return `${brut} ILIKE ${litteralSql(filtre.val + '%')}`;
        case 'ends':
            return `${brut} ILIKE ${litteralSql('%' + filtre.val)}`;
        case 'empty':
            return `(${colonne} IS NULL OR TRIM(${brut}) = '')`;
        case 'nempty':
            return `(${colonne} IS NOT NULL AND TRIM(${brut}) <> '')`;
        case 'gt':
        case 'gte':
        case 'lt':
        case 'lte': {
            const symbole = { gt: '>', gte: '>=', lt: '<', lte: '<=' }[filtre.op];
            // Une valeur au format date se compare en DATE (01/02/2025 ≡ 2025-02-01), sinon en nombre.
            if (/^\d{4}-\d{2}-\d{2}$/.test(filtre.val) || /^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}$/.test(filtre.val))
                return `COALESCE(${expressionDate(brut)}, CAST(TRY_CAST(${brut} AS TIMESTAMP) AS DATE)) ${symbole} ${expressionDate(valeur)}`;
            return `TRY_CAST(REPLACE(${brut}, ',', '.') AS DOUBLE) ${symbole} TRY_CAST(REPLACE(${valeur}, ',', '.') AS DOUBLE)`;
        }
    }
    return '';
}

/** Une formule de colonne calculée écrit les attributs entre crochets : [Prix] * [Quantité] → identifiants SQL. */
export function formuleEnSql(formule: string): string {
    return String(formule).replace(/\[([^\][]+)\]/g, (_, attribut: string) => identifiantSql(attribut.trim()));
}

/** Enrichissements complets (source, clé, accroche, colonne, nom) ; les autres sont ignorés. */
export function enrichissementsValides(recette: Recette): Enrichissement[] {
    return (recette.joins || []).filter(
        jointure =>
            jointure.src &&
            jointure.srcKey &&
            jointure.attr &&
            jointure.col &&
            String(jointure.as || '').trim() &&
            (!jointure.viaSrc || (jointure.viaIn && jointure.viaOut))
    );
}

/** Clés étrangères complètes (attribut, table, colonne). */
export function clesEtrangeresValides(recette: Recette): CleEtrangere[] {
    return (recette.fks || []).filter(cle => cle.attr && cle.table && cle.col);
}

/** Colonnes calculées complètes (nom et formule). */
export function calculsValides(recette: Recette): { name: string; formula: string }[] {
    return (recette.calcs || []).filter(calcul => calcul.name && String(calcul.formula || '').trim());
}

/** Noms de toutes les colonnes produites (attributs, enrichissements, calculs), dans l'ordre. */
export function colonnesProduites(recette: Recette): string[] {
    return [
        ...recette.attrs,
        ...enrichissementsValides(recette).map(jointure => jointure.as.trim()),
        ...calculsValides(recette).map(calcul => calcul.name)
    ];
}

/** Vérifie la cohérence d'une recette avant construction ; lève une ErreurRecette explicite. */
export function verifierRecette(recette: Recette): void {
    const noms = colonnesProduites(recette);
    const reserve = noms.find(nom => nom === COLONNE_ORIGINE || nom === COLONNE_NUMERO_LIGNE);
    if (reserve) throw new ErreurRecette(`Le nom d'attribut « ${reserve} » est réservé.`);
    const doublon = noms.find((nom, position) => noms.indexOf(nom) !== position);
    if (doublon)
        throw new ErreurRecette(
            `Nom d'attribut en double : « ${doublon} » (attribut, calcul et enrichissement doivent avoir des noms distincts).`
        );
    const cleInconnue = (recette.key || []).find(attribut => !recette.attrs.includes(attribut));
    if (cleInconnue) throw new ErreurRecette(`La clé cite un attribut inconnu : « ${cleInconnue} ».`);
}

/** Branche UNION ALL d'une source contributrice : colonne d'origine + un attribut par colonne, filtres d'entrée. */
function sqlBrancheSource(source: Recette['sources'][number], recette: Recette, contexte: ContexteRecette): string {
    const colonnesSource = contexte.colonnesDe(source.src);
    const colonnes = recette.attrs.map(attribut =>
        source.map[attribut] && colonnesSource.includes(source.map[attribut])
            ? `CAST(${identifiantSql(source.map[attribut])} AS VARCHAR) AS ${identifiantSql(attribut)}`
            : `CAST(NULL AS VARCHAR) AS ${identifiantSql(attribut)}`
    );
    const conditions = (source.filters || []).map(filtre => conditionFiltreSource(filtre)).filter(Boolean);
    return (
        `SELECT ${litteralSql(source.src)} AS ${identifiantSql(COLONNE_ORIGINE)}, ${colonnes.join(', ')} ` +
        `FROM ${identifiantSql(contexte.nomTableDe(source.src))}${conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''}`
    );
}

/** Applique les formats déclarés : une valeur inconvertible est conservée telle quelle (et comptée non conforme). */
function sqlAvecFormats(sql: string, recette: Recette): string {
    const formats = recette.formats || {};
    if (!recette.attrs.some(attribut => formats[attribut] && expressionNormalisation(formats[attribut], 'x'))) return sql;
    const colonnes = [identifiantSql(COLONNE_ORIGINE)].concat(
        recette.attrs.map(attribut => {
            const normalisee = formats[attribut]
                ? expressionNormalisation(formats[attribut], `CAST(${identifiantSql(attribut)} AS VARCHAR)`)
                : null;
            return normalisee
                ? `COALESCE(${normalisee}, CAST(${identifiantSql(attribut)} AS VARCHAR)) AS ${identifiantSql(attribut)}`
                : identifiantSql(attribut);
        })
    );
    return `SELECT ${colonnes.join(', ')} FROM (\n${sql}\n) n0`;
}

/** Condition de validité des lignes d'une source d'enrichissement (statut ou période active), préfixée par l'alias. */
function conditionValidite(jointure: Enrichissement, alias: string): string {
    if (jointure.validMode === 'status' && jointure.vCol) {
        const condition = conditionFiltreSource({ col: jointure.vCol, op: jointure.vOp || 'eq', val: jointure.vVal || '' }, alias + '.');
        return condition ? ' AND ' + condition : '';
    }
    if (jointure.validMode === 'period' && jointure.vStart) {
        let condition = ` AND ${expressionDate(`CAST(${alias}.${identifiantSql(jointure.vStart)} AS VARCHAR)`)} <= CURRENT_DATE`;
        if (jointure.vEnd)
            condition += ` AND (${alias}.${identifiantSql(jointure.vEnd)} IS NULL OR TRIM(CAST(${alias}.${identifiantSql(jointure.vEnd)} AS VARCHAR)) = '' OR ${expressionDate(`CAST(${alias}.${identifiantSql(jointure.vEnd)} AS VARCHAR)`)} >= CURRENT_DATE)`;
        return condition;
    }
    return '';
}

type GroupeEnrichissement = { src: string; srcKey: string; attr: string; colonnes: { col: string; as: string }[]; premier: Enrichissement };

/** Regroupe les enrichissements qui partagent source, clé et accroche (un seul LEFT JOIN pour plusieurs colonnes). */
function grouperEnrichissements(jointures: Enrichissement[]): GroupeEnrichissement[] {
    const groupes = new Map<string, GroupeEnrichissement>();
    jointures.forEach((jointure, position) => {
        const cle = jointure.viaSrc || jointure.validMode ? 'u' + position : jointure.src + '|' + jointure.srcKey + '|' + jointure.attr;
        if (!groupes.has(cle))
            groupes.set(cle, { src: jointure.src, srcKey: jointure.srcKey, attr: jointure.attr, colonnes: [], premier: jointure });
        groupes.get(cle)!.colonnes.push({ col: jointure.col, as: jointure.as.trim() });
    });
    return [...groupes.values()];
}

/** Sous-requête d'un enrichissement : une ligne par clé normalisée (__k), colonnes ramenées en VARCHAR. */
function sqlSousRequeteEnrichissement(groupe: GroupeEnrichissement, contexte: ContexteRecette): string {
    const cible = identifiantSql(contexte.nomTableDe(groupe.src));
    const premier = groupe.premier;
    const colonnesRamenees = (alias: string) =>
        groupe.colonnes
            .map(colonne => `CAST(${alias}.${identifiantSql(colonne.col)} AS VARCHAR) AS ${identifiantSql(colonne.as)}`)
            .join(', ');
    if (premier.viaSrc) {
        // Deux sauts : table → table de lien (lignes valides seulement) → cible.
        const lien = identifiantSql(contexte.nomTableDe(premier.viaSrc));
        const cleLien = cleNormalisee('lk.' + identifiantSql(premier.viaIn));
        const ordre =
            premier.validMode === 'period' && premier.vStart
                ? `${expressionDate(`CAST(lk.${identifiantSql(premier.vStart)} AS VARCHAR)`)} DESC NULLS LAST`
                : `lk.${identifiantSql(premier.viaIn)}`;
        return (
            `SELECT ${cleLien} AS __k, ${colonnesRamenees('tg')} FROM ${lien} lk JOIN ${cible} tg ` +
            `ON ${cleNormalisee('tg.' + identifiantSql(groupe.srcKey))} = ${cleNormalisee('lk.' + identifiantSql(premier.viaOut))} ` +
            `WHERE ${cleLien} IS NOT NULL${conditionValidite(premier, 'lk')} ` +
            `QUALIFY row_number() OVER (PARTITION BY ${cleLien} ORDER BY ${ordre}) = 1`
        );
    }
    // Jointure directe : validité optionnelle ; en période, la ligne la plus récente est retenue.
    const cleCible = `COALESCE(UPPER(TRIM(CAST(t0.${identifiantSql(groupe.srcKey)} AS VARCHAR))), chr(2))`;
    const ordre =
        premier.validMode === 'period' && premier.vStart
            ? `${expressionDate(`CAST(t0.${identifiantSql(premier.vStart)} AS VARCHAR)`)} DESC NULLS LAST`
            : '__k';
    return (
        `SELECT ${cleCible} AS __k, ${colonnesRamenees('t0')} FROM ${cible} t0 WHERE 1=1${conditionValidite(premier, 't0')} ` +
        `QUALIFY row_number() OVER (PARTITION BY ${cleCible} ORDER BY ${ordre}) = 1`
    );
}

/**
 * Applique les enrichissements EN COUCHES successives : chacun est joint sur le résultat des précédents, si bien
 * que son attribut d'accroche peut être une colonne ramenée par un enrichissement antérieur (chaînage).
 */
function sqlAvecEnrichissements(sql: string, recette: Recette, contexte: ContexteRecette): string {
    let numero = 0;
    for (const groupe of grouperEnrichissements(enrichissementsValides(recette))) {
        const alias = 'e' + ++numero;
        const accroche = `COALESCE(UPPER(TRIM(CAST(u.${identifiantSql(groupe.attr)} AS VARCHAR))), chr(3))`;
        sql =
            `SELECT u.*, ${groupe.colonnes.map(colonne => alias + '.' + identifiantSql(colonne.as)).join(', ')} FROM (\n${sql}\n) u\n` +
            `LEFT JOIN (${sqlSousRequeteEnrichissement(groupe, contexte)}) ${alias} ON ${accroche} = ${alias}.__k`;
    }
    return sql;
}

/** Dédoublonnage : même clé + contenu strictement identique → une seule ligne ; les divergences restent. */
function sqlAvecDedoublonnage(sql: string, recette: Recette): string {
    if (!(recette.key || []).length) return sql;
    const empreinteLigne = `md5(concat_ws(chr(1), ${colonnesProduites(recette)
        .map(colonne => `COALESCE(CAST(${identifiantSql(colonne)} AS VARCHAR), chr(0))`)
        .join(', ')}))`;
    return `SELECT * FROM (\n${sql}\n) w QUALIFY row_number() OVER (PARTITION BY ${expressionCle(recette.key)}, ${empreinteLigne} ORDER BY ${identifiantSql(COLONNE_ORIGINE)}) = 1`;
}

/** Clé composée normalisée (majuscules, sans espaces), utilisée pour dédoublonner et pour le rapport d'écarts. */
export function expressionCle(cle: string[], separateur = 'chr(1)'): string {
    return cle.map(attribut => `COALESCE(UPPER(TRIM(CAST(${identifiantSql(attribut)} AS VARCHAR))), '')`).join(` || ${separateur} || `);
}

/** Requête complète (sans numéro de ligne) qui produit le contenu de la table conçue. */
export function construireSqlTableConcue(recette: Recette, contexte: ContexteRecette): string {
    verifierRecette(recette);
    let sql = recette.sources.map(source => sqlBrancheSource(source, recette, contexte)).join('\nUNION ALL\n');
    sql = sqlAvecFormats(sql, recette);
    sql = sqlAvecEnrichissements(sql, recette, contexte);
    const calculs = calculsValides(recette);
    if (calculs.length)
        sql = `SELECT *, ${calculs.map(calcul => `(${formuleEnSql(calcul.formula)}) AS ${identifiantSql(calcul.name)}`).join(', ')} FROM (\n${sql}\n) c`;
    return sqlAvecDedoublonnage(sql, recette);
}

/** Requête de comptage des valeurs restées non conformes au format déclaré, attribut par attribut. */
export function sqlNonConformes(nomTable: string, recette: Recette): { attributs: string[]; sql: string } | null {
    const formats = recette.formats || {};
    const attributs = recette.attrs.filter(attribut => formats[attribut] && expressionNormalisation(formats[attribut], 'x'));
    if (!attributs.length) return null;
    const expressions = attributs.map((attribut, position) => {
        const brut = `CAST(${identifiantSql(attribut)} AS VARCHAR)`;
        return `SUM(CASE WHEN ${identifiantSql(attribut)} IS NOT NULL AND TRIM(${brut}) <> '' AND ${expressionNormalisation(formats[attribut], brut)} IS NULL THEN 1 ELSE 0 END)::BIGINT AS f${position}`;
    });
    return { attributs, sql: `SELECT ${expressions.join(', ')} FROM ${identifiantSql(nomTable)}` };
}

/** Nombre de valeurs d'un attribut absentes de la colonne cible (orphelins d'une clé étrangère). */
export function sqlOrphelins(nomTable: string, attribut: string, nomTableCible: string, colonneCible: string): string {
    const valeur = cleNormalisee(identifiantSql(attribut));
    const cible = cleNormalisee(identifiantSql(colonneCible));
    return `SELECT COUNT(*)::BIGINT FROM ${identifiantSql(nomTable)} WHERE ${valeur} IS NOT NULL AND ${valeur} NOT IN (SELECT ${cible} FROM ${identifiantSql(nomTableCible)} WHERE ${cible} IS NOT NULL)`;
}

/**
 * Rapport d'écarts entre sources : clés partagées dont les attributs (hors clé) diffèrent.
 * `nombreCles` compte les clés divergentes ; `ecartsDe(attribut, limite)` liste (clé, source, valeur) pour un attribut.
 */
export function sqlEcarts(
    nomTable: string,
    recette: Recette,
    attributs: string[]
): { nombreCles: string; ecartsDe: (attribut: string, limite: number) => string } {
    const table = identifiantSql(nomTable);
    const cle = expressionCle(recette.key, "' | '");
    const cleAffichee = recette.key.map(attribut => `COALESCE(CAST(${identifiantSql(attribut)} AS VARCHAR), '')`).join(" || ' | ' || ");
    const empreinte = `md5(concat_ws(chr(1), ${attributs.map(attribut => `COALESCE(CAST(${identifiantSql(attribut)} AS VARCHAR), chr(0))`).join(', ')}))`;
    return {
        nombreCles: `SELECT COUNT(*)::BIGINT FROM (SELECT ${cle} AS k FROM ${table} GROUP BY 1 HAVING COUNT(DISTINCT ${empreinte}) > 1) s`,
        ecartsDe: (attribut, limite) => {
            const valeurNormalisee = `COALESCE(UPPER(TRIM(CAST(${identifiantSql(attribut)} AS VARCHAR))), chr(2))`;
            const clesDivergentes = `SELECT ${cle} FROM ${table} GROUP BY 1 HAVING COUNT(DISTINCT ${valeurNormalisee}) > 1`;
            return (
                `SELECT ${cleAffichee} AS cle, ${identifiantSql(COLONNE_ORIGINE)} AS source, COALESCE(CAST(${identifiantSql(attribut)} AS VARCHAR), '') AS valeur ` +
                `FROM ${table} WHERE ${cle} IN (${clesDivergentes}) ORDER BY cle, source LIMIT ${Math.max(1, Math.floor(limite))}`
            );
        }
    };
}

/** Contribution de chaque source : lignes, part et complétude moyenne des attributs. */
export function sqlContributions(nomTable: string, colonnes: string[]): string {
    const attributs = colonnes.filter(colonne => colonne !== COLONNE_ORIGINE && colonne !== COLONNE_NUMERO_LIGNE);
    const remplies = attributs
        .map(
            attribut =>
                `SUM(CASE WHEN ${identifiantSql(attribut)} IS NOT NULL AND TRIM(CAST(${identifiantSql(attribut)} AS VARCHAR)) <> '' THEN 1 ELSE 0 END)`
        )
        .join(' + ');
    const completude = attributs.length ? `((${remplies})::DOUBLE / (COUNT(*) * ${attributs.length}))` : '1.0';
    return `SELECT ${identifiantSql(COLONNE_ORIGINE)} AS source, COUNT(*)::BIGINT AS lignes, ${completude} AS completude FROM ${identifiantSql(nomTable)} GROUP BY 1 ORDER BY lignes DESC`;
}
