/**
 * Qualité & Audit : pour une source choisie,
 *   • Profilage — mesures par colonne (complétude, valeurs distinctes, formats, valeurs fréquentes), alertes ;
 *   • Doublons — sur une clé composée d'une ou plusieurs colonnes ;
 *   • Règles & score — règles de qualité de la source, exécution, score pondéré par criticité ;
 *   • Historique — audits enregistrés (profilages, doublons, exécutions de règles).
 * Tout le calcul est fait par le serveur (DuckDB) ; l'écran compose et affiche.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import {
    AuditQualite,
    Criticite,
    DefinitionRegle,
    ExecutionRegles,
    ProfilColonne,
    ProfilSource,
    RegleQualite,
    ResultatDoublons,
    Source,
    TypeRegle,
    VocabulaireQualite,
    formaterDate
} from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

type Onglet = 'profil' | 'doublons' | 'regles' | 'historique';

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
    imports: [FormsModule],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Qualité & Audit</h1>
                <p class="discret">Profilage, doublons, règles et score — calculés par le serveur, enregistrés dans l'historique.</p>
            </div>
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
        </div>

        @if (source(); as source) {
            <div class="onglets">
                @for (onglet of onglets; track onglet.cle) {
                    <button [class.actif]="ongletActif() === onglet.cle" (click)="ongletActif.set(onglet.cle)">{{ onglet.libelle }}</button>
                }
            </div>

            <!-- ---- profilage ---- -->
            @if (ongletActif() === 'profil') {
                <div class="carte">
                    <div class="entete-page" style="margin: 0">
                        <button class="bouton principal" (click)="profiler()" [disabled]="enCours()">
                            {{ enCours() ? 'Analyse…' : 'Profiler la source' }}
                        </button>
                        @if (profil(); as profil) {
                            <span class="badge">{{ profil.lignes }} ligne(s)</span>
                            <span
                                class="badge"
                                [class.succes]="profil.completudeMoyenne >= 0.95"
                                [class.alerte]="profil.completudeMoyenne < 0.95"
                                >complétude moyenne {{ pourcent(profil.completudeMoyenne) }}</span
                            >
                            <span class="badge" [class.succes]="profil.doublonsExacts === 0" [class.erreur]="profil.doublonsExacts > 0"
                                >{{ profil.doublonsExacts }} doublon(s) exact(s)</span
                            >
                        }
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
                                </tr>
                            </thead>
                            <tbody>
                                @for (colonne of profil.colonnes; track colonne.colonne) {
                                    <tr>
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
                                        <td>{{ typeDominant(colonne) }}</td>
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
                                    </tr>
                                }
                            </tbody>
                        </table>
                    </div>
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
                        }
                        <span class="espace"></span>
                        @if (session.peutEditer()) {
                            <button class="bouton" (click)="nouvelleRegle()">Nouvelle règle</button>
                        }
                    </div>
                </div>
                @if (brouillon(); as edition) {
                    <form class="carte" (ngSubmit)="enregistrerRegle()">
                        <h2>{{ edition.id ? 'Modifier la règle' : 'Nouvelle règle' }}</h2>
                        <div class="formulaire-ligne">
                            <div>
                                <label class="etiquette">Nom</label
                                ><input class="champ" name="nom" [(ngModel)]="edition.definition.nom" required />
                            </div>
                            <div>
                                <label class="etiquette">Colonne</label>
                                <select class="champ" name="colonne" [(ngModel)]="edition.definition.colonne" required>
                                    @for (colonne of source.headers; track colonne) {
                                        <option [value]="colonne">{{ colonne }}</option>
                                    }
                                </select>
                            </div>
                            <div>
                                <label class="etiquette">Type</label>
                                <select class="champ" name="type" [(ngModel)]="edition.definition.type">
                                    @for (type of typesRegle(); track type[0]) {
                                        <option [value]="type[0]">{{ type[1] }}</option>
                                    }
                                </select>
                            </div>
                            <div style="flex: 0 0 140px">
                                <label class="etiquette">Criticité</label>
                                <select class="champ" name="criticite" [(ngModel)]="edition.definition.criticite">
                                    <option value="bloquante">bloquante</option>
                                    <option value="majeure">majeure</option>
                                    <option value="mineure">mineure</option>
                                </select>
                            </div>
                        </div>
                        <div class="formulaire-ligne" style="margin-top: 8px">
                            @switch (edition.definition.type) {
                                @case ('format') {
                                    <div>
                                        <label class="etiquette">Expression régulière</label
                                        ><input
                                            class="champ"
                                            name="expression"
                                            [(ngModel)]="edition.definition.parametres.expression"
                                            placeholder="^[0-9]{5}$"
                                        />
                                    </div>
                                }
                                @case ('dansListe') {
                                    <div>
                                        <label class="etiquette">Valeurs autorisées (séparées par ;)</label
                                        ><input
                                            class="champ"
                                            name="valeurs"
                                            [ngModel]="edition.valeursTexte"
                                            (ngModelChange)="edition.valeursTexte = $event"
                                            placeholder="Paris;Lyon"
                                        />
                                    </div>
                                }
                                @case ('plage') {
                                    <div>
                                        <label class="etiquette">Minimum</label
                                        ><input
                                            class="champ"
                                            type="number"
                                            name="minimum"
                                            [(ngModel)]="edition.definition.parametres.minimum"
                                        />
                                    </div>
                                    <div>
                                        <label class="etiquette">Maximum</label
                                        ><input
                                            class="champ"
                                            type="number"
                                            name="maximum"
                                            [(ngModel)]="edition.definition.parametres.maximum"
                                        />
                                    </div>
                                }
                                @case ('longueur') {
                                    <div>
                                        <label class="etiquette">Longueur minimale</label
                                        ><input
                                            class="champ"
                                            type="number"
                                            name="minimum"
                                            [(ngModel)]="edition.definition.parametres.minimum"
                                        />
                                    </div>
                                    <div>
                                        <label class="etiquette">Longueur maximale</label
                                        ><input
                                            class="champ"
                                            type="number"
                                            name="maximum"
                                            [(ngModel)]="edition.definition.parametres.maximum"
                                        />
                                    </div>
                                }
                                @case ('reference') {
                                    <div>
                                        <label class="etiquette">Source cible</label>
                                        <select
                                            class="champ"
                                            name="sourceCibleId"
                                            [(ngModel)]="edition.definition.parametres.sourceCibleId"
                                        >
                                            @for (candidate of sources(); track candidate.id) {
                                                <option [value]="candidate.id">{{ candidate.name }}</option>
                                            }
                                        </select>
                                    </div>
                                    <div>
                                        <label class="etiquette">Colonne cible</label>
                                        <select class="champ" name="colonneCible" [(ngModel)]="edition.definition.parametres.colonneCible">
                                            @for (colonne of colonnesDe(edition.definition.parametres.sourceCibleId); track colonne) {
                                                <option [value]="colonne">{{ colonne }}</option>
                                            }
                                        </select>
                                    </div>
                                }
                            }
                        </div>
                        <div class="formulaire-ligne" style="margin-top: 10px">
                            <button class="bouton principal" type="submit" style="flex: 0">Enregistrer</button>
                            <button class="bouton" type="button" style="flex: 0" (click)="brouillon.set(null)">Annuler</button>
                        </div>
                    </form>
                }
                <div class="carte">
                    @if (regles().length === 0) {
                        <div class="vide">
                            Aucune règle pour cette source. Créez-en une : non vide, unique, format, liste, plage, longueur, date,
                            référence.
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
                                            <code>{{ regle.colonne }}</code>
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
                                            } @else {
                                                <span class="discret">jamais exécutée</span>
                                            }
                                        </td>
                                        <td style="white-space: nowrap">
                                            @if (session.peutEditer()) {
                                                <button class="bouton petit" (click)="modifierRegle(regle)">Modifier</button>
                                                <button class="bouton petit danger" (click)="supprimerRegle(regle)">Supprimer</button>
                                            }
                                        </td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    }
                </div>
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
        { cle: 'profil', libelle: 'Profilage' },
        { cle: 'doublons', libelle: 'Doublons' },
        { cle: 'regles', libelle: 'Règles & score' },
        { cle: 'historique', libelle: 'Historique' }
    ];
    readonly sources = signal<Source[]>([]);
    readonly vocabulaire = signal<VocabulaireQualite | null>(null);
    readonly sourceId = signal('');
    readonly ongletActif = signal<Onglet>('profil');
    readonly enCours = signal(false);
    readonly profil = signal<ProfilSource | null>(null);
    readonly cle = signal<string[]>([]);
    readonly doublons = signal<ResultatDoublons | null>(null);
    readonly regles = signal<RegleQualite[]>([]);
    readonly execution = signal<ExecutionRegles | null>(null);
    readonly brouillon = signal<{ id: string | null; definition: DefinitionRegle; valeursTexte: string } | null>(null);
    readonly audits = signal<AuditQualite[]>([]);
    readonly formaterDate = formaterDate;

    readonly source = computed(() => this.sources().find(source => source.id === this.sourceId()) || null);
    readonly typesRegle = computed(() => Object.entries(this.vocabulaire()?.typesRegle || {}) as [TypeRegle, string][]);
    /** Alertes lisibles déduites du profil : complétude faible, formats hétérogènes, espaces parasites, doublons. */
    readonly alertes = computed(() => {
        const profil = this.profil();
        if (!profil) return [];
        const alertes: string[] = [];
        if (profil.doublonsExacts > 0) alertes.push(`${profil.doublonsExacts} ligne(s) strictement identique(s) à une autre.`);
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

    constructor() {
        this.charger();
    }

    private async charger(): Promise<void> {
        try {
            const [sources, vocabulaire] = await Promise.all([this.api.sources(), this.api.vocabulaireQualite()]);
            this.sources.set(sources);
            this.vocabulaire.set(vocabulaire);
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
        if (!sourceId) return;
        await Promise.all([this.rechargerRegles(), this.rechargerAudits()]);
    }

    pourcent(valeur: number): string {
        return (100 * valeur).toFixed(1) + ' %';
    }
    typeDominant(colonne: ProfilColonne): string {
        if (colonne.total === colonne.vides) return 'vide';
        if (colonne.partDate >= 0.9) return 'date';
        if (colonne.partNumerique >= 0.9) return 'nombre';
        return 'texte';
    }
    colonnesDe(sourceId: string | undefined): string[] {
        return this.sources().find(source => source.id === sourceId)?.headers || [];
    }
    libelleType(type: TypeRegle): string {
        return this.vocabulaire()?.typesRegle[type] || type;
    }
    syntheseAudit(audit: AuditQualite): string {
        const resume = audit.resume as Record<string, unknown>;
        if (audit.genre === 'profilage')
            return `complétude moyenne ${this.pourcent(Number(resume['completudeMoyenne']))}, ${resume['doublonsExacts']} doublon(s) exact(s), ${resume['colonnesIncompletes']} colonne(s) incomplète(s)`;
        if (audit.genre === 'doublons')
            return `clé ${(resume['cle'] as string[]).join(' + ')} : ${resume['groupes']} groupe(s), ${resume['lignes']} ligne(s)`;
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

    async profiler(): Promise<void> {
        await this.executer(async () => {
            this.profil.set(await this.api.profilerSource(this.sourceId()));
            await this.rechargerAudits();
        });
    }

    basculerCle(colonne: string): void {
        this.cle.update(cle => (cle.includes(colonne) ? cle.filter(candidat => candidat !== colonne) : [...cle, colonne]));
    }
    async chercherDoublons(): Promise<void> {
        await this.executer(async () => {
            this.doublons.set(await this.api.chercherDoublons(this.sourceId(), this.cle()));
            await this.rechargerAudits();
        });
    }

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
        this.brouillon.set({
            id: null,
            definition: { ...REGLE_VIDE(), sourceId: this.sourceId(), colonne: source?.headers[0] || '' },
            valeursTexte: ''
        });
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
            },
            valeursTexte: (regle.parametres.valeurs || []).join(';')
        });
    }
    async enregistrerRegle(): Promise<void> {
        const brouillon = this.brouillon();
        if (!brouillon) return;
        const definition: DefinitionRegle = { ...brouillon.definition, parametres: { ...brouillon.definition.parametres } };
        if (definition.type === 'dansListe')
            definition.parametres.valeurs = brouillon.valeursTexte
                .split(';')
                .map(valeur => valeur.trim())
                .filter(Boolean);
        for (const champ of ['minimum', 'maximum'] as const) {
            const valeur = definition.parametres[champ] as unknown;
            definition.parametres[champ] = valeur === '' || valeur === null || valeur === undefined ? undefined : Number(valeur);
        }
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
}
