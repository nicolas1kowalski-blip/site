/**
 * Statistiques : un graphique en trois choix — la table, l'axe (dimension) et l'agrégat (nombre de lignes, somme,
 * moyenne… d'une mesure) — calculé par le serveur, dessiné en barres, courbe ou camembert, avec le tableau des valeurs.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PleinEcranComponent } from '../../composants/plein-ecran.component';
import { ClientApiService } from '../../coeur/client-api.service';
import { AgregatStatistique, ParametresStatistiques, ResultatStatistiques, Source, VocabulaireExploitation } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { GenreGraphique, GraphiqueSvgComponent } from '../../composants/graphique-svg.component';

@Component({
    selector: 'app-statistiques',
    imports: [FormsModule, PleinEcranComponent, GraphiqueSvgComponent],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Statistiques</h1>
                <p class="discret">Une table, un axe, une mesure : le graphique est calculé par le serveur sur toutes les lignes.</p>
            </div>
        </div>
        <div class="carte">
            <div class="formulaire-ligne">
                <div>
                    <label class="etiquette">Table</label>
                    <select
                        class="champ"
                        name="table"
                        [(ngModel)]="parametres.table"
                        (ngModelChange)="parametres.dimension = ''; parametres.mesure = ''"
                    >
                        <option value="">— table —</option>
                        @for (source of sources(); track source.id) {
                            <option [value]="source.name">{{ source.name }}</option>
                        }
                    </select>
                </div>
                <div>
                    <label class="etiquette">Axe (dimension)</label>
                    <select class="champ" name="dimension" [(ngModel)]="parametres.dimension">
                        <option value="">— colonne —</option>
                        @for (colonne of colonnes(); track colonne) {
                            <option [value]="colonne">{{ colonne }}</option>
                        }
                    </select>
                </div>
                <div>
                    <label class="etiquette">Agrégat</label>
                    <select class="champ" name="agregat" [(ngModel)]="parametres.agregat">
                        @for (agregat of agregats(); track agregat[0]) {
                            <option [value]="agregat[0]">{{ agregat[1] }}</option>
                        }
                    </select>
                </div>
                <div>
                    <label class="etiquette">Mesure</label>
                    <select class="champ" name="mesure" [(ngModel)]="parametres.mesure" [disabled]="parametres.agregat === 'count'">
                        <option value="">— colonne —</option>
                        @for (colonne of colonnes(); track colonne) {
                            <option [value]="colonne">{{ colonne }}</option>
                        }
                    </select>
                </div>
                <div>
                    <label class="etiquette">Graphique</label>
                    <select class="champ" name="genre" [(ngModel)]="genre">
                        <option value="bar">Barres</option>
                        <option value="line">Courbe</option>
                        <option value="pie">Camembert</option>
                    </select>
                </div>
                <div>
                    <label class="etiquette">Valeurs affichées</label>
                    <input
                        class="champ"
                        type="number"
                        min="1"
                        max="200"
                        name="limite"
                        [(ngModel)]="parametres.limite"
                        style="width: 90px"
                    />
                </div>
                <div style="align-self: flex-end">
                    <button
                        class="bouton principal"
                        (click)="generer()"
                        [disabled]="
                            enCours() ||
                            !parametres.table ||
                            !parametres.dimension ||
                            (parametres.agregat !== 'count' && !parametres.mesure)
                        "
                    >
                        {{ enCours() ? 'Calcul…' : 'Générer le graphique' }}
                    </button>
                </div>
            </div>
        </div>
        @if (resultat(); as resultat) {
            <div class="carte">
                <app-plein-ecran />
                <h2>{{ titre() }}</h2>
                @if (resultat.points.length === 0) {
                    <p class="discret">Aucune valeur.</p>
                } @else {
                    <app-graphique-svg [points]="resultat.points" [genre]="genre" [outils]="true" [nomImage]="titre()" />
                    <div class="defilement-x" style="margin-top: 10px">
                        <table class="tableau">
                            <thead>
                                <tr>
                                    <th>{{ parametres.dimension }}</th>
                                    <th style="text-align: right">{{ libelleAgregat() }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                @for (point of resultat.points; track point.d) {
                                    <tr>
                                        <td>{{ point.d }}</td>
                                        <td style="text-align: right">{{ formater(point.v) }}</td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    </div>
                    <details style="margin-top: 8px">
                        <summary class="discret">SQL exécuté</summary>
                        <pre class="sql">{{ resultat.sql }}</pre>
                    </details>
                }
            </div>
        }
    `,
    styles: `
        .sql {
            font-size: 12px;
            white-space: pre-wrap;
            background: var(--surface-2);
            padding: 8px;
            border-radius: 6px;
        }
    `
})
export class StatistiquesComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    readonly sources = signal<Source[]>([]);
    readonly vocabulaire = signal<VocabulaireExploitation | null>(null);
    readonly resultat = signal<ResultatStatistiques | null>(null);
    readonly enCours = signal(false);
    readonly titre = signal('');
    parametres: ParametresStatistiques = { table: '', dimension: '', agregat: 'count', mesure: '', limite: 15 };
    genre: GenreGraphique = 'bar';

    /** Colonnes de la table choisie (méthode : la table est un champ de formulaire, pas un signal). */
    colonnes(): string[] {
        return this.sources().find(source => source.name === this.parametres.table)?.headers || [];
    }
    readonly agregats = computed(() => Object.entries(this.vocabulaire()?.agregatsStatistiques || {}) as [AgregatStatistique, string][]);

    constructor() {
        void this.charger();
    }

    private async charger(): Promise<void> {
        try {
            const [sources, vocabulaire] = await Promise.all([this.api.sourcesEtJeux(), this.api.vocabulaireExploitation()]);
            this.sources.set(sources);
            this.vocabulaire.set(vocabulaire);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    libelleAgregat(): string {
        const libelle = this.vocabulaire()?.agregatsStatistiques[this.parametres.agregat] || this.parametres.agregat;
        return this.parametres.agregat === 'count' ? libelle : `${libelle} de ${this.parametres.mesure}`;
    }

    formater(valeur: number): string {
        return Number.isInteger(valeur) ? valeur.toLocaleString('fr-FR') : valeur.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    }

    async generer(): Promise<void> {
        this.enCours.set(true);
        try {
            const parametres = { ...this.parametres, limite: Number(this.parametres.limite) || 15 };
            this.resultat.set(await this.api.statistiques(parametres));
            this.titre.set(`${this.libelleAgregat()} par ${parametres.dimension} — ${parametres.table}`);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }
}
