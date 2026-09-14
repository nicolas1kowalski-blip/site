/**
 * Navigateur de données (repris de l'écran « Explorer » de l'application classique) : une table, un filtre par
 * colonne (contient, casse ignorée), un tri par clic sur l'en-tête, et un saut vers les tables liées : quand une
 * colonne est reliée par le modèle de données, sa valeur est cliquable et ouvre la table liée filtrée sur cette
 * valeur. Le serveur (DuckDB) exécute la requête ; l'écran en construit le SQL (identifiants et valeurs échappés).
 */
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import { Relation, ResultatSql, Source } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { telechargerCsv } from '../../coeur/telechargement';

const LIGNES_MAXIMUM = 1000;
const DELAI_FILTRE_MS = 400;

/** Identifiant et littéral SQL, comme côté serveur. */
const GUILLEMET_DOUBLE = String.fromCharCode(34);
const APOSTROPHE = String.fromCharCode(39);
const identifiantSql = (nom: string) =>
    GUILLEMET_DOUBLE + nom.split(GUILLEMET_DOUBLE).join(GUILLEMET_DOUBLE + GUILLEMET_DOUBLE) + GUILLEMET_DOUBLE;
const litteralSql = (valeur: string) => APOSTROPHE + valeur.split(APOSTROPHE).join(APOSTROPHE + APOSTROPHE) + APOSTROPHE;

type LienColonne = { table: string; colonne: string };

@Component({
    selector: 'app-navigateur',
    imports: [FormsModule],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Navigateur de données</h1>
                <p class="discret">
                    Filtrez colonne par colonne, triez, et sautez d'une table à l'autre par les liens du modèle de données.
                </p>
            </div>
            <select
                class="champ"
                style="width: auto; min-width: 220px"
                name="table"
                [ngModel]="tableId()"
                (ngModelChange)="choisirTable($event)"
            >
                <option value="">Choisir une table…</option>
                @for (source of sources(); track source.id) {
                    <option [value]="source.id">{{ source.name }}</option>
                }
            </select>
            @if (resultat(); as resultat) {
                <span class="badge neutre"
                    >{{ totalFiltre() }} ligne(s) sur {{ total()
                    }}{{ resultat.lignes.length < totalFiltre() ? ' (' + resultat.lignes.length + ' affichées)' : '' }}</span
                >
                <button class="bouton petit" (click)="exporter()">Exporter en CSV</button>
                @if (aDesFiltres()) {
                    <button class="bouton petit" (click)="effacerFiltres()">Effacer les filtres</button>
                }
            }
        </div>
        @if (source(); as source) {
            <div class="carte defilement-x">
                @if (chargement()) {
                    <span class="discret">Chargement…</span>
                }
                <table class="tableau">
                    <thead>
                        <tr>
                            @for (colonne of source.headers; track colonne) {
                                <th class="entete" (click)="trier(colonne)" [title]="'Trier par ' + colonne">
                                    {{ colonne }}
                                    @if (tri().colonne === colonne) {
                                        <span>{{ tri().sens === 'asc' ? '▲' : '▼' }}</span>
                                    }
                                    @if (lienDe(colonne); as lien) {
                                        <span class="badge neutre" [title]="'Lié à ' + lien.table + '.' + lien.colonne"
                                            >⇄ {{ lien.table }}</span
                                        >
                                    }
                                </th>
                            }
                        </tr>
                        <tr>
                            @for (colonne of source.headers; track colonne) {
                                <th>
                                    <input
                                        class="champ petit"
                                        [attr.name]="'filtre-' + colonne"
                                        [ngModel]="filtres()[colonne] || ''"
                                        (ngModelChange)="filtrer(colonne, $event)"
                                        placeholder="filtrer…"
                                    />
                                </th>
                            }
                        </tr>
                    </thead>
                    <tbody>
                        @for (ligne of resultat()?.lignes || []; track $index) {
                            <tr>
                                @for (valeur of ligne; track $index; let index = $index) {
                                    <td>
                                        @if (lienDe(source.headers[index]) && valeur !== null && valeur !== '') {
                                            <a
                                                class="saut"
                                                (click)="sauter(lienDe(source.headers[index])!, valeur)"
                                                [title]="'Voir dans ' + lienDe(source.headers[index])!.table"
                                                >{{ valeur }}</a
                                            >
                                        } @else {
                                            {{ valeur === null ? '' : valeur }}
                                        }
                                    </td>
                                }
                            </tr>
                        } @empty {
                            <tr>
                                <td [attr.colspan]="source.headers.length" class="vide">Aucune ligne ne correspond aux filtres.</td>
                            </tr>
                        }
                    </tbody>
                </table>
            </div>
        } @else {
            <div class="carte vide">Choisissez une table pour parcourir ses lignes.</div>
        }
    `,
    styles: `
        .entete {
            cursor: pointer;
            white-space: nowrap;
            user-select: none;
        }
        .entete:hover {
            color: var(--accent);
        }
        .champ.petit {
            padding: 3px 6px;
            font-size: 12px;
            min-width: 90px;
        }
        .saut {
            color: var(--accent);
            cursor: pointer;
            text-decoration: underline dotted;
        }
    `
})
export class NavigateurComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);

    readonly sources = signal<Source[]>([]);
    readonly relations = signal<Relation[]>([]);
    readonly tableId = signal('');
    readonly filtres = signal<Record<string, string>>({});
    readonly tri = signal<{ colonne: string; sens: 'asc' | 'desc' }>({ colonne: '', sens: 'asc' });
    readonly resultat = signal<ResultatSql | null>(null);
    /** Lignes de la table entière et lignes retenues par les filtres. */
    readonly total = signal(0);
    readonly totalFiltre = signal(0);
    readonly chargement = signal(false);
    private minuteur: ReturnType<typeof setTimeout> | null = null;

    readonly source = computed(() => this.sources().find(source => source.id === this.tableId()) || null);
    readonly aDesFiltres = computed(() => Object.values(this.filtres()).some(valeur => valeur.trim()));

    constructor() {
        this.charger();
    }
    private async charger(): Promise<void> {
        try {
            const [sources, relations] = await Promise.all([this.api.sourcesEtJeux(), this.api.relations()]);
            this.sources.set(sources);
            this.relations.set(relations);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    /** Colonne reliée par le modèle : la table et la colonne de l'autre côté du lien. */
    lienDe(colonne: string): LienColonne | null {
        const source = this.source();
        if (!source) return null;
        for (const relation of this.relations()) {
            if (relation.sourceTable === source.name && relation.sourceCol === colonne)
                return { table: relation.targetTable, colonne: relation.targetCol };
            if (relation.targetTable === source.name && relation.targetCol === colonne)
                return { table: relation.sourceTable, colonne: relation.sourceCol };
        }
        return null;
    }

    choisirTable(tableId: string): void {
        this.tableId.set(tableId);
        this.filtres.set({});
        this.tri.set({ colonne: '', sens: 'asc' });
        this.resultat.set(null);
        if (tableId) void this.executer();
    }
    filtrer(colonne: string, valeur: string): void {
        this.filtres.update(filtres => ({ ...filtres, [colonne]: valeur }));
        if (this.minuteur) clearTimeout(this.minuteur);
        this.minuteur = setTimeout(() => void this.executer(), DELAI_FILTRE_MS);
    }
    effacerFiltres(): void {
        this.filtres.set({});
        void this.executer();
    }
    trier(colonne: string): void {
        const tri = this.tri();
        this.tri.set({ colonne, sens: tri.colonne === colonne && tri.sens === 'asc' ? 'desc' : 'asc' });
        void this.executer();
    }
    /** Ouvre la table liée, filtrée sur la valeur cliquée (égalité, casse ignorée). */
    sauter(lien: LienColonne, valeur: unknown): void {
        const cible = this.sources().find(source => source.name === lien.table);
        if (!cible) {
            this.notifications.erreur(`La table « ${lien.table} » n'est pas chargée.`);
            return;
        }
        this.tableId.set(cible.id);
        this.filtres.set({ [lien.colonne]: '=' + String(valeur) });
        this.tri.set({ colonne: '', sens: 'asc' });
        void this.executer();
    }

    /** Requête : filtres « contient » (ou « = » exact si la saisie commence par =), tri, limite. */
    private clauseWhere(): string {
        const conditions = Object.entries(this.filtres())
            .filter(entree => entree[1].trim())
            .map(entree => {
                const [colonne, valeur] = entree;
                const texte = `CAST(${identifiantSql(colonne)} AS VARCHAR)`;
                return valeur.startsWith('=')
                    ? `UPPER(TRIM(${texte})) = ${litteralSql(valeur.slice(1).trim().toUpperCase())}`
                    : `${texte} ILIKE ${litteralSql('%' + valeur.trim() + '%')}`;
            });
        return conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    }
    async executer(): Promise<void> {
        const source = this.source();
        if (!source) return;
        const table = identifiantSql('t_' + source.id);
        const tri = this.tri();
        const ordre = tri.colonne
            ? ` ORDER BY ${identifiantSql(tri.colonne)} ${tri.sens === 'asc' ? 'ASC' : 'DESC'} NULLS LAST`
            : ' ORDER BY __rn';
        this.chargement.set(true);
        try {
            const [resultat, totalFiltre, total] = await Promise.all([
                this.api.sql(`SELECT * EXCLUDE (__rn) FROM ${table}${this.clauseWhere()}${ordre} LIMIT ${LIGNES_MAXIMUM}`),
                this.api.sql(`SELECT COUNT(*)::BIGINT FROM ${table}${this.clauseWhere()}`),
                this.api.sql(`SELECT COUNT(*)::BIGINT FROM ${table}`)
            ]);
            this.resultat.set(resultat);
            this.totalFiltre.set(Number(totalFiltre.lignes[0][0]));
            this.total.set(Number(total.lignes[0][0]));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.chargement.set(false);
        }
    }
    exporter(): void {
        const resultat = this.resultat();
        const source = this.source();
        if (!resultat || !source) return;
        telechargerCsv(
            `${source.name} - filtre.csv`,
            resultat.colonnes.map(colonne => colonne.nom),
            resultat.lignes
        );
    }
}
