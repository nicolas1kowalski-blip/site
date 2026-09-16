/**
 * Codification : retrouver le code d'un référentiel pour chaque ligne d'une liste reçue.
 *
 * Le cas : on reçoit une liste d'équipements — un libellé écrit à la main, une famille, quelques attributs. À
 * côté, une nomenclature en arbre : la famille en haut, des systèmes, des sous-systèmes, et tout en bas le type
 * d'équipement avec son code. Ce code est structurant ; sans lui la liste ne se rattache à rien. Personne ne
 * peut le poser à la main sur des milliers de lignes, et aucune égalité stricte ne le trouve, parce que le même
 * équipement s'écrit de dix façons.
 *
 * On empile donc des règles, de la plus sûre à la plus souple, et la première qui répond gagne :
 *   1. le code est déjà renseigné dans la liste — on le garde ;
 *   2. la table de correspondance — « ce libellé-là, c'est ce code », alimentée par les décisions passées ;
 *   3. les règles de mots-clés et d'expressions — « contient POMPE et CENTRIFUGE mais pas À VIDE » ;
 *   4. la ressemblance — le libellé comparé à ceux de la nomenclature, avec deux seuils.
 * Et par-dessus tout : ne chercher que dans la bonne branche de l'arbre, quand la famille est connue. C'est ce
 * qui empêche de coder une pompe en vanne parce que les libellés se ressemblent.
 *
 * Chaque ligne repart avec son code, PAR QUELLE RÈGLE il a été trouvé et avec quel score : une codification
 * qu'on ne peut pas justifier ne vaut rien.
 *
 * Fonctions pures : elles fabriquent du SQL et interprètent des nombres, elles n'exécutent rien.
 */
import { z } from 'zod';
import { identifiantSql, litteralSql } from '../espaces/moteur-duckdb';

/**
 * Les trois façons de mesurer la ressemblance de deux libellés.
 *
 * « Mots » est la bonne par défaut sur des libellés d'équipements, et la seule qui s'explique en une phrase :
 * combien de mots du type de référence se retrouvent dans le libellé lu. « Pompe centrifuge alimentaire »
 * contient les deux mots de « Pompe centrifuge » : c'est bien elle. Les deux autres comparent les chaînes
 * caractère par caractère, ce qui pardonne les fautes mais se laisse tromper par les mots en trop : sur un
 * libellé long, Jaro-Winkler rend 0,91 pour une correspondance parfaite, et 0,93 pour une autre qui ne l'est pas.
 */
export const METHODES_DE_RESSEMBLANCE = {
    mots: 'Mots retrouvés (recommandé : part des mots du type de référence présents dans le libellé)',
    jw: 'Jaro-Winkler (compare les chaînes, tolère les fautes de frappe)',
    lev: 'Levenshtein (compte les caractères à changer)'
} as const;
export type MethodeDeRessemblance = keyof typeof METHODES_DE_RESSEMBLANCE;

/** Les deux formes d'une règle écrite à la main. */
export const TYPES_DE_REGLE = {
    motscles: 'Mots-clés (contient / et / ou / sauf)',
    expression: 'Expression régulière (pour les cas tordus)'
} as const;
export type TypeDeRegle = keyof typeof TYPES_DE_REGLE;

export const schemaRegle = z.object({
    id: z.string().min(1),
    actif: z.boolean().default(true),
    /** Le code attribué quand la règle répond. */
    code: z.string().min(1, 'code requis'),
    /** Colonne examinée ; vide = la colonne du libellé de la codification. */
    colonne: z.string().default(''),
    type: z.enum(Object.keys(TYPES_DE_REGLE) as [TypeDeRegle, ...TypeDeRegle[]]).default('motscles'),
    /** Mots-clés à trouver ; « ou » dit s'il en suffit d'un seul, sinon il les faut tous. */
    contient: z.array(z.string().min(1)).max(20).default([]),
    ou: z.boolean().default(false),
    /** Mots-clés qui disqualifient la ligne, même si les autres sont là. */
    sauf: z.array(z.string().min(1)).max(20).default([]),
    /** Type « expression » : le motif, au sens des expressions régulières. */
    motif: z.string().default('')
});
export type RegleCodification = z.infer<typeof schemaRegle>;

export const schemaSynonyme = z.object({
    id: z.string().min(1),
    /** Le mot retenu : c'est lui qui remplacera toutes ses variantes, des deux côtés de la comparaison. */
    motRetenu: z.string().min(1, 'mot retenu requis'),
    /** Les autres façons de l'écrire : abréviations, jargon du site, pluriels, formes en plusieurs mots. */
    variantes: z.array(z.string().min(1)).max(50).default([]),
    /** Vrai : la variante est reconnue même mal orthographiée (à partir de quatre lettres). */
    proche: z.boolean().default(false)
});
export type Synonyme = z.infer<typeof schemaSynonyme>;

/**
 * Ce que l'on compare pour mesurer la ressemblance : une colonne de la liste reçue contre une colonne de la
 * nomenclature. Ce n'est pas toujours le libellé contre le libellé — la liste peut porter la désignation
 * technique et la nomenclature un libellé de codification, ou l'on peut vouloir peser aussi la marque contre
 * le fabricant. Chaque comparaison a son poids ; le score est leur moyenne pondérée.
 */
export const schemaComparaison = z.object({
    id: z.string().min(1),
    // Vides tant que la ligne se remplit : une comparaison à moitié saisie n'empêche pas d'enregistrer.
    colonneSource: z.string().default(''),
    colonneNomenclature: z.string().default(''),
    /** Ce que cette comparaison pèse dans le score, face aux autres. */
    poids: z.number().min(0.1).max(10).default(1),
    /** Sa propre mesure, ou vide pour celle de la codification. */
    methode: z.enum(['', ...(Object.keys(METHODES_DE_RESSEMBLANCE) as MethodeDeRessemblance[])]).default('')
});
export type ComparaisonCodification = z.infer<typeof schemaComparaison>;

export const schemaCorrespondance = z.object({
    /** Le libellé tel qu'il a été vu, ou une variante décidée à la revue. */
    libelle: z.string().min(1),
    code: z.string().min(1),
    /** Qui l'a décidé et quand : une correspondance est une décision, elle se justifie. */
    auteur: z.string().default(''),
    le: z.string().default('')
});
export type CorrespondanceCodification = z.infer<typeof schemaCorrespondance>;

export const schemaCodification = z.object({
    id: z.string().min(1),
    nom: z.string().min(1, 'nom requis'),
    /** La liste reçue, et la colonne qui porte le libellé à interpréter. */
    source: z.string().default(''),
    colonneLibelle: z.string().default(''),
    /** La colonne où un code est parfois déjà renseigné : on ne le remet jamais en cause. */
    colonneCodeExistant: z.string().default(''),
    /** La nomenclature de référence, sa colonne de code et sa colonne de libellé. */
    nomenclature: z.string().default(''),
    colonneCode: z.string().default(''),
    colonneLibelleRef: z.string().default(''),
    /** Les colonnes de l'arbre, du plus haut au plus fin : famille, système, sous-système… */
    niveaux: z.array(z.string().min(1)).max(8).default([]),
    /** Ne chercher que dans la branche où la ligne se trouve déjà : c'est ce qui fait la précision. */
    restreindreSource: z.string().default(''),
    restreindreNomenclature: z.string().default(''),
    /**
     * Les mots qui en valent d'autres : « MOTOPOMPE » vaut « POMPE », « CENTRIF » vaut « CENTRIFUGE ». Les
     * variantes sont ramenées au mot retenu des deux côtés avant de comparer, de sorte qu'un libellé écrit
     * dans le jargon du site retrouve quand même son type. Les règles de mots-clés, elles, restent littérales :
     * on les a écrites exprès sur un mot précis.
     */
    /**
     * Ce que l'on compare, des deux côtés. Vide = le libellé de la liste contre le libellé de la
     * nomenclature, comme lorsque l'on n'a rien dit.
     */
    comparaisons: z.array(schemaComparaison).max(10).default([]),
    synonymes: z.array(schemaSynonyme).max(500).default([]),
    regles: z.array(schemaRegle).max(500).default([]),
    correspondances: z.array(schemaCorrespondance).max(20_000).default([]),
    /** Au-dessus, on code d'office ; entre les deux, on demande ; en dessous, on ne propose rien. */
    seuilAuto: z.number().min(0).max(1).default(0.99),
    seuilRevoir: z.number().min(0).max(1).default(0.45),
    methode: z.enum(Object.keys(METHODES_DE_RESSEMBLANCE) as [MethodeDeRessemblance, ...MethodeDeRessemblance[]]).default('mots'),
    /** Les lignes tranchées à la main : rang de la ligne → code retenu (vide = « aucun code »). */
    decisions: z.record(z.string(), z.string()).default({})
});
export type Codification = z.infer<typeof schemaCodification>;

/** Ce que le module a besoin de savoir du monde extérieur : le nom en base d'une table, d'après son nom métier. */
export type ContexteCodification = {
    nomTableDe: (nomSource: string) => string;
    /** La table où le résultat de la codification a été posé : la revue la relit au lieu de tout recalculer. */
    nomTableCodee: string;
};

/** Message d'une codification qu'on ne peut pas exécuter, dit en clair plutôt qu'en erreur SQL. */
export class ErreurCodification extends Error {}

/**
 * Le texte réduit à ce qui compte pour comparer : majuscules, sans accents, la ponctuation et les espaces
 * multiples ramenés à un seul espace. « Pompe centrifuge (x2) » et « POMPE  CENTRIFUGE X2 » deviennent
 * identiques, ce qui est bien le sens que leur donne un humain.
 */
export function texteCompare(expression: string): string {
    return `TRIM(regexp_replace(strip_accents(UPPER(CAST(${expression} AS VARCHAR))), '[^A-Z0-9]+', ' ', 'g'))`;
}

/** Une valeur vide, quelle que soit la façon dont elle est vide. */
export function estVide(expression: string): string {
    return `(${expression} IS NULL OR TRIM(CAST(${expression} AS VARCHAR)) = '')`;
}

/** La condition SQL d'une règle : vraie quand la règle reconnaît la ligne. */
export function conditionDeLaRegle(regle: RegleCodification, colonneParDefaut: string): string {
    const colonne = regle.colonne || colonneParDefaut;
    if (!colonne) throw new ErreurCodification(`La règle « ${regle.code} » ne dit pas quelle colonne examiner.`);
    const texte = texteCompare(`s.${identifiantSql(colonne)}`);
    const contient = (mot: string) => `${texte} LIKE ${litteralSql('%' + motCompare(mot) + '%')}`;
    if (regle.type === 'expression') {
        if (!regle.motif.trim()) throw new ErreurCodification(`La règle « ${regle.code} » n'a pas d'expression.`);
        return `regexp_matches(${texte}, ${litteralSql(regle.motif.trim())})`;
    }
    if (!regle.contient.length) throw new ErreurCodification(`La règle « ${regle.code} » n'a aucun mot-clé à chercher.`);
    const voulus = regle.contient.map(contient).join(regle.ou ? ' OR ' : ' AND ');
    const exclus = regle.sauf.map(mot => `NOT ${contient(mot)}`).join(' AND ');
    return exclus ? `((${voulus}) AND ${exclus})` : `(${voulus})`;
}

/** Un mot-clé réduit comme le sont les libellés, pour que la comparaison porte sur la même chose des deux côtés. */
export function motCompare(mot: string): string {
    return mot
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();
}

/**
 * Le même travail que « canoniser », mais sur un texte que l'on tient déjà : c'est ainsi qu'un libellé appris
 * est rangé, pour qu'il retrouve plus tard les libellés écrits autrement.
 */
export function motRetenuDuTexte(texte: string, synonymes: Synonyme[]): string {
    let mots = motCompare(texte);
    const retenus = synonymes
        .map(synonyme => ({
            retenu: motCompare(synonyme.motRetenu),
            variantes: synonyme.variantes.map(motCompare).filter(Boolean)
        }))
        .filter(synonyme => synonyme.retenu && synonyme.variantes.length);
    for (const synonyme of retenus)
        for (const variante of synonyme.variantes.filter(variante => variante.includes(' ')))
            mots = ` ${mots} `.split(` ${variante} `).join(` ${synonyme.retenu} `).trim();
    const retenuDuMot = new Map<string, string>();
    for (const synonyme of retenus)
        for (const variante of synonyme.variantes.filter(variante => !variante.includes(' '))) retenuDuMot.set(variante, synonyme.retenu);
    return mots
        .split(' ')
        .map(mot => retenuDuMot.get(mot) || mot)
        .join(' ')
        .trim();
}

/** La table de correspondance, portée dans la requête : un libellé réduit, un code. */
function tableDesCorrespondances(codification: Codification): string {
    const lignes = codification.correspondances
        .map(correspondance => ({ libelle: motRetenuDuTexte(correspondance.libelle, codification.synonymes), code: correspondance.code }))
        .filter(correspondance => correspondance.libelle);
    if (!lignes.length) return '';
    const valeurs = lignes.map(ligne => `(${litteralSql(ligne.libelle)}, ${litteralSql(ligne.code)})`).join(', ');
    return `(VALUES ${valeurs}) AS corr(libelle, code)`;
}

/**
 * Un mot du type de référence compte pour retrouvé s'il est là tel quel, ou à une faute près — mais seulement
 * à partir de quatre lettres : sur « DN » ou « BP », une faute change tout.
 */
const LETTRES_POUR_TOLERER_UNE_FAUTE = 4;
const TOLERANCE_PAR_MOT = 0.9;

/**
 * Le texte où chaque variante déclarée a laissé place au mot retenu. On le fait des deux côtés avant de
 * comparer : « MOTOPOMPE CENTRIF » et « Pompe centrifuge » deviennent tous deux « POMPE CENTRIFUGE », et se
 * retrouvent. Deux passes, parce qu'une variante en plusieurs mots ne se remplace pas mot à mot :
 *   1. les variantes en plusieurs mots, remplacées telles quelles dans la chaîne ;
 *   2. les variantes d'un seul mot, remplacées mot à mot — exactement, ou à une faute près si on l'a demandé.
 */
export function canoniser(expression: string, synonymes: Synonyme[]): string {
    const retenus = synonymes
        .map(synonyme => ({
            retenu: motCompare(synonyme.motRetenu),
            proche: synonyme.proche,
            variantes: synonyme.variantes.map(motCompare).filter(Boolean)
        }))
        .filter(synonyme => synonyme.retenu && synonyme.variantes.length);
    if (!retenus.length) return expression;
    let texte = `' ' || ${expression} || ' '`;
    for (const synonyme of retenus)
        for (const variante of synonyme.variantes.filter(variante => variante.includes(' ')))
            texte = `replace(${texte}, ${litteralSql(` ${variante} `)}, ${litteralSql(` ${synonyme.retenu} `)})`;
    const cas = retenus
        .map(synonyme => {
            const simples = synonyme.variantes.filter(variante => !variante.includes(' '));
            if (!simples.length) return '';
            const reconnait = simples.map(variante => conditionDeLaVariante(variante, synonyme.proche)).join(' OR ');
            return `WHEN ${reconnait} THEN ${litteralSql(synonyme.retenu)}`;
        })
        .filter(Boolean);
    const nettoye = `TRIM(${texte})`;
    if (!cas.length) return nettoye;
    return `array_to_string(list_transform(string_split(${nettoye}, ' '), motEcrit -> CASE ${cas.join(' ')} ELSE motEcrit END), ' ')`;
}

/** Un mot écrit est-il cette variante-là : tel quel, ou à une faute près quand on l'a autorisé. */
function conditionDeLaVariante(variante: string, proche: boolean): string {
    const egal = `motEcrit = ${litteralSql(variante)}`;
    if (!proche || variante.length < LETTRES_POUR_TOLERER_UNE_FAUTE) return egal;
    return `(${egal} OR jaro_winkler_similarity(motEcrit, ${litteralSql(variante)}) >= ${TOLERANCE_PAR_MOT})`;
}

/** La part des mots du libellé de référence que l'on retrouve dans le libellé lu. */
function motsRetrouves(libelleLu: string, reference: string): string {
    const mots = `string_split(${reference}, ' ')`;
    const retrouve = `len(list_filter(string_split(${libelleLu}, ' '),
            motLu -> motLu = motRef OR (length(motRef) >= ${LETTRES_POUR_TOLERER_UNE_FAUTE}
                AND jaro_winkler_similarity(motLu, motRef) >= ${TOLERANCE_PAR_MOT}))) > 0`;
    return `list_aggregate(list_transform(${mots}, motRef -> CASE WHEN ${retrouve} THEN 1 ELSE 0 END), 'sum')::DOUBLE
        / GREATEST(len(${mots}), 1)`;
}

/** La ressemblance de deux textes, selon la méthode choisie ; 1 = identiques, 0 = rien à voir. */
export function ressemblance(gauche: string, droite: string, methode: MethodeDeRessemblance): string {
    const vide = `${gauche} IS NULL OR ${droite} IS NULL OR ${gauche} = '' OR ${droite} = ''`;
    if (methode === 'mots') return `CASE WHEN ${vide} THEN 0.0 ELSE ${motsRetrouves(gauche, droite)} END`;
    if (methode === 'lev')
        return `CASE WHEN ${gauche} IS NULL OR ${droite} IS NULL OR ${gauche} = '' OR ${droite} = '' THEN 0.0
            ELSE 1.0 - levenshtein(${gauche}, ${droite})::DOUBLE / GREATEST(length(${gauche}), length(${droite}), 1) END`;
    return `CASE WHEN ${gauche} IS NULL OR ${droite} IS NULL OR ${gauche} = '' OR ${droite} = '' THEN 0.0
        ELSE jaro_winkler_similarity(${gauche}, ${droite}) END`;
}

/**
 * Les comparaisons réellement appliquées. Quand on n'a rien déclaré, c'est le libellé de la liste contre le
 * libellé de la nomenclature : le cas courant n'oblige à rien dire.
 */
export function comparaisonsRetenues(codification: Codification): ComparaisonCodification[] {
    const declarees = (codification.comparaisons || []).filter(comparaison => comparaison.colonneSource && comparaison.colonneNomenclature);
    if (declarees.length) return declarees;
    return [
        {
            id: 'defaut',
            colonneSource: codification.colonneLibelle,
            colonneNomenclature: codification.colonneLibelleRef,
            poids: 1,
            methode: ''
        }
    ];
}

/**
 * Le score de ressemblance d'une ligne avec une ligne de la nomenclature : la moyenne pondérée des
 * comparaisons déclarées. Les deux côtés passent par les synonymes avant d'être comparés.
 */
export function scoreDeRessemblance(codification: Codification, aliasSource: string, aliasNomenclature: string): string {
    const comparaisons = comparaisonsRetenues(codification);
    const total = comparaisons.reduce((somme, comparaison) => somme + (comparaison.poids || 1), 0) || 1;
    const parts = comparaisons.map(comparaison => {
        const libelleLu = canoniser(texteCompare(`${aliasSource}.${identifiantSql(comparaison.colonneSource)}`), codification.synonymes);
        const reference = canoniser(
            texteCompare(`${aliasNomenclature}.${identifiantSql(comparaison.colonneNomenclature)}`),
            codification.synonymes
        );
        return `${comparaison.poids || 1} * (${ressemblance(libelleLu, reference, comparaison.methode || codification.methode)})`;
    });
    return `(${parts.join(' + ')}) / ${total}`;
}

/** La condition qui enferme la recherche dans la bonne branche de l'arbre — vraie partout si l'on ne restreint pas. */
export function conditionDeBranche(codification: Codification): string {
    if (!codification.restreindreSource || !codification.restreindreNomenclature) return 'TRUE';
    const cote = texteCompare(`s.${identifiantSql(codification.restreindreSource)}`);
    const autre = texteCompare(`n.${identifiantSql(codification.restreindreNomenclature)}`);
    // Une ligne sans famille connue n'est pas exclue : on la cherche dans tout l'arbre, et son score en décidera.
    return `(${cote} = ${autre} OR ${estVide(`s.${identifiantSql(codification.restreindreSource)}`)})`;
}

/** Vérifie qu'une codification dit tout ce qu'il faut pour être exécutée, et le dit en français sinon. */
export function verifierLaCodification(codification: Codification): void {
    const manques: [string, string][] = [
        [codification.source, 'la liste à coder'],
        [codification.colonneLibelle, 'la colonne du libellé'],
        [codification.nomenclature, 'la nomenclature de référence'],
        [codification.colonneCode, 'la colonne du code dans la nomenclature'],
        [codification.colonneLibelleRef, 'la colonne du libellé dans la nomenclature']
    ];
    const absent = manques.find(([valeur]) => !valeur);
    if (absent) throw new ErreurCodification(`Codification incomplète : choisissez ${absent[1]}.`);
    if (codification.seuilRevoir > codification.seuilAuto)
        throw new ErreurCodification('Le seuil « à revoir » ne peut pas dépasser le seuil « d’office ».');
}

/** L'origine d'un code : ce qui permet de justifier chaque ligne, et de savoir à quoi se fier. */
export const ORIGINES = {
    existant: 'Code déjà renseigné dans la liste',
    correspondance: 'Table de correspondance',
    regle: 'Règle de mots-clés',
    ressemblance: 'Ressemblance du libellé',
    decision: 'Décision prise à la revue',
    aucune: 'Aucun code trouvé'
} as const;
export type Origine = keyof typeof ORIGINES;

/** Le statut d'une ligne : ce que l'utilisateur doit en faire, ou ne pas en faire. */
export const STATUTS = { office: "Codé d'office", revoir: 'À revoir', absent: 'Non trouvé' } as const;
export type StatutDeLigne = keyof typeof STATUTS;

/** Les colonnes que la codification ajoute à chaque ligne. */
export const COLONNES_AJOUTEES = ['__code', '__origine', '__score', '__statut', '__chemin'] as const;

/**
 * Sur combien de caractères on regroupe les mots pour former les couples à comparer. Quatre suffisent à
 * rapprocher « PAPILLON » et « PAPILON », et à écarter tout le reste.
 */
export const TETE_DE_MOT = 4;
/** Un mot qui désigne plus que cette part de la nomenclature ne distingue rien : il ne sert pas à choisir. */
export const PART_MOT_TROP_COURANT = 0.05;
/** Sur une petite nomenclature, un mot présent dans une vingtaine de types reste utilisable. */
export const TYPES_TOLERES_PAR_MOT = 20;

/**
 * Les mots d'une colonne, réduits à leur tête. « projection » nomme la ligne dans la sous-requête qui
 * découpe les mots ; « colonne » est le nom sous lequel on la relit ensuite.
 */
function tetesDeMots(expression: string, table: string, projection: string, colonne: string, ou: string): string {
    return `SELECT mots.${colonne}, substr(mots.mot, 1, ${TETE_DE_MOT}) AS tete
        FROM (SELECT ${projection}, unnest(string_split(${expression}, ' ')) AS mot FROM ${table}${ou}) mots
        WHERE mots.mot <> ''`;
}

/**
 * Les couples qu'il vaut la peine de comparer.
 *
 * Sans cela, on compare chaque ligne de la liste à CHAQUE ligne de la nomenclature : sur des dizaines de
 * milliers de lignes de part et d'autre, cela fait des milliards de couples, chacun payant un calcul de
 * ressemblance. La requête ne finit pas.
 *
 * On rapproche donc par les mots — mais par les mots qui DISTINGUENT. « POMPE » se trouve dans tous les
 * types de pompes : rapprocher là-dessus revient à ne rien rapprocher du tout. On écarte donc les mots trop
 * courants, et l'on garde les rares — un numéro de modèle, un terme propre au type. Une ligne dont tous les
 * mots sont courants garde tout de même le moins courant d'entre eux : mieux vaut peu de candidats que zéro.
 *
 * La réserve : une faute dans les quatre premières lettres d'un mot fait manquer le couple. C'est le prix
 * d'une requête qui se termine.
 */
function sqlDesRapprochables(codification: Codification, tableNomenclature: string): string {
    const comparaisons = comparaisonsRetenues(codification);
    const cote = (
        colonne: (comparaison: ComparaisonCodification) => string,
        table: string,
        projection: string,
        nom: string,
        ou: string
    ) =>
        comparaisons
            .map(comparaison =>
                tetesDeMots(canoniser(texteCompare(colonne(comparaison)), codification.synonymes), table, projection, nom, ou)
            )
            .join('\n        UNION ALL\n        ');
    const lus = cote(
        comparaison => `r.${identifiantSql(comparaison.colonneSource)}`,
        'reconnues r',
        'r.__rn AS __rn',
        '__rn',
        ' WHERE r.__code_regle IS NULL'
    );
    const types = cote(
        comparaison => `n.${identifiantSql(comparaison.colonneNomenclature)}`,
        `${tableNomenclature} n`,
        'n.rowid AS __ligne',
        '__ligne',
        ''
    );
    return `WITH motsLus AS (\n        ${lus}\n    ), motsTypes AS (\n        ${types}\n    ),
    frequences AS (SELECT tete, COUNT(DISTINCT __ligne) AS types FROM motsTypes GROUP BY tete),
    seuil AS (SELECT GREATEST(${TYPES_TOLERES_PAR_MOT}, CAST(${PART_MOT_TROP_COURANT} * COUNT(DISTINCT __ligne) AS BIGINT)) AS maximum FROM motsTypes),
    tetesRetenues AS (
        SELECT __rn, tete FROM (
            SELECT DISTINCT lus.__rn, lus.tete, frequences.types,
                row_number() OVER (PARTITION BY lus.__rn ORDER BY frequences.types) AS rang
            FROM motsLus lus JOIN frequences ON frequences.tete = lus.tete
        ) pesees, seuil
        WHERE pesees.types <= seuil.maximum OR pesees.rang = 1
    )
    SELECT DISTINCT tetesRetenues.__rn, motsTypes.__ligne
    FROM tetesRetenues JOIN motsTypes ON motsTypes.tete = tetesRetenues.tete`;
}

/**
 * Le SQL qui code chaque ligne de la liste.
 *
 * Trois temps : « reconnues » applique la pile de règles, « candidats » cherche le meilleur voisin dans la
 * nomenclature pour celles qui restent, et le SELECT final tranche entre les deux et déplie le chemin de
 * l'arbre. La colonne technique __rn identifie la ligne : c'est elle que porteront les décisions de la revue.
 */
export function sqlDeCodification(codification: Codification, contexte: ContexteCodification): string {
    verifierLaCodification(codification);
    const tableSource = identifiantSql(contexte.nomTableDe(codification.source));
    const tableNomenclature = identifiantSql(contexte.nomTableDe(codification.nomenclature));
    const libelle = canoniser(texteCompare(`s.${identifiantSql(codification.colonneLibelle)}`), codification.synonymes);
    const correspondances = tableDesCorrespondances(codification);
    const reconnues = `SELECT s.*, ${libelle} AS __libelle,
        ${codeDesRegles(codification, correspondances)} AS __code_regle,
        ${origineDesRegles(codification, correspondances)} AS __origine_regle
        FROM ${tableSource} s${correspondances ? `\n        LEFT JOIN ${correspondances} ON corr.libelle = ${libelle}` : ''}`;
    // Le score n'est calculé qu'UNE fois par couple retenu, puis filtré : deux fois coûterait le double.
    const notes = `SELECT r.__rn AS __rn, n.${identifiantSql(codification.colonneCode)} AS __code_voisin,
            (${scoreDeRessemblance(codification, 'r', 'n')}) AS __score_voisin
        FROM rapprochables p
        JOIN reconnues r ON r.__rn = p.__rn
        JOIN ${tableNomenclature} n ON n.rowid = p.__ligne
        WHERE ${conditionDeBranche(codification).replace(/\bs\./g, 'r.')}`;
    const candidats = `SELECT __rn, __code_voisin, __score_voisin FROM (\n${notes}\n    ) notes
        WHERE __score_voisin >= ${codification.seuilRevoir}
        QUALIFY row_number() OVER (PARTITION BY __rn ORDER BY __score_voisin DESC) = 1`;
    return `WITH reconnues AS (\n${reconnues}\n), rapprochables AS (\n    ${sqlDesRapprochables(codification, tableNomenclature)}\n), candidats AS (\n${candidats}\n)\n${selectFinal(codification, tableNomenclature)}`;
}

/** Le code retenu, règle après règle, la première qui répond l'emportant. */
function codeDesRegles(codification: Codification, correspondances: string): string {
    const cas: string[] = [];
    if (codification.colonneCodeExistant) {
        const colonne = `s.${identifiantSql(codification.colonneCodeExistant)}`;
        cas.push(`WHEN NOT ${estVide(colonne)} THEN CAST(${colonne} AS VARCHAR)`);
    }
    if (correspondances) cas.push('WHEN corr.code IS NOT NULL THEN corr.code');
    for (const regle of codification.regles.filter(candidate => candidate.actif))
        cas.push(`WHEN ${conditionDeLaRegle(regle, codification.colonneLibelle)} THEN ${litteralSql(regle.code)}`);
    return cas.length ? `CASE ${cas.join(' ')} ELSE NULL END` : 'NULL';
}

/** D'où vient le code, dans le même ordre que les règles : c'est ce qui rend la codification justifiable. */
function origineDesRegles(codification: Codification, correspondances: string): string {
    const cas: string[] = [];
    if (codification.colonneCodeExistant)
        cas.push(`WHEN NOT ${estVide(`s.${identifiantSql(codification.colonneCodeExistant)}`)} THEN 'existant'`);
    if (correspondances) cas.push(`WHEN corr.code IS NOT NULL THEN 'correspondance'`);
    for (const regle of codification.regles.filter(candidate => candidate.actif))
        cas.push(`WHEN ${conditionDeLaRegle(regle, codification.colonneLibelle)} THEN ${litteralSql('regle:' + regle.id)}`);
    return cas.length ? `CASE ${cas.join(' ')} ELSE NULL END` : 'NULL';
}

/** Le code final, son origine, son score, son statut, et le chemin déplié dans l'arbre. */
function selectFinal(codification: Codification, tableNomenclature: string): string {
    const code = `COALESCE(reconnues.__code_regle, CASE WHEN candidats.__score_voisin >= ${codification.seuilAuto} THEN candidats.__code_voisin END)`;
    const statut = `CASE WHEN ${code} IS NOT NULL THEN 'office' WHEN candidats.__code_voisin IS NOT NULL THEN 'revoir' ELSE 'absent' END`;
    const chemin = codification.niveaux.length
        ? `concat_ws(' › ', ${codification.niveaux.map(niveau => `CAST(arbre.${identifiantSql(niveau)} AS VARCHAR)`).join(', ')})`
        : `NULL`;
    return `SELECT reconnues.* EXCLUDE (__libelle, __code_regle, __origine_regle),
    ${code} AS __code,
    COALESCE(reconnues.__origine_regle, CASE WHEN ${code} IS NOT NULL THEN 'ressemblance' ELSE 'aucune' END) AS __origine,
    ROUND(COALESCE(candidats.__score_voisin, CASE WHEN reconnues.__code_regle IS NOT NULL THEN 1.0 ELSE 0.0 END), 3) AS __score,
    ${statut} AS __statut,
    ${chemin} AS __chemin
FROM reconnues
LEFT JOIN candidats ON candidats.__rn = reconnues.__rn
LEFT JOIN ${tableNomenclature} arbre ON ${texteCompare(`arbre.${identifiantSql(codification.colonneCode)}`)} = ${texteCompare(code)}`;
}

/** Combien de propositions on montre à la revue : au-delà, on ne choisit plus, on hésite. */
export const CANDIDATS_MONTRES = 3;

/**
 * Le SQL des cas à revoir : pour chaque ligne qu'aucune règle n'a reconnue, les meilleurs voisins de la
 * nomenclature, avec leur score et leur chemin. C'est de quoi trancher en un coup d'œil.
 */
export function sqlDesCasARevoir(codification: Codification, contexte: ContexteCodification, combien = 200): string {
    verifierLaCodification(codification);
    const tableNomenclature = identifiantSql(contexte.nomTableDe(codification.nomenclature));
    const codeRef = identifiantSql(codification.colonneCode);
    const libelleRef = identifiantSql(codification.colonneLibelleRef);
    const score = scoreDeRessemblance(codification, 'aCoder', 'n');
    const chemin = codification.niveaux.length
        ? `concat_ws(' › ', ${codification.niveaux.map(niveau => `CAST(n.${identifiantSql(niveau)} AS VARCHAR)`).join(', ')})`
        : `CAST(n.${codeRef} AS VARCHAR)`;
    // Même blocage que la codification : sans lui, chacun des cas à revoir serait comparé à toute la
    // nomenclature. « codee » est la table déjà calculée : on ne recode pas la liste pour la relire.
    const couples = sqlDesRapprochables(codification, tableNomenclature).replace(/\breconnues r\b/g, 'aCoder r').replace(
        /r\.__code_regle IS NULL/g,
        'TRUE'
    );
    return `WITH aCoder AS (
    SELECT codee.*, CAST(codee.${identifiantSql(codification.colonneLibelle)} AS VARCHAR) AS __texte
    FROM ${identifiantSql(contexte.nomTableCodee)} codee WHERE __statut = 'revoir' ORDER BY __rn LIMIT ${combien}
), rapprochables AS (\n    ${couples}\n), notes AS (
    SELECT aCoder.__rn AS rang, aCoder.__texte AS libelle, CAST(n.${codeRef} AS VARCHAR) AS code,
        CAST(n.${libelleRef} AS VARCHAR) AS libelleRef, ${chemin} AS chemin, ROUND((${score}), 3) AS score
    FROM rapprochables p
    JOIN aCoder ON aCoder.__rn = p.__rn
    JOIN ${tableNomenclature} n ON n.rowid = p.__ligne
)
SELECT * FROM notes WHERE score > 0
QUALIFY row_number() OVER (PARTITION BY rang ORDER BY score DESC) <= ${CANDIDATS_MONTRES}
ORDER BY rang, score DESC`;
}

/** Ce qu'une codification a donné, dit en chiffres et en une phrase. */
export type BilanDeCodification = {
    total: number;
    office: number;
    revoir: number;
    absent: number;
    /** Part des lignes codées sans intervention, de 0 à 1. */
    couverture: number;
    phrase: string;
};

/** Le bilan, à partir du compte de chaque statut. */
export function bilanDeCodification(comptes: { statut: string; lignes: number }[]): BilanDeCodification {
    const compte = (statut: string) => comptes.find(candidat => candidat.statut === statut)?.lignes || 0;
    const office = compte('office');
    const revoir = compte('revoir');
    const absent = compte('absent');
    const total = office + revoir + absent;
    const couverture = total ? Math.round((1000 * office) / total) / 1000 : 0;
    const enFrancais = (nombre: number) => nombre.toLocaleString('fr-FR');
    if (!total) return { total, office, revoir, absent, couverture, phrase: 'Aucune ligne à coder.' };
    const part = `${Math.round(100 * couverture)} %`;
    const reste = revoir || absent ? ` — ${enFrancais(revoir)} à revoir, ${enFrancais(absent)} sans proposition.` : ' — rien à revoir.';
    return {
        total,
        office,
        revoir,
        absent,
        couverture,
        phrase: `${enFrancais(office)} ligne(s) codées d’office sur ${enFrancais(total)} (${part})${reste}`
    };
}

/**
 * La correspondance qu'une décision de revue laisse derrière elle : c'est ce qui fait qu'un cas tranché une
 * fois ne revient jamais. Un code vide efface la correspondance au lieu d'en poser une.
 */
export function correspondanceApresDecision(
    correspondances: CorrespondanceCodification[],
    libelle: string,
    code: string,
    auteur: string,
    le: string
): CorrespondanceCodification[] {
    const compare = motCompare(libelle);
    if (!compare) return correspondances;
    const autres = correspondances.filter(candidate => motCompare(candidate.libelle) !== compare);
    return code ? [...autres, { libelle, code, auteur, le }] : autres;
}
