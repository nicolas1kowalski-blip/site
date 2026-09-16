/**
 * Deviner la configuration d'une codification, pour que l'utilisateur n'ait presque rien à régler.
 *
 * Quand on ouvre l'écran, on connaît deux tables : la liste reçue et la nomenclature. Tout le reste — quelle
 * colonne porte le libellé, laquelle porte le code, quels sont les niveaux de l'arbre, quelle famille
 * restreindre — se lit dans les données mieux qu'il ne se demande. Un code est court et unique ; un libellé
 * est long et varié ; une famille prend peu de valeurs différentes ; un niveau d'arbre en prend plus que
 * celui du dessus. Le nom des colonnes aide, mais ne décide pas seul : « CODE_POSTAL » n'est pas un code.
 *
 * Chaque choix est rendu avec sa raison en français : une proposition qu'on ne peut pas contester est une
 * proposition qu'on subit.
 *
 * Fonctions pures : elles ne voient que des colonnes observées, jamais une base de données.
 */

/** Ce qu'on a regardé d'une colonne pour se faire une idée. */
export type ColonneObservee = {
    nom: string;
    /** Nombre de valeurs différentes, vides exclues. */
    distinctes: number;
    /** Nombre de lignes renseignées. */
    renseignees: number;
    /** Longueur moyenne des valeurs, en caractères. */
    longueurMoyenne: number;
    /** Quelques valeurs, pour comparer les deux tables entre elles. */
    exemples: string[];
};

/** Ce que l'on propose, et pourquoi. */
export type PropositionDeCodification = {
    colonneLibelle: string;
    colonneCodeExistant: string;
    colonneCode: string;
    colonneLibelleRef: string;
    niveaux: string[];
    restreindreSource: string;
    restreindreNomenclature: string;
    /** Une phrase par choix, dans l'ordre où l'écran les présente. */
    raisons: string[];
};

/** Les mots qui, dans un nom de colonne, trahissent un code — et ceux qui le démentent. */
const MOTS_DE_CODE = /(^|_)(code|cod|ref|reference|identifiant|matricule|abrege|abrev)($|_)/i;
const FAUX_CODES = /(postal|barre|couleur|iso)/i;
/** Les mots qui trahissent un libellé. */
const MOTS_DE_LIBELLE = /(libell|libel|designation|denomination|intitule|nom|description|texte)/i;

/** Le nom d'une colonne réduit pour être comparé à ces motifs : sans accents, en minuscules. */
function nomReduit(nom: string): string {
    return nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Une valeur réduite comme le fait la codification, pour comparer deux colonnes de tables différentes. */
function valeurReduite(valeur: string): string {
    return valeur
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();
}

/**
 * Combien une colonne ressemble à un code : des valeurs uniques, courtes, et un nom qui le dit. On ne garde
 * que ce qui identifie vraiment une ligne — une colonne à moitié vide ou pleine de doublons n'est pas un code.
 */
export function scoreDeCode(colonne: ColonneObservee): number {
    if (!colonne.renseignees) return 0;
    const unicite = colonne.distinctes / colonne.renseignees;
    if (unicite < 0.95) return 0;
    const nom = nomReduit(colonne.nom);
    let score = 10 * unicite;
    if (colonne.longueurMoyenne <= 12) score += 4;
    if (colonne.longueurMoyenne <= 6) score += 2;
    if (MOTS_DE_CODE.test(nom)) score += 8;
    if (FAUX_CODES.test(nom)) score -= 10;
    if (MOTS_DE_LIBELLE.test(nom)) score -= 4;
    return score;
}

/** Combien une colonne ressemble à un libellé : du texte, long, varié, et un nom qui le dit. */
export function scoreDeLibelle(colonne: ColonneObservee): number {
    if (!colonne.renseignees) return 0;
    const variete = colonne.distinctes / colonne.renseignees;
    let score = 6 * variete + Math.min(colonne.longueurMoyenne, 40) / 4;
    const nom = nomReduit(colonne.nom);
    if (MOTS_DE_LIBELLE.test(nom)) score += 8;
    if (MOTS_DE_CODE.test(nom)) score -= 5;
    // Un libellé contient des espaces : c'est ce qui le distingue d'un identifiant à rallonge.
    if (colonne.exemples.some(valeur => valeur.trim().includes(' '))) score += 3;
    return score;
}

/** La colonne qui obtient le meilleur score, à condition qu'il soit positif. */
function meilleure(colonnes: ColonneObservee[], score: (colonne: ColonneObservee) => number): ColonneObservee | undefined {
    const classees = colonnes
        .map(colonne => ({ colonne, valeur: score(colonne) }))
        .filter(candidate => candidate.valeur > 0)
        .sort((premier, second) => second.valeur - premier.valeur);
    return classees.length ? classees[0].colonne : undefined;
}

/** Part des valeurs d'une colonne que l'on retrouve dans une autre, une fois les deux réduites. */
export function recouvrement(gauche: ColonneObservee, droite: ColonneObservee): number {
    const valeurs = new Set(droite.exemples.map(valeurReduite).filter(Boolean));
    const lues = gauche.exemples.map(valeurReduite).filter(Boolean);
    if (!lues.length || !valeurs.size) return 0;
    return lues.filter(valeur => valeurs.has(valeur)).length / lues.length;
}

/** En deçà, deux colonnes ne parlent pas de la même chose et ne peuvent pas servir de famille commune. */
export const RECOUVREMENT_MINIMUM = 0.5;

/**
 * La paire de colonnes qui dit la même chose des deux côtés : c'est elle qui enfermera la recherche dans la
 * bonne branche. On cherche le meilleur recouvrement de valeurs, pas une égalité de noms — une liste peut
 * appeler « FAMILLE » ce que la nomenclature appelle « CLASSE ».
 */
export function devinerLaBranche(
    liste: ColonneObservee[],
    nomenclature: ColonneObservee[],
    exclues: string[]
): { source: string; nomenclature: string; part: number } | undefined {
    const candidates: { source: string; nomenclature: string; part: number }[] = [];
    for (const colonneListe of liste)
        for (const colonneArbre of nomenclature) {
            if (exclues.includes(colonneArbre.nom)) continue;
            // Une famille prend peu de valeurs différentes : au-delà, c'est déjà le type lui-même.
            if (colonneArbre.distinctes > Math.max(2, nomenclature.length * 4)) continue;
            const part = recouvrement(colonneListe, colonneArbre);
            if (part >= RECOUVREMENT_MINIMUM) candidates.push({ source: colonneListe.nom, nomenclature: colonneArbre.nom, part });
        }
    return candidates.sort((premier, second) => second.part - premier.part)[0];
}

/**
 * Une colonne qui est un second identifiant plutôt qu'un étage de l'arbre : ses valeurs ne se répètent jamais,
 * et elles ont la forme d'un code — nom qui l'annonce, ou valeurs très courtes et sans espace. Un vrai niveau
 * peut n'avoir qu'une ligne par valeur dans une petite nomenclature ; c'est la forme qui tranche, pas le compte.
 */
function estUnSecondCode(colonne: ColonneObservee): boolean {
    if (!colonne.renseignees || colonne.distinctes / colonne.renseignees < 0.95) return false;
    if (MOTS_DE_CODE.test(nomReduit(colonne.nom))) return true;
    const enUnSeulMot = colonne.exemples.every(valeur => !valeur.trim().includes(' '));
    return colonne.longueurMoyenne <= 8 && enUnSeulMot;
}

/**
 * Les niveaux de l'arbre, du plus haut au plus fin : ce sont les colonnes qui restent une fois le code et le
 * libellé mis de côté, rangées par nombre de valeurs différentes croissant. Une famille en a moins qu'un
 * système, qui en a moins qu'un sous-système : l'arbre se lit dans les chiffres.
 */
export function devinerLesNiveaux(nomenclature: ColonneObservee[], colonneCode: string, colonneLibelleRef: string): string[] {
    const niveaux = nomenclature
        .filter(colonne => colonne.nom !== colonneCode && colonne.nom !== colonneLibelleRef && !estUnSecondCode(colonne))
        .sort((premier, second) => premier.distinctes - second.distinctes)
        .map(colonne => colonne.nom);
    // Le libellé du type ferme le chemin : c'est la feuille de l'arbre.
    return colonneLibelleRef ? [...niveaux, colonneLibelleRef] : niveaux;
}

/**
 * La colonne de la liste qui porte déjà un code du référentiel : ses valeurs se retrouvent parmi les codes de
 * la nomenclature. Souvent à moitié vide — c'est justement ce qu'on vient compléter.
 */
function devinerLeCodeDejaFourni(
    liste: ColonneObservee[],
    nomenclature: ColonneObservee[],
    colonneCode: string,
    colonneLibelle: string
): string {
    const codes = nomenclature.find(colonne => colonne.nom === colonneCode);
    if (!codes) return '';
    const candidates = liste
        .filter(colonne => colonne.nom !== colonneLibelle && colonne.renseignees)
        .map(colonne => ({ nom: colonne.nom, part: recouvrement(colonne, codes) }))
        .filter(candidate => candidate.part >= RECOUVREMENT_MINIMUM)
        .sort((premier, second) => second.part - premier.part);
    return candidates.length ? candidates[0].nom : '';
}

/**
 * La proposition complète. Rien n'est imposé : chaque choix est une liste déroulante que l'on peut changer,
 * et chaque choix est justifié d'une phrase.
 */
export function devinerLaCodification(liste: ColonneObservee[], nomenclature: ColonneObservee[]): PropositionDeCodification {
    const raisons: string[] = [];
    const code = meilleure(nomenclature, scoreDeCode);
    const libelleRef = meilleure(
        nomenclature.filter(colonne => colonne.nom !== code?.nom),
        scoreDeLibelle
    );
    const libelle = meilleure(liste, scoreDeLibelle);
    const colonneCode = code?.nom || '';
    const colonneLibelleRef = libelleRef?.nom || '';
    const colonneLibelle = libelle?.nom || '';
    if (colonneLibelle) raisons.push(`« ${colonneLibelle} » porte le libellé de la liste : c'est sa colonne la plus textuelle.`);
    if (colonneCode) raisons.push(`« ${colonneCode} » porte le code : ses valeurs sont uniques et courtes.`);
    if (colonneLibelleRef) raisons.push(`« ${colonneLibelleRef} » porte le libellé du type, celui auquel on comparera.`);
    const niveaux = devinerLesNiveaux(nomenclature, colonneCode, colonneLibelleRef);
    if (niveaux.length)
        raisons.push(
            `L'arbre se lit ${niveaux.join(' › ')} : rangé du moins de valeurs différentes au plus, c'est du plus haut au plus fin.`
        );
    const branche = devinerLaBranche(liste, nomenclature, [colonneCode, colonneLibelleRef]);
    if (branche)
        raisons.push(
            `On ne cherchera que dans la branche où la ligne se trouve déjà : « ${branche.source} » et « ${branche.nomenclature} » disent la même chose (${Math.round(100 * branche.part)} % de valeurs communes).`
        );
    const colonneCodeExistant = devinerLeCodeDejaFourni(liste, nomenclature, colonneCode, colonneLibelle);
    if (colonneCodeExistant)
        raisons.push(`« ${colonneCodeExistant} » contient déjà des codes du référentiel : ils seront gardés tels quels.`);
    return {
        colonneLibelle,
        colonneCodeExistant,
        colonneCode,
        colonneLibelleRef,
        niveaux,
        restreindreSource: branche?.source || '',
        restreindreNomenclature: branche?.nomenclature || '',
        raisons
    };
}
