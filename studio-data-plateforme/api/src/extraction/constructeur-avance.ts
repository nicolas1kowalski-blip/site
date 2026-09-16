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
    /** Route de la table d'ancrage, quand elle est ramenée plusieurs fois par des liens différents. */
    deRoute: string;
    deColonne: string;
    versColonne: string;
    /** Les colonnes en plus de la clé, quand le lien du modèle en porte une composite. */
    pairesEnPlus?: { deColonne: string; versColonne: string }[];
    mode: ModeSynthese;
    nomColonne: string;
    n: number;
};
/**
 * Hiérarchie aplatie. Deux façons de connaître le parent d'une ligne :
 *   • « simple » : une colonne parent dans la table elle-même (COD_PARENT à côté de COD) ;
 *   • « liaison » : une table de rattachement enfant → parent, éventuellement datée (valide du / au),
 *     que l'on lit à une date de référence — c'est le cas des organigrammes qui changent dans le temps.
 */
export type Hierarchie = {
    idColonne: string;
    parentColonne: string;
    attributs: string[];
    profondeur: number;
    type: 'simple' | 'liaison';
    /** Type « liaison » : les colonnes de la table de rattachement (la table elle-même est passée à part). */
    liaisonEnfant: string;
    liaisonParent: string;
    /** Colonnes de début et de fin de validité du rattachement (facultatives). */
    valideDu: string;
    valideAu: string;
    /** Date à laquelle lire le rattachement (AAAA-MM-JJ) ; vide = aujourd'hui. */
    dateReference: string;
};

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

/** Une expression SQL et le nom qu'elle portera en sortie. */
export type ExpressionNommee = { expression: string; alias: string };

/**
 * Expressions d'une synthèse : une seule pour count / countd / values, N pour « premières valeurs ».
 * `nomTableEnfant` est la table DuckDB résumée, `expressionParent` la clé côté table présente.
 */
export function expressionsSynthese(
    synthese: Synthese,
    nomTableEnfant: string,
    expressionParent: string,
    aliasSortie: string,
    nomCteTransposition = '',
    /** Les colonnes en plus de la clé, quand le lien en porte une composite. */
    parentsEnPlus: { versColonne: string; expressionParent: string }[] = []
): ExpressionNommee[] {
    const table = identifiantSql(nomTableEnfant);
    const condition = [{ versColonne: synthese.versColonne, expressionParent }, ...parentsEnPlus]
        .map(paire => `${cleNormalisee('s.' + identifiantSql(paire.versColonne))} = ${cleNormalisee(paire.expressionParent)}`)
        .join(' AND ');
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
            if (!nomCteTransposition)
                throw new ErreurFormule('Synthèse « premières valeurs » : la liste ordonnée de la table liée est requise.');
            return expressionsTransposees(nomCteTransposition, synthese, aliasSortie);
        }
    }
}

/** Nombre de colonnes transposées : au moins une, douze au plus — au-delà, c'est un tableau, pas une synthèse. */
export function nombreTranspose(synthese: Synthese): number {
    return Math.max(1, Math.min(12, synthese.n || 3));
}

/**
 * La table liée lue **une seule fois** : ses valeurs sont rangées en liste ordonnée, une liste par clé.
 * Transposer douze colonnes ne coûte alors pas plus cher que d'en transposer trois.
 */
export function cteValeursOrdonnees(nomCte: string, nomTableEnfant: string, synthese: Synthese): string {
    const colonne = `TRIM(CAST(s.${identifiantSql(synthese.nomColonne)} AS VARCHAR))`;
    return (
        `${nomCte} AS (SELECT ${cleNormalisee('s.' + identifiantSql(synthese.versColonne))} AS cle,` +
        ` list(${colonne} ORDER BY s."__rn") AS valeurs` +
        ` FROM ${identifiantSql(nomTableEnfant)} s GROUP BY 1)`
    );
}

/** Le raccordement de cette liste à la ligne de l'extraction, par la clé de la relation. */
export function jointureValeursOrdonnees(nomCte: string, expressionParent: string): string {
    return `LEFT JOIN ${nomCte} ON ${nomCte}.cle = ${cleNormalisee(expressionParent)}`;
}

/** Une colonne par rang : la n-ième valeur de la liste (les listes DuckDB commencent à 1). */
export function expressionsTransposees(nomCte: string, synthese: Synthese, aliasSortie: string): ExpressionNommee[] {
    return Array.from({ length: nombreTranspose(synthese) }, (_, position) => ({
        expression: `${nomCte}.valeurs[${position + 1}]`,
        alias: `${aliasSortie}_${position + 1}`
    }));
}

/**
 * Condition de validité d'un rattachement daté, lue à la date de référence : une borne vide ne limite rien.
 * Sans date de référence, on lit le rattachement du jour.
 */
function conditionValidite(hierarchie: Hierarchie, alias: string): string {
    const reference = hierarchie.dateReference ? `${litteralSql(hierarchie.dateReference)}::DATE` : 'current_date';
    const bornes: string[] = [];
    const renseignee = (colonne: string) =>
        `${alias}.${identifiantSql(colonne)} IS NOT NULL AND TRIM(CAST(${alias}.${identifiantSql(colonne)} AS VARCHAR)) <> ''`;
    if (hierarchie.valideDu)
        bornes.push(
            `(NOT (${renseignee(hierarchie.valideDu)}) OR TRY_CAST(${alias}.${identifiantSql(hierarchie.valideDu)} AS DATE) <= ${reference})`
        );
    if (hierarchie.valideAu)
        bornes.push(
            `(NOT (${renseignee(hierarchie.valideAu)}) OR TRY_CAST(${alias}.${identifiantSql(hierarchie.valideAu)} AS DATE) >= ${reference})`
        );
    return bornes.length ? bornes.join(' AND ') : 'TRUE';
}

/**
 * Définitions à placer dans le WITH pour une hiérarchie. La dernière est toujours `nomCte(k, chain)`, où k est
 * l'identifiant normalisé et chain la liste des étiquettes de la racine jusqu'à la ligne (un scalaire par niveau,
 * ou un struct {a0, a1…} si plusieurs attributs sont demandés). Le type « liaison » ajoute devant une définition
 * `nomCte_liens(enfant, parent)` : les rattachements retenus à la date de référence.
 */
export function cteHierarchie(nomCte: string, nomTable: string, hierarchie: Hierarchie, nomTableLiaison?: string): string[] {
    const table = identifiantSql(nomTable);
    const identifiant = identifiantSql(hierarchie.idColonne);
    const attributs = hierarchie.attributs.length ? hierarchie.attributs : [hierarchie.idColonne];
    const etiquette = (alias: string) =>
        attributs.length > 1
            ? `{ ${attributs.map((attribut, index) => `'a${index}': TRIM(CAST(${alias}.${identifiantSql(attribut)} AS VARCHAR))`).join(', ')} }`
            : `TRIM(CAST(${alias}.${identifiantSql(attributs[0])} AS VARCHAR))`;
    const profondeur = Math.max(1, Math.min(20, hierarchie.profondeur || 5));
    const definitions: string[] = [];
    // Comment reconnaître une racine, et comment rattacher un enfant « c » à un parent déjà placé « p ».
    let racines: string;
    let rattachement: string;
    if (hierarchie.type === 'liaison') {
        if (!nomTableLiaison) throw new ErreurFormule('Hiérarchie par table de liaison : la table de rattachement est requise.');
        if (!hierarchie.liaisonEnfant || !hierarchie.liaisonParent)
            throw new ErreurFormule('Hiérarchie par table de liaison : les colonnes enfant et parent sont requises.');
        const liens = `${nomCte}_liens`;
        definitions.push(
            `${liens}(enfant, parent) AS (\n` +
                `  SELECT ${cleNormalisee('l.' + identifiantSql(hierarchie.liaisonEnfant))}, ${cleNormalisee('l.' + identifiantSql(hierarchie.liaisonParent))}\n` +
                `  FROM ${identifiantSql(nomTableLiaison)} l WHERE ${conditionValidite(hierarchie, 'l')}\n)`
        );
        racines = `NOT EXISTS (SELECT 1 FROM ${liens} r WHERE r.enfant = ${cleNormalisee('t.' + identifiant)} AND r.parent IS NOT NULL)`;
        rattachement = `JOIN ${liens} li ON li.enfant = ${cleNormalisee('c.' + identifiant)} JOIN ${nomCte} p ON p.k = li.parent`;
    } else {
        if (!hierarchie.parentColonne) throw new ErreurFormule('Hiérarchie : la colonne parent est requise.');
        const parent = identifiantSql(hierarchie.parentColonne);
        racines = `t.${parent} IS NULL OR TRIM(CAST(t.${parent} AS VARCHAR)) = ''`;
        rattachement = `JOIN ${nomCte} p ON p.k = ${cleNormalisee('c.' + parent)}`;
    }
    definitions.push(
        `${nomCte}(k, chain) AS (\n` +
            `  SELECT ${cleNormalisee('t.' + identifiant)}, [${etiquette('t')}] FROM ${table} t WHERE ${racines}\n` +
            `  UNION ALL\n` +
            `  SELECT ${cleNormalisee('c.' + identifiant)}, list_append(p.chain, ${etiquette('c')}) FROM ${table} c ${rattachement}` +
            ` WHERE len(p.chain) < ${profondeur} AND NOT list_contains(p.chain, ${etiquette('c')})\n)`
    );
    return definitions;
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
