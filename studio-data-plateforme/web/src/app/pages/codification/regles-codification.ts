/**
 * Ce que l'écran de codification a besoin de calculer, et qui ne regarde pas le serveur : lire une règle en
 * français, ranger les cas à revoir, dire où en est la couverture. Fonctions pures, donc testables seules.
 */

/** Une règle telle que l'écran la manipule ; le serveur en attend la même forme. */
export type RegleCodification = {
    id: string;
    actif: boolean;
    code: string;
    colonne: string;
    type: 'motscles' | 'expression';
    contient: string[];
    ou: boolean;
    sauf: string[];
    motif: string;
};

/**
 * La règle dite en français, comme on la lirait à voix haute. C'est ce qui permet de relire une pile de
 * quarante règles sans ouvrir chacune : « si le libellé contient POMPE et CENTRIFUGE mais pas VIDE → PMP-C ».
 */
export function phraseDeLaRegle(regle: RegleCodification, colonneParDefaut: string): string {
    const colonne = regle.colonne || colonneParDefaut || 'le libellé';
    if (regle.type === 'expression')
        return regle.motif.trim()
            ? `si ${colonne} correspond à « ${regle.motif.trim()} » → ${regle.code}`
            : `règle incomplète : il manque l'expression`;
    if (!regle.contient.length) return `règle incomplète : il manque les mots à chercher`;
    const voulus = regle.contient.join(regle.ou ? ' ou ' : ' et ');
    const exclus = regle.sauf.length ? ` mais pas ${regle.sauf.join(' ni ')}` : '';
    return `si ${colonne} contient ${voulus}${exclus} → ${regle.code}`;
}

/** Une colonne de la liste comparée à une colonne de la nomenclature, avec son poids. */
export type ComparaisonCodification = { id: string; colonneSource: string; colonneNomenclature: string; poids: number; methode: string };

/**
 * La comparaison dite en français : « le libellé de la liste contre le libellé du type, poids 3 ». C'est la
 * phrase qui permet de vérifier qu'on n'a pas croisé les colonnes des deux côtés.
 */
export function phraseDeLaComparaison(comparaison: ComparaisonCodification, methodes: Record<string, string>): string {
    if (!comparaison.colonneSource || !comparaison.colonneNomenclature)
        return 'comparaison incomplète : choisissez une colonne de chaque côté';
    const mesure = comparaison.methode ? ` (${(methodes[comparaison.methode] || comparaison.methode).split(' (')[0]})` : '';
    const poids = comparaison.poids && comparaison.poids !== 1 ? `, poids ${comparaison.poids}` : '';
    return `${comparaison.colonneSource} contre ${comparaison.colonneNomenclature}${poids}${mesure}`;
}

/** Un mot retenu et les autres façons de l'écrire. */
export type SynonymeCodification = { id: string; motRetenu: string; variantes: string[]; proche: boolean };

/**
 * Le synonyme dit en français, pour se relire : « MOTOPOMPE, GROUPE MOTOPOMPE valent POMPE ». C'est la
 * phrase qui permet de vérifier d'un coup d'œil qu'on n'a pas écrit l'équivalence à l'envers.
 */
export function phraseDuSynonyme(synonyme: SynonymeCodification): string {
    if (!synonyme.motRetenu.trim()) return 'synonyme incomplet : il manque le mot retenu';
    if (!synonyme.variantes.length) return `« ${synonyme.motRetenu} » : aucune variante déclarée`;
    const tolerance = synonyme.proche ? ', même mal orthographiées' : '';
    return `${synonyme.variantes.join(', ')} ${synonyme.variantes.length > 1 ? 'valent' : 'vaut'} ${synonyme.motRetenu}${tolerance}`;
}

/** Les mots d'une saisie libre : séparés par des virgules ou des points-virgules, les vides écartés. */
export function motsSaisis(saisie: string): string[] {
    return saisie
        .split(/[;,]/)
        .map(mot => mot.trim())
        .filter(Boolean);
}

/** L'inverse : de quoi remettre une liste de mots dans le champ de saisie. */
export function saisieDesMots(mots: string[]): string {
    return mots.join(' ; ');
}

/** Les couleurs des trois statuts, pour que l'œil trie avant de lire. */
export const ALLURES_DE_STATUT: Record<string, { libelle: string; allure: string }> = {
    office: { libelle: "Codé d'office", allure: 'succes' },
    revoir: { libelle: 'À revoir', allure: 'alerte' },
    absent: { libelle: 'Non trouvé', allure: 'neutre' }
};

/** L'allure d'un statut, ou le neutre pour un statut qu'on ne connaît pas. */
export function allureDuStatut(statut: string): { libelle: string; allure: string } {
    return ALLURES_DE_STATUT[statut] || { libelle: statut, allure: 'neutre' };
}

/** D'où vient un code, dit en clair — « regle:r3 » n'apprend rien à personne. */
export function phraseDeLOrigine(origine: string, regles: RegleCodification[]): string {
    if (origine.startsWith('regle:')) {
        const regle = regles.find(candidate => candidate.id === origine.slice('regle:'.length));
        return regle ? `règle « ${regle.code} »` : 'règle supprimée depuis';
    }
    const phrases: Record<string, string> = {
        existant: 'code déjà fourni',
        correspondance: 'table de correspondance',
        ressemblance: 'ressemblance du libellé',
        decision: 'décision prise à la revue',
        aucune: 'rien trouvé'
    };
    return phrases[origine] || origine;
}

/** Un score rendu lisible : 0,93 devient « 93 % ». */
export function scoreLisible(score: number): string {
    return `${Math.round(100 * (Number(score) || 0))} %`;
}

/** La couleur d'une proposition : plus elle est sûre, plus elle est verte. */
export function allureDuScore(score: number, seuilAuto: number): string {
    if (score >= seuilAuto) return 'succes';
    if (score >= seuilAuto / 2) return 'alerte';
    return 'neutre';
}

/** Combien de lignes on montre d'un coup dans le tableau du résultat. */
export const LIGNES_MONTREES = 200;

/**
 * La prochaine chose à faire, d'après le bilan. Un écran qui dit « 47 à revoir » sans dire quoi en faire
 * laisse l'utilisateur devant son tas.
 */
export function prochaineAction(bilan: { total: number; revoir: number; absent: number } | null): string {
    if (!bilan || !bilan.total) return 'Choisissez la liste à coder et la nomenclature, puis lancez la codification.';
    if (bilan.revoir) return `Passez les ${bilan.revoir} cas à revoir : chaque décision servira aux prochaines livraisons.`;
    if (bilan.absent) return `${bilan.absent} ligne(s) sans proposition : ajoutez une règle de mots-clés pour les attraper.`;
    return 'Tout est codé : le résultat peut partir.';
}
