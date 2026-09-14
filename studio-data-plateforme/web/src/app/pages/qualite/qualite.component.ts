/**
 * Qualité & Audit : pour une source choisie,
 *   • Profilage — périmètre filtrable, mesures par colonne (complétude, distinctes, formats, valeurs fréquentes,
 *     hygiène), alertes, inspecteur d'anomalies (voir / exporter les lignes concernées) ;
 *   • Doublons — sur une clé composée d'une ou plusieurs colonnes, dans le périmètre choisi ;
 *   • Clé fonctionnelle — profils de clé composite et doublons approchés ;
 *   • Règles & score — règles de qualité de la source (quatorze types), exécution, score pondéré, lignes en échec ;
 *   • Objet métier — audit d'un objet de la gouvernance (table maître, règles du périmètre, facettes) ;
 *   • Historique — audits enregistrés.
 * Tout le calcul est fait par le serveur (DuckDB) ; l'écran compose et affiche. Les sections lourdes sont des
 * composants dédiés du même dossier (filtres-audit, inspecteur-anomalies, formulaire-regle, cles-fonctionnelles,
 * audit-objet, page-lignes).
 */
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ClientApiService } from '../../coeur/client-api.service';
import {
    AuditQualite,
    ConfigurationSerie,
    Criticite,
    DefinitionRegle,
    ExecutionRegles,
    FiltreAudit,
    ListeValeurs,
    ObjetMetier,
    PageLignes,
    ProfilColonne,
    ProfilSource,
    RegleQualite,
    Relation,
    ResultatDoublons,
    Source,
    TypeRegle,
    VocabulaireQualite,
    formaterDate
} from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';
import { telechargerCsv, telechargerJson } from '../../coeur/telechargement';
import { AuditObjetComponent } from './audit-objet.component';
import { cibleDeLaRegle } from './description-regle';
import { ClesFonctionnellesComponent } from './cles-fonctionnelles.component';
import { DetailColonneComponent } from './detail-colonne.component';
import { DettesQualiteComponent } from './dettes-qualite.component';
import { FiltresAuditComponent } from './filtres-audit.component';
import { BrouillonRegle, FormulaireRegleComponent } from './formulaire-regle.component';
import { InspecteurAnomaliesComponent } from './inspecteur-anomalies.component';
import { PageLignesComponent, TAILLE_PAGE_LIGNES } from './page-lignes.component';
import { TendanceScoresComponent } from './tendance-scores.component';

type Onglet = 'profil' | 'doublons' | 'cles' | 'regles' | 'objet' | 'historique';

/** Volumes analysés proposés (nombre de premières lignes) ; 0 = toute la source. */
const VOLUMES_ANALYSES = [
    { valeur: 0, libelle: 'Toute la source' },
    { valeur: 1000, libelle: '1 000 premières lignes' },
    { valeur: 10000, libelle: '10 000 premières lignes' },
    { valeur: 100000, libelle: '100 000 premières lignes' },
    { valeur: 1000000, libelle: '1 000 000 premières lignes' }
];

const REGLE_VIDE = (): DefinitionRegle => ({
    nom: '',
    sourceId: '',
    colonne: '',
    type: 'nonVide',
    parametres: {},
    criticite: 'majeure',
    active: true
});

@Component({
    selector: 'app-qualite',
    imports: [
        FormsModule,
        FiltresAuditComponent,
        InspecteurAnomaliesComponent,
        FormulaireRegleComponent,
        ClesFonctionnellesComponent,
        AuditObjetComponent,
        PageLignesComponent,
        DetailColonneComponent,
        DettesQualiteComponent,
        TendanceScoresComponent
    ],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Qualité & Audit</h1>
                <p class="discret">
                    Profilage, anomalies, doublons, clés fonctionnelles, règles et score — calculés par le serveur, enregistrés dans
                    l'historique.
                </p>
            </div>
            @if (ongletActif() !== 'objet') {
                <select
                    class="champ"
                    style="width: auto; min-width: 220px"
                    [ngModel]="sourceId()"
                    (ngModelChange)="choisirSource($event)"
                    name="source"
                >
                    <option value="">Choisir une source…</option>
                    @for (source of sources(); track source.id) {
                        <option [value]="source.id">{{ source.name }}</option>
                    }
                </select>
            }
        </div>

        <div class="onglets">
            @for (onglet of onglets; track onglet.cle) {
                <button [class.actif]="ongletActif() === onglet.cle" (click)="ongletActif.set(onglet.cle)">{{ onglet.libelle }}</button>
            }
        </div>

        @if (ongletActif() === 'objet') {
            <app-audit-objet [objets]="objets()" [sources]="sources()" />
        } @else if (source(); as source) {
            <!-- ---- profilage ---- -->
            @if (ongletActif() === 'profil') {
                <div class="carte">
                    <div class="entete-page" style="margin: 0">
                        <button class="bouton principal" (click)="profiler()" [disabled]="enCours()">
                            {{ enCours() ? 'Analyse…' : 'Profiler la source' }}
                        </button>
                        <select
                            class="champ"
                            style="width: auto"
                            name="echantillon"
                            title="Volume analysé : n'analyser que les premières lignes pour une source volumineuse"
                            [ngModel]="echantillon()"
                            (ngModelChange)="echantillon.set(+$event)"
                        >
                            @for (volume of volumesAnalyses; track volume.valeur) {
                                <option [ngValue]="volume.valeur">{{ volume.libelle }}</option>
                            }
                        </select>
                        @if (profil(); as profil) {
                            <span class="badge">{{ profil.lignes }} ligne(s)</span>
                            @if (profil.echantillon) {
                                <span class="badge neutre">volume analysé : {{ profil.echantillon }} premières lignes</span>
                            }
                            <span
                                class="badge"
                                [class.succes]="profil.completudeMoyenne >= 0.95"
                                [class.alerte]="profil.completudeMoyenne < 0.95"
                                >complétude moyenne {{ pourcent(profil.completudeMoyenne) }}</span
                            >
                            <span class="badge" [class.succes]="profil.doublonsExacts === 0" [class.erreur]="profil.doublonsExacts > 0"
                                >{{ profil.doublonsExacts }} doublon(s) exact(s)</span
                            >
                            @if (profil.filtres?.length) {
                                <span class="badge neutre">périmètre : {{ profil.filtres!.length }} filtre(s)</span>
                            }
                            <span class="espace"></span>
                            <button class="bouton petit" (click)="exporterProfil()">Exporter le profil (CSV)</button>
                            <button class="bouton petit" (click)="exporterAuditJson()">Exporter l'audit (JSON)</button>
                        }
                    </div>
                    <div style="margin-top: 10px">
                        <app-filtres-audit [colonnes]="source.headers" prefixe="profil" [(filtres)]="filtresProfil" />
                    </div>
                    @if (alertes().length) {
                        <ul class="alertes">
                            @for (alerte of alertes(); track alerte) {
                                <li>{{ alerte }}</li>
                            }
                        </ul>
                    }
                </div>
                @if (profil(); as profil) {
                    <div class="carte defilement-x">
                        <table class="tableau">
                            <thead>
                                <tr>
                                    <th>Colonne</th>
                                    <th>Complétude</th>
                                    <th>Distinctes</th>
                                    <th>Longueur</th>
                                    <th>Type dominant</th>
                                    <th>Format majoritaire</th>
                                    <th>Valeurs fréquentes</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                @for (colonne of profil.colonnes; track colonne.colonne) {
                                    <tr [class.choisie]="colonneDetaillee() === colonne.colonne">
                                        <td>
                                            <code>{{ colonne.colonne }}</code>
                                            @if (colonne.espacesParasites) {
                                                <div class="discret">{{ colonne.espacesParasites }} valeur(s) avec espaces parasites</div>
                                            }
                                        </td>
                                        <td>
                                            <div class="barre-progression" [title]="colonne.vides + ' vide(s)'">
                                                <div
                                                    [style.width.%]="colonne.completude * 100"
                                                    [style.background]="
                                                        colonne.completude < 0.9
                                                            ? 'var(--erreur)'
                                                            : colonne.completude < 0.95
                                                              ? 'var(--alerte)'
                                                              : 'var(--succes)'
                                                    "
                                                ></div>
                                            </div>
                                            <span class="discret">{{ pourcent(colonne.completude) }}</span>
                                        </td>
                                        <td>{{ colonne.distinctes }}</td>
                                        <td class="discret">{{ colonne.longueurMin ?? '—' }} – {{ colonne.longueurMax ?? '—' }}</td>
                                        <td>
                                            {{ typeDominant(colonne) }}
                                            @if (
                                                typeDominant(colonne) === 'nombre' &&
                                                colonne.moyenne !== null &&
                                                colonne.moyenne !== undefined
                                            ) {
                                                <div class="discret">
                                                    moyenne {{ arrondir(colonne.moyenne) }} · écart-type
                                                    {{ arrondir(colonne.ecartType ?? 0) }}
                                                </div>
                                            }
                                        </td>
                                        <td>
                                            @if (colonne.motifMajoritaire) {
                                                <code>{{ colonne.motifMajoritaire }}</code>
                                                <span class="discret"
                                                    >{{ pourcent(colonne.partMotifMajoritaire) }} ·
                                                    {{ colonne.motifsDistincts }} format(s)</span
                                                >
                                            }
                                        </td>
                                        <td class="discret">
                                            @for (valeur of colonne.valeursFrequentes; track $index) {
                                                <span class="valeur"
                                                    >{{ valeur.valeur }} <b>×{{ valeur.nombre }}</b></span
                                                >
                                            }
                                        </td>
                                        <td style="white-space: nowrap">
                                            <button class="bouton petit" (click)="detaillerColonne(colonne.colonne)">Détail</button>
                                        </td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    </div>
                    @if (colonneDetaillee(); as colonne) {
                        <app-detail-colonne
                            [sourceId]="source.id"
                            [sourceNom]="source.name"
                            [colonne]="colonne"
                            [filtres]="profil.filtres || []"
                            [echantillon]="profil.echantillon"
                            (fermer)="colonneDetaillee.set('')"
                        />
                    }
                    <app-inspecteur-anomalies
                        [sourceId]="source.id"
                        [sourceNom]="source.name"
                        [anomalies]="profil.anomalies || []"
                        [filtres]="profil.filtres || []"
                    />
                }
            }

            <!-- ---- doublons ---- -->
            @if (ongletActif() === 'doublons') {
                <div class="carte">
                    <h2>Clé de recherche</h2>
                    <p class="discret">
                        Les lignes qui partagent les mêmes valeurs sur ces colonnes (comparaison sans espaces ni casse) sont des doublons.
                    </p>
                    <div class="cases">
                        @for (colonne of source.headers; track colonne) {
                            <label class="case"
                                ><input type="checkbox" [checked]="cle().includes(colonne)" (change)="basculerCle(colonne)" />
                                <code>{{ colonne }}</code></label
                            >
                        }
                    </div>
                    <div style="margin-top: 10px">
                        <app-filtres-audit [colonnes]="source.headers" prefixe="doublons" [(filtres)]="filtresDoublons" />
                    </div>
                    <button
                        class="bouton principal"
                        style="margin-top: 10px"
                        (click)="chercherDoublons()"
                        [disabled]="!cle().length || enCours()"
                    >
                        Chercher les doublons
                    </button>
                </div>
                @if (doublons(); as doublons) {
                    <div class="carte">
                        <h2>
                            <span class="badge" [class.succes]="doublons.groupes === 0" [class.erreur]="doublons.groupes > 0"
                                >{{ doublons.groupes }} groupe(s)</span
                            >
                            {{ doublons.lignes }} ligne(s) concernée(s) sur la clé {{ doublons.cle.join(' + ') }}
                        </h2>
                        @if (doublons.exemples.length) {
                            <table class="tableau">
                                <thead>
                                    <tr>
                                        @for (colonne of doublons.cle; track colonne) {
                                            <th>{{ colonne }}</th>
                                        }
                                        <th>Occurrences</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @for (exemple of doublons.exemples; track $index) {
                                        <tr>
                                            @for (valeur of exemple.valeurs; track $index) {
                                                <td>{{ valeur }}</td>
                                            }
                                            <td>
                                                <b>{{ exemple.nombre }}</b>
                                            </td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        }
                    </div>
                }
            }

            <!-- ---- clé fonctionnelle ---- -->
            @if (ongletActif() === 'cles' && vocabulaire(); as vocabulaire) {
                <app-cles-fonctionnelles [source]="source" [sources]="sources()" [relations]="relations()" [vocabulaire]="vocabulaire" />
            }

            <!-- ---- règles & score ---- -->
            @if (ongletActif() === 'regles') {
                <div class="carte">
                    <div class="entete-page" style="margin: 0">
                        <button class="bouton principal" (click)="executerRegles()" [disabled]="enCours() || !regles().length">
                            {{ enCours() ? 'Exécution…' : 'Exécuter les règles' }}
                        </button>
                        @if (execution(); as execution) {
                            <span
                                class="score"
                                [class.bon]="(execution.score ?? 0) >= 90"
                                [class.moyen]="(execution.score ?? 0) < 90 && (execution.score ?? 0) >= 70"
                                [class.mauvais]="(execution.score ?? 0) < 70"
                                >Score {{ execution.score ?? '—' }} / 100</span
                            >
                            <button class="bouton petit" (click)="exporterResultats()">Exporter les résultats (CSV)</button>
                            <button class="bouton petit" (click)="exporterScorecard()">Scorecard (JSON)</button>
                        }
                        <span class="espace"></span>
                        @if (session.peutEditer()) {
                            <button class="bouton" (click)="nouvelleRegle()">Nouvelle règle</button>
                        }
                    </div>
                </div>
                @if (brouillon() && vocabulaire(); as vocabulaire) {
                    <app-formulaire-regle
                        [brouillon]="brouillon()!"
                        [source]="source"
                        [sources]="sources()"
                        [vocabulaire]="vocabulaire"
                        [listesValeurs]="listesValeurs()"
                        [series]="series()"
                        (enregistrer)="enregistrerRegle($event)"
                        (annuler)="brouillon.set(null)"
                    />
                }
                <div class="carte">
                    @if (regles().length === 0) {
                        <div class="vide">
                            Aucune règle pour cette source. Créez-en une : non vide, unique, format, liste, plage, longueur, date,
                            fraîcheur, référence, condition, cohérence, SQL, agrégat par groupe.
                        </div>
                    } @else {
                        <table class="tableau">
                            <thead>
                                <tr>
                                    <th>Règle</th>
                                    <th>Colonne</th>
                                    <th>Type</th>
                                    <th>Criticité</th>
                                    <th>Dernier résultat</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                @for (regle of regles(); track regle.id) {
                                    <tr [class.inactive]="!regle.active">
                                        <td>
                                            <b>{{ regle.nom }}</b>
                                            @if (!regle.active) {
                                                <span class="badge neutre">inactive</span>
                                            }
                                        </td>
                                        <td>
                                            <code>{{ cibleDeLaRegle(regle) }}</code>
                                        </td>
                                        <td>{{ libelleType(regle.type) }}</td>
                                        <td>
                                            <span
                                                class="badge"
                                                [class.erreur]="regle.criticite === 'bloquante'"
                                                [class.alerte]="regle.criticite === 'majeure'"
                                                [class.neutre]="regle.criticite === 'mineure'"
                                                >{{ regle.criticite }}</span
                                            >
                                        </td>
                                        <td>
                                            @if (regle.dernierResultat; as resultat) {
                                                <span
                                                    class="badge"
                                                    [class.succes]="resultat.echecs === 0"
                                                    [class.erreur]="resultat.echecs > 0"
                                                    >{{ pourcent(resultat.taux) }} conforme</span
                                                >
                                                <span class="discret">{{ resultat.echecs }} échec(s) / {{ resultat.total }}</span>
                                                @if (resultat.exemples.length) {
                                                    <div class="discret">ex. {{ resultat.exemples.join(' · ') }}</div>
                                                }
                                                @if (resultat.echecs > 0) {
                                                    <button class="bouton petit" (click)="voirLignesRegle(regle)">Voir les lignes</button>
                                                }
                                            } @else {
                                                <span class="discret">jamais exécutée</span>
                                            }
                                        </td>
                                        <td style="white-space: nowrap">
                                            <button
                                                class="bouton petit"
                                                (click)="expliquerRegle(regle)"
                                                title="Ce que la règle vérifie et comment elle compte les échecs"
                                            >
                                                ?
                                            </button>
                                            <button class="bouton petit" (click)="executerUneRegle(regle)" [disabled]="enCours()">
                                                Exécuter
                                            </button>
                                            @if (session.peutEditer()) {
                                                <button class="bouton petit" (click)="modifierRegle(regle)">Modifier</button>
                                                <button class="bouton petit" (click)="dupliquerRegle(regle)">Dupliquer</button>
                                                <button class="bouton petit danger" (click)="supprimerRegle(regle)">Supprimer</button>
                                            }
                                        </td>
                                    </tr>
                                    @if (regleExpliquee() === regle.id && explication(regle); as explication) {
                                        <tr class="explication">
                                            <td colspan="6">
                                                <b>Quoi :</b> {{ explication.quoi }}<br />
                                                <b>Comment :</b> {{ explication.comment }}
                                            </td>
                                        </tr>
                                    }
                                }
                            </tbody>
                        </table>
                    }
                </div>
                @if (regles().length) {
                    <app-dettes-qualite [regles]="regles()" [poidsCriticites]="vocabulaire()?.criticites || {}" />
                    <app-tendance-scores [audits]="audits()" />
                }
                @if (pageRegle()) {
                    <div class="carte">
                        <app-page-lignes
                            [titre]="'Lignes en échec — ' + (regleInspectee()?.nom || '')"
                            [page]="pageRegle()"
                            [enCours]="enCours()"
                            (changerOffset)="chargerLignesRegle($event)"
                            (exporter)="exporterLignesRegle()"
                            (fermer)="pageRegle.set(null)"
                        />
                    </div>
                }
            }

            <!-- ---- historique ---- -->
            @if (ongletActif() === 'historique') {
                <div class="carte">
                    @if (audits().length === 0) {
                        <div class="vide">Aucun audit enregistré pour cette source.</div>
                    } @else {
                        <table class="tableau">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Genre</th>
                                    <th>Lignes</th>
                                    <th>Synthèse</th>
                                </tr>
                            </thead>
                            <tbody>
                                @for (audit of audits(); track audit.id) {
                                    <tr>
                                        <td class="discret">{{ formaterDate(audit.lanceLe) }}</td>
                                        <td>
                                            <span class="badge neutre">{{ audit.genre }}</span>
                                        </td>
                                        <td>{{ audit.lignes }}</td>
                                        <td>{{ syntheseAudit(audit) }}</td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    }
                </div>
            }
        } @else {
            <div class="carte vide">
                Choisissez une source pour lancer un profilage, chercher des doublons ou gérer ses règles de qualité.
            </div>
        }
    `,
    styles: `
        .onglets {
            display: flex;
            gap: 4px;
            margin-bottom: 12px;
            border-bottom: 1px solid var(--bordure);
            flex-wrap: wrap;
        }
        .onglets button {
            border: 0;
            background: none;
            padding: 8px 12px;
            font: inherit;
            font-weight: 600;
            color: var(--texte-2);
            cursor: pointer;
            border-bottom: 2px solid transparent;
        }
        .onglets button.actif {
            color: var(--accent);
            border-bottom-color: var(--accent);
        }
        .alertes {
            margin: 10px 0 0;
            padding-left: 18px;
            color: var(--alerte);
        }
        .cases {
            display: flex;
            flex-wrap: wrap;
            gap: 8px 16px;
        }
        .case {
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
        }
        .valeur {
            display: inline-block;
            margin-right: 8px;
        }
        .score {
            font-weight: 800;
            padding: 4px 10px;
            border-radius: 8px;
        }
        .score.bon {
            background: color-mix(in srgb, var(--succes) 15%, transparent);
            color: var(--succes);
        }
        .score.moyen {
            background: color-mix(in srgb, var(--alerte) 18%, transparent);
            color: var(--alerte);
        }
        .score.mauvais {
            background: color-mix(in srgb, var(--erreur) 15%, transparent);
            color: var(--erreur);
        }
        .inactive td {
            opacity: 0.6;
        }
        .explication td {
            background: var(--surface-2);
            font-size: 12px;
            color: var(--texte-2);
        }
        tr.choisie td {
            background: var(--accent-2);
        }
        .barre-progression {
            width: 120px;
            display: inline-block;
            vertical-align: middle;
            margin-right: 6px;
        }
    `
})
export class QualiteComponent {
    readonly session = inject(SessionService);
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);

    readonly onglets: { cle: Onglet; libelle: string }[] = [
        { cle: 'profil', libelle: 'Profilage & anomalies' },
        { cle: 'doublons', libelle: 'Doublons' },
        { cle: 'cles', libelle: 'Clé fonctionnelle' },
        { cle: 'regles', libelle: 'Règles & score' },
        { cle: 'objet', libelle: 'Objet métier' },
        { cle: 'historique', libelle: 'Historique' }
    ];
    readonly sources = signal<Source[]>([]);
    readonly vocabulaire = signal<VocabulaireQualite | null>(null);
    readonly relations = signal<Relation[]>([]);
    readonly objets = signal<ObjetMetier[]>([]);
    readonly listesValeurs = signal<ListeValeurs[]>([]);
    readonly series = signal<ConfigurationSerie[]>([]);
    readonly sourceId = signal('');
    readonly ongletActif = signal<Onglet>('profil');
    readonly enCours = signal(false);
    readonly profil = signal<ProfilSource | null>(null);
    readonly cle = signal<string[]>([]);
    readonly doublons = signal<ResultatDoublons | null>(null);
    readonly regles = signal<RegleQualite[]>([]);
    readonly execution = signal<ExecutionRegles | null>(null);
    readonly brouillon = signal<BrouillonRegle | null>(null);
    readonly regleInspectee = signal<RegleQualite | null>(null);
    readonly pageRegle = signal<PageLignes | null>(null);
    readonly audits = signal<AuditQualite[]>([]);
    readonly formaterDate = formaterDate;
    /** Volume analysé au profilage (0 = toute la source) et colonne dont le détail est ouvert. */
    readonly volumesAnalyses = VOLUMES_ANALYSES;
    readonly echantillon = signal(0);
    readonly colonneDetaillee = signal('');
    /** Règle dont l'explication (quoi / comment) est dépliée. */
    readonly regleExpliquee = signal('');
    /** Périmètres d'audit (filtres) du profilage et de la recherche de doublons. */
    filtresProfil: FiltreAudit[] = [];
    filtresDoublons: FiltreAudit[] = [];

    readonly source = computed(() => this.sources().find(source => source.id === this.sourceId()) || null);
    /** Alertes lisibles déduites du profil : complétude faible, formats hétérogènes, espaces parasites, doublons. */
    readonly alertes = computed(() => {
        const profil = this.profil();
        if (!profil) return [];
        const alertes: string[] = [];
        if (profil.doublonsExacts > 0) alertes.push(`${profil.doublonsExacts} ligne(s) strictement identique(s) à une autre.`);
        if (profil.lignesVides) alertes.push(`${profil.lignesVides} ligne(s) entièrement vide(s).`);
        for (const colonne of profil.colonnes) {
            if (colonne.completude < 0.9)
                alertes.push(
                    `« ${colonne.colonne} » : complétude faible (${this.pourcent(colonne.completude)}, ${colonne.vides} vide(s)).`
                );
            if (colonne.motifsDistincts > 1 && colonne.partMotifMajoritaire >= 0.8) {
                alertes.push(
                    `« ${colonne.colonne} » : le format ${colonne.motifMajoritaire} domine (${this.pourcent(colonne.partMotifMajoritaire)}) mais ${colonne.motifsDistincts - 1} autre(s) format(s) existent.`
                );
            }
            if (colonne.espacesParasites > 0)
                alertes.push(`« ${colonne.colonne} » : ${colonne.espacesParasites} valeur(s) avec des espaces autour.`);
        }
        return alertes;
    });

    private readonly sourceDemandee = inject(ActivatedRoute).snapshot.queryParamMap.get('source') || '';

    constructor() {
        // L'entrée de menu « Règles & score » ouvre directement l'onglet des règles (/qualite/regles).
        const onglet = inject(ActivatedRoute).snapshot.paramMap.get('onglet');
        if (onglet && this.onglets.some(candidat => candidat.cle === onglet)) this.ongletActif.set(onglet as Onglet);
        this.charger();
    }

    private async charger(): Promise<void> {
        try {
            const [sources, vocabulaire, relations, objets, listesValeurs, series] = await Promise.all([
                this.api.sourcesEtJeux(),
                this.api.vocabulaireQualite(),
                this.api.relations(),
                this.api.objetsMetier(),
                this.api.listesValeurs(),
                this.api.series()
            ]);
            this.series.set(series);
            this.sources.set(sources);
            this.vocabulaire.set(vocabulaire);
            this.relations.set(relations);
            this.objets.set(objets);
            this.listesValeurs.set(listesValeurs);
            // Lien « Qualité » de l'écran Sources : /qualite?source=identifiant choisit directement la source.
            if (this.sourceDemandee && !this.sourceId() && sources.some(source => source.id === this.sourceDemandee))
                await this.choisirSource(this.sourceDemandee);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async choisirSource(sourceId: string): Promise<void> {
        this.sourceId.set(sourceId);
        this.profil.set(null);
        this.doublons.set(null);
        this.cle.set([]);
        this.execution.set(null);
        this.brouillon.set(null);
        this.pageRegle.set(null);
        this.colonneDetaillee.set('');
        this.regleExpliquee.set('');
        this.filtresProfil = [];
        this.filtresDoublons = [];
        if (!sourceId) return;
        await Promise.all([this.rechargerRegles(), this.rechargerAudits()]);
    }

    pourcent(valeur: number): string {
        return (100 * valeur).toFixed(1) + ' %';
    }
    arrondir(valeur: number): string {
        return (Math.round(valeur * 100) / 100).toString();
    }
    typeDominant(colonne: ProfilColonne): string {
        if (colonne.total === colonne.vides) return 'vide';
        if (colonne.partDate >= 0.9) return 'date';
        if (colonne.partNumerique >= 0.9) return 'nombre';
        return 'texte';
    }
    libelleType(type: TypeRegle): string {
        return this.vocabulaire()?.typesRegle[type] || type;
    }
    readonly cibleDeLaRegle = cibleDeLaRegle;
    syntheseAudit(audit: AuditQualite): string {
        const resume = audit.resume as Record<string, unknown>;
        if (audit.genre === 'profilage')
            return `complétude moyenne ${this.pourcent(Number(resume['completudeMoyenne']))}, ${resume['doublonsExacts']} doublon(s) exact(s), ${resume['colonnesIncompletes']} colonne(s) incomplète(s)${resume['filtres'] ? `, ${resume['filtres']} filtre(s)` : ''}`;
        if (audit.genre === 'doublons')
            return `clé ${(resume['cle'] as string[]).join(' + ')} : ${resume['groupes']} groupe(s), ${resume['lignes']} ligne(s)`;
        if (audit.genre === 'doublons-approches')
            return `${resume['profils']} profil(s) de clé : ${resume['groupesExacts']} clé(s) en doublon exact, ${resume['pairesFloues']} paire(s) ressemblante(s)`;
        return `score ${resume['score'] ?? '—'} / 100 sur ${resume['regles']} règle(s), ${resume['enEchec']} en échec`;
    }

    private async executer(action: () => Promise<void>): Promise<void> {
        this.enCours.set(true);
        try {
            await action();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    // ---- profilage ----
    async profiler(): Promise<void> {
        await this.executer(async () => {
            this.colonneDetaillee.set('');
            this.profil.set(await this.api.profilerSource(this.sourceId(), this.filtresProfil, this.echantillon() || undefined));
            await this.rechargerAudits();
        });
    }
    detaillerColonne(colonne: string): void {
        this.colonneDetaillee.set(this.colonneDetaillee() === colonne ? '' : colonne);
    }
    /** L'audit complet (profil, anomalies, périmètre) en JSON, pour archivage ou traitement externe. */
    exporterAuditJson(): void {
        const profil = this.profil();
        if (!profil) return;
        telechargerJson(`audit ${profil.sourceNom}.json`, { exporteLe: new Date().toISOString(), ...profil });
    }
    exporterProfil(): void {
        const profil = this.profil();
        if (!profil) return;
        const colonnes = [
            'colonne',
            'total',
            'vides',
            'completude',
            'distinctes',
            'longueurMin',
            'longueurMax',
            'espacesParasites',
            'espacesMultiples',
            'boucheTrous',
            'cassesIncoherentes',
            'aberrantes',
            'partNumerique',
            'partDate',
            'motifMajoritaire',
            'motifsDistincts'
        ];
        const lignes = profil.colonnes.map(colonne => colonnes.map(champ => (colonne as unknown as Record<string, unknown>)[champ]));
        telechargerCsv(`profil ${profil.sourceNom}.csv`, colonnes, lignes);
    }

    // ---- doublons ----
    basculerCle(colonne: string): void {
        this.cle.update(cle => (cle.includes(colonne) ? cle.filter(candidat => candidat !== colonne) : [...cle, colonne]));
    }
    async chercherDoublons(): Promise<void> {
        await this.executer(async () => {
            this.doublons.set(await this.api.chercherDoublons(this.sourceId(), this.cle(), this.filtresDoublons));
            await this.rechargerAudits();
        });
    }

    // ---- règles ----
    async rechargerRegles(): Promise<void> {
        try {
            this.regles.set(await this.api.reglesQualite(this.sourceId()));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
    async rechargerAudits(): Promise<void> {
        try {
            this.audits.set(await this.api.auditsQualite(this.sourceId()));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
    nouvelleRegle(): void {
        const source = this.source();
        this.brouillon.set({ id: null, definition: { ...REGLE_VIDE(), sourceId: this.sourceId(), colonne: source?.headers[0] || '' } });
    }
    modifierRegle(regle: RegleQualite): void {
        this.brouillon.set({
            id: regle.id,
            definition: {
                nom: regle.nom,
                sourceId: regle.sourceId,
                colonne: regle.colonne,
                type: regle.type,
                parametres: { ...regle.parametres },
                criticite: regle.criticite as Criticite,
                active: regle.active
            }
        });
    }
    async enregistrerRegle(definition: DefinitionRegle): Promise<void> {
        const brouillon = this.brouillon();
        if (!brouillon) return;
        try {
            if (brouillon.id) await this.api.modifierRegleQualite(brouillon.id, definition);
            else await this.api.creerRegleQualite(definition);
            this.notifications.succes(`Règle « ${definition.nom} » enregistrée.`);
            this.brouillon.set(null);
            await this.rechargerRegles();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
    async supprimerRegle(regle: RegleQualite): Promise<void> {
        if (!confirm(`Supprimer la règle « ${regle.nom} » ?`)) return;
        try {
            await this.api.supprimerRegleQualite(regle.id);
            await this.rechargerRegles();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
    async executerRegles(): Promise<void> {
        await this.executer(async () => {
            this.execution.set(await this.api.executerReglesQualite(this.sourceId()));
            await Promise.all([this.rechargerRegles(), this.rechargerAudits()]);
        });
    }
    /** Exécute une seule règle (même inactive) : utile pour tester une règle qu'on vient d'écrire. */
    async executerUneRegle(regle: RegleQualite): Promise<void> {
        await this.executer(async () => {
            const resultat = await this.api.executerUneRegle(regle.id);
            if (resultat.erreur) this.notifications.erreur(`« ${regle.nom} » : ${resultat.erreur}`);
            else
                this.notifications.succes(
                    `« ${regle.nom} » : ${resultat.resultat?.echecs ?? 0} échec(s) sur ${resultat.resultat?.total ?? 0}.`
                );
            await Promise.all([this.rechargerRegles(), this.rechargerAudits()]);
        });
    }
    async dupliquerRegle(regle: RegleQualite): Promise<void> {
        try {
            const copie = await this.api.dupliquerRegleQualite(regle.id);
            this.notifications.succes(`Copie « ${copie.nom} » créée (inactive) : modifiez-la puis activez-la.`);
            await this.rechargerRegles();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
    expliquerRegle(regle: RegleQualite): void {
        this.regleExpliquee.set(this.regleExpliquee() === regle.id ? '' : regle.id);
    }
    explication(regle: RegleQualite): { quoi: string; comment: string } | null {
        return this.vocabulaire()?.explications?.[regle.type] || null;
    }
    /** Scorecard : le score et le résultat de chaque règle, en JSON (format repris de l'application classique). */
    exporterScorecard(): void {
        const execution = this.execution();
        const source = this.source();
        if (!execution || !source) return;
        telechargerJson(`scorecard ${source.name}.json`, {
            source: source.name,
            exporteLe: new Date().toISOString(),
            score: execution.score,
            regles: execution.regles.map(regle => ({
                nom: regle.nom,
                type: regle.type,
                cible: cibleDeLaRegle(regle),
                criticite: regle.criticite,
                total: regle.resultat?.total ?? null,
                echecs: regle.resultat?.echecs ?? null,
                taux: regle.resultat?.taux ?? null,
                erreur: regle.erreur || null
            }))
        });
    }
    exporterResultats(): void {
        const execution = this.execution();
        if (!execution) return;
        const colonnes = ['regle', 'type', 'colonne', 'criticite', 'total', 'echecs', 'taux', 'exemples', 'erreur'];
        const lignes = execution.regles.map(regle => [
            regle.nom,
            regle.type,
            regle.colonne,
            regle.criticite,
            regle.resultat?.total ?? '',
            regle.resultat?.echecs ?? '',
            regle.resultat ? this.pourcent(regle.resultat.taux) : '',
            (regle.resultat?.exemples || []).join(' | '),
            regle.erreur || ''
        ]);
        telechargerCsv(`regles ${this.source()?.name || ''} - score ${execution.score ?? ''}.csv`, colonnes, lignes);
    }

    // ---- lignes en échec d'une règle ----
    async voirLignesRegle(regle: RegleQualite): Promise<void> {
        this.regleInspectee.set(regle);
        await this.chargerLignesRegle(0);
    }
    async chargerLignesRegle(offset: number): Promise<void> {
        const regle = this.regleInspectee();
        if (!regle) return;
        await this.executer(async () => {
            this.pageRegle.set(await this.api.lignesRegle(regle.id, Math.max(0, offset)));
        });
    }
    async exporterLignesRegle(): Promise<void> {
        const regle = this.regleInspectee();
        if (!regle) return;
        await this.executer(async () => {
            const lignes: unknown[][] = [];
            let colonnes: string[] = [];
            let offset = 0;
            let total = 0;
            do {
                const page = await this.api.lignesRegle(regle.id, offset);
                colonnes = page.colonnes;
                total = page.total;
                lignes.push(...page.lignes);
                offset += TAILLE_PAGE_LIGNES;
                if (!page.lignes.length) break;
            } while (offset < total && lignes.length < 5000);
            telechargerCsv(`echecs ${regle.nom}.csv`, colonnes, lignes);
            this.notifications.succes(`${lignes.length} ligne(s) exportée(s).`);
        });
    }
}
