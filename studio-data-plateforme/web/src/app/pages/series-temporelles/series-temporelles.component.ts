/**
 * Séries temporelles : on déclare la maille (clé de série, horodatage, mesure, pas) et le serveur profile chaque
 * série — pas dominant, régularité, trous, doublons d'horodatage, plateaux (valeur figée), couverture, retard —
 * puis dresse le calendrier de couverture (points par période).
 */
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import { AnalyseSerie, ConfigurationSerie, Source, VocabulaireExploitation, genererIdentifiant } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

/** Durée lisible à partir de secondes. */
export function dureeLisible(secondes: unknown): string {
    const valeur = Number(secondes);
    if (!Number.isFinite(valeur) || valeur <= 0) return '—';
    if (valeur < 60) return valeur + ' s';
    if (valeur < 3600) return Math.round(valeur / 60) + ' min';
    if (valeur < 86400) return (valeur / 3600).toFixed(valeur % 3600 ? 1 : 0) + ' h';
    return (valeur / 86400).toFixed(valeur % 86400 ? 1 : 0) + ' j';
}

@Component({
    selector: 'app-series-temporelles',
    imports: [FormsModule],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Séries temporelles</h1>
                <p class="discret">
                    Une ligne est une observation, l'entité est la série : trous, doublons, plateaux et retards deviennent visibles.
                </p>
            </div>
            @if (session.peutEditer()) {
                <button class="bouton principal" (click)="ajouter()">Nouvelle série</button>
            }
        </div>
        @for (serie of series(); track serie.id; let index = $index) {
            <div class="carte">
                <div class="formulaire-ligne">
                    <div>
                        <label class="etiquette">Nom</label
                        ><input
                            class="champ"
                            [(ngModel)]="serie.name"
                            [name]="'serie-nom-' + index"
                            [attr.name]="'serie-nom-' + index"
                            [disabled]="!session.peutEditer()"
                        />
                    </div>
                    <div>
                        <label class="etiquette">Source</label>
                        <select
                            class="champ"
                            [(ngModel)]="serie.table"
                            (ngModelChange)="serie.keyCols = []; serie.tsCol = ''; serie.valCol = ''"
                            [name]="'serie-table-' + index"
                            [attr.name]="'serie-table-' + index"
                            [disabled]="!session.peutEditer()"
                        >
                            <option value="">— source —</option>
                            @for (source of sources(); track source.id) {
                                <option [value]="source.name">{{ source.name }}</option>
                            }
                        </select>
                    </div>
                    <div>
                        <label class="etiquette">Horodatage</label>
                        <select
                            class="champ"
                            [(ngModel)]="serie.tsCol"
                            [name]="'serie-horodatage-' + index"
                            [attr.name]="'serie-horodatage-' + index"
                            [disabled]="!session.peutEditer()"
                        >
                            <option value="">— colonne —</option>
                            @for (colonne of colonnesDe(serie.table); track colonne) {
                                <option [value]="colonne">{{ colonne }}</option>
                            }
                        </select>
                    </div>
                    <div>
                        <label class="etiquette">Mesure (facultatif)</label>
                        <select
                            class="champ"
                            [(ngModel)]="serie.valCol"
                            [name]="'serie-mesure-' + index"
                            [attr.name]="'serie-mesure-' + index"
                            [disabled]="!session.peutEditer()"
                        >
                            <option value="">—</option>
                            @for (colonne of colonnesDe(serie.table); track colonne) {
                                <option [value]="colonne">{{ colonne }}</option>
                            }
                        </select>
                    </div>
                    <div>
                        <label class="etiquette">Pas</label>
                        <select class="champ" [(ngModel)]="serie.step" [name]="'serie-pas-' + index" [disabled]="!session.peutEditer()">
                            @for (pas of pasPossibles(); track pas.cle) {
                                <option [value]="pas.cle">{{ pas.libelle }}</option>
                            }
                        </select>
                    </div>
                </div>
                <label class="etiquette" style="margin-top: 8px">Clé de série (une ou plusieurs colonnes)</label>
                <div class="cases">
                    @for (colonne of colonnesDe(serie.table); track colonne) {
                        <label class="case"
                            ><input
                                type="checkbox"
                                [checked]="serie.keyCols.includes(colonne)"
                                (change)="basculerCle(serie, colonne)"
                                [attr.name]="'serie-cle-' + index + '-' + colonne"
                                [disabled]="!session.peutEditer()"
                            />
                            {{ colonne }}</label
                        >
                    } @empty {
                        <span class="discret">Choisissez une source.</span>
                    }
                </div>
                <div class="entete-page" style="margin: 10px 0 0">
                    @if (session.peutEditer()) {
                        <button class="bouton principal petit" (click)="enregistrer(serie)">Enregistrer</button>
                        <button class="bouton petit danger" (click)="supprimer(serie)">Supprimer</button>
                    }
                    <button class="bouton petit" (click)="analyser(serie)" [disabled]="enCours()">Analyser</button>
                </div>
                @if (analyses[serie.id]; as analyse) {
                    <h3>Profil par série</h3>
                    <div class="defilement-x">
                        <table class="tableau">
                            <thead>
                                <tr>
                                    <th>Série</th>
                                    <th>Points</th>
                                    <th>Doublons</th>
                                    <th>Pas</th>
                                    <th>Régularité</th>
                                    <th>Trous</th>
                                    <th>Plus long trou</th>
                                    <th>Couverture</th>
                                    <th>Plateau max</th>
                                    <th>Retard</th>
                                    <th>Min / max / moy</th>
                                </tr>
                            </thead>
                            <tbody>
                                @for (ligne of analyse.profil; track ligne.serie) {
                                    <tr>
                                        <td>
                                            <strong>{{ ligne.serie }}</strong>
                                        </td>
                                        <td>{{ ligne.points }}</td>
                                        <td [class.probleme]="ligne.doublons > 0">{{ ligne.doublons }}</td>
                                        <td>{{ dureeLisible(ligne['pas_sec']) }}{{ ligne.cadencee ? '' : ' (événementielle)' }}</td>
                                        <td>{{ ligne.regularite }} %</td>
                                        <td [class.probleme]="ligne.trous > 0">{{ ligne.trous }}</td>
                                        <td>{{ dureeLisible(ligne['plus_long_trou_sec']) }}</td>
                                        <td>{{ ligne.couverture == null ? '—' : ligne.couverture + ' %' }}</td>
                                        <td [class.probleme]="ligne.plateau_max >= 3">{{ ligne.plateau_max }}</td>
                                        <td>{{ dureeLisible(ligne.retard_sec) }}</td>
                                        <td class="discret">
                                            {{ ligne['vmin'] ?? '—' }} / {{ ligne['vmax'] ?? '—' }} / {{ ligne['vmoy'] ?? '—' }}
                                        </td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    </div>
                    <h3>
                        Calendrier de couverture <span class="discret">(points par {{ libelleMaille(analyse.maille) }})</span>
                    </h3>
                    <div class="defilement-x">
                        <table class="calendrier">
                            <thead>
                                <tr>
                                    <th></th>
                                    @for (periode of periodesDe(analyse); track periode) {
                                        <th [title]="periode">{{ periode.slice(5, 16) }}</th>
                                    }
                                </tr>
                            </thead>
                            <tbody>
                                @for (nomSerie of seriesDe(analyse); track nomSerie) {
                                    <tr>
                                        <th>{{ nomSerie }}</th>
                                        @for (periode of periodesDe(analyse); track periode) {
                                            <td
                                                [style.background]="couleurCase(compteDe(analyse, nomSerie, periode))"
                                                [title]="compteDe(analyse, nomSerie, periode) + ' point(s)'"
                                            >
                                                {{ compteDe(analyse, nomSerie, periode) || '' }}
                                            </td>
                                        }
                                    </tr>
                                }
                            </tbody>
                        </table>
                    </div>
                }
            </div>
        } @empty {
            <div class="carte discret" style="text-align: center; padding: 40px">
                Aucune série déclarée. Déclarez la clé de série, l'horodatage et la mesure d'une source.
            </div>
        }
    `,
    styles: `
        .carte + .carte {
            margin-top: 14px;
        }
        h3 {
            margin: 14px 0 6px;
            font-size: 14px;
        }
        .cases {
            display: flex;
            flex-wrap: wrap;
            gap: 6px 14px;
        }
        .case {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
        }
        .probleme {
            color: var(--erreur);
            font-weight: 700;
        }
        .calendrier {
            border-collapse: collapse;
            font-size: 10px;
        }
        .calendrier th {
            padding: 2px 4px;
            color: var(--texte-2);
            font-weight: 600;
            white-space: nowrap;
            text-align: left;
        }
        .calendrier td {
            width: 22px;
            height: 18px;
            text-align: center;
            border: 1px solid var(--surface);
            border-radius: 3px;
        }
    `
})
export class SeriesTemporellesComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    readonly session = inject(SessionService);
    readonly dureeLisible = dureeLisible;
    readonly series = signal<ConfigurationSerie[]>([]);
    readonly sources = signal<Source[]>([]);
    readonly vocabulaire = signal<VocabulaireExploitation | null>(null);
    readonly enCours = signal(false);
    analyses: Record<string, AnalyseSerie> = {};
    readonly pasPossibles = computed(() => Object.entries(this.vocabulaire()?.pas || {}).map(([cle, libelle]) => ({ cle, libelle })));

    constructor() {
        void this.recharger();
    }

    async recharger(): Promise<void> {
        try {
            const [series, sources, vocabulaire] = await Promise.all([
                this.api.series(),
                this.api.sources(),
                this.vocabulaire() ?? this.api.vocabulaireExploitation()
            ]);
            this.series.set(
                series.map(serie => ({
                    ...serie,
                    keyCols: serie.keyCols || [],
                    step: serie.step || 'auto',
                    tol: serie.tol ?? 0.5,
                    regMin: serie.regMin ?? 0.7
                }))
            );
            this.sources.set(sources);
            this.vocabulaire.set(vocabulaire);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    ajouter(): void {
        this.series.update(liste => [
            ...liste,
            {
                id: genererIdentifiant('tsr'),
                name: 'Nouvelle série',
                table: '',
                keyCols: [],
                tsCol: '',
                valCol: '',
                step: 'auto',
                tol: 0.5,
                regMin: 0.7
            }
        ]);
    }

    colonnesDe(nomSource: string): string[] {
        return this.sources().find(source => source.name === nomSource)?.headers || [];
    }

    basculerCle(serie: ConfigurationSerie, colonne: string): void {
        const position = serie.keyCols.indexOf(colonne);
        if (position >= 0) serie.keyCols.splice(position, 1);
        else serie.keyCols.push(colonne);
    }

    libelleMaille(maille: string): string {
        return this.vocabulaire()?.mailles[maille] || maille;
    }

    periodesDe(analyse: AnalyseSerie): string[] {
        return [...new Set(analyse.calendrier.map(ligne => ligne.periode))].sort();
    }

    seriesDe(analyse: AnalyseSerie): string[] {
        return [...new Set(analyse.calendrier.map(ligne => ligne.serie))].sort();
    }

    compteDe(analyse: AnalyseSerie, serie: string, periode: string): number {
        return analyse.calendrier.find(ligne => ligne.serie === serie && ligne.periode === periode)?.n || 0;
    }

    couleurCase(compte: number): string {
        if (!compte) return 'color-mix(in srgb, var(--erreur) 12%, transparent)';
        return `color-mix(in srgb, var(--succes) ${Math.min(80, 25 + compte * 10)}%, transparent)`;
    }

    async enregistrer(serie: ConfigurationSerie): Promise<void> {
        try {
            const { id, ...corps } = serie;
            await this.api.enregistrerSerie(id, corps);
            this.notifications.succes(`Série « ${serie.name} » enregistrée.`);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async analyser(serie: ConfigurationSerie): Promise<void> {
        this.enCours.set(true);
        try {
            if (this.session.peutEditer()) await this.enregistrer(serie);
            this.analyses[serie.id] = await this.api.analyserSerie(serie.id);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    async supprimer(serie: ConfigurationSerie): Promise<void> {
        if (!confirm(`Supprimer la série « ${serie.name} » ?`)) return;
        try {
            await this.api.supprimerSerie(serie.id);
        } catch {
            // Série jamais enregistrée : rien côté serveur.
        }
        this.series.update(liste => liste.filter(candidat => candidat.id !== serie.id));
    }
}
