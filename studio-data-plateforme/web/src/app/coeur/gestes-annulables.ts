/**
 * Le geste inverse d'une écriture de gouvernance — le cœur de l'annulation (V11).
 *
 * Les référentiels de gouvernance s'écrivent tous de la même façon : on remplace un élément entier
 * (« enregistrer l'objet métier bo_123 »), ou on le supprime. Le geste inverse se déduit donc toujours de la
 * même manière, et ce module le construit une fois pour toutes :
 *
 *   • on a **modifié** un élément qui existait déjà → réécrire la version d'avant ;
 *   • on a **créé** un élément qui n'existait pas → l'effacer ;
 *   • on a **supprimé** un élément → le réécrire tel qu'il était.
 *
 * Rien ici ne connaît Angular ni le réseau : les appels sont passés en paramètre. C'est ce qui permet de
 * tester ces règles telles quelles, et de les réutiliser pour les objets métier, le glossaire et les
 * applications sans les réécrire.
 */
import type { ActionAnnulable } from './annulation.service';

/** Tout élément de gouvernance : un identifiant, et le reste du contenu. */
export type ElementIdentifie = { id: string };

/** Ce qu'il faut savoir faire pour défaire une écriture : réécrire, effacer, et relire l'écran ensuite. */
export type MoyensDuRetour<T extends ElementIdentifie> = {
    /** Réécrit l'élément tel qu'il était (même appel que l'enregistrement ordinaire). */
    ecrire: (id: string, contenu: Omit<T, 'id'>) => Promise<unknown>;
    /** Efface l'élément (même appel que la suppression ordinaire). */
    effacer: (id: string) => Promise<unknown>;
    /** Relit l'écran après le retour en arrière, pour que l'on voie tout de suite le résultat. */
    relire: () => Promise<void>;
};

/** Sépare l'identifiant du contenu : c'est la forme qu'attendent les routes « enregistrer ». */
function contenuDe<T extends ElementIdentifie>(element: T): Omit<T, 'id'> {
    const { id, ...contenu } = element;
    void id;
    return contenu as Omit<T, 'id'>;
}

/**
 * Le geste inverse d'un enregistrement. `avant` est l'élément tel qu'il était avant la saisie, ou null
 * quand on vient de le créer — auquel cas annuler veut dire l'effacer.
 */
export function retourDUneEcriture<T extends ElementIdentifie>(
    quoi: string,
    identifiant: string,
    avant: T | null,
    moyens: MoyensDuRetour<T>
): ActionAnnulable {
    return {
        quoi,
        retablir: async () => {
            if (avant) await moyens.ecrire(identifiant, contenuDe(avant));
            else await moyens.effacer(identifiant);
            await moyens.relire();
        }
    };
}

/** Le geste inverse d'une suppression : remettre l'élément tel qu'il était, identifiant compris. */
export function retourDUneSuppression<T extends ElementIdentifie>(quoi: string, supprime: T, moyens: MoyensDuRetour<T>): ActionAnnulable {
    return {
        quoi,
        retablir: async () => {
            await moyens.ecrire(supprime.id, contenuDe(supprime));
            await moyens.relire();
        }
    };
}

/**
 * La question posée avant une suppression. On nomme ce que l'on s'apprête à perdre, et on rappelle que ce
 * n'est pas définitif : c'est ce qui distingue une suppression sûre d'un couperet.
 */
export function questionAvantSuppression(quoi: string): string {
    return `Supprimer ${quoi} ?\n\nVous pourrez revenir en arrière avec « ⟲ Annuler » ou Ctrl+Z juste après.`;
}
