/**
 * En-tête de page unifié, repris de l'application classique : un titre, une phrase, et les explications
 * longues repliées derrière « ℹ️ En savoir plus » — on ne lit le détail que si on en a besoin.
 *
 * Les boutons d'action de l'écran se projettent à droite du titre :
 *
 *   <app-entete-page titre="Qualité & Audit" phrase="Profilez une source, listez ses anomalies.">
 *       <p detail>Le profilage mesure la complétude, les doublons…</p>
 *       <button class="bouton principal">Lancer l'audit</button>
 *   </app-entete-page>
 *
 * Le repli est mémorisé par écran : celui qui déplie une fois n'a pas à recommencer à chaque visite.
 */
import { Component, inject, input, signal } from '@angular/core';
import { PreferencesService } from '../coeur/preferences.service';

@Component({
    selector: 'app-entete-page',
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>{{ titre() }}</h1>
                @if (phrase()) {
                    <p class="discret">{{ phrase() }}</p>
                }
            </div>
            <ng-content />
        </div>
        @if (avecDetail()) {
            <div class="detail-page">
                <button class="bouton petit" type="button" name="enSavoirPlus" (click)="basculer()">
                    ℹ️ {{ deplie() ? 'Masquer le détail' : 'En savoir plus' }}
                </button>
                @if (deplie()) {
                    <div class="corps-detail"><ng-content select="[detail]" /></div>
                }
            </div>
        }
    `,
    styles: `
        h1 {
            margin: 0;
        }
        .detail-page {
            margin: -4px 0 12px;
        }
        .corps-detail {
            margin-top: 6px;
            padding: 10px 12px;
            border: 1px solid var(--bordure);
            border-radius: 8px;
            background: var(--surface-2);
            font-size: 13px;
        }
    `
})
export class EntetePageComponent {
    private readonly preferences = inject(PreferencesService);

    readonly titre = input.required<string>();
    readonly phrase = input('');
    /** Faux quand l'écran n'a rien à expliquer de plus : le bouton disparaît alors. */
    readonly avecDetail = input(true);
    /** Clé de mémorisation du repli ; à défaut, le titre suffit. */
    readonly ecran = input('');

    readonly deplie = signal(false);

    constructor() {
        queueMicrotask(() => this.deplie.set(this.preferences.lireBooleen(this.cle(), false)));
    }

    private cle(): string {
        return `detail.${this.ecran() || this.titre()}`;
    }
    basculer(): void {
        this.deplie.update(ouvert => !ouvert);
        this.preferences.ecrire(this.cle(), this.deplie());
    }
}
