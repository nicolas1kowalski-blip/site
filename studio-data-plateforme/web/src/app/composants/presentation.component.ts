/**
 * Imprimer une fiche, et le mode présentation — repris de la V11 de l'application classique.
 *
 * Deux besoins qui reviennent dès qu'on montre la gouvernance à quelqu'un :
 *   • **imprimer** (⎙) une fiche pour l'emporter en réunion ou l'enregistrer en PDF. On n'imprime que la
 *     fiche : le menu, les barres et les boutons disparaissent, et le vocabulaire métier est celui de
 *     l'écran, pas celui de la base ;
 *   • **présenter** (Maj+P) : grandes polices, menu masqué, rien à cliquer par mégarde — ce qu'il faut pour
 *     projeter un écran devant un comité sans qu'il devienne illisible.
 *
 * Les deux ne touchent qu'à l'affichage : aucune donnée n'est modifiée, et quitter le mode rend l'écran tel
 * qu'il était.
 */
import { Component, HostListener, inject, signal } from '@angular/core';
import { PreferencesService } from '../coeur/preferences.service';

/** Classe posée sur le corps de la page pendant une présentation ; les styles vivent dans styles.css. */
const CLASSE_PRESENTATION = 'en-presentation';
/** Clé de la préférence : le mode présentation se retrouve tel qu'on l'a laissé. */
const CLE_PRESENTATION = 'affichage.presentation';

@Component({
    selector: 'app-presentation',
    template: `
        <button class="bouton petit" type="button" name="imprimer" title="Imprimer l'écran ou l'enregistrer en PDF" (click)="imprimer()">
            ⎙
        </button>
        <button
            class="bouton petit"
            type="button"
            name="presentation"
            [class.actif]="presentation()"
            title="Mode présentation : grandes polices, menu masqué (Maj + P)"
            (click)="basculerPresentation()"
        >
            {{ presentation() ? '⤡' : '🖵' }}
        </button>
    `,
    styles: `
        :host {
            display: inline-flex;
            gap: 4px;
        }
    `
})
export class PresentationComponent {
    private readonly preferences = inject(PreferencesService);
    readonly presentation = signal(false);

    constructor() {
        if (this.preferences.lireBooleen(CLE_PRESENTATION)) this.basculerPresentation();
    }

    /**
     * L'impression ne demande rien de plus que d'ouvrir la boîte du navigateur : la feuille de style
     * d'impression (bloc « @media print » de styles.css) se charge de ne garder que le contenu de l'écran,
     * et « Enregistrer en PDF » y est proposé comme n'importe quelle imprimante.
     */
    imprimer(): void {
        window.print();
    }

    /** Entre ou sort du mode présentation, et retient le choix pour la prochaine fois. */
    basculerPresentation(): void {
        this.presentation.update(actif => !actif);
        document.body.classList.toggle(CLASSE_PRESENTATION, this.presentation());
        this.preferences.ecrire(CLE_PRESENTATION, this.presentation());
    }

    /** Maj+P bascule la présentation ; Échap en sort. Jamais pendant une saisie. */
    @HostListener('document:keydown', ['$event'])
    auClavier(evenement: KeyboardEvent): void {
        const cible = evenement.target as HTMLElement | null;
        const enSaisie = !!cible && (['INPUT', 'TEXTAREA', 'SELECT'].includes(cible.tagName) || cible.isContentEditable);
        if (evenement.key === 'Escape' && this.presentation()) {
            this.basculerPresentation();
            return;
        }
        if (enSaisie || evenement.ctrlKey || evenement.metaKey || evenement.altKey) return;
        if (evenement.shiftKey && evenement.key.toLowerCase() === 'p') {
            evenement.preventDefault();
            this.basculerPresentation();
        }
    }
}
