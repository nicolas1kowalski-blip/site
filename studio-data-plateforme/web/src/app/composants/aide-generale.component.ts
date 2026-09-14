/**
 * L'aide « ? » — reprise de la V11 de l'application classique.
 *
 * Deux choses qu'on cherche toujours et qu'on ne trouve jamais :
 *   • **les raccourcis clavier** — ceux qui existent vraiment, décrits une fois pour toutes ;
 *   • **le lexique** — ce que veulent dire les mots de l'application, et quel terme technique ils remplacent.
 *
 * S'ouvre par le bouton « ? » de la barre, ou par la touche F1 ; se ferme par Échap. Rien n'y est configuré :
 * c'est une aide, pas un réglage.
 */
import { Component, HostListener, signal } from '@angular/core';
import { MOTS_METIER } from '../coeur/vocabulaire-metier';

/** Les raccourcis réellement câblés dans l'application ; cette liste est la vérité affichée. */
export const RACCOURCIS_AIDE: { touches: string; quoi: string }[] = [
    { touches: 'Ctrl + K', quoi: 'Rechercher un écran, une action, une source ou une colonne' },
    { touches: 'G puis S', quoi: 'Aller aux Sources' },
    { touches: 'G puis M', quoi: 'Aller au Modèle de données' },
    { touches: 'G puis X', quoi: 'Aller à Extraire' },
    { touches: 'G puis Q', quoi: 'Aller à Qualité & Audit' },
    { touches: 'G puis R', quoi: 'Aller aux Règles & score' },
    { touches: 'G puis B', quoi: 'Aller aux Tableaux de bord' },
    { touches: 'G puis I', quoi: "Revenir à l'accueil" },
    { touches: 'Ctrl + Z', quoi: 'Annuler la dernière modification du référentiel' },
    { touches: 'Maj + P', quoi: 'Mode présentation : grandes polices, menu masqué' },
    { touches: 'Alt + ←', quoi: 'Écran précédent' },
    { touches: 'Alt + →', quoi: 'Écran suivant' },
    { touches: 'Échap', quoi: 'Quitter le plein écran, fermer la recherche ou cette aide' },
    { touches: 'F1', quoi: 'Ouvrir cette aide' }
];

@Component({
    selector: 'app-aide-generale',
    template: `
        <button
            class="bouton petit"
            type="button"
            name="ouvrirAide"
            title="Raccourcis clavier et lexique (F1)"
            (click)="ouvert.set(!ouvert())"
        >
            ?
        </button>
        @if (ouvert()) {
            <div class="voile" (click)="ouvert.set(false)"></div>
            <div class="panneau-aide" role="dialog" aria-label="Aide">
                <div class="entete-page" style="margin: 0 0 8px">
                    <h2 class="espace">Aide</h2>
                    <button class="bouton petit" type="button" name="fermerAide" (click)="ouvert.set(false)">Fermer</button>
                </div>
                <h3>Raccourcis clavier</h3>
                <table class="tableau">
                    <tbody>
                        @for (raccourci of raccourcis; track raccourci.touches) {
                            <tr>
                                <td style="white-space: nowrap">
                                    <code>{{ raccourci.touches }}</code>
                                </td>
                                <td>{{ raccourci.quoi }}</td>
                            </tr>
                        }
                    </tbody>
                </table>
                <h3>Les mots de l'application</h3>
                <table class="tableau">
                    <tbody>
                        @for (mot of mots; track mot.mot) {
                            <tr>
                                <td>
                                    <b>{{ mot.mot }}</b>
                                    @if (mot.technique) {
                                        <div class="discret">terme technique : {{ mot.technique }}</div>
                                    }
                                </td>
                                <td>{{ mot.definition }}</td>
                            </tr>
                        }
                    </tbody>
                </table>
            </div>
        }
    `,
    styles: `
        .voile {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.35);
            z-index: 50;
        }
        .panneau-aide {
            position: fixed;
            top: 40px;
            right: 24px;
            bottom: 40px;
            width: min(560px, calc(100vw - 48px));
            overflow: auto;
            z-index: 51;
            background: var(--surface);
            border-radius: 12px;
            padding: 16px;
            box-shadow: 0 18px 50px rgba(0, 0, 0, 0.3);
        }
        .panneau-aide h3 {
            margin: 14px 0 6px;
            font-size: 13px;
        }
    `
})
export class AideGeneraleComponent {
    readonly ouvert = signal(false);
    readonly raccourcis = RACCOURCIS_AIDE;
    readonly mots = MOTS_METIER;

    /** F1 ouvre l'aide, Échap la referme — les deux touches que tout le monde essaie. */
    @HostListener('document:keydown', ['$event'])
    auClavier(evenement: KeyboardEvent): void {
        if (evenement.key === 'F1') {
            evenement.preventDefault();
            this.ouvert.set(true);
        } else if (evenement.key === 'Escape' && this.ouvert()) {
            this.ouvert.set(false);
        }
    }
}
