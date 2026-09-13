/**
 * Détail d'une colonne (l'« Analyse Colonnes » de l'application classique) : type sémantique, tuiles de synthèse
 * (renseignées, distinctes, longueur moyenne…), statistiques descriptives (nombres : minimum, quartiles, moyenne,
 * écart-type, somme ; dates : première, dernière, futures, avant 1900), valeurs les plus fréquentes et formats
 * détectés sous forme de barres, hygiène (espaces multiples, bouche-trous, casses, aberrantes) et signaux
 * (clé candidate, colonne constante, faible cardinalité, distribution asymétrique). Le serveur calcule tout ;
 * ce composant charge le détail à l'ouverture et l'affiche.
 */
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { ClientApiService } from '../../coeur/client-api.service';
import { DetailColonne, FiltreAudit } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { telechargerJson } from '../../coeur/telechargement';

@Component({
    selector: 'app-detail-colonne',
    template: `
        <div class="carte">
            <div class="entete-page" style="margin: 0 0 10px">
                <h2 style="margin: 0">
                    Analyse de la colonne <code>{{ colonne() }}</code>
                </h2>
                @if (detail(); as detail) {
                    <span class="badge">{{ detail.typeSemantique }}</span>
                    @for (signal of signaux(); track signal) {
                        <span class="badge alerte">{{ signal }}</span>
                    }
                }
                <span class="espace"></span>
                @if (detail()) {
                    <button class="bouton petit" type="button" (click)="exporter()">Exporter (JSON)</button>
                }
                <button class="bouton petit" type="button" (click)="fermer.emit()">Fermer</button>
            </div>
            @if (enCours()) {
                <span class="discret">Analyse…</span>
            } @else if (detail(); as detail) {
                <div class="kpis">
                    <div class="kpi">
                        <b>{{ detail.profil.total - detail.profil.vides }}</b>
                        <span>renseignées sur {{ detail.profil.total }} ({{ pourcent(detail.profil.completude) }})</span>
                    </div>
                    <div class="kpi">
                        <b>{{ detail.profil.distinctes }}</b>
                        <span>valeurs distinctes</span>
                    </div>
                    <div class="kpi">
                        <b>{{ detail.longueurMoyenne === null ? '—' : arrondir(detail.longueurMoyenne) }}</b>
                        <span>longueur moyenne ({{ detail.profil.longueurMin ?? '—' }} – {{ detail.profil.longueurMax ?? '—' }})</span>
                    </div>
                    <div class="kpi">
                        <b>{{ detail.motifsDistincts }}</b>
                        <span>format(s) détecté(s)</span>
                    </div>
                </div>

                @if (detail.nombres; as nombres) {
                    <h3>Distribution</h3>
                    <div class="kpis">
                        <div class="kpi">
                            <b>{{ arrondir(nombres.minimum) }}</b
                            ><span>minimum</span>
                        </div>
                        <div class="kpi">
                            <b>{{ arrondir(nombres.q1) }}</b
                            ><span>1er quartile</span>
                        </div>
                        <div class="kpi">
                            <b>{{ arrondir(nombres.mediane) }}</b
                            ><span>médiane</span>
                        </div>
                        <div class="kpi">
                            <b>{{ arrondir(nombres.q3) }}</b
                            ><span>3e quartile</span>
                        </div>
                        <div class="kpi">
                            <b>{{ arrondir(nombres.maximum) }}</b
                            ><span>maximum</span>
                        </div>
                        <div class="kpi">
                            <b>{{ arrondir(nombres.moyenne) }}</b
                            ><span>moyenne</span>
                        </div>
                        <div class="kpi">
                            <b>{{ arrondir(nombres.ecartType) }}</b
                            ><span>écart-type</span>
                        </div>
                        <div class="kpi">
                            <b>{{ arrondir(nombres.somme) }}</b
                            ><span>somme</span>
                        </div>
                    </div>
                    <p class="discret">
                        90 % des valeurs sont comprises entre {{ arrondir(nombres.p05) }} et {{ arrondir(nombres.p95) }} (5e et 95e
                        centiles).
                    </p>
                }
                @if (detail.dates; as dates) {
                    <h3>Dates</h3>
                    <div class="kpis">
                        <div class="kpi">
                            <b>{{ dates.premiere || '—' }}</b
                            ><span>première date</span>
                        </div>
                        <div class="kpi">
                            <b>{{ dates.derniere || '—' }}</b
                            ><span>dernière date</span>
                        </div>
                        <div class="kpi">
                            <b>{{ dates.futures }}</b
                            ><span>dans le futur</span>
                        </div>
                        <div class="kpi">
                            <b>{{ dates.avant1900 }}</b
                            ><span>avant 1900</span>
                        </div>
                    </div>
                }

                <div class="grille" style="margin-top: 12px">
                    <div>
                        <h3>Valeurs les plus fréquentes</h3>
                        @for (valeur of detail.valeursFrequentes; track $index) {
                            <div class="ligne-barre" [title]="valeur.nombre + ' occurrence(s)'">
                                <span class="libelle">{{ valeur.valeur }}</span>
                                <div class="barre-progression"><div [style.width.%]="100 * valeur.part"></div></div>
                                <span class="discret">{{ valeur.nombre }} · {{ pourcent(valeur.part) }}</span>
                            </div>
                        } @empty {
                            <div class="discret">Aucune valeur renseignée.</div>
                        }
                    </div>
                    <div>
                        <h3>Formats (A = lettre, 9 = chiffre)</h3>
                        @for (motif of detail.motifs; track $index) {
                            <div class="ligne-barre" [title]="motif.nombre + ' valeur(s)'">
                                <code class="libelle">{{ motif.motif }}</code>
                                <div class="barre-progression"><div [style.width.%]="100 * motif.part"></div></div>
                                <span class="discret">{{ motif.nombre }} · {{ pourcent(motif.part) }}</span>
                            </div>
                        } @empty {
                            <div class="discret">Aucun format.</div>
                        }
                    </div>
                </div>

                <h3>Hygiène</h3>
                <div class="kpis">
                    <div class="kpi" [class.attention]="detail.profil.espacesParasites > 0">
                        <b>{{ detail.profil.espacesParasites }}</b
                        ><span>espaces autour</span>
                    </div>
                    <div class="kpi" [class.attention]="(detail.profil.espacesMultiples || 0) > 0">
                        <b>{{ detail.profil.espacesMultiples || 0 }}</b
                        ><span>espaces multiples</span>
                    </div>
                    <div class="kpi" [class.attention]="(detail.profil.boucheTrous || 0) > 0">
                        <b>{{ detail.profil.boucheTrous || 0 }}</b
                        ><span>bouche-trous (N/A, ?, -…)</span>
                    </div>
                    <div class="kpi" [class.attention]="(detail.profil.cassesIncoherentes || 0) > 0">
                        <b>{{ detail.profil.cassesIncoherentes || 0 }}</b
                        ><span>casses incohérentes</span>
                    </div>
                    <div class="kpi" [class.attention]="(detail.profil.aberrantes || 0) > 0">
                        <b>{{ detail.profil.aberrantes || 0 }}</b
                        ><span>valeurs aberrantes</span>
                    </div>
                </div>
            }
        </div>
    `,
    styles: `
        h3 {
            font-size: 13px;
            margin: 14px 0 6px;
            color: var(--texte-2);
        }
        .ligne-barre {
            display: grid;
            grid-template-columns: minmax(80px, 1fr) 2fr auto;
            gap: 8px;
            align-items: center;
            font-size: 12px;
            margin-bottom: 4px;
        }
        .libelle {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .kpi.attention {
            border-color: var(--alerte);
        }
    `
})
export class DetailColonneComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);

    readonly sourceId = input.required<string>();
    readonly sourceNom = input('');
    readonly colonne = input.required<string>();
    readonly filtres = input<FiltreAudit[]>([]);
    readonly echantillon = input<number | undefined>(undefined);
    readonly fermer = output<void>();

    readonly detail = signal<DetailColonne | null>(null);
    readonly enCours = signal(false);
    /** Les signaux vrais, en clair. */
    readonly signaux = computed(() => {
        const signaux = this.detail()?.signaux;
        if (!signaux) return [];
        const libelles: string[] = [];
        if (signaux.cleCandidate) libelles.push('clé candidate');
        if (signaux.constante) libelles.push('colonne constante');
        if (signaux.faibleCardinalite) libelles.push('faible cardinalité');
        if (signaux.asymetrique) libelles.push('distribution asymétrique');
        return libelles;
    });

    constructor() {
        // À chaque changement de colonne (ou de périmètre), on recharge le détail.
        effect(() => {
            const sourceId = this.sourceId();
            const colonne = this.colonne();
            const filtres = this.filtres();
            const echantillon = this.echantillon();
            void this.charger(sourceId, colonne, filtres, echantillon);
        });
    }

    private async charger(sourceId: string, colonne: string, filtres: FiltreAudit[], echantillon: number | undefined): Promise<void> {
        this.enCours.set(true);
        try {
            this.detail.set(await this.api.detailColonne(sourceId, colonne, filtres, echantillon));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    pourcent(valeur: number): string {
        return (100 * valeur).toFixed(1) + ' %';
    }
    arrondir(valeur: number): string {
        return Number(valeur).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    }
    exporter(): void {
        const detail = this.detail();
        if (detail) telechargerJson(`analyse ${this.sourceNom() || this.sourceId()} - ${detail.colonne}.json`, detail);
    }
}
