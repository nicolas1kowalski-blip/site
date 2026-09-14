/**
 * « Et ensuite ? » — le bandeau de bas de page repris de la V12 de l'application classique.
 *
 * Arrivé au bout d'un écran, on sait rarement où aller : ce bandeau propose les deux ou trois écrans qui
 * viennent logiquement après (sources → modèle → extraction, audit → règles, extraction → comparer…).
 * Ce n'est pas un parcours imposé, juste la suite la plus fréquente, à un clic.
 *
 * Il est posé une seule fois, dans la coque, sous la route affichée : chaque écran en hérite sans rien faire.
 * Les suites sont décrites dans coeur/navigation.ts, au même endroit que le menu.
 */
import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { Lien, suitesDe } from '../coeur/navigation';

@Component({
    selector: 'app-et-ensuite',
    imports: [RouterLink],
    template: `
        @if (suites().length) {
            <nav class="et-ensuite" aria-label="Et ensuite ?">
                <span class="discret">Et ensuite ?</span>
                @for (suite of suites(); track suite.chemin) {
                    <a class="bouton petit" [routerLink]="suite.chemin">{{ suite.icone }} {{ suite.libelle }}</a>
                }
            </nav>
        }
    `,
    styles: `
        .et-ensuite {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 8px;
            margin: 18px 0 6px;
            padding-top: 12px;
            border-top: 1px solid var(--bordure);
        }
    `
})
export class EtEnsuiteComponent {
    private readonly routeur = inject(Router);
    readonly suites = signal<Lien[]>([]);

    constructor() {
        this.relire(this.routeur.url);
        this.routeur.events.subscribe(evenement => {
            if (evenement instanceof NavigationEnd) this.relire(evenement.urlAfterRedirects);
        });
    }

    private relire(adresse: string): void {
        this.suites.set(suitesDe(adresse));
    }
}
