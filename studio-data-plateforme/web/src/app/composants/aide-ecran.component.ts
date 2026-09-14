/**
 * Bandeau « Ici, vous… » — la phrase d'aide de chaque écran de gouvernance, reprise de la V13.
 *
 * La gouvernance s'adresse à des gens qui ne sont pas informaticiens : arriver sur un écran sans savoir ce
 * qu'on y fait est décourageant. Une phrase en tête dit ce qu'on y fait, une seconde dit pourquoi. On la
 * referme d'un clic quand on la connaît, et elle ne revient plus sur cet écran.
 *
 * Il est posé une seule fois, dans la coque, au-dessus de la route affichée : les écrans n'ont rien à faire.
 * Les phrases vivent dans coeur/vocabulaire-metier.ts, avec le lexique.
 */
import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { cheminNormalise } from '../coeur/navigation';
import { PreferencesService } from '../coeur/preferences.service';
import { AideEcran, aideDe } from '../coeur/vocabulaire-metier';

/** Préfixe des préférences : une clé par écran, pour que chaque bandeau se referme séparément. */
const CLE_AIDE = 'aide-ecran';

@Component({
    selector: 'app-aide-ecran',
    template: `
        @if (aide(); as aide) {
            <div class="carte bandeau-aide">
                <span class="pictogramme">{{ aide.pictogramme }}</span>
                <div class="espace">
                    <b>{{ aide.quoi }}</b>
                    <div class="discret">{{ aide.pourquoi }}</div>
                </div>
                <button class="bouton petit" type="button" name="fermerAide" title="Ne plus afficher sur cet écran" (click)="fermer()">
                    ✕
                </button>
            </div>
        }
    `,
    styles: `
        .bandeau-aide {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            border-left: 3px solid var(--accent);
        }
        .pictogramme {
            font-size: 20px;
            line-height: 1.2;
        }
    `
})
export class AideEcranComponent {
    private readonly routeur = inject(Router);
    private readonly preferences = inject(PreferencesService);
    readonly aide = signal<AideEcran | null>(null);
    private chemin = '';

    constructor() {
        this.relire(this.routeur.url);
        this.routeur.events.subscribe(evenement => {
            if (evenement instanceof NavigationEnd) this.relire(evenement.urlAfterRedirects);
        });
    }

    fermer(): void {
        this.preferences.ecrire(`${CLE_AIDE}.${this.chemin}`, false);
        this.aide.set(null);
    }

    private relire(adresse: string): void {
        this.chemin = cheminNormalise(adresse);
        const montrer = this.preferences.lireBooleen(`${CLE_AIDE}.${this.chemin}`, true);
        this.aide.set(montrer ? aideDe(this.chemin) : null);
    }
}
