/**
 * Recettes de préparation (nettoyage reproductible) : une source, une liste ordonnée d'étapes, une table
 * produite. Fonctions pures : la recette devient une requête SQL DuckDB, déterministe (même entrée → même
 * sortie). Le format est celui de l'application classique (champs en anglais : src, out, steps[{type, p}]).
 *
 * Étapes : filter (filtrer les lignes), clean (nettoyer un texte), normalize (format canonique), std
 * (standardiser téléphone / email), enrich (référentiel embarqué), calc (colonne calculée), dedup
 * (dédoublonner sur une clé), rename (renommer), drop (supprimer des colonnes).
 */
import { z } from 'zod';
import { identifiantSql, litteralSql } from '../espaces/moteur-duckdb';
import { conditionFiltreSource, expressionNormalisation, formuleEnSql } from '../tables-concues/constructeur-table-concue';
import { REFERENTIELS } from './referentiels';

export const TYPES_ETAPE = {
    filter: 'Filtrer',
    clean: 'Nettoyer',
    normalize: 'Normaliser (format)',
    std: 'Standardiser (téléphone / email)',
    enrich: 'Enrichir (référentiel)',
    calc: 'Colonne calculée',
    dedup: 'Dédoublonner',
    rename: 'Renommer',
    drop: 'Supprimer des colonnes'
} as const;
export type TypeEtape = keyof typeof TYPES_ETAPE;

export const ACTIONS_NETTOYAGE = {
    trim: 'espaces début / fin',
    upper: 'MAJUSCULES',
    lower: 'minuscules',
    noaccents: 'sans accents',
    squeeze: 'espaces multiples → un seul'
} as const;

export const FORMATS_NORMALISATION = {
    date: 'date → AAAA-MM-JJ',
    dec: 'décimal (1 234,5 → 1234.5)',
    int: 'entier',
    code: 'code (MAJUSCULES, sans espaces)',
    bool: 'booléen (OUI / NON)'
} as const;

export const STANDARDISATIONS = { phone: 'téléphone → +33…', email: 'email → minuscules' } as const;

const schemaEtape = z.object({
    id: z.string().min(1),
    type: z.enum(Object.keys(TYPES_ETAPE) as [TypeEtape, ...TypeEtape[]]),
    enabled: z.boolean().default(true),
    p: z.record(z.string(), z.unknown()).default({}),
    lastMatch: z.number().nullable().optional()
});

export const schemaRecettePreparation = z.object({
    name: z.string().trim().min(1, 'nom requis'),
    src: z.string().default(''),
    out: z.string().trim().default(''),
    steps: z.array(schemaEtape).default([]),
    targetId: z.string().nullable().optional(),
    lastRows: z.number().nullable().optional(),
    lastAt: z.number().nullable().optional()
});
export type RecettePreparation = z.infer<typeof schemaRecettePreparation> & { id: string };
export type EtapePreparation = z.infer<typeof schemaEtape>;

const texte = (valeur: unknown) => (valeur == null ? '' : String(valeur));
const liste = (valeur: unknown) =>
    texte(valeur)
        .split(';')
        .map(element => element.trim())
        .filter(Boolean);

/** Valeurs d'un référentiel embarqué sous forme de table SQL (VALUES … AS ref(colonnes)). */
export function sqlReferentiel(cle: string): string | null {
    const referentiel = REFERENTIELS[cle];
    if (!referentiel) return null;
    const lignes = referentiel.rows.map(ligne => `(${ligne.map(litteralSql).join(', ')})`).join(', ');
    return `(VALUES ${lignes}) AS ref(${referentiel.cols.map(identifiantSql).join(', ')})`;
}

/** Colonne standardisée : téléphone français au format +33, ou email en minuscules. */
function expressionStandardisation(quoi: string, colonne: string, brut: string): string {
    if (quoi === 'email') return `LOWER(TRIM(${brut}))`;
    const chiffres = `regexp_replace(${brut}, '[^0-9]', '', 'g')`;
    return (
        `CASE WHEN ${colonne} IS NULL OR TRIM(${brut}) = '' THEN ${brut}` +
        ` WHEN length(${chiffres}) = 10 AND substr(${chiffres}, 1, 1) = '0' THEN '+33' || substr(${chiffres}, 2)` +
        ` WHEN length(${chiffres}) = 11 AND substr(${chiffres}, 1, 2) = '33' THEN '+' || ${chiffres}` +
        ` WHEN length(${chiffres}) = 13 AND substr(${chiffres}, 1, 4) = '0033' THEN '+33' || substr(${chiffres}, 5)` +
        ` WHEN substr(TRIM(${brut}), 1, 1) = '+' THEN '+' || ${chiffres} ELSE ${brut} END`
    );
}

function expressionNettoyage(action: string, brut: string): string {
    switch (action) {
        case 'upper':
            return `UPPER(${brut})`;
        case 'lower':
            return `LOWER(${brut})`;
        case 'noaccents':
            return `strip_accents(${brut})`;
        case 'squeeze':
            return `regexp_replace(TRIM(${brut}), ' +', ' ', 'g')`;
        default:
            return `TRIM(${brut})`;
    }
}

/** SQL d'une étape appliquée à la requête courante ; null si l'étape est incomplète (elle est alors ignorée). */
export function sqlEtape(etape: EtapePreparation, sqlEntree: string): string | null {
    const parametres = etape.p || {};
    const nomColonne = texte(parametres['col']);
    const colonne = nomColonne ? identifiantSql(nomColonne) : null;
    const brut = colonne ? `CAST(${colonne} AS VARCHAR)` : null;
    const source = `(\n${sqlEntree}\n) q`;
    switch (etape.type) {
        case 'filter': {
            const condition = conditionFiltreSource({
                col: nomColonne,
                op: texte(parametres['op']) as never,
                val: texte(parametres['val'])
            });
            return condition ? `SELECT * FROM ${source} WHERE ${condition}` : null;
        }
        case 'clean':
            return colonne
                ? `SELECT * REPLACE (${expressionNettoyage(texte(parametres['action']), brut!)} AS ${colonne}) FROM ${source}`
                : null;
        case 'normalize': {
            const normalisee = colonne ? expressionNormalisation(texte(parametres['fmt']), brut!) : null;
            return normalisee ? `SELECT * REPLACE (COALESCE(${normalisee}, ${brut}) AS ${colonne}) FROM ${source}` : null;
        }
        case 'std':
            return colonne
                ? `SELECT * REPLACE (${expressionStandardisation(texte(parametres['what']) || 'phone', colonne, brut!)} AS ${colonne}) FROM ${source}`
                : null;
        case 'enrich': {
            const referentiel = REFERENTIELS[texte(parametres['ref'])];
            const valeurs = sqlReferentiel(texte(parametres['ref']));
            if (!colonne || !referentiel || !valeurs) return null;
            const normaliser = (expression: string) => `NULLIF(UPPER(TRIM(CAST(${expression} AS VARCHAR))), '')`;
            const ajoutees = referentiel.cols
                .filter(nom => nom !== referentiel.key)
                .map(nom => `ref.${identifiantSql(nom)} AS ${identifiantSql(texte(parametres['prefix']) + nom)}`);
            return `SELECT q.*, ${ajoutees.join(', ')} FROM ${source} LEFT JOIN ${valeurs} ON ${normaliser('q.' + colonne)} = ${normaliser('ref.' + identifiantSql(referentiel.key))}`;
        }
        case 'calc': {
            const nom = texte(parametres['name']).trim();
            const formule = texte(parametres['formula']).trim();
            return nom && formule ? `SELECT *, (${formuleEnSql(formule)}) AS ${identifiantSql(nom)} FROM ${source}` : null;
        }
        case 'dedup': {
            const cles = liste(parametres['keys']);
            if (!cles.length) return null;
            const cle = cles.map(nom => `COALESCE(UPPER(TRIM(CAST(${identifiantSql(nom)} AS VARCHAR))), '')`).join(` || chr(1) || `);
            return `SELECT * FROM ${source} QUALIFY row_number() OVER (PARTITION BY ${cle} ORDER BY md5(CAST(q AS VARCHAR))) = 1`;
        }
        case 'rename': {
            const nouveau = texte(parametres['to']).trim();
            return colonne && nouveau ? `SELECT * RENAME (${colonne} AS ${identifiantSql(nouveau)}) FROM ${source}` : null;
        }
        case 'drop': {
            const colonnes = liste(parametres['cols']);
            return colonnes.length ? `SELECT * EXCLUDE (${colonnes.map(identifiantSql).join(', ')}) FROM ${source}` : null;
        }
        default:
            return null;
    }
}

/**
 * SQL complet d'une recette sur la table DuckDB de sa source, jusqu'à l'étape d'indice `jusquA` incluse
 * (toutes les étapes actives si omis). Les étapes désactivées ou incomplètes sont sautées.
 */
export function sqlRecettePreparation(recette: Pick<RecettePreparation, 'steps'>, nomTableSource: string, jusquA?: number): string {
    let sql = `SELECT * EXCLUDE (__rn) FROM ${identifiantSql(nomTableSource)}`;
    const etapes = recette.steps.filter(etape => etape.enabled);
    const limite = jusquA == null ? etapes.length : Math.min(jusquA + 1, etapes.length);
    for (const etape of etapes.slice(0, limite)) sql = sqlEtape(etape, sql) ?? sql;
    return sql;
}

/** Les étapes d'enrichissement complètes : on mesure leur taux d'appariement après exécution. */
export function etapesEnrichissement(recette: Pick<RecettePreparation, 'steps'>): EtapePreparation[] {
    return recette.steps.filter(etape => etape.enabled && etape.type === 'enrich' && texte(etape.p?.['ref']) && texte(etape.p?.['col']));
}

/** SQL du taux d'appariement d'un enrichissement : lignes renseignées, lignes appariées. */
export function sqlTauxAppariement(nomTable: string, etape: EtapePreparation): string | null {
    const referentiel = REFERENTIELS[texte(etape.p?.['ref'])];
    if (!referentiel) return null;
    const premiereAjoutee = referentiel.cols.find(nom => nom !== referentiel.key)!;
    const colonneAjoutee = identifiantSql(texte(etape.p?.['prefix']) + premiereAjoutee);
    const colonne = identifiantSql(texte(etape.p?.['col']));
    return (
        `SELECT COUNT(*)::BIGINT AS n, SUM(CASE WHEN ${colonneAjoutee} IS NOT NULL THEN 1 ELSE 0 END)::BIGINT AS m` +
        ` FROM ${identifiantSql(nomTable)} WHERE ${colonne} IS NOT NULL AND TRIM(CAST(${colonne} AS VARCHAR)) <> ''`
    );
}
