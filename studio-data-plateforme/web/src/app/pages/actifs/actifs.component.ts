/**
 * Applications, processus et restitutions — repris de la V13.
 *
 * Le modèle que l'écran applique, et qu'il énonce en tête : une application contient ses sources, ces
 * sources alimentent les objets métier, qui alimentent à leur tour les consommateurs. C'est l'application
 * qui est maître, jamais le fichier — une table n'a donc qu'un producteur, et tout l'aval s'en déduit.
 *
 * L'écran porte aussi l'analyse d'impact : « si cette donnée a un problème, qui est touché ? ».
 *
 * Liste et fiche :
 *   • Application : tables qu'elle produit (elle en est propriétaire) et tables qu'elle lit ;
 *   • Processus : applications sur lesquelles il s'appuie ;
 *   • Restitution : actifs qui la génèrent, destinataires, fréquence, forme ;
 *   • Tous : responsable, domaine, criticité, objets métier rattachés.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProposerCorrectionComponent } from '../../composants/proposer-correction.component';
import { AnnulationService } from '../../coeur/annulation.service';
import { copieDUnActif, messageDeCopie } from '../../coeur/duplication';
import { ClientApiService } from '../../coeur/client-api.service';
import { MoyensDuRetour, questionAvantSuppression, retourDUneEcriture, retourDUneSuppression } from '../../coeur/gestes-annulables';
import { Actif, AnalyseImpact, GenreActif, ObjetMetier, Source, VocabulaireGouvernance, genererIdentifiant } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';
import {
    ChaineAval,
    ColonneCritique,
    ajouterUneColonneCritique,
    blocsDImpact,
    chaineAval,
    etatDeLaSource,
    libelleDeLaColonne,
    objetsAlimentes,
    phraseDeLUsage,
    usageDunActif
} from './chaine-des-actifs';

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
    imports: [FormsModule, ProposerCorrectionComponent],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Applications & processus</h1>
                <p class="discret">{{ actifs().length }} actif(s) — qui produit, lit et diffuse les données.</p>
            </div>
            @if (session.peutEditer()) {
                <button class="bouton" name="nouvelleApplication" (click)="nouvel('app')">Nouvelle application</button>
                <button class="bouton" name="nouveauProcessus" (click)="nouvel('process')">Nouveau processus</button>
                <button class="bouton" name="nouvelleRestitution" (click)="nouvel('report')">Nouvelle restitution</button>
            }
        </div>

        <!-- V13 : le modèle est écrit là où on le remplit, sans quoi on rattache au hasard. -->
        <div class="bandeau-modele" name="modeleDesActifs">
            <span class="intitule">Modèle</span>
            <b>🖥 Application</b><span class="fleche">contient →</span> <b class="vert">📄 Sources</b
            ><span class="fleche">alimentent →</span> <b class="vert">🏛️ Objet métier</b><span class="fleche">alimente →</span>
            <b>📥 Consommateurs</b>
            <span class="note"
                >C'est l'application qui est maître, jamais le fichier ; on ne remplit un objet métier que via une application.</span
            >
        </div>

        <!-- V13 : « si cette donnée a un problème, qui est touché ? » — la question se pose ici. -->
        <div class="carte impact-v13">
            <h2 style="margin: 0 0 8px">🛎 Analyse d'impact — « si cette donnée a un problème, qui est touché ? »</h2>
            <div class="formulaire-ligne" style="max-width: 660px">
                <select class="champ" name="tableImpact" [(ngModel)]="tableImpact" (ngModelChange)="colonneImpact = ''">
                    <option value="">— table —</option>
                    @for (source of sources(); track source.id) {
                        <option [value]="source.name">{{ source.name }}</option>
                    }
                </select>
                <select class="champ" name="colonneImpact" [(ngModel)]="colonneImpact">
                    <option value="">Toute la table</option>
                    @for (colonne of colonnesDe(tableImpact); track colonne) {
                        <option [value]="colonne">{{ colonne }}</option>
                    }
                </select>
                <button
                    class="bouton principal"
                    name="analyserImpact"
                    [disabled]="!tableImpact"
                    (click)="analyserImpact()"
                    style="flex: 0 0 auto"
                >
                    Analyser l'impact
                </button>
            </div>
            @if (impact(); as impact) {
                <div name="resultatImpact" style="margin-top: 8px">
                    @if (!impact.direct.length && !impact.viaLineage.length && !impact.viaRelations.length) {
                        <p class="discret">Aucun processus déclaré n'utilise cette donnée — déclarez-en un ci-dessous.</p>
                    }
                    @for (bloc of blocsDImpact(impact); track bloc.titre) {
                        @if (bloc.actifs.length) {
                            <h3 style="margin: 8px 0 2px">{{ bloc.titre }}</h3>
                            @for (touche of bloc.actifs; track touche.id) {
                                <div class="text-xs">
                                    <b>{{ touche.name }}</b>
                                    <span class="discret"> · {{ touche.criticality }} · {{ touche.owner || 'sans responsable' }}</span>
                                </div>
                            }
                        }
                    }
                </div>
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
                                <button class="bouton" name="dupliquerActif" (click)="dupliquer(actif)">⧉ Dupliquer</button>
                                <button class="bouton danger" (click)="supprimer(actif)">Supprimer</button>
                            }
                        }
                    </div>
                    <!-- V13 : contribuer sans risque — le responsable valide avant que quoi que ce soit change. -->
                    <app-proposer-correction
                        [genre]="'asset'"
                        [cible]="{ assetId: actif.id }"
                        [sujet]="actif.name"
                        champ="description"
                        [valeurActuelle]="actif.description"
                        [domaine]="actif.domain || ''"
                    />
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
                                <!-- Une table n'a qu'un producteur : celles d'une autre application se voient, mais ne se prennent pas. -->
                                @for (source of sources(); track source.id) {
                                    @let etat = etatSource(actif, source.name);
                                    <label
                                        class="case"
                                        [class.prise]="etat.priseParUnAutre"
                                        [title]="etat.priseParUnAutre ? 'Déjà rattachée à ' + etat.proprietaire : ''"
                                    >
                                        <input
                                            type="checkbox"
                                            [checked]="etat.rattachee"
                                            (change)="basculer(actif.sources, source.name)"
                                            [disabled]="!session.peutEditer() || etat.priseParUnAutre"
                                        />
                                        {{ source.name }}
                                        @if (etat.priseParUnAutre) {
                                            <span class="discret">· 🖥 {{ etat.proprietaire }}</span>
                                        }
                                    </label>
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
                        <!-- Déduit des sources ci-dessus : un objet métier déclare de quelles tables il vient. -->
                        @if (objetsAlimentes(actif).length) {
                            <label class="etiquette" style="margin-top: 10px">
                                🏛️ Objets métier alimentés
                                <span class="discret">— déduits des sources ci-dessus, rien à ressaisir</span>
                            </label>
                            <div class="puces" name="objetsAlimentes">
                                @for (objet of objetsAlimentes(actif); track objet.id) {
                                    <span class="puce vert">🏛️ {{ objet.name }}</span>
                                }
                            </div>
                        }
                        @let aval = chaine(actif);
                        @if (aval.sources.length && (aval.objets.length || aval.consommateurs.length)) {
                            <div class="chaine-aval" name="chaineAval">
                                <span class="intitule">🔗 Chaîne aval</span>
                                <b class="vert">📄 {{ aval.sources.join(', ') }}</b>
                                @if (aval.objets.length) {
                                    <span>
                                        → <b>🏛️ {{ aval.objets.join(', ') }}</b></span
                                    >
                                }
                                @if (aval.consommateurs.length) {
                                    <span>
                                        → <span class="discret">{{ aval.consommateurs.join(', ') }}</span></span
                                    >
                                }
                                <span class="note">déduit du paramétrage amont — rien à ressaisir</span>
                            </div>
                        }
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
                        <!-- V13 : les colonnes dont le processus dépend vraiment — c'est ce que lit l'analyse d'impact. -->
                        <label class="etiquette" style="margin-top: 10px">Colonnes critiques utilisées</label>
                        <div class="puces" name="colonnesCritiques">
                            @for (colonne of actif.columns; track $index; let rang = $index) {
                                <span class="puce ambre">
                                    {{ libelleColonne(colonne) }}
                                    @if (session.peutEditer()) {
                                        <a (click)="retirerLaColonne(actif, rang)" title="Retirer">✕</a>
                                    }
                                </span>
                            } @empty {
                                <span class="discret">aucune colonne déclarée critique</span>
                            }
                        </div>
                        @if (session.peutEditer()) {
                            <div class="formulaire-ligne" style="max-width: 560px">
                                <select
                                    class="champ"
                                    name="tableCritique"
                                    [(ngModel)]="tableCritique"
                                    (ngModelChange)="colonneCritique = ''"
                                >
                                    <option value="">— table —</option>
                                    @for (source of sources(); track source.id) {
                                        <option [value]="source.name">{{ source.name }}</option>
                                    }
                                </select>
                                <select class="champ" name="colonneCritique" [(ngModel)]="colonneCritique">
                                    <option value="">— colonne —</option>
                                    @for (colonne of colonnesDe(tableCritique); track colonne) {
                                        <option [value]="colonne">{{ colonne }}</option>
                                    }
                                </select>
                                <button class="bouton" name="lierLaColonne" (click)="lierLaColonne(actif)" style="flex: 0 0 auto">
                                    Lier la colonne
                                </button>
                            </div>
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
                    <!-- Un actif déclaré mais relié à rien ne sert à personne : on le dit. -->
                    <div class="discret" style="margin-top: 10px" name="usageDeLActif">{{ phraseUsage(actif) }}</div>
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
        /* Une source déjà rattachée à une autre application : visible, mais hors de portée. */
        .case.prise {
            opacity: 0.5;
        }
        /* Le modèle, écrit en tête de l'écran. */
        .bandeau-modele {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 4px 8px;
            background: var(--surface);
            border: 1px solid var(--bordure);
            border-radius: 12px;
            padding: 10px 14px;
            margin-bottom: 14px;
            font-size: 13px;
        }
        .bandeau-modele .intitule,
        .chaine-aval .intitule {
            font-size: 10px;
            text-transform: uppercase;
            font-weight: 700;
            color: var(--texte-2);
        }
        .bandeau-modele .fleche {
            color: var(--texte-2);
            opacity: 0.6;
        }
        .bandeau-modele .note,
        .chaine-aval .note {
            flex-basis: 100%;
            font-size: 11px;
            color: var(--texte-2);
        }
        .vert {
            color: var(--succes);
        }
        .impact-v13 {
            margin-bottom: 14px;
        }
        .chaine-aval {
            font-size: 11.5px;
            background: var(--surface);
            border: 1px solid var(--bordure);
            border-radius: 8px;
            padding: 6px 8px;
            margin-top: 6px;
        }
        .puces {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin: 4px 0;
        }
        .puce {
            font-size: 11px;
            padding: 2px 8px;
            border: 1px solid var(--bordure);
            border-radius: 999px;
            background: var(--surface-2);
        }
        .puce.vert {
            border-color: color-mix(in srgb, var(--succes) 45%, transparent);
            color: var(--succes);
        }
        .puce.ambre {
            border-color: color-mix(in srgb, var(--alerte) 45%, transparent);
            color: var(--alerte);
        }
        .puce a {
            cursor: pointer;
            margin-left: 5px;
            color: var(--erreur);
        }
    `
})
export class ActifsComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    private readonly annulation = inject(AnnulationService);
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
    /** L'analyse d'impact en cours : la table et la colonne interrogées, et ce qu'elle a répondu. */
    readonly impact = signal<AnalyseImpact | null>(null);
    tableImpact = '';
    colonneImpact = '';
    /** La colonne critique que l'on est en train de déclarer sur un processus. */
    tableCritique = '';
    colonneCritique = '';
    readonly blocsDImpact = blocsDImpact;
    readonly libelleColonne = libelleDeLaColonne;

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

    /** Les colonnes d'une source, pour les listes déroulantes de l'impact et des colonnes critiques. */
    colonnesDe(nomSource: string): string[] {
        return this.sources().find(source => source.name === nomSource)?.headers || [];
    }

    /** « Si cette donnée a un problème, qui est touché ? » — directement, en aval, ou par les liens. */
    async analyserImpact(): Promise<void> {
        try {
            this.impact.set(await this.api.analyseImpact(this.tableImpact, this.colonneImpact || undefined));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    /** Ce que dit la case d'une source : à moi, libre, ou déjà prise par une autre application. */
    etatSource(actif: Actif, nomSource: string) {
        return etatDeLaSource(this.actifs(), actif, nomSource);
    }

    /** Les objets métier qu'alimentent les sources de cette application — déduits, jamais saisis. */
    objetsAlimentes(actif: Actif): ObjetMetier[] {
        return objetsAlimentes(actif, this.objets());
    }

    /** Ce que produit l'application, en bout de chaîne. */
    chaine(actif: Actif): ChaineAval {
        return chaineAval(actif, this.objets(), this.actifs());
    }

    /** À quoi l'actif est relié, en une phrase. */
    phraseUsage(actif: Actif): string {
        return phraseDeLUsage(usageDunActif(actif, this.objets(), this.actifs()));
    }

    /** Déclare une colonne critique sur un processus : c'est elle que lira l'analyse d'impact. */
    lierLaColonne(actif: Actif): void {
        const colonnes = (actif.columns ||= []) as ColonneCritique[];
        if (!ajouterUneColonneCritique(colonnes, this.tableCritique, this.colonneCritique))
            return this.notifications.erreur('Choisissez une table et une colonne qui ne soient pas déjà déclarées.');
        this.colonneCritique = '';
    }

    retirerLaColonne(actif: Actif, rang: number): void {
        (actif.columns as ColonneCritique[]).splice(rang, 1);
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

    /** Les mêmes appels que la saisie ordinaire, pour défaire une écriture sur une application. */
    private moyensDuRetour(): MoyensDuRetour<Actif> {
        return {
            ecrire: (id, contenu) => this.api.enregistrerActif(id, contenu),
            effacer: id => this.api.supprimerActif(id),
            relire: () => this.recharger()
        };
    }

    async enregistrer(): Promise<void> {
        const actif = this.edition();
        if (!actif) return;
        if (!actif.name.trim()) return this.notifications.erreur("Donnez un nom à l'actif.");
        this.enCours.set(true);
        // La version d'avant est prise avant l'appel : c'est elle que « ⟲ Annuler » réécrira.
        const avant = this.actifs().find(candidat => candidat.id === actif.id) || null;
        try {
            const { id, ...corps } = actif;
            await this.api.enregistrerActif(id, corps);
            this.nouveau.set(false);
            await this.recharger();
            this.annulation.retenir(
                retourDUneEcriture(`« ${actif.name} »`, id, avant, this.moyensDuRetour()),
                `« ${actif.name} » enregistré.`
            );
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    /**
     * Une copie de l'application, à renommer. Ses sources ne suivent pas : une table n'a qu'un producteur,
     * et il reste l'original.
     */
    async dupliquer(actif: Actif): Promise<void> {
        const copie = copieDUnActif(actif, genererIdentifiant);
        try {
            const { id, ...corps } = copie;
            await this.api.enregistrerActif(id, corps);
            await this.recharger();
            this.selectionId.set(id);
            this.edition.set(this.actifs().find(candidat => candidat.id === id) || copie);
            this.annulation.retenir(
                retourDUneEcriture(`« ${copie.name} »`, id, null, this.moyensDuRetour()),
                messageDeCopie(copie.name, "Ses sources n'ont pas été copiées : une table n'a qu'un producteur.")
            );
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    /** Suppression sûre : on nomme l'application, et le retour en arrière reste offert ensuite. */
    async supprimer(actif: Actif): Promise<void> {
        if (!confirm(questionAvantSuppression(`« ${actif.name} »`))) return;
        try {
            await this.api.supprimerActif(actif.id);
            this.edition.set(null);
            this.selectionId.set(null);
            await this.recharger();
            this.annulation.retenir(
                retourDUneSuppression(`« ${actif.name} »`, actif, this.moyensDuRetour()),
                `« ${actif.name} » supprimé.`
            );
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
}
