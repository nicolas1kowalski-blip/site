/**
 * Tableau paginé de lignes (50 par page) rendu par le serveur : lignes d'une anomalie, lignes en échec d'une règle.
 * Le parent charge chaque page ; ce composant affiche, pagine et propose l'export CSV de ce qui est chargé
 * ou de l'ensemble (le parent fournit alors toutes les pages).
 */
import { Component, input, output } from '@angular/core';
import { TableauDonneesComponent } from '../../composants/tableau-donnees.component';
import { PageLignes } from '../../coeur/modeles';

export const TAILLE_PAGE_LIGNES = 50;

@Component({
    selector: 'app-page-lignes',
    template: `
        @if (page(); as page) {
            <div class="entete-page" style="margin: 0 0 8px">
                <b>{{ titre() }}</b>
                <span class="badge neutre">{{ page.total }} ligne(s)</span>
                <span class="espace"></span>
                <button
                    class="bouton petit"
                    type="button"
                    (click)="changerOffset.emit(page.offset - taillePage)"
                    [disabled]="page.offset === 0 || enCours()"
                >
                    ◀ Précédentes
                </button>
                <span class="discret"
                    >{{ page.total ? page.offset + 1 : 0 }} – {{ minimum(page.offset + page.lignes.length, page.total) }}</span
                >
                <button
                    class="bouton petit"
                    type="button"
                    (click)="changerOffset.emit(page.offset + taillePage)"
                    [disabled]="page.offset + page.lignes.length >= page.total || enCours()"
                >
                    Suivantes ▶
                </button>
                <button class="bouton petit" type="button" (click)="exporter.emit()" [disabled]="!page.total || enCours()">
                    Exporter en CSV
                </button>
                <button class="bouton petit" type="button" (click)="fermer.emit()">Fermer</button>
            </div>
            <app-tableau-donnees [colonnes]="page.colonnes" [lignes]="page.lignes" />
        }
    `,
    imports: [TableauDonneesComponent]
})
export class PageLignesComponent {
    readonly titre = input('Lignes');
    readonly page = input<PageLignes | null>(null);
    readonly enCours = input(false);
    readonly changerOffset = output<number>();
    readonly exporter = output<void>();
    readonly fermer = output<void>();
    readonly taillePage = TAILLE_PAGE_LIGNES;

    minimum(gauche: number, droite: number): number {
        return Math.min(gauche, droite);
    }
}
