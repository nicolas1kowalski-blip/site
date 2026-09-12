/**
 * Sources : liste des sources de l'espace, dépôt de fichiers CSV/TXT/Parquet/JSON avec progression, aperçu
 * des premières lignes, optimisation Parquet et suppression.
 *
 * Le dépôt suit le même chemin que l'application classique, ce qui rend les sources visibles des deux côtés :
 *   1. le fichier est déposé sous le nom src_<id> (PUT /api/fichiers) ;
 *   2. DuckDB le lit en table t_<id> avec un numéro de ligne technique __rn (POST /api/sql) ;
 *   3. les métadonnées sont enregistrées (PUT /api/tables/<id>).
 * Les classeurs Excel sont pris en charge par l'application complète (lecture dans le navigateur).
 */
import { Component, inject, signal } from '@angular/core';
import { ClientApiService, progressionDe } from '../../coeur/client-api.service';
import { ResultatSql, Source, formaterDate, formaterOctets, genererIdentifiant } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

type Depot = { nom: string; progression: number; etape: string };

const EXTENSIONS_ACCEPTEES = ['csv', 'txt', 'tsv', 'parquet', 'json', 'ndjson'];

/** Expression DuckDB qui lit le fichier déposé selon son extension (toutes les colonnes en texte pour CSV). */
function lectureDuckDB(nomServeur: string, extension: string): string {
    const nom = `'${nomServeur}'`;
    if (extension === 'parquet') return `read_parquet(${nom})`;
    if (extension === 'json' || extension === 'ndjson') return `read_json_auto(${nom})`;
    return `read_csv_auto(${nom}, header=true, all_varchar=true)`;
}

@Component({
    selector: 'app-sources',
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Sources</h1>
                <p class="discret">{{ sources().length }} source(s) dans l'espace « {{ session.espaceCourant()?.nom }} »</p>
            </div>
            @if (session.peutEditer()) {
                <label class="bouton principal">
                    Déposer des fichiers
                    <input type="file" multiple hidden [accept]="accept" (change)="deposer($event)" />
                </label>
            }
        </div>
        @for (depot of depots(); track depot.nom) {
            <div class="carte depot">
                <div>
                    <b>{{ depot.nom }}</b> <span class="discret">— {{ depot.etape }}</span>
                </div>
                <div class="barre-progression"><div [style.width.%]="depot.progression"></div></div>
            </div>
        }
        <div class="carte defilement-x">
            @if (sources().length === 0) {
                <div class="vide">Aucune source. Déposez un fichier CSV, TXT, Parquet ou JSON pour commencer.</div>
            } @else {
                <table class="tableau">
                    <thead>
                        <tr>
                            <th>Nom</th>
                            <th>Type</th>
                            <th>Stockage</th>
                            <th>Colonnes</th>
                            <th>Taille</th>
                            <th>Enregistrée</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        @for (source of sources(); track source.id) {
                            <tr>
                                <td>
                                    <b>{{ source.name }}</b>
                                </td>
                                <td>
                                    <span class="badge neutre">{{ source.type }}</span>
                                </td>
                                <td>
                                    <span class="badge" [class.succes]="source.storage === 'parquet'">{{ source.storage }}</span>
                                </td>
                                <td class="discret" [title]="source.headers.join(', ')">{{ source.headers.length }}</td>
                                <td>{{ formaterOctets(source.size) }}</td>
                                <td class="discret">{{ formaterDate(source.enregistreLe) }}</td>
                                <td class="actions">
                                    <button class="bouton petit" (click)="apercevoir(source)">Aperçu</button>
                                    @if (session.peutEditer() && source.storage !== 'parquet') {
                                        <button class="bouton petit" (click)="optimiser(source)">Optimiser</button>
                                    }
                                    @if (session.peutEditer()) {
                                        <button class="bouton petit danger" (click)="supprimer(source)">Supprimer</button>
                                    }
                                </td>
                            </tr>
                        }
                    </tbody>
                </table>
            }
        </div>
        @if (apercu(); as apercu) {
            <div class="carte">
                <div class="entete-page">
                    <h2 class="espace">Aperçu de « {{ apercu.source.name }} » ({{ apercu.total }} ligne(s))</h2>
                    <button class="bouton petit" (click)="apercu$.set(null)">Fermer</button>
                </div>
                <div class="defilement-x">
                    <table class="tableau">
                        <thead>
                            <tr>
                                @for (colonne of apercu.resultat.colonnes; track colonne.nom) {
                                    <th>{{ colonne.nom }}</th>
                                }
                            </tr>
                        </thead>
                        <tbody>
                            @for (ligne of apercu.resultat.lignes; track $index) {
                                <tr>
                                    @for (valeur of ligne; track $index) {
                                        <td>{{ valeur }}</td>
                                    }
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>
            </div>
        }
    `,
    styles: `
        .depot {
            margin-bottom: 10px;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .actions {
            white-space: nowrap;
            display: flex;
            gap: 4px;
        }
    `
})
export class SourcesComponent {
    readonly session = inject(SessionService);
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);

    readonly sources = signal<Source[]>([]);
    readonly depots = signal<Depot[]>([]);
    readonly apercu$ = signal<{ source: Source; resultat: ResultatSql; total: string } | null>(null);
    readonly apercu = this.apercu$;
    readonly accept = EXTENSIONS_ACCEPTEES.map(extension => '.' + extension).join(',');
    readonly formaterOctets = formaterOctets;
    readonly formaterDate = formaterDate;

    constructor() {
        this.recharger();
    }

    async recharger(): Promise<void> {
        try {
            this.sources.set(await this.api.sources());
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async deposer(evenement: Event): Promise<void> {
        const champ = evenement.target as HTMLInputElement;
        const fichiers = Array.from(champ.files || []);
        champ.value = '';
        for (const fichier of fichiers) await this.deposerUnFichier(fichier);
        await this.recharger();
    }

    private async deposerUnFichier(fichier: File): Promise<void> {
        const extension = (fichier.name.split('.').pop() || '').toLowerCase();
        if (!EXTENSIONS_ACCEPTEES.includes(extension)) {
            this.notifications.erreur(
                `« ${fichier.name} » : format .${extension} non pris en charge ici (formats : ${EXTENSIONS_ACCEPTEES.join(', ')}). Les classeurs Excel se déposent dans l'application complète.`
            );
            return;
        }
        if (this.sources().some(source => source.name === fichier.name)) {
            this.notifications.erreur(
                `Une source nommée « ${fichier.name} » existe déjà : renommez le fichier ou supprimez l'ancienne source.`
            );
            return;
        }
        const id = genererIdentifiant('tb_');
        const nomServeur = 'src_' + id;
        const depot: Depot = { nom: fichier.name, progression: 0, etape: 'dépôt sur le serveur' };
        this.depots.update(liste => [...liste, depot]);
        const mettreAJour = (changements: Partial<Depot>) =>
            this.depots.update(liste => liste.map(candidat => (candidat === depot ? Object.assign(candidat, changements) : candidat)));
        try {
            await new Promise<void>((resoudre, rejeter) => {
                this.api.deposerFichier(nomServeur, fichier).subscribe({
                    next: evenement => {
                        const progression = progressionDe(evenement);
                        if (progression !== null) mettreAJour({ progression });
                    },
                    error: rejeter,
                    complete: resoudre
                });
            });
            mettreAJour({ etape: 'lecture par le moteur DuckDB' });
            const table = '"t_' + id + '"';
            await this.api.sql(
                `CREATE OR REPLACE TABLE ${table} AS SELECT row_number() OVER () AS __rn, * FROM ${lectureDuckDB(nomServeur, extension)}`
            );
            const structure = await this.api.sql(`SELECT * FROM ${table} LIMIT 0`);
            const headers = structure.colonnes.map(colonne => colonne.nom).filter(nom => nom !== '__rn');
            mettreAJour({ etape: 'enregistrement' });
            await this.api.enregistrerSource(id, {
                name: fichier.name,
                type: extension === 'tsv' ? 'txt' : extension,
                storage: 'table',
                size: fichier.size,
                headers,
                config: { delim: '', enc: 'UTF-8' },
                fichier: { nom: nomServeur, name: fichier.name, size: fichier.size, lastModified: fichier.lastModified },
                srcModified: fichier.lastModified
            });
            this.notifications.succes(`« ${fichier.name} » chargée : ${headers.length} colonne(s).`);
            await this.reconstruireTablesConcuesDependantes(fichier.name);
        } catch (erreur) {
            this.notifications.erreur(`« ${fichier.name} » : ${(erreur as Error).message}`);
        } finally {
            this.depots.update(liste => liste.filter(candidat => candidat !== depot));
        }
    }

    /** Les tables conçues qui s'appuient sur cette source sont reconstruites sur son nouveau contenu. */
    private async reconstruireTablesConcuesDependantes(nomSource: string): Promise<void> {
        try {
            const resultat = await this.api.reconstruireTablesDependantes(nomSource);
            if (resultat.reconstruites.length)
                this.notifications.succes(`Table(s) conçue(s) reconstruite(s) : ${resultat.reconstruites.join(', ')}.`);
            for (const echec of resultat.erreurs) this.notifications.erreur(`Table conçue « ${echec.table} » : ${echec.erreur}`);
            if (resultat.reconstruites.length) await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async apercevoir(source: Source): Promise<void> {
        try {
            const table = '"t_' + source.id + '"';
            const [resultat, total] = await Promise.all([
                this.api.sql(`SELECT * EXCLUDE (__rn) FROM ${table} ORDER BY __rn LIMIT 50`),
                this.api.sql(`SELECT COUNT(*)::BIGINT AS n FROM ${table}`)
            ]);
            this.apercu$.set({ source, resultat, total: String(total.lignes[0][0]) });
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async optimiser(source: Source): Promise<void> {
        try {
            const resultat = await this.api.optimiserSource(source.id);
            this.notifications.succes(`« ${source.name} » optimisée : ${formaterOctets(resultat.taille)} en Parquet.`);
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async supprimer(source: Source): Promise<void> {
        if (!confirm(`Supprimer la source « ${source.name} » et ses données sur le serveur ?`)) return;
        try {
            await this.api.supprimerSource(source.id);
            this.notifications.succes(`« ${source.name} » supprimée.`);
            if (this.apercu$()?.source.id === source.id) this.apercu$.set(null);
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
}
