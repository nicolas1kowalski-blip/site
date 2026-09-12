/**
 * Explorateur SQL : une requête libre exécutée par DuckDB sur le serveur, résultats affichés avec un
 * défilement virtuel (seules les lignes visibles sont rendues : des dizaines de milliers de lignes restent
 * fluides), export CSV du résultat. Les tables des sources sont listées pour composer la requête.
 */
import { ScrollingModule } from '@angular/cdk/scrolling';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import { ResultatSql, Source } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

@Component({
    selector: 'app-explorateur',
    imports: [FormsModule, ScrollingModule],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Explorateur SQL</h1>
                <p class="discret">
                    Exécuté par DuckDB sur le serveur · {{ session.peutEditer() ? 'lecture et écriture' : 'lecture seule' }}
                </p>
            </div>
        </div>
        <div class="disposition">
            <aside class="carte tables">
                <h3>Tables disponibles</h3>
                @if (sources().length === 0) {
                    <p class="discret">Aucune source.</p>
                }
                @for (source of sources(); track source.id) {
                    <button class="table" (click)="inserer(source)" [title]="source.headers.join(', ')">
                        <b>{{ source.name }}</b
                        ><span class="discret">t_{{ source.id }} · {{ source.headers.length }} col.</span>
                    </button>
                }
            </aside>
            <section>
                <div class="carte">
                    <textarea
                        class="champ"
                        [(ngModel)]="requete"
                        rows="6"
                        spellcheck="false"
                        placeholder='SELECT * FROM "t_…" LIMIT 100'
                        (keydown.control.enter)="executer()"
                    ></textarea>
                    <div class="entete-page" style="margin: 10px 0 0">
                        <button class="bouton principal" (click)="executer()" [disabled]="enCours()">
                            {{ enCours() ? 'Exécution…' : 'Exécuter (Ctrl + Entrée)' }}
                        </button>
                        @if (resultat(); as resultat) {
                            <span class="discret"
                                >{{ resultat.lignes.length }} ligne(s) · {{ resultat.colonnes.length }} colonne(s) · {{ duree() }} ms</span
                            >
                            <span class="espace"></span>
                            <button class="bouton petit" (click)="exporterCsv()">Exporter en CSV</button>
                        }
                    </div>
                </div>
                @if (resultat(); as resultat) {
                    <div class="carte resultat">
                        <div class="ligne entete-colonnes">
                            @for (colonne of resultat.colonnes; track colonne.nom) {
                                <div class="cellule" [title]="colonne.type">
                                    <b>{{ colonne.nom }}</b
                                    ><span class="discret">{{ colonne.type }}</span>
                                </div>
                            }
                        </div>
                        <cdk-virtual-scroll-viewport itemSize="30" class="corps">
                            <div
                                class="ligne"
                                *cdkVirtualFor="let ligne of resultat.lignes; let index = index"
                                [class.paire]="index % 2 === 0"
                            >
                                @for (valeur of ligne; track $index) {
                                    <div class="cellule">{{ valeur === null ? '∅' : valeur }}</div>
                                }
                            </div>
                        </cdk-virtual-scroll-viewport>
                    </div>
                }
            </section>
        </div>
    `,
    styles: `
        .disposition {
            display: grid;
            grid-template-columns: 240px 1fr;
            gap: 14px;
            align-items: start;
        }
        .tables {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .table {
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
        .table:hover {
            border-color: var(--accent);
        }
        .resultat {
            padding: 0;
            overflow: hidden;
        }
        .ligne {
            display: flex;
            min-width: max-content;
        }
        .entete-colonnes {
            background: var(--surface-2);
            border-bottom: 1px solid var(--bordure);
        }
        .entete-colonnes .cellule {
            display: flex;
            flex-direction: column;
            line-height: 1.2;
            height: auto;
            padding: 6px 10px;
        }
        .cellule {
            flex: 0 0 180px;
            padding: 0 10px;
            height: 30px;
            line-height: 30px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            border-right: 1px solid var(--bordure);
            font-size: 13px;
        }
        .paire {
            background: color-mix(in srgb, var(--surface-2) 50%, transparent);
        }
        .corps {
            height: 60vh;
        }
        @media (max-width: 800px) {
            .disposition {
                grid-template-columns: 1fr;
            }
        }
    `
})
export class ExplorateurComponent {
    readonly session = inject(SessionService);
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);

    requete = '';
    readonly sources = signal<Source[]>([]);
    readonly resultat = signal<ResultatSql | null>(null);
    readonly enCours = signal(false);
    readonly duree = signal(0);

    constructor() {
        this.api
            .sources()
            .then(sources => this.sources.set(sources))
            .catch(erreur => this.notifications.erreur(erreur));
    }

    inserer(source: Source): void {
        const table = `"t_${source.id}"`;
        this.requete = this.requete.trim() ? this.requete + ' ' + table : `SELECT * EXCLUDE (__rn) FROM ${table} LIMIT 100`;
    }

    async executer(): Promise<void> {
        if (!this.requete.trim()) return;
        this.enCours.set(true);
        const debut = performance.now();
        try {
            this.resultat.set(await this.api.sql(this.requete));
            this.duree.set(Math.round(performance.now() - debut));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    /** Export CSV côté navigateur (séparateur point-virgule, valeurs entre guillemets), pour Excel français. */
    exporterCsv(): void {
        const resultat = this.resultat();
        if (!resultat) return;
        const echapper = (valeur: unknown) => '"' + String(valeur === null || valeur === undefined ? '' : valeur).replace(/"/g, '""') + '"';
        const lignes = [
            resultat.colonnes.map(colonne => echapper(colonne.nom)).join(';'),
            ...resultat.lignes.map(ligne => ligne.map(echapper).join(';'))
        ];
        const blob = new Blob(['\ufeff' + lignes.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const lien = document.createElement('a');
        lien.href = URL.createObjectURL(blob);
        lien.download = 'resultat.csv';
        lien.click();
        URL.revokeObjectURL(lien.href);
    }
}
