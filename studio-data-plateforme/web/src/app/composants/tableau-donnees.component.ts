/**
 * Tableau de résultats réutilisable : des en-têtes, des lignes de valeurs, et les deux conforts de la V11 —
 * le tri par colonne d'un clic et les valeurs vides affichées « — ».
 *
 * Il sert partout où un écran montre le résultat d'une requête sans mise en forme particulière : lignes
 * d'une anomalie, aperçu d'une comparaison, résultat d'une requête SQL, contenu d'une table conçue ou d'un
 * jeu temporaire. Les tableaux qui portent des boutons ou des champs dans leurs cellules gardent leur
 * propre balisage : ce composant n'affiche que des valeurs.
 *
 * Le tri ne redemande rien au serveur : il réordonne les lignes déjà reçues (voir ./tri-tableau.ts).
 */
import { Component, computed, input, signal } from '@angular/core';
import { PleinEcranComponent } from './plein-ecran.component';
import { TriColonne, flecheTri, lignesTriees, triSuivant, valeurAffichee } from './tri-tableau';

@Component({
    selector: 'app-tableau-donnees',
    imports: [PleinEcranComponent],
    template: `
        @if (avecPleinEcran()) {
            <app-plein-ecran />
        }
        @if (lignes().length) {
            <div class="defilement-x">
                <table class="tableau">
                    <thead>
                        <tr>
                            @for (colonne of colonnes(); track $index; let index = $index) {
                                <th
                                    class="triable"
                                    [attr.title]="'Trier sur ' + colonne"
                                    [attr.aria-sort]="etatDeTri(index)"
                                    (click)="trierSur(index)"
                                >
                                    {{ colonne }}{{ fleche(index) }}
                                </th>
                            }
                        </tr>
                    </thead>
                    <tbody>
                        @for (ligne of lignesAffichees(); track $index) {
                            <tr>
                                @for (valeur of ligne; track $index) {
                                    <td [class.vide]="texte(valeur) === tiret">{{ texte(valeur) }}</td>
                                }
                            </tr>
                        }
                    </tbody>
                </table>
            </div>
        } @else {
            <div class="vide">{{ messageVide() }}</div>
        }
    `,
    styles: `
        th.triable {
            cursor: pointer;
            user-select: none;
            white-space: nowrap;
        }
        th.triable:hover {
            color: var(--accent);
        }
        td.vide {
            color: var(--texte-2);
        }
    `
})
export class TableauDonneesComponent {
    readonly colonnes = input<string[]>([]);
    readonly lignes = input<unknown[][]>([]);
    /** Ce qu'on dit quand il n'y a rien à montrer : chaque écran a sa formule. */
    readonly messageVide = input('Aucune ligne.');
    /** Le bouton ⛶ n'a de sens que si le tableau est seul dans sa carte. */
    readonly avecPleinEcran = input(false);

    readonly tri = signal<TriColonne>(null);
    readonly tiret = valeurAffichee(null);
    readonly lignesAffichees = computed(() => lignesTriees(this.lignes(), this.tri()));

    texte(valeur: unknown): string {
        return valeurAffichee(valeur);
    }
    fleche(colonne: number): string {
        return flecheTri(this.tri(), colonne);
    }
    /** Pour les lecteurs d'écran : l'attribut standard qui dit comment la colonne est triée. */
    etatDeTri(colonne: number): string {
        const tri = this.tri();
        if (!tri || tri.colonne !== colonne) return 'none';
        return tri.sens === 'asc' ? 'ascending' : 'descending';
    }
    trierSur(colonne: number): void {
        this.tri.update(courant => triSuivant(courant, colonne));
    }
}
