/**
 * Fonctions avancées du constructeur d'extraction, reprises de l'application classique :
 *   • colonnes calculées « façon tableur » : une formule où les colonnes s'écrivent entre crochets,
 *     [colonne] ou [table.colonne], le reste étant du SQL DuckDB (opérateurs, fonctions, CASE WHEN) ;
 *   • synthèses d'une table liée : compter, compter les distincts, lister les valeurs ou ramener les
 *     N premières valeurs d'une table « enfant », sans multiplier les lignes (sous-requête corrélée) ;
 *   • hiérarchies aplaties : à partir d'une colonne identifiant et d'une colonne parent, chaque niveau
 *     devient une colonne (CTE récursive) ;
 *   • filtre sur une liste fournie : garder (ou exclure) les lignes dont la valeur est dans la liste.
 * Fonctions pures : elles reçoivent les alias SQL déjà attribués et rendent des morceaux de requête.
 */
import { identifiantSql, litteralSql } from '../espaces/moteur-duckdb';

export const MODES_SYNTHESE = {
    count: 'nombre de lignes liées',
    countd: 'nombre de valeurs distinctes',
    values: 'valeurs distinctes (liste)',
    first: 'N premières valeurs (une colonne par valeur)'
} as const;
export type ModeSynthese = keyof typeof MODES_SYNTHESE;

export type Synthese = {
    tableId: string;
    deTableId: string;
    deColonne: string;
    versColonne: string;
    mode: ModeSynthese;
    nomColonne: string;
    n: number;
};
export type Hierarchie = { idColonne: string; parentColonne: string; attributs: string[]; profondeur: number };

export class ErreurFormule extends Error {}

/** Clé de jointure normalisée : sans casse ni espaces, vide devient NULL (comme l'application classique). */
export const cleNormalisee = (expression: string) => `NULLIF(UPPER(TRIM(CAST(${expression} AS VARCHAR))), '')`;

/**
 * Traduit une formule en SQL : chaque [référence] devient l'expression SQL rendue par `resoudre`, qui reçoit
 * le texte entre crochets (« ville » ou « commandes.montant ») et renvoie null s'il ne le connaît pas.
 */
export function formuleEnSql(formule: string, resoudre: (reference: string) => string | null): string {
    const texte = String(formule || '').trim();
    if (!texte) throw new ErreurFormule('Formule vide.');
    return texte.replace(/\[([^\][]+)\]/g, (_, reference: string) => {
        const expression = resoudre(reference.trim());
        if (!expression) throw new ErreurFormule(`Colonne inconnue dans la formule : « ${reference.trim()} ».`);
        return expression;
    });
}

/**
 * Expressions d'une synthèse : une seule pour count / countd / values, N pour « premières valeurs ».
 * `nomTableEnfant` est la table DuckDB résumée, `expressionParent` la clé côté table présente.
 */
export function expressionsSynthese(
    synthese: Synthese,
    nomTableEnfant: string,
    expressionParent: string,
    aliasSortie: string
): { expression: string; alias: string }[] {
    const table = identifiantSql(nomTableEnfant);
    const condition = `${cleNormalisee('s.' + identifiantSql(synthese.versColonne))} = ${cleNormalisee(expressionParent)}`;
    const colonne = synthese.nomColonne ? `TRIM(CAST(s.${identifiantSql(synthese.nomColonne)} AS VARCHAR))` : null;
    switch (synthese.mode) {
        case 'count':
            return [{ expression: `(SELECT COUNT(*) FROM ${table} s WHERE ${condition})`, alias: aliasSortie }];
        case 'countd':
            if (!colonne) throw new ErreurFormule('Synthèse « valeurs distinctes » : choisissez la colonne à compter.');
            return [
                {
                    expression: `(SELECT COUNT(DISTINCT ${cleNormalisee('s.' + identifiantSql(synthese.nomColonne))}) FROM ${table} s WHERE ${condition})`,
                    alias: aliasSortie
                }
            ];
        case 'values':
            if (!colonne) throw new ErreurFormule('Synthèse « liste des valeurs » : choisissez la colonne à lister.');
            return [
                {
                    expression: `(SELECT string_agg(DISTINCT NULLIF(${colonne}, ''), ' | ') FROM ${table} s WHERE ${condition})`,
                    alias: aliasSortie
                }
            ];
        case 'first': {
            if (!colonne) throw new ErreurFormule('Synthèse « premières valeurs » : choisissez la colonne à ramener.');
            const nombre = Math.max(1, Math.min(12, synthese.n || 3));
            return Array.from({ length: nombre }, (_, position) => ({
                expression: `(SELECT ${colonne} FROM ${table} s WHERE ${condition} ORDER BY s."__rn" LIMIT 1 OFFSET ${position})`,
                alias: `${aliasSortie}_${position + 1}`
            }));
        }
    }
}

/**
 * CTE récursive d'une hiérarchie : `nomCte(k, chain)` où k est l'identifiant normalisé et chain la liste des
 * étiquettes de la racine jusqu'à la ligne (un scalaire par niveau, ou un struct {a0, a1…} si plusieurs attributs).
 */
export function cteHierarchie(nomCte: string, nomTable: string, hierarchie: Hierarchie): string {
    const table = identifiantSql(nomTable);
    const identifiant = identifiantSql(hierarchie.idColonne);
    const parent = identifiantSql(hierarchie.parentColonne);
    const attributs = hierarchie.attributs.length ? hierarchie.attributs : [hierarchie.idColonne];
    const etiquette = (alias: string) =>
        attributs.length > 1
            ? `{ ${attributs.map((attribut, index) => `'a${index}': TRIM(CAST(${alias}.${identifiantSql(attribut)} AS VARCHAR))`).join(', ')} }`
            : `TRIM(CAST(${alias}.${identifiantSql(attributs[0])} AS VARCHAR))`;
    const profondeur = Math.max(1, Math.min(20, hierarchie.profondeur || 5));
    return (
        `${nomCte}(k, chain) AS (\n` +
        `  SELECT ${cleNormalisee('t.' + identifiant)}, [${etiquette('t')}] FROM ${table} t WHERE t.${parent} IS NULL OR TRIM(CAST(t.${parent} AS VARCHAR)) = ''\n` +
        `  UNION ALL\n` +
        `  SELECT ${cleNormalisee('c.' + identifiant)}, list_append(p.chain, ${etiquette('c')}) FROM ${table} c JOIN ${nomCte} p ON ${cleNormalisee('c.' + parent)} = p.k` +
        ` WHERE len(p.chain) < ${profondeur} AND NOT list_contains(p.chain, ${etiquette('c')})\n)`
    );
}

/** Une colonne de sortie par niveau (et par attribut) : `alias_niv1`, `alias_niv2`… */
export function expressionsHierarchie(
    nomCte: string,
    hierarchie: Hierarchie,
    aliasSortie: string
): { expression: string; alias: string }[] {
    const attributs = hierarchie.attributs.length ? hierarchie.attributs : [hierarchie.idColonne];
    const profondeur = Math.max(1, Math.min(20, hierarchie.profondeur || 5));
    const resultat: { expression: string; alias: string }[] = [];
    for (let niveau = 1; niveau <= profondeur; niveau++) {
        if (attributs.length <= 1)
            resultat.push({ expression: `list_extract(${nomCte}.chain, ${niveau})`, alias: `${aliasSortie}_niv${niveau}` });
        else
            attributs.forEach((attribut, index) =>
                resultat.push({
                    expression: `list_extract(${nomCte}.chain, ${niveau})['a${index}']`,
                    alias: `${aliasSortie}_niv${niveau}_${attribut}`
                })
            );
    }
    return resultat;
}

/** Condition « dans la liste fournie » (ou « hors de la liste ») ; une liste vide ne filtre rien. */
export function conditionListe(expressionColonne: string, liste: string[], exclure: boolean): string {
    const valeurs = [...new Set(liste.map(valeur => String(valeur).trim().toUpperCase()).filter(Boolean))];
    if (!valeurs.length) return 'TRUE';
    const membres = valeurs.map(litteralSql).join(', ');
    return exclure
        ? `COALESCE(${cleNormalisee(expressionColonne)}, '') NOT IN (${membres})`
        : `${cleNormalisee(expressionColonne)} IN (${membres})`;
}
