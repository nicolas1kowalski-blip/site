/**
 * Applications, processus et restitutions (les « actifs » du lineage) : liste et fiche.
 *   • Application : tables qu'elle produit (elle en est propriétaire) et tables qu'elle lit ;
 *   • Processus : applications sur lesquelles il s'appuie ;
 *   • Restitution : actifs qui la génèrent, destinataires, fréquence, forme ;
 *   • Tous : responsable, domaine, criticité, objets métier rattachés.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import { Actif, GenreActif, ObjetMetier, Source, VocabulaireGouvernance, genererIdentifiant } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

const ACTIF_VIDE = (kind: GenreActif): Actif => ({
    id: genererIdentifiant('as'),
    name: '',
    kind,
    description: '',
    owner: '',
    domain: '',
    criticality: 'Moyenne',
    sources: [],
    tables: [],
    columns: [],
    boIds: [],
    appIds: [],
    producedBy: [],
    deliveredTo: []
});

@Component({
    selector: 'app-actifs',
    imports: [FormsModule],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Applications & processus</h1>
                <p class="discret">{{ actifs().length }} actif(s) — qui produit, lit et diffuse les données.</p>
            </div>
            @if (session.peutEditer()) {
                <button class="bouton" (click)="nouvel('app')">Nouvelle application</button>
                <button class="bouton" (click)="nouvel('process')">Nouveau processus</button>
                <button class="bouton" (click)="nouvel('report')">Nouvelle restitution</button>
            }
        </div>

        <div class="disposition">
            <div class="carte liste">
                @for (genre of genres(); track genre.cle) {
                    <div class="groupe-titre">{{ genre.libelle }}</div>
                    @for (actif of actifsDuGenre(genre.cle); track actif.id) {
                        <button class="element" [class.actif]="actif.id === selectionId()" (click)="selectionner(actif)">
                            <span class="nom">{{ actif.name || '(sans nom)' }}</span>
                            <span class="discret">{{ actif.domain || '—' }} · {{ actif.criticality }}</span>
                        </button>
                    } @empty {
                        <div class="discret" style="padding: 4px 8px 8px">aucun</div>
                    }
                }
            </div>

            @if (edition(); as actif) {
                <div class="carte">
                    <div class="entete-page" style="margin: 0 0 8px">
                        <h2 class="espace">
                            {{ actif.name || 'Nouvel actif' }} <span class="badge neutre">{{ libelleGenre(actif.kind) }}</span>
                        </h2>
                        @if (session.peutEditer()) {
                            <button class="bouton principal" (click)="enregistrer()" [disabled]="enCours()">Enregistrer</button>
                            @if (!nouveau()) {
                                <button class="bouton danger" (click)="supprimer(actif)">Supprimer</button>
                            }
                        }
                    </div>
                    <div class="formulaire-ligne">
                        <div>
                            <label class="etiquette">Nom</label
                            ><input class="champ" name="nom" [(ngModel)]="actif.name" [disabled]="!session.peutEditer()" />
                        </div>
                        <div>
                            <label class="etiquette">Responsable</label
                            ><input class="champ" name="responsable" [(ngModel)]="actif.owner" [disabled]="!session.peutEditer()" />
                        </div>
                        <div>
                            <label class="etiquette">Domaine</label>
                            <input
                                class="champ"
                                name="domaine"
                                [(ngModel)]="actif.domain"
                                list="domaines-actifs"
                                [disabled]="!session.peutEditer()"
                            />
                            <datalist id="domaines-actifs">
                                @for (domaine of domaines(); track domaine) {
                                    <option [value]="domaine"></option>
                                }
                            </datalist>
                        </div>
                        <div>
                            <label class="etiquette">Criticité</label>
                            <select class="champ" name="criticite" [(ngModel)]="actif.criticality" [disabled]="!session.peutEditer()">
                                @for (criticite of vocabulaire()?.criticites || []; track criticite) {
                                    <option [value]="criticite">{{ criticite }}</option>
                                }
                            </select>
                        </div>
                    </div>
                    <label class="etiquette" style="margin-top: 8px">Description</label>
                    <textarea
                        class="champ"
                        name="description"
                        [(ngModel)]="actif.description"
                        style="font-family: inherit"
                        [disabled]="!session.peutEditer()"
                    ></textarea>

                    @if (actif.kind === 'app') {
                        <div class="formulaire-ligne" style="margin-top: 10px">
                            <div>
                                <label class="etiquette">Tables produites (l'application en est propriétaire)</label>
                                @for (source of sources(); track source.id) {
                                    <label class="case"
                                        ><input
                                            type="checkbox"
                                            [checked]="actif.sources.includes(source.name)"
                                            (change)="basculer(actif.sources, source.name)"
                                            [disabled]="!session.peutEditer()"
                                        />
                                        {{ source.name }}</label
                                    >
                                }
                            </div>
                            <div>
                                <label class="etiquette">Tables lues</label>
                                @for (source of sources(); track source.id) {
                                    <label class="case"
                                        ><input
                                            type="checkbox"
                                            [checked]="actif.tables.includes(source.name)"
                                            (change)="basculer(actif.tables, source.name)"
                                            [disabled]="!session.peutEditer()"
                                        />
                                        {{ source.name }}</label
                                    >
                                }
                            </div>
                        </div>
                    }
                    @if (actif.kind === 'process') {
                        <label class="etiquette" style="margin-top: 10px">Applications sur lesquelles le processus s'appuie</label>
                        @for (application of actifsDuGenre('app'); track application.id) {
                            <label class="case"
                                ><input
                                    type="checkbox"
                                    [checked]="actif.appIds.includes(application.id)"
                                    (change)="basculer(actif.appIds, application.id)"
                                    [disabled]="!session.peutEditer()"
                                />
                                {{ application.name }}</label
                            >
                        } @empty {
                            <div class="discret">Aucune application déclarée.</div>
                        }
                    }
                    @if (actif.kind === 'report') {
                        <div class="formulaire-ligne" style="margin-top: 10px">
                            <div>
                                <label class="etiquette">Générée par</label>
                                @for (autre of autresActifs(); track autre.id) {
                                    <label class="case"
                                        ><input
                                            type="checkbox"
                                            [checked]="actif.producedBy.includes(autre.id)"
                                            (change)="basculer(actif.producedBy, autre.id)"
                                            [disabled]="!session.peutEditer()"
                                        />
                                        {{ autre.name }}</label
                                    >
                                }
                            </div>
                            <div>
                                <label class="etiquette">Destinée à</label>
                                @for (autre of autresActifs(); track autre.id) {
                                    <label class="case"
                                        ><input
                                            type="checkbox"
                                            [checked]="actif.deliveredTo.includes(autre.id)"
                                            (change)="basculer(actif.deliveredTo, autre.id)"
                                            [disabled]="!session.peutEditer()"
                                        />
                                        {{ autre.name }}</label
                                    >
                                }
                            </div>
                        </div>
                        <div class="formulaire-ligne" style="margin-top: 8px">
                            <div>
                                <label class="etiquette">Destinataires externes</label
                                ><input
                                    class="champ"
                                    name="destinataires"
                                    [(ngModel)]="actif.recipients"
                                    [disabled]="!session.peutEditer()"
                                />
                            </div>
                            <div>
                                <label class="etiquette">Fréquence</label
                                ><input
                                    class="champ"
                                    name="frequence"
                                    [(ngModel)]="actif.frequency"
                                    placeholder="mensuelle…"
                                    [disabled]="!session.peutEditer()"
                                />
                            </div>
                            <div>
                                <label class="etiquette">Forme</label
                                ><input
                                    class="champ"
                                    name="forme"
                                    [(ngModel)]="actif.format"
                                    placeholder="fichier, tableau de bord…"
                                    [disabled]="!session.peutEditer()"
                                />
                            </div>
                        </div>
                    }
                    <label class="etiquette" style="margin-top: 10px">Objets métier rattachés</label>
                    @for (objet of objets(); track objet.id) {
                        <label class="case"
                            ><input
                                type="checkbox"
                                [checked]="actif.boIds.includes(objet.id)"
                                (change)="basculer(actif.boIds, objet.id)"
                                [disabled]="!session.peutEditer()"
                            />
                            {{ objet.name }}</label
                        >
                    } @empty {
                        <div class="discret">Aucun objet métier.</div>
                    }
                </div>
            } @else {
                <div class="carte discret" style="text-align: center; padding: 40px">Choisissez un actif, ou créez-en un.</div>
            }
        </div>
    `,
    styles: `
        .disposition {
            display: grid;
            grid-template-columns: 280px 1fr;
            gap: 14px;
            align-items: start;
        }
        @media (max-width: 900px) {
            .disposition {
                grid-template-columns: 1fr;
            }
        }
        .groupe-titre {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--texte-2);
            margin: 8px 8px 4px;
        }
        .liste .element {
            display: block;
            width: 100%;
            text-align: left;
            border: 0;
            background: none;
            padding: 6px 8px;
            border-radius: 8px;
            cursor: pointer;
            font: inherit;
        }
        .liste .element:hover {
            background: var(--surface-2);
        }
        .liste .element.actif {
            background: var(--accent-2);
        }
        .liste .nom {
            display: block;
            font-weight: 700;
        }
        .case {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
        }
    `
})
export class ActifsComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    readonly session = inject(SessionService);

    readonly actifs = signal<Actif[]>([]);
    readonly objets = signal<ObjetMetier[]>([]);
    readonly sources = signal<Source[]>([]);
    readonly domaines = signal<string[]>([]);
    readonly vocabulaire = signal<VocabulaireGouvernance | null>(null);
    readonly selectionId = signal<string | null>(null);
    readonly edition = signal<Actif | null>(null);
    readonly nouveau = signal(false);
    readonly enCours = signal(false);

    readonly genres = computed(() =>
        Object.entries(this.vocabulaire()?.genresActif || {}).map(([cle, libelle]) => ({ cle: cle as GenreActif, libelle }))
    );
    readonly autresActifs = computed(() => this.actifs().filter(actif => actif.id !== this.selectionId()));

    constructor() {
        void this.recharger();
    }

    async recharger(): Promise<void> {
        try {
            const [actifs, objets, sources, domaines, vocabulaire] = await Promise.all([
                this.api.actifs(),
                this.api.objetsMetier(),
                this.api.sources(),
                this.api.domaines(),
                this.vocabulaire() ?? this.api.vocabulaireGouvernance()
            ]);
            this.actifs.set(actifs.map(actif => ({ ...ACTIF_VIDE(actif.kind), ...actif })));
            this.objets.set(objets);
            this.sources.set(sources);
            this.domaines.set(domaines);
            this.vocabulaire.set(vocabulaire);
            const selection = this.actifs().find(actif => actif.id === this.selectionId());
            if (selection) this.selectionner(selection);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    actifsDuGenre(genre: GenreActif): Actif[] {
        return this.actifs().filter(actif => actif.kind === genre);
    }

    libelleGenre(genre: GenreActif): string {
        return this.vocabulaire()?.genresActif[genre] || genre;
    }

    selectionner(actif: Actif): void {
        this.selectionId.set(actif.id);
        this.nouveau.set(false);
        this.edition.set(structuredClone(actif));
    }

    nouvel(genre: GenreActif): void {
        const actif = ACTIF_VIDE(genre);
        this.selectionId.set(actif.id);
        this.nouveau.set(true);
        this.edition.set(actif);
    }

    basculer(liste: string[], valeur: string): void {
        const position = liste.indexOf(valeur);
        if (position >= 0) liste.splice(position, 1);
        else liste.push(valeur);
    }

    async enregistrer(): Promise<void> {
        const actif = this.edition();
        if (!actif) return;
        if (!actif.name.trim()) return this.notifications.erreur("Donnez un nom à l'actif.");
        this.enCours.set(true);
        try {
            const { id, ...corps } = actif;
            await this.api.enregistrerActif(id, corps);
            this.notifications.succes(`« ${actif.name} » enregistré.`);
            this.nouveau.set(false);
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    async supprimer(actif: Actif): Promise<void> {
        if (!confirm(`Supprimer « ${actif.name} » ?`)) return;
        try {
            await this.api.supprimerActif(actif.id);
            this.edition.set(null);
            this.selectionId.set(null);
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
}
