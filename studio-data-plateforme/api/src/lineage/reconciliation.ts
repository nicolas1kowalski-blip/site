/**
 * Réconciliation d'une alimentation table → table : pour chaque clé partagée, la valeur maître (source) est
 * comparée à la valeur aval (cible) attribut par attribut, après transformation éventuelle (agrégat, arrondi,
 * facteur, majuscules…). On mesure les lignes en écart, les clés manquantes en aval et quelques exemples.
 * Fonctions pures : le SQL est produit ici, exécuté par le service.
 */
import { identifiantSql } from '../espaces/moteur-duckdb';
import { PaireAttributs } from './flux';

export const TRANSFORMATIONS_AGREGAT = { sum: 'somme', avg: 'moyenne', min: 'minimum', max: 'maximum', count: 'nombre' } as const;
export const TRANSFORMATIONS_SCALAIRES = {
    none: 'aucune',
    round: 'arrondi',
    factor: 'facteur',
    abs: 'valeur absolue',
    upper: 'MAJUSCULES',
    lower: 'minuscules'
} as const;

/** Clé normalisée (majuscules, sans espaces, vide = NULL) d'une colonne d'une table aliasée. */
export function expressionCle(alias: string, colonne: string): string {
    return `NULLIF(UPPER(TRIM(CAST(${alias}.${identifiantSql(colonne)} AS VARCHAR))), '')`;
}

/** Expressions de valeur maître (mv) et aval (dv) d'une paire, prêtes pour un GROUP BY par clé. */
export function expressionsPaire(paire: PaireAttributs): { maitre: string; aval: string } {
    const source = 'a.' + identifiantSql(paire.src);
    const cible = 'b.' + identifiantSql(paire.tgt);
    const transformation = paire.xform || { kind: 'none' };
    if (transformation.kind === 'agg') {
        const fonction = { sum: 'SUM', avg: 'AVG', min: 'MIN', max: 'MAX', count: 'COUNT' }[transformation.fn || 'sum'] || 'SUM';
        const maitre =
            transformation.fn === 'count' ? 'ROUND(COUNT(*)::DOUBLE, 4)' : `ROUND(${fonction}(TRY_CAST(${source} AS DOUBLE)), 4)`;
        return { maitre, aval: `ROUND(MIN(TRY_CAST(${cible} AS DOUBLE)), 4)` };
    }
    let numerique = false;
    let decimales = 4;
    let expressionMaitre = `NULLIF(TRIM(CAST(${source} AS VARCHAR)), '')`;
    if (transformation.kind === 'scalar') {
        const parametre = String(transformation.param ?? '');
        switch (transformation.op) {
            case 'round':
                decimales = parseInt(parametre, 10) || 0;
                numerique = true;
                expressionMaitre = `ROUND(TRY_CAST(${source} AS DOUBLE), ${decimales})`;
                break;
            case 'factor':
                numerique = true;
                expressionMaitre = `ROUND(TRY_CAST(${source} AS DOUBLE) * ${parseFloat(parametre) || 1}, 4)`;
                break;
            case 'abs':
                numerique = true;
                expressionMaitre = `ROUND(ABS(TRY_CAST(${source} AS DOUBLE)), 4)`;
                break;
            case 'upper':
                expressionMaitre = `UPPER(TRIM(CAST(${source} AS VARCHAR)))`;
                break;
            case 'lower':
                expressionMaitre = `LOWER(TRIM(CAST(${source} AS VARCHAR)))`;
                break;
        }
    }
    const expressionAval = numerique ? `ROUND(TRY_CAST(${cible} AS DOUBLE), ${decimales})` : `NULLIF(TRIM(CAST(${cible} AS VARCHAR)), '')`;
    return { maitre: `MIN(${expressionMaitre})`, aval: `MIN(${expressionAval})` };
}

/** Requêtes de réconciliation : synthèse (lignes, écarts par paire, écarts toutes paires), clés manquantes, exemples d'une paire. */
export function sqlReconciliation(
    tableSource: string,
    tableCible: string,
    cleSource: string,
    cleCible: string,
    paires: PaireAttributs[]
): { synthese: string; manquants: string; exemples: (position: number) => string } {
    const source = identifiantSql(tableSource);
    const cible = identifiantSql(tableCible);
    const cleA = expressionCle('a', cleSource);
    const cleB = expressionCle('b', cleCible);
    const colonnesMaitre = paires.map((paire, position) => `${expressionsPaire(paire).maitre} AS mv${position}`).join(', ');
    const colonnesAval = paires.map((paire, position) => `${expressionsPaire(paire).aval} AS dv${position}`).join(', ');
    const base = `WITH m AS (SELECT ${cleA} AS k, ${colonnesMaitre} FROM ${source} a WHERE ${cleA} IS NOT NULL GROUP BY 1), d AS (SELECT ${cleB} AS k, ${colonnesAval} FROM ${cible} b WHERE ${cleB} IS NOT NULL GROUP BY 1)`;
    const ecartsParPaire = paires
        .map((_, position) => `COUNT(*) FILTER (WHERE m.mv${position} IS DISTINCT FROM d.dv${position})::BIGINT AS d${position}`)
        .join(', ');
    const unEcart = paires.map((_, position) => `m.mv${position} IS DISTINCT FROM d.dv${position}`).join(' OR ');
    return {
        synthese: `${base} SELECT COUNT(*)::BIGINT AS lignes, ${ecartsParPaire}, COUNT(*) FILTER (WHERE ${unEcart})::BIGINT AS dany FROM m JOIN d USING (k)`,
        manquants: `SELECT COUNT(*)::BIGINT FROM (SELECT DISTINCT ${cleA} AS k FROM ${source} a WHERE ${cleA} IS NOT NULL) s WHERE k NOT IN (SELECT ${cleB} FROM ${cible} b WHERE ${cleB} IS NOT NULL)`,
        exemples: position =>
            `${base} SELECT k, m.mv${position} AS av, d.dv${position} AS bv FROM m JOIN d USING (k) WHERE m.mv${position} IS DISTINCT FROM d.dv${position} ORDER BY k LIMIT 8`
    };
}
