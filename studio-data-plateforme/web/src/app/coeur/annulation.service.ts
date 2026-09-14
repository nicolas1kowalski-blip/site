/**
 * Annuler la dernière modification (Ctrl+Z) — repris de la V11 de l'application classique.
 *
 * Ce qui rend une application de gouvernance intimidante, c'est la peur de casser quelque chose : on hésite
 * à corriger une définition, on n'ose pas supprimer un objet inutile. La réponse de la V11 est simple : tout
 * geste qui modifie le référentiel laisse derrière lui de quoi revenir en arrière.
 *
 * Le principe retenu ici n'est pas de photographier tout le référentiel, mais de retenir **le geste
 * inverse** : remettre l'objet supprimé, réécrire la définition telle qu'elle était. C'est plus léger, cela
 * ne touche jamais à ce que d'autres ont modifié entre-temps, et cela passe par les mêmes appels que la
 * saisie ordinaire — donc par les mêmes contrôles de droits côté serveur.
 *
 * Deux façons d'annuler, les deux sur la même pile :
 *   • le bouton « ⟲ Annuler » de la notification qui suit le geste ;
 *   • Ctrl+Z (jamais pendant une saisie : dans un champ, c'est le navigateur qui annule la frappe).
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { NotificationsService } from './notifications.service';

/**
 * Un geste que l'on sait défaire : ce qu'il a changé (dit en français, pour la notification) et comment
 * revenir à l'état d'avant.
 */
export type ActionAnnulable = { quoi: string; retablir: () => Promise<void> };

/** Au-delà, on n'annule plus : une pile trop profonde donne l'illusion de pouvoir tout défaire. */
export const GESTES_RETENUS = 20;

@Injectable({ providedIn: 'root' })
export class AnnulationService {
    private readonly notifications = inject(NotificationsService);
    /** Les gestes annulables, du plus ancien au plus récent : on défait toujours le dernier. */
    private readonly pile = signal<ActionAnnulable[]>([]);

    readonly nombre = computed(() => this.pile().length);
    readonly peutAnnuler = computed(() => this.pile().length > 0);
    /** Ce que Ctrl+Z défera : sert aux infobulles, pour que l'on sache avant de cliquer. */
    readonly dernier = computed(() => this.pile()[this.pile().length - 1]?.quoi || '');

    /**
     * Retient un geste et annonce qu'il est annulable : la notification porte le bouton « ⟲ Annuler »,
     * comme dans le classique, pour que le retour en arrière soit à portée de main tout de suite.
     */
    retenir(action: ActionAnnulable, message = ''): void {
        this.pile.update(pile => [...pile, action].slice(-GESTES_RETENUS));
        this.notifications.avecAction(message || `${action.quoi} — modifié.`, '⟲ Annuler', () => void this.annuler());
    }

    /** Défait le dernier geste retenu. Rend faux quand il n'y avait rien à annuler. */
    async annuler(): Promise<boolean> {
        const action = this.pile()[this.pile().length - 1];
        if (!action) {
            this.notifications.info('Rien à annuler.');
            return false;
        }
        this.pile.update(pile => pile.slice(0, -1));
        try {
            await action.retablir();
            this.notifications.succes(`Annulé : ${action.quoi}.`);
            return true;
        } catch (erreur) {
            // Le geste inverse a échoué (droits retirés, élément repris par quelqu'un d'autre) : on le dit
            // franchement plutôt que de laisser croire que l'état est revenu en arrière.
            this.notifications.erreur(erreur as Error);
            return false;
        }
    }

    /** Vide la pile : après un changement d'espace, les gestes d'avant ne veulent plus rien dire. */
    oublierTout(): void {
        this.pile.set([]);
    }
}
