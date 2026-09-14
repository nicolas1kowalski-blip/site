/**
 * Actions groupées sur les informations d'un objet — reprises de la V11 de l'application classique.
 *
 * Décrire un objet, c'est souvent répéter le même geste trente fois : poser la même confidentialité sur
 * toutes les colonnes d'identité, désigner le même responsable, dire que les mêmes informations servent à la
 * même application. La V11 permet de cocher plusieurs informations et d'appliquer le geste une seule fois.
 *
 * Quatre raccourcis de sélection, ceux qui servent vraiment : tout, aucun, celles **sans définition** (le
 * trou le plus courant), celles **dont on ne sait pas d'où elles viennent**.
 *
 * Fonctions pures : elles reçoivent l'objet et rendent un nouvel objet, sans toucher à celui d'origine et
 * sans rien connaître de l'écran.
 */
import type { AttributObjetMetier, ObjetMetier } from '../../coeur/modeles';

/** Ce que l'on peut poser d'un coup sur plusieurs informations. */
export type ActionGroupee = 'confidentialite' | 'terme' | 'responsable' | 'usage' | 'definition';

/** Le libellé de chaque action, et ce que la valeur attendue représente. */
export const ACTIONS_GROUPEES: { action: ActionGroupee; libelle: string; valeur: string }[] = [
    { action: 'confidentialite', libelle: 'Confidentialité', valeur: 'niveau' },
    { action: 'terme', libelle: 'Poser un mot du glossaire', valeur: 'terme' },
    { action: 'responsable', libelle: "Responsable de l'information", valeur: 'personne ou direction' },
    { action: 'usage', libelle: 'Usage par une application ou un processus', valeur: 'application' },
    { action: 'definition', libelle: 'Définition (remplace)', valeur: 'définition commune' }
];

/** Les façons de choisir les informations concernées, sans les cocher une par une. */
export type ChoixRapide = 'tout' | 'aucun' | 'sansDefinition' | 'sansOrigine';

/** Ce que désigne un choix rapide, dans l'ordre où l'objet présente ses informations. */
export function selonLeChoix(informations: AttributObjetMetier[], choix: ChoixRapide): string[] {
    if (choix === 'aucun') return [];
    if (choix === 'tout') return informations.map(information => information.id);
    if (choix === 'sansDefinition') return informations.filter(information => !information.definition).map(information => information.id);
    return informations
        .filter(information => !(information.mappings || []).length && !(information.origins || []).length)
        .map(information => information.id);
}

/** Applique le geste à une information ; rend une copie modifiée, l'originale reste telle quelle. */
function informationModifiee(information: AttributObjetMetier, action: ActionGroupee, valeur: string): AttributObjetMetier {
    if (action === 'confidentialite') return { ...information, sensitivity: valeur };
    if (action === 'terme') return { ...information, term: valeur };
    if (action === 'responsable') return { ...information, owner: valeur };
    if (action === 'definition') return { ...information, definition: valeur };
    // Usage : on ajoute l'application à celles déjà citées, sans jamais en retirer une.
    const usages = information.usedBy || [];
    return usages.includes(valeur) ? information : { ...information, usedBy: [...usages, valeur] };
}

/**
 * L'objet après le geste groupé, et le nombre d'informations réellement changées — c'est ce nombre que l'on
 * annonce, pas celui des cases cochées : dire « 7 modifiées » quand deux l'étaient déjà serait faux.
 */
export function objetApresGeste(
    objet: ObjetMetier,
    informationsChoisies: string[],
    action: ActionGroupee,
    valeur: string
): { objet: ObjetMetier; modifiees: number } {
    const choisies = new Set(informationsChoisies);
    let modifiees = 0;
    const elements = (objet.elements || []).map(information => {
        if (!choisies.has(information.id)) return information;
        const apres = informationModifiee(information, action, valeur);
        if (apres !== information) modifiees += 1;
        return apres;
    });
    return { objet: { ...objet, elements }, modifiees };
}

/** Ce qui empêche d'appliquer le geste, dit en clair ; chaîne vide quand tout est en ordre. */
export function refusDuGeste(informationsChoisies: string[], action: ActionGroupee, valeur: string): string {
    if (!informationsChoisies.length) return 'Cochez au moins une information.';
    // Une définition commune peut être vidée volontairement ; les autres actions demandent une valeur.
    if (!valeur.trim() && action !== 'definition') return 'Indiquez une valeur à appliquer.';
    return '';
}
