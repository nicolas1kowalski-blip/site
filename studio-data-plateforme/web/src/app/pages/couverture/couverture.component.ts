/**
 * Analyse de couverture (reprise de l'application classique) : une population (table de base, filtrable) ventilée
 * par une dimension (colonne de la base ou d'une table liée), et pour chaque valeur le nombre de lignes AVEC et
 * SANS élément dans une table liée (filtrable). Exemple : clients par ville, avec ou sans commande de plus de 10 €.
 * Le calcul est fait par le serveur ; l'écran choisit les tables (reliées par le modèle de données), affiche un
 * tableau avec barres et exporte en CSV.
 */
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import { FiltreAudit, LigneCouverture, ParametresCouverture, Relation, Source } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { telechargerCsv } from '../../coeur/telechargement';
import { FiltresAuditComponent } from '../qualite/filtres-audit.component';

@Component({
    selector: 'app-couverture',
    imports: [FormsModule, FiltresAuditComponent],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Analyse de couverture</h1>
                <p class="discret">
                    Quelle part d'une population a (ou n'a pas) d'élément lié ? Population × dimension × présence, d'après les liens du
                    modèle de données.
                </p>
            </div>
        </div>
        <form class="carte" (ngSubmit)="analyser()">
            <div class="formulaire-ligne">
                <div>
                    <label class="etiquette">1. Population (table de base)</label>
                    <select class="champ" name="base" [(ngModel)]="base" (ngModelChange)="changerBase()">
                        <option value="">Choisir…</option>
                        @for (source of sources(); track source.id) {
                            <option [value]="source.name">{{ source.name }}</option>
                        }
                    </select>
                </div>
                <div>
                    <label class="etiquette">2. Dimension : table</label>
                    <select
                        class="champ"
                        name="dimensionTable"
                        [(ngModel)]="dimensionTable"
                        (ngModelChange)="dimensionColonne = colonnesDe($event)[0] || ''"
                        [disabled]="!base"
                    >
                        @for (table of tablesDimension(); track table) {
                            <option [value]="table">{{ table }}{{ table === base ? ' (elle-même)' : '' }}</option>
                        }
                    </select>
                </div>
                <div>
                    <label class="etiquette">Dimension : colonne</label>
                    <select class="champ" name="dimensionColonne" [(ngModel)]="dimensionColonne" [disabled]="!dimensionTable">
                        @for (colonne of colonnesDe(dimensionTable); track colonne) {
                            <option [value]="colonne">{{ colonne }}</option>
                        }
                    </select>
                    <label class="case"
                        ><input type="checkbox" name="parAnnee" [(ngModel)]="dimensionParAnnee" /> par année (colonne de dates)</label
                    >
                </div>
                <div>
                    <label class="etiquette">3. Éléments liés (table)</label>
                    <select class="champ" name="liee" [(ngModel)]="liee" [disabled]="!base">
                        <option value="">Choisir…</option>
                        @for (table of tablesLiees(); track table) {
                            <option [value]="table">{{ table }}</option>
                        }
                    </select>
                    @if (base && !tablesLiees().length) {
                        <div class="discret">Aucune table reliée à « {{ base }} » : déclarez un lien dans le Modèle de données.</div>
                    }
                </div>
            </div>
            <div class="formulaire-ligne" style="margin-top: 8px">
                <div>
                    <label class="etiquette">Seconde dimension (facultative) : table</label>
                    <select
                        class="champ"
                        name="dimension2Table"
                        [(ngModel)]="dimension2Table"
                        (ngModelChange)="dimension2Colonne = ''"
                        [disabled]="!base"
                    >
                        <option value="">(aucune)</option>
                        @for (table of tablesDimension(); track table) {
                            <option [value]="table">{{ table }}</option>
                        }
                    </select>
                </div>
                <div>
                    <label class="etiquette">Seconde dimension : colonne</label>
                    <select class="champ" name="dimension2Colonne" [(ngModel)]="dimension2Colonne" [disabled]="!dimension2Table">
                        <option value="">(aucune)</option>
                        @for (colonne of colonnesDe(dimension2Table); track colonne) {
                            <option [value]="colonne">{{ colonne }}</option>
                        }
                    </select>
                </div>
            </div>
            @if (base) {
                <div class="grille" style="margin-top: 10px">
                    <div>
                        <label class="etiquette">Filtres sur la population</label>
                        <app-filtres-audit
                            [colonnes]="colonnesDe(base)"
                            prefixe="population"
                            [(filtres)]="filtresBase"
                            libelleAjout="Filtrer la population"
                        />
                    </div>
                    <div>
                        <label class="etiquette">Filtres sur les éléments liés</label>
                        <app-filtres-audit
                            [colonnes]="colonnesDe(liee)"
                            prefixe="lies"
                            [(filtres)]="filtresLiee"
                            libelleAjout="Filtrer les éléments liés"
                        />
                    </div>
                </div>
            }
            <div class="formulaire-ligne" style="margin-top: 10px">
                <button
                    class="bouton principal"
                    type="submit"
                    style="flex: 0"
                    [disabled]="enCours() || !base || !dimensionTable || !dimensionColonne || !liee"
                >
                    {{ enCours() ? 'Analyse…' : 'Analyser la couverture' }}
                </button>
                @if (lignes().length) {
                    <button class="bouton" type="button" style="flex: 0" (click)="exporter()">Exporter en CSV</button>
                }
            </div>
        </form>

        @if (lignes().length) {
            <div class="carte">
                <div class="kpis">
                    <div class="kpi">
                        <b>{{ totaux().total }}</b
                        ><span>lignes dans la population</span>
                    </div>
                    <div class="kpi">
                        <b>{{ totaux().avec }}</b
                        ><span>avec élément lié ({{ pourcent(totaux().avec, totaux().total) }})</span>
                    </div>
                    <div class="kpi">
                        <b>{{ totaux().sans }}</b
                        ><span>sans élément lié ({{ pourcent(totaux().sans, totaux().total) }})</span>
                    </div>
                </div>
                <table class="tableau" style="margin-top: 10px">
                    <thead>
                        <tr>
                            <th>{{ dimensionColonne }}</th>
                            @if (dimension2Colonne) {
                                <th>{{ dimension2Colonne }}</th>
                            }
                            <th>Avec</th>
                            <th>Sans</th>
                            <th>Total</th>
                            <th style="width: 40%">Couverture</th>
                        </tr>
                    </thead>
                    <tbody>
                        @for (ligne of lignes(); track ligne.dimension + '|' + ligne.dimension2) {
                            <tr>
                                <td>
                                    <b>{{ ligne.dimension }}</b>
                                </td>
                                @if (dimension2Colonne) {
                                    <td>{{ ligne.dimension2 }}</td>
                                }
                                <td>{{ ligne.avec }}</td>
                                <td>{{ ligne.sans }}</td>
                                <td>{{ ligne.total }}</td>
                                <td>
                                    <div class="barre" [title]="pourcent(ligne.avec, ligne.total) + ' avec'">
                                        <div class="avec" [style.width.%]="(100 * ligne.avec) / (ligne.total || 1)"></div>
                                        <div class="sans" [style.width.%]="(100 * ligne.sans) / (ligne.total || 1)"></div>
                                    </div>
                                    <span class="discret">{{ pourcent(ligne.avec, ligne.total) }}</span>
                                </td>
                            </tr>
                        }
                    </tbody>
                </table>
            </div>
        }
    `,
    styles: `
        .case {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-top: 4px;
            cursor: pointer;
        }
        .barre {
            display: inline-flex;
            width: 70%;
            height: 12px;
            border-radius: 6px;
            overflow: hidden;
            background: var(--bordure);
            vertical-align: middle;
            margin-right: 6px;
        }
        .barre .avec {
            background: var(--succes);
        }
        .barre .sans {
            background: var(--alerte);
        }
    `
})
export class CouvertureComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);

    readonly sources = signal<Source[]>([]);
    readonly relations = signal<Relation[]>([]);
    readonly lignes = signal<LigneCouverture[]>([]);
    readonly enCours = signal(false);
    base = '';
    dimensionTable = '';
    dimensionColonne = '';
    dimensionParAnnee = false;
    liee = '';
    dimension2Table = '';
    dimension2Colonne = '';
    filtresBase: FiltreAudit[] = [];
    filtresLiee: FiltreAudit[] = [];

    constructor() {
        this.charger();
    }
    private async charger(): Promise<void> {
        try {
            const [sources, relations] = await Promise.all([this.api.sources(), this.api.relations()]);
            this.sources.set(sources);
            this.relations.set(relations);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    colonnesDe(nomTable: string): string[] {
        return this.sources().find(source => source.name === nomTable)?.headers || [];
    }
    /** Tables reliées à la base par le modèle de données (et chargées). */
    tablesLiees(): string[] {
        const noms = new Set(this.sources().map(source => source.name));
        const liees = this.relations()
            .filter(relation => relation.sourceTable === this.base || relation.targetTable === this.base)
            .map(relation => (relation.sourceTable === this.base ? relation.targetTable : relation.sourceTable))
            .filter(nom => noms.has(nom));
        return [...new Set(liees)];
    }
    tablesDimension(): string[] {
        return this.base ? [this.base, ...this.tablesLiees()] : [];
    }
    changerBase(): void {
        this.dimensionTable = this.base;
        this.dimensionColonne = this.colonnesDe(this.base)[0] || '';
        this.liee = this.tablesLiees()[0] || '';
        this.dimension2Table = '';
        this.dimension2Colonne = '';
        this.filtresBase = [];
        this.filtresLiee = [];
        this.lignes.set([]);
    }
    pourcent(partie: number, total: number): string {
        return total ? ((100 * partie) / total).toFixed(1) + ' %' : '—';
    }
    totaux(): { avec: number; sans: number; total: number } {
        return this.lignes().reduce(
            (somme, ligne) => ({ avec: somme.avec + ligne.avec, sans: somme.sans + ligne.sans, total: somme.total + ligne.total }),
            { avec: 0, sans: 0, total: 0 }
        );
    }

    async analyser(): Promise<void> {
        const parametres: ParametresCouverture = {
            base: this.base,
            dimensionTable: this.dimensionTable,
            dimensionColonne: this.dimensionColonne,
            dimensionParAnnee: this.dimensionParAnnee,
            liee: this.liee,
            filtresBase: this.filtresBase,
            filtresLiee: this.filtresLiee,
            dimension2Table: this.dimension2Table,
            dimension2Colonne: this.dimension2Table ? this.dimension2Colonne : ''
        };
        this.enCours.set(true);
        try {
            this.lignes.set(await this.api.couverture(parametres));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }
    exporter(): void {
        const colonnes = [
            this.dimensionColonne,
            ...(this.dimension2Colonne ? [this.dimension2Colonne] : []),
            'avec',
            'sans',
            'total',
            'couverture'
        ];
        const lignes = this.lignes().map(ligne => [
            ligne.dimension,
            ...(this.dimension2Colonne ? [ligne.dimension2] : []),
            ligne.avec,
            ligne.sans,
            ligne.total,
            this.pourcent(ligne.avec, ligne.total)
        ]);
        telechargerCsv(`couverture ${this.base} - ${this.liee}.csv`, colonnes, lignes);
    }
}
