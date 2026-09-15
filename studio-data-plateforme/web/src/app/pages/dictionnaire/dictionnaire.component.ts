/**
 * Dictionnaire des données — repris de la V13.
 *
 * Pour chaque source, une fiche (description, responsable, référent, domaine, système source, fréquence de
 * mise à jour, confidentialité, statut de validation) et, pour chaque colonne, ce qu'il faut pour la
 * comprendre sans ouvrir le fichier : sa définition, son type technique, des exemples de valeurs, sa
 * confidentialité, le terme du glossaire qu'elle porte et la liste de valeurs qui la régit.
 *
 * Quand une colonne n'a pas encore de définition, l'écran montre en filigrane ce que l'objet métier en dit
 * et le signale : on n'écrit pas deux fois la même chose à deux endroits.
 *
 * Les modifications sont fusionnées dans le document partagé avec l'application classique.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ClientApiService } from '../../coeur/client-api.service';
import { Router } from '@angular/router';
import {
    Actif,
    ColonneDeDictionnaire,
    FicheDictionnaire,
    ListeValeurs,
    ObjetMetier,
    Source,
    TermeGlossaire,
    formaterDate
} from '../../coeur/modeles';
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
import {
    ValeurHeritee,
    colonnesDecrites,
    definitionDe,
    exemplesDepuisLesValeurs,
    exemplesRemplacables,
    heriteDeLObjetMetier,
    phraseDeLHeritage
} from './colonnes-dictionnaire';

type FicheEnEdition = {
    source: Source;
    fiche: FicheDictionnaire & { columns: Record<string, ColonneDeDictionnaire> };
};

const SENSIBILITES = ['', 'public', 'interne', 'confidentiel', 'personnel'];

@Component({
    selector: 'app-dictionnaire',
    imports: [FormsModule],
    template: `
        <!--
            V13 : deux entrées pour la même matière. « Par objet métier » décrit la donnée telle que le
            métier la nomme (c'est l'écran des objets métier, avec ses variantes et ses groupes) ; « Par
            table technique » la décrit fichier par fichier, colonne par colonne — c'est cet écran.
        -->
        <div class="flex items-center gap-1.5 mb-4">
            <button
                type="button"
                name="dictionnaireParObjet"
                class="text-xs font-bold px-3 py-1.5 rounded-lg border bg-white text-slate-500 border-slate-300 hover:bg-slate-50"
                (click)="ouvrirParObjetMetier()"
            >
                🏛️ Par objet métier
            </button>
            <button
                type="button"
                name="dictionnaireParTable"
                class="text-xs font-bold px-3 py-1.5 rounded-lg border bg-indigo-600 text-white border-indigo-600"
            >
                📄 Par table technique
            </button>
        </div>
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
                            <label class="etiquette" title="Le classique dit « Data Steward »">Référent</label
                            ><input
                                class="champ"
                                name="steward"
                                [(ngModel)]="edition.fiche.steward"
                                placeholder="personne référente au quotidien"
                                [disabled]="!session.peutEditer()"
                            />
                        </div>
                        <div>
                            <label class="etiquette" title="C'est aussi le point de départ du parcours de la donnée">Système source</label
                            ><input
                                class="champ"
                                name="sourceSystem"
                                list="applicationsConnues"
                                [(ngModel)]="edition.fiche.sourceSystem"
                                placeholder="ex : SAP, CRM, export Excel…"
                                [disabled]="!session.peutEditer()"
                            />
                            <datalist id="applicationsConnues">
                                @for (application of applications(); track application.id) {
                                    <option [value]="application.name"></option>
                                }
                            </datalist>
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
                    <div class="flex justify-between items-center mt-4 mb-2 flex-wrap gap-2">
                        <h3 style="margin: 0">Colonnes ({{ colonnesDecrites(edition) }}/{{ edition.source.headers.length }} définies)</h3>
                        @if (session.peutEditer()) {
                            <button
                                type="button"
                                name="echantillonnerLesExemples"
                                class="bouton petit"
                                [disabled]="echantillonnage()"
                                title="Prend quelques valeurs réellement présentes dans le fichier, sans écraser ce qui a été saisi à la main"
                                (click)="echantillonnerLesExemples(edition)"
                            >
                                ⟳ Échantillonner les exemples depuis la source
                            </button>
                        }
                    </div>
                    <div style="overflow-x: auto">
                        <table class="tableau">
                            <thead>
                                <tr>
                                    <th>Colonne</th>
                                    <th>Définition fonctionnelle</th>
                                    <th>Type technique</th>
                                    <th>Exemples de valeurs</th>
                                    <th title="Terme technique : sensibilité">Confidentialité</th>
                                    <th>Terme du glossaire</th>
                                    <th>🎚️ Liste de valeurs</th>
                                </tr>
                            </thead>
                            <tbody>
                                @for (colonne of edition.source.headers; track colonne) {
                                    @let champs = colonneDe(edition, colonne);
                                    <tr>
                                        <td>
                                            <code>{{ colonne }}</code>
                                        </td>
                                        <td>
                                            <!-- V13 : à défaut de définition propre, on montre celle de l'objet métier, et d'où elle vient. -->
                                            @let heriteeDefinition = heritee(edition, colonne, 'definition');
                                            <input
                                                class="champ"
                                                [name]="'d_' + colonne"
                                                [attr.name]="'d_' + colonne"
                                                [(ngModel)]="champs.definition"
                                                [placeholder]="heriteeDefinition ? heriteeDefinition.valeur : 'Définition métier…'"
                                                [disabled]="!session.peutEditer()"
                                            />
                                            @if (!champs.definition && heriteeDefinition) {
                                                <div class="herite" [attr.name]="'herite_' + colonne">
                                                    {{ phraseHeritage(heriteeDefinition) }}
                                                </div>
                                            }
                                        </td>
                                        <td>
                                            <input
                                                class="champ etroit"
                                                [name]="'t_' + colonne"
                                                [attr.name]="'t_' + colonne"
                                                [(ngModel)]="champs.technicalType"
                                                placeholder="ex : VARCHAR(10)"
                                                [disabled]="!session.peutEditer()"
                                            />
                                        </td>
                                        <td>
                                            <input
                                                class="champ"
                                                [class.auto]="champs.examplesAuto"
                                                [name]="'e_' + colonne"
                                                [attr.name]="'e_' + colonne"
                                                [(ngModel)]="champs.examples"
                                                (ngModelChange)="champs.examplesAuto = false"
                                                placeholder="ex : PARIS ; LYON…"
                                                [title]="champs.examplesAuto ? 'Pris dans la source' : 'Saisie manuelle'"
                                                [disabled]="!session.peutEditer()"
                                            />
                                        </td>
                                        <td>
                                            @let heriteeConfidentialite = heritee(edition, colonne, 'sensitivity');
                                            <select
                                                class="champ"
                                                [name]="'s_' + colonne"
                                                [attr.name]="'s_' + colonne"
                                                [(ngModel)]="champs.sensitivity"
                                                [disabled]="!session.peutEditer()"
                                            >
                                                @for (niveau of sensibilites; track niveau) {
                                                    <option [value]="niveau">{{ niveau || '—' }}</option>
                                                }
                                            </select>
                                            @if (!champs.sensitivity && heriteeConfidentialite) {
                                                <div class="herite">hérite : {{ heriteeConfidentialite.valeur }}</div>
                                            }
                                        </td>
                                        <td>
                                            <select
                                                class="champ"
                                                [name]="'g_' + colonne"
                                                [attr.name]="'g_' + colonne"
                                                [(ngModel)]="champs.term"
                                                [disabled]="!session.peutEditer()"
                                            >
                                                <option value="">— aucun terme —</option>
                                                @for (terme of termes(); track terme.id) {
                                                    <option [value]="terme.id">{{ terme.term }}</option>
                                                }
                                            </select>
                                        </td>
                                        <td>
                                            <select
                                                class="champ"
                                                [name]="'v_' + colonne"
                                                [attr.name]="'v_' + colonne"
                                                [(ngModel)]="champs.valueListId"
                                                [disabled]="!session.peutEditer()"
                                            >
                                                <option value="">— aucune liste —</option>
                                                @for (liste of listes(); track liste.id) {
                                                    <option [value]="liste.id">{{ liste.name }}</option>
                                                }
                                            </select>
                                        </td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    </div>
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
        /* Ce que l'objet métier dit déjà de cette colonne : on le montre, on ne le recopie pas. */
        .herite {
            font-size: 10px;
            color: var(--succes);
            margin-top: 2px;
        }
        .champ.etroit {
            width: 130px;
        }
        /* Des exemples pris dans la source, et non saisis à la main. */
        .champ.auto {
            background: color-mix(in srgb, var(--accent) 6%, transparent);
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
    /** Ce que l'écran va chercher ailleurs : les mots du glossaire, les listes de valeurs, les objets
     * métier (pour l'héritage) et les applications (pour proposer le système source). */
    readonly termes = signal<TermeGlossaire[]>([]);
    readonly listes = signal<ListeValeurs[]>([]);
    readonly objets = signal<ObjetMetier[]>([]);
    readonly applications = signal<Actif[]>([]);
    /** Vrai pendant que l'on prend des exemples dans le fichier : le bouton ne se relance pas. */
    readonly echantillonnage = signal(false);
    private readonly routeur = inject(Router);
    readonly phraseHeritage = phraseDeLHeritage;

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
            const [sources, fiches, termes, listes, objets, actifs] = await Promise.all([
                this.api.sources(),
                this.api.dictionnaire(),
                this.api.glossaire(),
                this.api.listesValeurs(),
                this.api.objetsMetier(),
                this.api.actifs()
            ]);
            this.sources.set(sources);
            this.fiches.set(fiches);
            this.termes.set(termes);
            this.listes.set(listes);
            this.objets.set(objets);
            this.applications.set(actifs.filter(actif => actif.kind === 'app'));
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
                steward: '',
                domain: '',
                sourceSystem: '',
                updateFrequency: '',
                sensitivity: '',
                ...existante,
                columns: { ...(existante.columns || {}) }
            }
        });
    }

    /**
     * Fiche d'une colonne, créée à la volée pour que le formulaire puisse la remplir. Une fiche ancienne
     * rangeait sa définition sous « description » : on la ramène sous son nom d'aujourd'hui, une fois, à
     * l'ouverture — sans quoi la saisie précédente disparaîtrait de l'écran.
     */
    colonneDe(edition: FicheEnEdition, colonne: string): ColonneDeDictionnaire {
        const champs = (edition.fiche.columns[colonne] ||= {});
        if (champs.definition === undefined) champs.definition = definitionDe(champs);
        if (champs.sensitivity === undefined) champs.sensitivity = '';
        return champs;
    }

    /** Ce que l'objet métier dit déjà de cette colonne, quand la colonne elle-même n'en dit rien. */
    heritee(edition: FicheEnEdition, colonne: string, champ: 'definition' | 'sensitivity'): ValeurHeritee | null {
        return heriteDeLObjetMetier(this.objets(), edition.source.name, colonne, champ);
    }

    /** Combien de colonnes de la fiche portent déjà une définition. */
    colonnesDecrites(edition: FicheEnEdition): number {
        return colonnesDecrites(edition.source.headers, edition.fiche.columns);
    }

    /** L'autre entrée vers la même matière : la donnée telle que le métier la nomme. */
    ouvrirParObjetMetier(): void {
        void this.routeur.navigateByUrl('/objets-metier');
    }

    /**
     * Va chercher, dans le fichier, quelques valeurs réellement présentes dans chaque colonne. On ne
     * remplace jamais des exemples saisis à la main — ce serait détruire du travail — mais on rafraîchit
     * ceux qui venaient déjà d'un échantillonnage.
     */
    async echantillonnerLesExemples(edition: FicheEnEdition): Promise<void> {
        this.echantillonnage.set(true);
        let remplies = 0;
        try {
            for (const colonne of edition.source.headers) {
                const champs = this.colonneDe(edition, colonne);
                if (!exemplesRemplacables(champs)) continue;
                const observees = await this.api.valeursColonne(edition.source.id, colonne);
                const exemples = exemplesDepuisLesValeurs(observees);
                if (!exemples) continue;
                champs.examples = exemples;
                champs.examplesAuto = true;
                remplies++;
            }
            await this.enregistrer();
            this.notifications.succes(
                remplies
                    ? `${remplies} colonne(s) illustrées par des valeurs prises dans « ${edition.source.name} ».`
                    : 'Rien à illustrer : toutes les colonnes portent déjà des exemples saisis à la main.'
            );
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.echantillonnage.set(false);
        }
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
