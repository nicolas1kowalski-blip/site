/**
 * Bouton ⛶ « plein écran » à poser sur un tableau, un rapport d'audit, un tableau de bord, une préparation,
 * une série ou un rapprochement — repris de l'application classique (V11).
 *
 * Le bouton agrandit l'élément qui le contient : la carte occupe toute la fenêtre, le reste de l'écran
 * disparaît, et Échap (ou le même bouton) revient à la disposition normale. On travaille ainsi sur un grand
 * tableau sans perdre le contexte de l'écran.
 *
 * Usage :  <div class="carte">  <app-plein-ecran />  …le contenu…  </div>
 */
import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';

/** Classe posée sur l'élément agrandi ; les styles vivent dans styles.css, avec le reste du thème. */
const CLASSE_PLEIN_ECRAN = 'en-plein-ecran';

@Component({
    selector: 'app-plein-ecran',
    template: `
        <button
            class="bouton petit"
            type="button"
            name="pleinEcran"
            (click)="basculer()"
            [title]="agrandi() ? 'Revenir à la taille normale (Échap)' : 'Afficher en plein écran'"
        >
            {{ agrandi() ? '⤡' : '⛶' }}
        </button>
    `,
    styles: `
        :host {
            float: right;
            margin-left: 8px;
        }
    `
})
export class PleinEcranComponent {
    private readonly element = inject(ElementRef<HTMLElement>);
    readonly agrandi = signal(false);

    /** L'élément agrandi est le conteneur du bouton : la carte, la section ou le tableau qui l'accueille. */
    private conteneur(): HTMLElement | null {
        return (this.element.nativeElement as HTMLElement).parentElement;
    }

    basculer(): void {
        const conteneur = this.conteneur();
        if (!conteneur) return;
        this.agrandi.update(etat => !etat);
        conteneur.classList.toggle(CLASSE_PLEIN_ECRAN, this.agrandi());
        document.body.classList.toggle('avec-plein-ecran', this.agrandi());
    }

    @HostListener('document:keydown.escape')
    quitter(): void {
        if (this.agrandi()) this.basculer();
    }
}
