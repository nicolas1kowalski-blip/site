/**
 * Dictionnaire des données : pour chaque source, une fiche (description, responsable, domaine, fréquence de
 * mise à jour, sensibilité) et une description par colonne. Les modifications sont fusionnées dans le
 * document partagé avec l'application complète.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ClientApiService } from '../../coeur/client-api.service';
import { FicheDictionnaire, Source, formaterDate } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';
import {
    AvancementDuDictionnaire,
    FicheValidable,
    PassageDeStatut,
    STATUTS_FICHE,
    avancementDuDictionnaire,
    changerLeStatut,
    depuisQuand,
    passagesRecentsDAbord,
    sourcesAValider,
    statutDe
} from './validation-fiche';

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
            <!-- V13 : une définition écrite n'est pas une définition validée — on dit où en est l'ensemble. -->
            <span class="badge" [class.succes]="avancement().pourcentage === 100">
                {{ avancement().pourcentage }} % ({{ avancement().validees }}/{{ avancement().total }} validée(s))
            </span>
            @if (avancement().aValider) {
                <button class="bouton petit" type="button" name="filtrerAValider" (click)="filtreAValider.set(!filtreAValider())">
                    📋 {{ avancement().aValider }} à valider{{ filtreAValider() ? ' (filtre actif ✕)' : '' }}
                </button>
            } @else {
                <span class="discret">rien en attente</span>
            }
        </div>
        <div class="disposition">
            <aside class="carte liste">
                @if (sourcesAffichees().length === 0) {
                    <p class="discret">
                        {{ sources().length ? 'Aucune fiche en attente de validation.' : 'Aucune source dans cet espace.' }}
                    </p>
                }
                @for (source of sourcesAffichees(); track source.id) {
                    <button class="element" [class.actif]="edition()?.source?.id === source.id" (click)="ouvrir(source)">
                        <b>{{ source.name }}</b>
                        <span class="discret">
                            <span class="statut" [attr.data-statut]="statutDe(source.name)">{{ statutDe(source.name) }}</span>
                            {{ fiches()[source.name]?.description || 'sans description' }}
                        </span>
                    </button>
                }
            </aside>
            @if (edition(); as edition) {
                <form class="carte" (ngSubmit)="enregistrer()">
                    <div class="entete-page" style="margin: 0 0 10px">
                        <h2 class="espace" style="margin: 0">{{ edition.source.name }}</h2>
                        <span class="statut" [attr.data-statut]="statutDe(edition.source.name)" [title]="depuisQuand(edition.fiche)">
                            {{ statutDe(edition.source.name) }}
                        </span>
                        @if (session.peutEditer()) {
                            <select
                                class="champ"
                                style="width: auto"
                                name="statut"
                                [ngModel]="statutDe(edition.source.name)"
                                (ngModelChange)="changerLeStatut(edition, $event)"
                            >
                                @for (statut of statuts; track statut) {
                                    <option [value]="statut">{{ statut }}</option>
                                }
                            </select>
                        }
                    </div>
                    <!-- L'historique dit qui a validé quoi et quand : c'est ce qui rend la validation opposable. -->
                    @if (passages(edition.fiche).length) {
                        <details class="historique">
                            <summary class="discret">🕓 Historique des statuts ({{ passages(edition.fiche).length }})</summary>
                            @for (passage of passages(edition.fiche); track $index) {
                                <div class="discret">
                                    {{ formaterDate(passage.at) }} — <b>{{ passage.from }}</b> → <b>{{ passage.to }}</b> par
                                    {{ passage.by }}
                                    @if (passage.comment) {
                                        <span> · « {{ passage.comment }} »</span>
                                    }
                                </div>
                            }
                        </details>
                    }
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
                            <label class="etiquette" title="Terme technique : sensibilité">Confidentialité</label>
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
                                <th title="Terme technique : sensibilité">Confidentialité</th>
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
        /* Le statut d'une fiche : lisible d'un coup d'œil, teinté selon ce qu'il annonce. */
        .statut {
            display: inline-block;
            font-size: 10.5px;
            font-weight: 700;
            padding: 1px 6px;
            margin-right: 5px;
            border-radius: 6px;
            background: color-mix(in srgb, var(--texte) 8%, transparent);
            color: var(--texte-2);
        }
        .statut[data-statut='Validé'] {
            background: color-mix(in srgb, var(--succes) 16%, transparent);
            color: var(--succes);
        }
        .statut[data-statut='Proposé'] {
            background: color-mix(in srgb, var(--alerte) 18%, transparent);
            color: var(--alerte);
        }
        .statut[data-statut='Obsolète'] {
            text-decoration: line-through;
        }
        .historique {
            margin-bottom: 8px;
        }
        .historique summary {
            cursor: pointer;
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
    readonly statuts = STATUTS_FICHE;
    readonly formaterDate = formaterDate;
    /** Vrai quand la liste ne montre plus que les fiches qui attendent une décision. */
    readonly filtreAValider = signal(false);

    readonly avancement = computed<AvancementDuDictionnaire>(() =>
        avancementDuDictionnaire(
            this.fiches(),
            this.sources().map(source => source.name)
        )
    );
    readonly sourcesAffichees = computed(() => {
        if (!this.filtreAValider()) return this.sources();
        const enAttente = sourcesAValider(
            this.fiches(),
            this.sources().map(source => source.name)
        );
        return this.sources().filter(source => enAttente.includes(source.name));
    });

    /** Source à ouvrir directement (lien « Dictionnaire » de l'écran Sources : /dictionnaire?source=nom). */
    private readonly sourceDemandee = inject(ActivatedRoute).snapshot.queryParamMap.get('source') || '';

    constructor() {
        this.recharger();
    }

    async recharger(): Promise<void> {
        try {
            const [sources, fiches] = await Promise.all([this.api.sources(), this.api.dictionnaire()]);
            this.sources.set(sources);
            this.fiches.set(fiches);
            const demandee = sources.find(source => source.name === this.sourceDemandee);
            if (demandee && !this.edition()) this.ouvrir(demandee);
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

    /** Le statut de la fiche d'une source, tel qu'il est enregistré (et non celui en cours d'édition). */
    statutDe(nomSource: string): string {
        return statutDe((this.fiches()[nomSource] || {}) as FicheValidable);
    }

    depuisQuand(fiche: FicheDictionnaire): string {
        return depuisQuand(fiche as FicheValidable, formaterDate);
    }

    passages(fiche: FicheDictionnaire): PassageDeStatut[] {
        return passagesRecentsDAbord(fiche as FicheValidable);
    }

    /**
     * Change le statut et enregistre aussitôt : un statut que l'on croit posé mais qui attend un
     * « Enregistrer » est un statut faux pour tous les autres. Valider demande un commentaire, facultatif :
     * c'est là que se dit le « pourquoi » qu'on cherchera plus tard.
     */
    async changerLeStatut(edition: FicheEnEdition, nouveau: string): Promise<void> {
        const commentaire = nouveau === 'Validé' ? (prompt('Commentaire de validation (facultatif) :') ?? '') : '';
        const qui = this.session.utilisateur()?.nomAffiche || this.session.utilisateur()?.identifiant || '';
        if (!changerLeStatut(edition.fiche as FicheValidable, nouveau, qui, commentaire)) return;
        await this.enregistrer();
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
