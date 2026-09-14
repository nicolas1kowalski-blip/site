/**
 * Où en est une fiche du dictionnaire — reprise du cycle de validation de la V13.
 *
 * Une définition écrite n'est pas une définition validée. Tant que les deux se ressemblent à l'écran,
 * personne ne sait ce sur quoi il peut s'appuyer. La V13 donne donc un statut à chaque fiche —
 * brouillon, proposée, validée, obsolète — et garde trace de chaque passage de l'un à l'autre : quand,
 * par qui, et pourquoi.
 *
 * Deux règles qui tiennent tout :
 *   • un changement de statut est **daté, attribué et historisé** ; on peut toujours dire qui a validé
 *     quoi et quand, ce qui est la seule chose qui rend une validation opposable ;
 *   • le même statut réécrit ne produit rien : on ne fabrique pas d'historique pour du vent.
 *
 * Fonctions pures : elles ne connaissent que les fiches, jamais l'écran.
 */
import type { FicheDictionnaire } from '../../coeur/modeles';

/** Les quatre statuts de la V13, dans l'ordre où l'on y passe. */
export const STATUTS_FICHE = ['Brouillon', 'Proposé', 'Validé', 'Obsolète'];

/** Le statut de départ d'une fiche dont personne n'a encore rien dit. */
export const STATUT_INITIAL = 'Brouillon';

/** Un passage d'un statut à un autre : quand, d'où, vers où, par qui, et pourquoi. */
export type PassageDeStatut = { at: string; from: string; to: string; by: string; comment: string };

/** Une fiche qui porte un statut : le dictionnaire, mais aussi un objet métier. */
export type FicheValidable = {
    status?: string;
    statusAt?: string;
    statusBy?: string;
    history?: PassageDeStatut[];
    [autre: string]: unknown;
};

/** Combien de passages on garde : de quoi remonter loin, sans faire enfler la fiche indéfiniment. */
export const PASSAGES_RETENUS = 100;

/** Ce qui est écrit quand personne ne s'est nommé : on le dit plutôt que de laisser un blanc. */
export const AUTEUR_INCONNU = '(non renseigné)';

/** Le statut d'une fiche, toujours renseigné : sans rien de dit, elle est au brouillon. */
export function statutDe(fiche: FicheValidable): string {
    return String(fiche.status || STATUT_INITIAL);
}

/**
 * Change le statut d'une fiche, en gardant trace du passage. Rend faux — et n'écrit rien — quand le
 * statut demandé est celui que la fiche porte déjà.
 */
export function changerLeStatut(fiche: FicheValidable, nouveau: string, par: string, commentaire = '', quand = new Date()): boolean {
    const ancien = statutDe(fiche);
    if (ancien === nouveau || !STATUTS_FICHE.includes(nouveau)) return false;
    const horodatage = quand.toISOString();
    fiche.status = nouveau;
    fiche.statusAt = horodatage;
    fiche.statusBy = par.trim() || AUTEUR_INCONNU;
    const passages = fiche.history || [];
    passages.push({ at: horodatage, from: ancien, to: nouveau, by: fiche.statusBy, comment: commentaire.trim() });
    // Les plus anciens passages s'effacent d'abord : c'est le récent qui sert.
    fiche.history = passages.slice(-PASSAGES_RETENUS);
    return true;
}

/** Depuis quand, et par qui — la phrase montrée sur le badge du statut. */
export function depuisQuand(fiche: FicheValidable, formaterDate: (date: string) => string): string {
    if (!fiche.statusAt) return 'Statut jamais modifié.';
    return `Depuis le ${formaterDate(String(fiche.statusAt))} par ${fiche.statusBy || AUTEUR_INCONNU}.`;
}

/** Les passages du plus récent au plus ancien : on lit d'abord ce qui vient d'arriver. */
export function passagesRecentsDAbord(fiche: FicheValidable): PassageDeStatut[] {
    return [...(fiche.history || [])].reverse();
}

/** Où en est l'ensemble du dictionnaire : de quoi savoir s'il reste du travail, et combien. */
export type AvancementDuDictionnaire = { total: number; validees: number; aValider: number; obsoletes: number; pourcentage: number };

/**
 * L'avancement, calculé sur les seules sources qui existent : une fiche laissée par une source disparue
 * fausserait le compte sans que personne ne puisse rien y faire.
 */
export function avancementDuDictionnaire(fiches: Record<string, FicheDictionnaire>, nomsDesSources: string[]): AvancementDuDictionnaire {
    const existantes = nomsDesSources.map(nom => (fiches[nom] || {}) as FicheValidable);
    const validees = existantes.filter(fiche => statutDe(fiche) === 'Validé').length;
    return {
        total: existantes.length,
        validees,
        aValider: existantes.filter(fiche => statutDe(fiche) === 'Proposé').length,
        obsoletes: existantes.filter(fiche => statutDe(fiche) === 'Obsolète').length,
        pourcentage: existantes.length ? Math.round((100 * validees) / existantes.length) : 0
    };
}

/** Les sources dont la fiche attend une décision : c'est la file de travail du responsable. */
export function sourcesAValider(fiches: Record<string, FicheDictionnaire>, nomsDesSources: string[]): string[] {
    return nomsDesSources.filter(nom => statutDe((fiches[nom] || {}) as FicheValidable) === 'Proposé');
}
