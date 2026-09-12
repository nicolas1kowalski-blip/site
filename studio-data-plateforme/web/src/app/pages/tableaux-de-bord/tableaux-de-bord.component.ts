/**
 * Tableaux de bord composables : des tuiles (barres, courbe, camembert, tableau, indicateur) calculées par le
 * serveur sur une source, avec des filtres globaux ; un indicateur peut porter des seuils (avertissement,
 * critique) évalués à la demande sur tous les tableaux (alertes).
 */
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import {
    Alerte,
    ResultatTuile,
    Source,
    TableauDeBord,
    Tuile,
    VocabulaireExploitation,
    VocabulaireTablesConcues,
    genererIdentifiant
} from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';
import { GraphiqueSvgComponent } from '../../composants/graphique-svg.component';

const TUILE_VIDE = (): Tuile => ({
    id: genererIdentifiant('tl'),
    title: 'Nouvelle tuile',
    table: '',
    kind: 'bar',
    dim: '',
    agg: 'count',
    aggCol: '',
    topN: 12
});

@Component({
    selector: 'app-tableaux-de-bord',
    imports: [FormsModule, GraphiqueSvgComponent],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Tableaux de bord</h1>
                <p class="discret">Tuiles calculées par le serveur sur vos sources ; indicateurs à seuils et alertes.</p>
            </div>
            <select
                class="champ"
                style="width: auto; min-width: 220px"
                name="tableau"
                [ngModel]="tableauId()"
                (ngModelChange)="ouvrir($event)"
            >
                <option value="">Choisir un tableau…</option>
                @for (tableau of tableaux(); track tableau.id) {
                    <option [value]="tableau.id">{{ tableau.name }}</option>
                }
            </select>
            @if (session.peutEditer()) {
                <button class="bouton principal" (click)="nouveau()">Nouveau tableau</button>
            }
            <button class="bouton" (click)="verifierAlertes()" [disabled]="enCours()">Vérifier les alertes</button>
        </div>

        @if (alertes(); as alertes) {
            <div class="carte">
                <h2>Alertes</h2>
                @if (!alertes.length) {
                    <p class="discret">Aucun indicateur avec seuil défini.</p>
                } @else {
                    <table class="tableau">
                        <thead>
                            <tr>
                                <th>État</th>
                                <th>Tableau de bord</th>
                                <th>Indicateur</th>
                                <th>Valeur</th>
                                <th>Seuils</th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (alerte of alertes; track alerte.tableau + alerte.indicateur) {
                                <tr>
                                    <td>
                                        <span
                                            class="badge"
                                            [class.erreur]="alerte.statut === 'crit'"
                                            [class.alerte]="alerte.statut === 'warn'"
                                            [class.succes]="alerte.statut === 'ok'"
                                        >
                                            {{
                                                { crit: 'critique', warn: 'avertissement', ok: 'dans les seuils', err: 'erreur' }[
                                                    alerte.statut
                                                ]
                                            }}
                                        </span>
                                    </td>
                                    <td>{{ alerte.tableau }}</td>
                                    <td>{{ alerte.indicateur }}</td>
                                    <td>{{ alerte.valeur == null ? alerte.erreur || '—' : formater(alerte.valeur) }}</td>
                                    <td class="discret">
                                        {{ alerte.sens === 'min' ? '≤' : '≥' }} {{ alerte.thWarn ? '⚠ ' + alerte.thWarn : '' }}
                                        {{ alerte.thCrit ? '⛔ ' + alerte.thCrit : '' }}
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                }
            </div>
        }

        @if (edition(); as tableau) {
            <div class="carte">
                <div class="entete-page" style="margin: 0 0 8px">
                    <input
                        class="champ espace"
                        name="nom"
                        [(ngModel)]="tableau.name"
                        placeholder="Nom du tableau de bord"
                        [disabled]="!session.peutEditer()"
                        style="max-width: 360px"
                    />
                    @if (session.peutEditer()) {
                        <button class="bouton principal" (click)="enregistrer()" [disabled]="enCours()">Enregistrer</button>
                        <button class="bouton" (click)="ajouterTuile(tableau)">+ tuile</button>
                        <button class="bouton" (click)="ajouterFiltre(tableau)">+ filtre global</button>
                        <button class="bouton danger" (click)="supprimer(tableau)">Supprimer</button>
                    }
                    <button class="bouton" (click)="executer()" [disabled]="enCours()">{{ enCours() ? 'Calcul…' : 'Exécuter' }}</button>
                </div>
                @for (filtre of tableau.filters; track $index; let index = $index) {
                    <div class="formulaire-ligne filtre">
                        @if (index > 0) {
                            <select
                                class="champ"
                                style="flex: 0 0 70px"
                                [(ngModel)]="filtre.conn"
                                [name]="'filtre-conn-' + index"
                                [disabled]="!session.peutEditer()"
                            >
                                <option value="AND">ET</option>
                                <option value="OR">OU</option>
                            </select>
                        }
                        <input
                            class="champ"
                            [(ngModel)]="filtre.col"
                            [name]="'filtre-colonne-' + index"
                            [attr.name]="'filtre-colonne-' + index"
                            placeholder="colonne (appliquée aux tables qui l'ont)"
                            list="colonnes-connues"
                            [disabled]="!session.peutEditer()"
                        />
                        <select
                            class="champ"
                            [(ngModel)]="filtre.op"
                            [name]="'filtre-operateur-' + index"
                            [disabled]="!session.peutEditer()"
                        >
                            @for (operateur of operateurs(); track operateur.cle) {
                                <option [value]="operateur.cle">{{ operateur.libelle }}</option>
                            }
                        </select>
                        @if (filtre.op !== 'empty' && filtre.op !== 'nempty') {
                            <input
                                class="champ"
                                [(ngModel)]="filtre.val"
                                [name]="'filtre-valeur-' + index"
                                [attr.name]="'filtre-valeur-' + index"
                                placeholder="valeur"
                                [disabled]="!session.peutEditer()"
                            />
                        }
                        @if (session.peutEditer()) {
                            <button class="bouton petit danger" (click)="tableau.filters.splice(index, 1)" style="flex: 0 0 auto">✕</button>
                        }
                    </div>
                }
                <datalist id="colonnes-connues">
                    @for (colonne of toutesColonnes(); track colonne) {
                        <option [value]="colonne"></option>
                    }
                </datalist>
            </div>
            <div class="grille tuiles">
                @for (tuile of tableau.tiles; track tuile.id; let index = $index) {
                    <div class="carte tuile">
                        @if (session.peutEditer()) {
                            <div class="parametres">
                                <input
                                    class="champ"
                                    [(ngModel)]="tuile.title"
                                    [name]="'tuile-titre-' + index"
                                    [attr.name]="'tuile-titre-' + index"
                                    placeholder="Titre"
                                />
                                <select
                                    class="champ"
                                    [(ngModel)]="tuile.table"
                                    (ngModelChange)="tuile.dim = ''; tuile.aggCol = ''"
                                    [name]="'tuile-table-' + index"
                                    [attr.name]="'tuile-table-' + index"
                                >
                                    <option value="">— source —</option>
                                    @for (source of sources(); track source.id) {
                                        <option [value]="source.name">{{ source.name }}</option>
                                    }
                                </select>
                                <select
                                    class="champ"
                                    [(ngModel)]="tuile.kind"
                                    [name]="'tuile-genre-' + index"
                                    [attr.name]="'tuile-genre-' + index"
                                >
                                    @for (genre of genres(); track genre.cle) {
                                        <option [value]="genre.cle">{{ genre.libelle }}</option>
                                    }
                                </select>
                                @if (tuile.kind !== 'kpi') {
                                    <select
                                        class="champ"
                                        [(ngModel)]="tuile.dim"
                                        [name]="'tuile-axe-' + index"
                                        [attr.name]="'tuile-axe-' + index"
                                    >
                                        <option value="">— axe —</option>
                                        @for (colonne of colonnesDe(tuile.table); track colonne) {
                                            <option [value]="colonne">{{ colonne }}</option>
                                        }
                                    </select>
                                }
                                <select
                                    class="champ"
                                    [(ngModel)]="tuile.agg"
                                    [name]="'tuile-agregat-' + index"
                                    [attr.name]="'tuile-agregat-' + index"
                                >
                                    @for (agregat of agregats(); track agregat.cle) {
                                        <option [value]="agregat.cle">{{ agregat.libelle }}</option>
                                    }
                                </select>
                                @if (tuile.agg !== 'count') {
                                    <select
                                        class="champ"
                                        [(ngModel)]="tuile.aggCol"
                                        [name]="'tuile-colonne-' + index"
                                        [attr.name]="'tuile-colonne-' + index"
                                    >
                                        <option value="">— colonne —</option>
                                        @for (colonne of colonnesDe(tuile.table); track colonne) {
                                            <option [value]="colonne">{{ colonne }}</option>
                                        }
                                    </select>
                                }
                                @if (tuile.kind !== 'kpi') {
                                    <input
                                        class="champ"
                                        type="number"
                                        [(ngModel)]="tuile.topN"
                                        [name]="'tuile-top-' + index"
                                        title="N premières valeurs"
                                        style="width: 70px"
                                    />
                                }
                                @if (tuile.kind === 'kpi') {
                                    <select class="champ" [(ngModel)]="tuile.thDir" [name]="'tuile-sens-' + index" style="width: 90px">
                                        <option [ngValue]="undefined">seuil ≥</option>
                                        <option value="max">≥ (max)</option>
                                        <option value="min">≤ (min)</option>
                                    </select>
                                    <input
                                        class="champ"
                                        [(ngModel)]="tuile.thWarn"
                                        [name]="'tuile-avertissement-' + index"
                                        placeholder="⚠ seuil"
                                        style="width: 90px"
                                    />
                                    <input
                                        class="champ"
                                        [(ngModel)]="tuile.thCrit"
                                        [name]="'tuile-critique-' + index"
                                        placeholder="⛔ seuil"
                                        style="width: 90px"
                                    />
                                }
                                <button class="bouton petit danger" (click)="tableau.tiles.splice(index, 1)">✕</button>
                            </div>
                        }
                        <h3>{{ tuile.title }}</h3>
                        @if (resultatDe(tuile.id); as resultat) {
                            @if (resultat.erreur) {
                                <p class="discret">{{ resultat.erreur }}</p>
                            } @else if (tuile.kind === 'kpi') {
                                <div class="indicateur" [class.crit]="resultat.statut === 'crit'" [class.warn]="resultat.statut === 'warn'">
                                    {{ formater(resultat.valeur || 0) }}
                                </div>
                            } @else if (tuile.kind === 'table') {
                                <table class="tableau">
                                    <tbody>
                                        @for (ligne of resultat.lignes; track ligne.d) {
                                            <tr>
                                                <td>{{ ligne.d }}</td>
                                                <td style="text-align: right; font-weight: 700">{{ formater(ligne.v) }}</td>
                                            </tr>
                                        }
                                    </tbody>
                                </table>
                            } @else {
                                <app-graphique-svg [points]="resultat.lignes" [genre]="tuile.kind" />
                            }
                        } @else {
                            <p class="discret">Cliquez sur « Exécuter ».</p>
                        }
                    </div>
                } @empty {
                    <div class="carte discret" style="text-align: center; padding: 30px">Aucune tuile. Ajoutez-en une.</div>
                }
            </div>
        } @else if (!tableaux().length) {
            <div class="carte discret" style="text-align: center; padding: 40px">Aucun tableau de bord. Créez-en un.</div>
        }
    `,
    styles: `
        .filtre {
            margin-top: 6px;
        }
        .tuiles {
            margin-top: 14px;
            grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
        }
        .tuile h3 {
            margin: 6px 0;
            font-size: 14px;
        }
        .parametres {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
        }
        .parametres .champ {
            flex: 1 1 110px;
            min-width: 90px;
        }
        .indicateur {
            font-size: 42px;
            font-weight: 900;
            color: var(--accent);
            text-align: center;
            padding: 20px 0;
        }
        .indicateur.warn {
            color: var(--alerte);
        }
        .indicateur.crit {
            color: var(--erreur);
        }
    `
})
export class TableauxDeBordComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    readonly session = inject(SessionService);

    readonly tableaux = signal<TableauDeBord[]>([]);
    readonly sources = signal<Source[]>([]);
    readonly vocabulaire = signal<VocabulaireExploitation | null>(null);
    readonly vocabulaireFiltres = signal<VocabulaireTablesConcues | null>(null);
    readonly tableauId = signal('');
    readonly edition = signal<TableauDeBord | null>(null);
    readonly resultats = signal<ResultatTuile[]>([]);
    readonly alertes = signal<Alerte[] | null>(null);
    readonly enCours = signal(false);

    readonly genres = computed(() => Object.entries(this.vocabulaire()?.genresTuile || {}).map(([cle, libelle]) => ({ cle, libelle })));
    readonly agregats = computed(() => Object.entries(this.vocabulaire()?.agregats || {}).map(([cle, libelle]) => ({ cle, libelle })));
    readonly operateurs = computed(() =>
        Object.entries(this.vocabulaireFiltres()?.operateursFiltre || {}).map(([cle, libelle]) => ({ cle, libelle }))
    );
    readonly toutesColonnes = computed(() => [...new Set(this.sources().flatMap(source => source.headers))].sort());

    constructor() {
        void this.recharger();
    }

    async recharger(): Promise<void> {
        try {
            const [tableaux, sources, vocabulaire, vocabulaireFiltres] = await Promise.all([
                this.api.tableauxDeBord(),
                this.api.sources(),
                this.vocabulaire() ?? this.api.vocabulaireExploitation(),
                this.vocabulaireFiltres() ?? this.api.vocabulaireTablesConcues()
            ]);
            this.tableaux.set(tableaux);
            this.sources.set(sources);
            this.vocabulaire.set(vocabulaire);
            this.vocabulaireFiltres.set(vocabulaireFiltres);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    ouvrir(id: string): void {
        this.tableauId.set(id);
        const tableau = this.tableaux().find(candidat => candidat.id === id);
        this.edition.set(tableau ? structuredClone(tableau) : null);
        this.resultats.set([]);
    }

    nouveau(): void {
        const tableau: TableauDeBord = {
            id: genererIdentifiant('db'),
            name: 'Nouveau tableau de bord',
            filters: [],
            tiles: [TUILE_VIDE()]
        };
        this.tableauId.set(tableau.id);
        this.edition.set(tableau);
        this.resultats.set([]);
    }

    ajouterTuile(tableau: TableauDeBord): void {
        tableau.tiles.push(TUILE_VIDE());
    }

    ajouterFiltre(tableau: TableauDeBord): void {
        tableau.filters.push({ col: '', op: 'eq', val: '', conn: 'AND' });
    }

    colonnesDe(nomSource: string): string[] {
        return this.sources().find(source => source.name === nomSource)?.headers || [];
    }

    resultatDe(idTuile: string): ResultatTuile | undefined {
        return this.resultats().find(resultat => resultat.id === idTuile);
    }

    formater(valeur: number): string {
        return Number.isInteger(valeur) ? valeur.toLocaleString('fr-FR') : valeur.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    }

    async enregistrer(): Promise<boolean> {
        const tableau = this.edition();
        if (!tableau) return false;
        if (!tableau.name.trim()) {
            this.notifications.erreur('Donnez un nom au tableau de bord.');
            return false;
        }
        try {
            const { id, ...corps } = tableau;
            await this.api.enregistrerTableauDeBord(id, corps);
            this.notifications.succes(`Tableau « ${tableau.name} » enregistré.`);
            await this.recharger();
            return true;
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
            return false;
        }
    }

    /** Exécuter enregistre d'abord (le serveur calcule à partir de la définition enregistrée). */
    async executer(): Promise<void> {
        const tableau = this.edition();
        if (!tableau) return;
        this.enCours.set(true);
        try {
            if (this.session.peutEditer() && !(await this.enregistrer())) return;
            this.resultats.set(await this.api.executerTableauDeBord(tableau.id));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    async verifierAlertes(): Promise<void> {
        this.enCours.set(true);
        try {
            const alertes = await this.api.alertesTableauxDeBord();
            this.alertes.set(alertes);
            const critiques = alertes.filter(alerte => alerte.statut === 'crit').length;
            const avertissements = alertes.filter(alerte => alerte.statut === 'warn').length;
            this.notifications.succes(
                critiques + avertissements
                    ? `${critiques} alerte(s) critique(s) et ${avertissements} avertissement(s) sur ${alertes.length} indicateur(s) suivi(s).`
                    : `${alertes.length} indicateur(s) suivi(s) — tous dans les seuils.`
            );
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    async supprimer(tableau: TableauDeBord): Promise<void> {
        if (!confirm(`Supprimer le tableau « ${tableau.name} » ?`)) return;
        try {
            await this.api.supprimerTableauDeBord(tableau.id);
        } catch {
            // Tableau jamais enregistré : rien côté serveur.
        }
        this.edition.set(null);
        this.tableauId.set('');
        await this.recharger();
    }
}
