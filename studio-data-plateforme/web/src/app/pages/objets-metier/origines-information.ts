/**
 * Une information qui provient d'une autre — repris de la V12.6 de l'application classique.
 *
 * Jusqu'ici, « d'où ça vient » ne connaissait que la colonne d'un fichier : le parcours de la donnée
 * s'arrêtait là. Or une information vient souvent d'une autre information, décrite ailleurs :
 *   • **copie**   — la même valeur, reprise telle quelle (1 ligne → 1 ligne, valeur identique) ;
 *   • **dérivé**  — une valeur calculée ou transformée (1 ligne → 1 ligne, valeur changée) ;
 *   • **agrégé**  — une valeur qui résume plusieurs lignes (N lignes → 1 valeur).
 *
 * Une information peut avoir plusieurs origines. Les boucles sont refusées : si A vient de B, B ne peut pas
 * venir de A, même par un long détour — sinon le parcours de la donnée tournerait en rond.
 *
 * Déclarer une origine, c'est aussi répondre à « d'où ça vient » : une information héritée compte comme
 * alimentée, même sans colonne de fichier.
 *
 * Fonctions pures : aucun accès au réseau ni au DOM.
 */
import type { AttributObjetMetier, ObjetMetier, OrigineInformation } from '../../coeur/modeles';

/** Les trois natures d'une origine, avec de quoi choisir sans se tromper. */
export const NATURES_ORIGINE = {
    copie: {
        libelle: 'Copie',
        relation: 'copié de',
        forme: '1 ligne → 1 ligne, valeur identique',
        explication: "La même valeur, reprise telle quelle. Une ligne d'origine donne une ligne ici, sans transformation.",
        exemple: 'Contrat › Adresse de risque = Personne › Adresse'
    },
    derive: {
        libelle: 'Dérivé',
        relation: 'dérivé de',
        forme: '1 ligne → 1 ligne, valeur transformée',
        explication:
            "Une valeur calculée ou transformée à partir de l'origine : toujours une ligne pour une ligne, mais la valeur change (formule, format, découpage, règle).",
        exemple: 'Âge dérivé de Personne › Date de naissance'
    },
    agrege: {
        libelle: 'Agrégé',
        relation: 'agrégé de',
        forme: 'N lignes → 1 valeur',
        explication: "Une valeur qui résume plusieurs lignes de l'origine : somme, nombre, moyenne, minimum, maximum, dernière valeur.",
        exemple: 'Contrat › Montant des sinistres = somme de Sinistre › Montant'
    }
} as const;
export type NatureOrigine = keyof typeof NATURES_ORIGINE;

/** En un mot, la règle de choix — celle qu'on relit quand on hésite. */
export const REGLE_DE_CHOIX =
    'En un mot : même valeur → Copie · une ligne transformée → Dérivé · plusieurs lignes résumées → Agrégé. ' +
    'Dans le doute, écrivez la règle en clair dans le champ prévu.';

/** L'objet et l'information désignés par une origine, ou null quand ils n'existent plus. */
export function informationDesignee(
    objets: ObjetMetier[],
    boId: string,
    elId: string
): { objet: ObjetMetier; information: AttributObjetMetier } | null {
    const objet = objets.find(candidat => candidat.id === boId);
    if (!objet) return null;
    const information = (objet.elements || []).find(candidat => candidat.id === elId);
    return information ? { objet, information } : null;
}

/** Les origines encore valides : celles dont l'objet et l'information existent toujours. */
export function originesValides(objets: ObjetMetier[], information: AttributObjetMetier): OrigineInformation[] {
    return (information.origins || []).filter(origine => informationDesignee(objets, origine.boId, origine.elId));
}

/** Le nom lisible d'une origine : « Personne › Adresse ». */
export function libelleOrigine(objets: ObjetMetier[], origine: OrigineInformation): string {
    const designee = informationDesignee(objets, origine.boId, origine.elId);
    return designee ? `${designee.objet.name} › ${designee.information.name}` : '(information supprimée)';
}

/**
 * Vrai si, en remontant les origines de proche en proche, on retombe sur l'information de départ. C'est ce
 * qui permet de refuser une boucle avant de l'écrire.
 */
export function remonteJusqua(
    objets: ObjetMetier[],
    boId: string,
    elId: string,
    versBoId: string,
    versElId: string,
    vues = new Set<string>()
): boolean {
    const cle = `${boId}|${elId}`;
    if (vues.has(cle)) return false;
    vues.add(cle);
    if (boId === versBoId && elId === versElId) return true;
    const designee = informationDesignee(objets, boId, elId);
    if (!designee) return false;
    return originesValides(objets, designee.information).some(origine =>
        remonteJusqua(objets, origine.boId, origine.elId, versBoId, versElId, vues)
    );
}

/** Pourquoi une origine est refusée, ou une chaîne vide quand elle est acceptable. */
export function refusDeLOrigine(
    objets: ObjetMetier[],
    information: AttributObjetMetier,
    objetPorteur: string,
    origine: OrigineInformation
): string {
    if (!origine.boId || !origine.elId) return "Choisissez l'objet et l'information d'origine.";
    if (origine.boId === objetPorteur && origine.elId === information.id) return 'Une information ne peut pas provenir d’elle-même.';
    if ((information.origins || []).some(existante => existante.boId === origine.boId && existante.elId === origine.elId))
        return 'Cette origine est déjà déclarée.';
    if (remonteJusqua(objets, origine.boId, origine.elId, objetPorteur, information.id))
        return `Boucle refusée : « ${libelleOrigine(objets, origine)} » provient déjà, directement ou non, de cette information.`;
    return '';
}

/** Ce qui reprend cette information ailleurs — le « Réutilisé par » de la fiche d'origine. */
export function dependantsDe(
    objets: ObjetMetier[],
    boId: string,
    elId: string
): { objet: ObjetMetier; information: AttributObjetMetier; origine: OrigineInformation }[] {
    const dependants: { objet: ObjetMetier; information: AttributObjetMetier; origine: OrigineInformation }[] = [];
    for (const objet of objets)
        for (const information of objet.elements || [])
            for (const origine of originesValides(objets, information))
                if (origine.boId === boId && origine.elId === elId) dependants.push({ objet, information, origine });
    return dependants;
}

/**
 * D'où vient une information, en clair : la colonne du fichier quand il y en a une, et ce dont elle hérite.
 * C'est le texte que lit un collègue qui découvre la donnée.
 */
export function provenanceDe(objets: ObjetMetier[], information: AttributObjetMetier): string {
    const colonnes = (information.mappings || []).map(correspondance => `${correspondance.table}.${correspondance.col}`);
    const heritages = originesValides(objets, information).map(
        origine => `${NATURES_ORIGINE[origine.kind].relation} ${libelleOrigine(objets, origine)}`
    );
    return [...colonnes, ...heritages].join(' · ');
}

/** Vrai quand on sait d'où vient l'information : une colonne de fichier, ou une origine déclarée. */
export function origineConnue(objets: ObjetMetier[], information: AttributObjetMetier): boolean {
    return (information.mappings || []).length > 0 || originesValides(objets, information).length > 0;
}
