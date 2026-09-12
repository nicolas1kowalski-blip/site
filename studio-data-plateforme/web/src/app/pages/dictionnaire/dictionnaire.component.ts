/**
 * Dictionnaire des données : pour chaque source, une fiche (description, responsable, domaine, fréquence de
 * mise à jour, sensibilité) et une description par colonne. Les modifications sont fusionnées dans le
 * document partagé avec l'application complète.
 */
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import { FicheDictionnaire, Source } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

type FicheEnEdition = {
    source: Source;
    fiche: FicheDictionnaire & { columns: Record<string, { description?: string; sensitivity?: string }> };
};

const SENSIBILITES = ['', 'public', 'interne', 'confidentiel', 'personnel'];

@Component({
    selector: 'app-dictionnaire',
    imports: [FormsModule],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Dictionnaire des données</h1>
                <p class="discret">Une fiche par source, une description par colonne</p>
            </div>
        </div>
        <div class="disposition">
            <aside class="carte liste">
                @if (sources().length === 0) {
                    <p class="discret">Aucune source dans cet espace.</p>
                }
                @for (source of sources(); track source.id) {
                    <button class="element" [class.actif]="edition()?.source?.id === source.id" (click)="ouvrir(source)">
                        <b>{{ source.name }}</b>
                        <span class="discret">{{ fiches()[source.name]?.description || 'sans description' }}</span>
                    </button>
                }
            </aside>
            @if (edition(); as edition) {
                <form class="carte" (ngSubmit)="enregistrer()">
                    <h2>{{ edition.source.name }}</h2>
                    <div class="formulaire-ligne">
                        <div>
                            <label class="etiquette">Responsable</label
                            ><input class="champ" name="owner" [(ngModel)]="edition.fiche.owner" [disabled]="!session.peutEditer()" />
                        </div>
                        <div>
                            <label class="etiquette">Domaine</label
                            ><input class="champ" name="domain" [(ngModel)]="edition.fiche.domain" [disabled]="!session.peutEditer()" />
                        </div>
                        <div>
                            <label class="etiquette">Fréquence de mise à jour</label
                            ><input
                                class="champ"
                                name="updateFrequency"
                                [(ngModel)]="edition.fiche.updateFrequency"
                                placeholder="quotidienne, mensuelle…"
                                [disabled]="!session.peutEditer()"
                            />
                        </div>
                        <div>
                            <label class="etiquette">Sensibilité</label>
                            <select
                                class="champ"
                                name="sensitivity"
                                [(ngModel)]="edition.fiche.sensitivity"
                                [disabled]="!session.peutEditer()"
                            >
                                @for (niveau of sensibilites; track niveau) {
                                    <option [value]="niveau">{{ niveau || '—' }}</option>
                                }
                            </select>
                        </div>
                    </div>
                    <label class="etiquette" style="margin-top: 8px">Description</label>
                    <textarea
                        class="champ"
                        name="description"
                        [(ngModel)]="edition.fiche.description"
                        style="font-family: inherit"
                        [disabled]="!session.peutEditer()"
                    ></textarea>
                    <h3 style="margin-top: 14px">Colonnes ({{ edition.source.headers.length }})</h3>
                    <table class="tableau">
                        <thead>
                            <tr>
                                <th>Colonne</th>
                                <th>Description</th>
                                <th>Sensibilité</th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (colonne of edition.source.headers; track colonne) {
                                <tr>
                                    <td>
                                        <code>{{ colonne }}</code>
                                    </td>
                                    <td>
                                        <input
                                            class="champ"
                                            [name]="'d_' + colonne"
                                            [attr.name]="'d_' + colonne"
                                            [(ngModel)]="colonneDe(edition, colonne).description"
                                            [disabled]="!session.peutEditer()"
                                        />
                                    </td>
                                    <td>
                                        <select
                                            class="champ"
                                            [name]="'s_' + colonne"
                                            [attr.name]="'s_' + colonne"
                                            [(ngModel)]="colonneDe(edition, colonne).sensitivity"
                                            [disabled]="!session.peutEditer()"
                                        >
                                            @for (niveau of sensibilites; track niveau) {
                                                <option [value]="niveau">{{ niveau || '—' }}</option>
                                            }
                                        </select>
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                    @if (session.peutEditer()) {
                        <div style="margin-top: 12px"><button class="bouton principal" type="submit">Enregistrer la fiche</button></div>
                    }
                </form>
            } @else {
                <div class="carte vide">Choisissez une source pour lire ou compléter sa fiche.</div>
            }
        </div>
    `,
    styles: `
        .disposition {
            display: grid;
            grid-template-columns: 260px 1fr;
            gap: 14px;
            align-items: start;
        }
        .liste {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .element {
            text-align: left;
            border: 1px solid var(--bordure);
            background: var(--surface-2);
            border-radius: 8px;
            padding: 6px 8px;
            cursor: pointer;
            font: inherit;
            color: inherit;
            display: flex;
            flex-direction: column;
        }
        .element.actif {
            border-color: var(--accent);
            background: var(--accent-2);
        }
        @media (max-width: 800px) {
            .disposition {
                grid-template-columns: 1fr;
            }
        }
    `
})
export class DictionnaireComponent {
    readonly session = inject(SessionService);
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);

    readonly sources = signal<Source[]>([]);
    readonly fiches = signal<Record<string, FicheDictionnaire>>({});
    readonly edition = signal<FicheEnEdition | null>(null);
    readonly sensibilites = SENSIBILITES;

    constructor() {
        this.recharger();
    }

    async recharger(): Promise<void> {
        try {
            const [sources, fiches] = await Promise.all([this.api.sources(), this.api.dictionnaire()]);
            this.sources.set(sources);
            this.fiches.set(fiches);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    ouvrir(source: Source): void {
        const existante = this.fiches()[source.name] || {};
        this.edition.set({
            source,
            fiche: {
                description: '',
                owner: '',
                domain: '',
                updateFrequency: '',
                sensitivity: '',
                ...existante,
                columns: { ...(existante.columns || {}) }
            }
        });
    }

    /** Fiche d'une colonne, créée à la volée pour que le formulaire puisse la remplir. */
    colonneDe(edition: FicheEnEdition, colonne: string): { description?: string; sensitivity?: string } {
        if (!edition.fiche.columns[colonne]) edition.fiche.columns[colonne] = { description: '', sensitivity: '' };
        return edition.fiche.columns[colonne];
    }

    async enregistrer(): Promise<void> {
        const edition = this.edition();
        if (!edition) return;
        try {
            await this.api.enregistrerFiche(edition.source.name, edition.fiche);
            this.notifications.succes(`Fiche de « ${edition.source.name} » enregistrée.`);
            this.fiches.update(fiches => ({ ...fiches, [edition.source.name]: edition.fiche }));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
}
