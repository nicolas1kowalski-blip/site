/**
 * Bandeau « aucune source chargée » — repris de la V12 de l'application classique.
 *
 * Arriver sur Extraire, Comparer ou Qualité dans un espace vide donnait des listes déroulantes vides et
 * aucune explication. Ce bandeau dit ce qui manque et donne le bouton pour y remédier, sans masquer
 * l'écran : on peut toujours regarder comment il est fait.
 *
 * Il est posé une seule fois, dans la coque, au-dessus de la route affichée. Les écrans concernés sont
 * décrits dans coeur/navigation.ts (ECRANS_AVEC_DONNEES).
 */
import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { ClientApiService } from '../coeur/client-api.service';
import { demandeDesDonnees } from '../coeur/navigation';

@Component({
    selector: 'app-sans-donnees',
    imports: [RouterLink],
    template: `
        @if (aMontrer()) {
            <div class="carte bandeau-vide">
                <span class="pictogramme">▤</span>
                <div class="espace">
                    <b>Aucune source chargée dans cet espace.</b>
                    <div class="discret">
                        Cet écran travaille sur vos données : commencez par déposer un fichier (CSV, Excel, Parquet…).
                    </div>
                </div>
                <a class="bouton principal" routerLink="/sources" [queryParams]="{ action: 'charger' }">Charger un fichier</a>
            </div>
        }
    `,
    styles: `
        .bandeau-vide {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .pictogramme {
            font-size: 22px;
        }
    `
})
export class SansDonneesComponent {
    private readonly api = inject(ClientApiService);
    private readonly routeur = inject(Router);
    /** Nombre de sources de l'espace ; null tant qu'on ne l'a pas encore demandé. */
    readonly nombreDeSources = signal<number | null>(null);
    readonly ecranConcerne = signal(false);

    constructor() {
        void this.relire(this.routeur.url);
        this.routeur.events.subscribe(evenement => {
            if (evenement instanceof NavigationEnd) void this.relire(evenement.urlAfterRedirects);
        });
    }

    /** Le bandeau ne s'affiche que sur un écran concerné, et seulement une fois le compte connu. */
    aMontrer(): boolean {
        return this.ecranConcerne() && this.nombreDeSources() === 0;
    }

    private async relire(adresse: string): Promise<void> {
        this.ecranConcerne.set(demandeDesDonnees(adresse));
        if (!this.ecranConcerne()) return;
        try {
            this.nombreDeSources.set((await this.api.sourcesEtJeux()).length);
        } catch {
            // Espace inaccessible ou moteur indisponible : l'écran affichera sa propre erreur, pas ce bandeau.
            this.nombreDeSources.set(null);
        }
    }
}
