/**
 * Sources : liste des sources de l'espace, dépôt de fichiers (CSV, TXT, Parquet, JSON, Excel, livraison ZIP) avec
 * progression, mise à jour d'une source existante par un nouveau fichier (même identifiant : gouvernance, règles
 * et recettes survivent ; alerte sur les colonnes disparues et leur impact), fusion de fichiers et de sources,
 * import par adresse (CSV, JSON, Parquet, Google Sheets) avec différentiel, aperçu, optimisation Parquet, suppression.
 *
 * Le dépôt suit le même chemin que l'application classique : le fichier est déposé (PUT /api/fichiers), puis le
 * serveur le lit dans DuckDB en table t_<id> et enregistre les métadonnées (POST /api/importation/fichier).
 * Après tout chargement, les tables conçues et les préparations qui dépendent de la source sont rejouées.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ClientApiService, progressionDe } from '../../coeur/client-api.service';
import {
    ActionEntreeZip,
    AuditQualite,
    OptionsLectureCsv,
    VocabulaireImportation,
    EntreeLivraisonZip,
    GenreAdresse,
    ParametresAdresse,
    ResultatImport,
    ResultatSql,
    Source,
    formaterDate,
    formaterOctets,
    genererIdentifiant
} from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

type Depot = { nom: string; progression: number; etape: string };

/** Texte comparable pour la recherche : minuscules, sans accents. */
const normaliserTexte = (texte: string) =>
    texte
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
type Livraison = { nomServeur: string; nomArchive: string; entrees: (EntreeLivraisonZip & { action: ActionEntreeZip })[] };
type Fusion = { nom: string; fichiers: File[]; sourceIds: string[]; retirerOrigines: boolean };

const EXTENSIONS_ACCEPTEES = ['csv', 'txt', 'tsv', 'parquet', 'json', 'ndjson', 'xlsx', 'zip'];
const GENRES_ADRESSE: Record<GenreAdresse, string> = {
    csv: 'CSV par adresse',
    json: 'API / JSON',
    parquet: 'Parquet par adresse',
    gsheet: 'Google Sheets'
};
const ADRESSE_VIDE = (): ParametresAdresse => ({
    adresse: '',
    genre: 'csv',
    nom: '',
    cheminJson: '',
    enTeteNom: '',
    enTeteValeur: '',
    sourceId: '',
    colonneCle: '',
    mode: 'remplacer'
});

@Component({
    selector: 'app-sources',
    imports: [FormsModule],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Sources</h1>
                <p class="discret">{{ sources().length }} source(s) dans l'espace « {{ session.espaceCourant()?.nom }} »</p>
            </div>
            @if (session.peutEditer()) {
                <button class="bouton" (click)="ouvrirFusion()">Fusionner des fichiers</button>
                <button class="bouton" (click)="ouvrirAdresse()">Importer par adresse</button>
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

        <!-- ---- livraison ZIP : inventaire et choix par fichier ---- -->
        @if (livraison(); as livraison) {
            <div class="carte">
                <div class="entete-page" style="margin: 0 0 8px">
                    <h2 class="espace">Livraison « {{ livraison.nomArchive }} » : {{ livraison.entrees.length }} fichier(s) de données</h2>
                    <button class="bouton principal" (click)="importerLivraison()" [disabled]="enCours()">Importer la livraison</button>
                    <button class="bouton" (click)="livraison$.set(null)">Annuler</button>
                </div>
                <table class="tableau">
                    <thead>
                        <tr>
                            <th>Dossier</th>
                            <th>Fichier</th>
                            <th>Taille</th>
                            <th>Source existante</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        @for (entree of livraison.entrees; track entree.nom; let index = $index) {
                            <tr>
                                <td class="discret">{{ entree.dossier }}</td>
                                <td>
                                    <b>{{ entree.nomCourt }}</b>
                                </td>
                                <td>{{ formaterOctets(entree.taille) }}</td>
                                <td>{{ entree.sourceExistante ? 'oui' : '—' }}</td>
                                <td>
                                    <select
                                        class="champ"
                                        [attr.name]="'action-' + index"
                                        [ngModel]="entree.action"
                                        (ngModelChange)="entree.action = $event"
                                    >
                                        <option value="importer">importer (nouvelle source)</option>
                                        @if (entree.sourceExistante) {
                                            <option value="mettreAJour">mettre à jour la source</option>
                                        }
                                        <option value="ignorer">ignorer</option>
                                    </select>
                                </td>
                            </tr>
                        }
                    </tbody>
                </table>
            </div>
        }

        <!-- ---- fusion de fichiers et de sources ---- -->
        @if (fusion(); as fusion) {
            <form class="carte" (ngSubmit)="fusionner()">
                <h2>Fusionner en une seule source</h2>
                <p class="discret">
                    Une même source découpée en plusieurs fichiers (export mensuel, par région…) ? Les fichiers et les sources choisis sont
                    empilés, colonnes alignées par nom ; la colonne « fichier_origine » garde la provenance de chaque ligne.
                </p>
                <div class="formulaire-ligne">
                    <div>
                        <label class="etiquette">Nom de la source fusionnée</label>
                        <input class="champ" name="fusion-nom" [(ngModel)]="fusion.nom" placeholder="Ventes 2024 (complet)" required />
                    </div>
                    <div>
                        <label class="etiquette">Fichiers à fusionner</label>
                        <label class="bouton"
                            >Ajouter des fichiers
                            <input
                                type="file"
                                multiple
                                hidden
                                accept=".csv,.txt,.tsv,.parquet,.json,.ndjson,.xlsx"
                                (change)="choisirFichiersFusion($event)"
                        /></label>
                        @for (fichier of fusion.fichiers; track fichier.name) {
                            <span class="badge neutre">{{ fichier.name }}</span>
                        }
                    </div>
                </div>
                <div style="margin-top: 8px">
                    <label class="etiquette">Sources déjà chargées à inclure</label>
                    <div class="cases">
                        @for (source of sources(); track source.id) {
                            <label class="case"
                                ><input
                                    type="checkbox"
                                    [checked]="fusion.sourceIds.includes(source.id)"
                                    (change)="basculerSourceFusion(source.id)"
                                />
                                {{ source.name }}</label
                            >
                        }
                    </div>
                </div>
                <div class="formulaire-ligne" style="margin-top: 10px">
                    <label class="case"
                        ><input type="checkbox" name="fusion-retirer" [(ngModel)]="fusion.retirerOrigines" /> Retirer les sources d'origine
                        après fusion</label
                    >
                    <span class="espace"></span>
                    <button
                        class="bouton principal"
                        type="submit"
                        [disabled]="enCours() || !fusion.nom || (!fusion.fichiers.length && !fusion.sourceIds.length)"
                    >
                        Fusionner
                    </button>
                    <button class="bouton" type="button" (click)="fusion$.set(null)">Annuler</button>
                </div>
            </form>
        }

        <!-- ---- import par adresse ---- -->
        @if (adresse(); as adresse) {
            <form class="carte" (ngSubmit)="importerAdresse()">
                <h2>Importer par adresse</h2>
                <p class="discret">
                    Le serveur télécharge le fichier (CSV, JSON, Parquet ou export Google Sheets) et en fait une source ; relancez pour la
                    mettre à jour avec un différentiel.
                </p>
                <div class="formulaire-ligne">
                    <div style="flex: 0 0 180px">
                        <label class="etiquette">Genre</label>
                        <select class="champ" name="adresse-genre" [(ngModel)]="adresse.genre">
                            @for (genre of genresAdresse; track genre[0]) {
                                <option [value]="genre[0]">{{ genre[1] }}</option>
                            }
                        </select>
                    </div>
                    <div style="flex: 2">
                        <label class="etiquette">Adresse</label>
                        <input
                            class="champ"
                            name="adresse-url"
                            [(ngModel)]="adresse.adresse"
                            placeholder="https://…/donnees.csv"
                            required
                        />
                    </div>
                    <div>
                        <label class="etiquette">Source à mettre à jour (sinon nouvelle)</label>
                        <select class="champ" name="adresse-source" [(ngModel)]="adresse.sourceId">
                            <option value="">Nouvelle source</option>
                            @for (source of sources(); track source.id) {
                                <option [value]="source.id">{{ source.name }}</option>
                            }
                        </select>
                    </div>
                    @if (!adresse.sourceId) {
                        <div>
                            <label class="etiquette">Nom de la source</label>
                            <input class="champ" name="adresse-nom" [(ngModel)]="adresse.nom" placeholder="(déduit de l'adresse)" />
                        </div>
                    }
                </div>
                <div class="formulaire-ligne" style="margin-top: 8px">
                    @if (adresse.genre === 'json') {
                        <div>
                            <label class="etiquette">Chemin du tableau dans le JSON</label>
                            <input class="champ" name="adresse-chemin" [(ngModel)]="adresse.cheminJson" placeholder="data.items" />
                        </div>
                    }
                    <div>
                        <label class="etiquette">En-tête d'authentification (nom)</label>
                        <input class="champ" name="adresse-entete-nom" [(ngModel)]="adresse.enTeteNom" placeholder="Authorization" />
                    </div>
                    <div>
                        <label class="etiquette">En-tête (valeur)</label>
                        <input class="champ" name="adresse-entete-valeur" [(ngModel)]="adresse.enTeteValeur" placeholder="Bearer …" />
                    </div>
                    @if (adresse.sourceId) {
                        <div>
                            <label class="etiquette">Colonne clé du différentiel</label>
                            <select class="champ" name="adresse-cle" [(ngModel)]="adresse.colonneCle">
                                <option value="">(comparaison ligne entière)</option>
                                @for (colonne of colonnesDe(adresse.sourceId); track colonne) {
                                    <option [value]="colonne">{{ colonne }}</option>
                                }
                            </select>
                        </div>
                        <div style="flex: 0 0 200px">
                            <label class="etiquette">Mode</label>
                            <select class="champ" name="adresse-mode" [(ngModel)]="adresse.mode">
                                <option value="remplacer">remplacer le contenu</option>
                                <option value="ajouter">ajouter les nouvelles clés</option>
                            </select>
                        </div>
                    }
                </div>
                <div class="formulaire-ligne" style="margin-top: 10px">
                    <button class="bouton principal" type="submit" style="flex: 0" [disabled]="enCours() || !adresse.adresse">
                        {{ enCours() ? 'Import…' : 'Importer' }}
                    </button>
                    <button class="bouton" type="button" style="flex: 0" (click)="adresse$.set(null)">Annuler</button>
                </div>
            </form>
        }

        <div class="carte">
            <div class="entete-page" style="margin: 0 0 8px">
                <input
                    class="champ"
                    style="max-width: 360px"
                    name="recherche"
                    [(ngModel)]="recherche"
                    placeholder="🔍 Rechercher une source (nom, domaine, colonne)…"
                />
                <span class="discret">{{ recherche ? sourcesVisibles().length + ' / ' : '' }}{{ sources().length }} source(s)</span>
                <span class="espace"></span>
                @if (session.peutEditer()) {
                    <label class="case"
                        ><input type="checkbox" name="parametres" [(ngModel)]="parametresVisibles" /> paramètres de lecture</label
                    >
                }
            </div>
            @if (sources().length === 0) {
                <div class="vide">
                    Aucune source. Déposez un fichier CSV, TXT, Parquet, JSON, Excel ou une livraison ZIP pour commencer.
                </div>
            } @else if (!sourcesVisibles().length) {
                <div class="vide">Aucune source ne correspond à « {{ recherche }} ».</div>
            } @else {
                <div class="defilement-x">
                    <table class="tableau sources">
                        <thead>
                            <tr>
                                <th>Nom</th>
                                <th>Type</th>
                                <th>Domaine</th>
                                <th>Lignes</th>
                                <th>Colonnes</th>
                                <th>Complétude (dernier audit)</th>
                                <th>Taille</th>
                                <th>Enregistrée</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (source of sourcesVisibles(); track source.id) {
                                <tr>
                                    <td>
                                        <b>{{ source.name }}</b>
                                        @if (source.origine === 'fusion') {
                                            <span class="badge neutre">fusion</span>
                                        }
                                        @if (source.origine === 'adresse') {
                                            <span class="badge neutre">adresse</span>
                                        }
                                        @if (source.storage === 'parquet') {
                                            <span class="badge succes" title="Convertie en Parquet compressé : analyses plus rapides"
                                                >optimisée</span
                                            >
                                        }
                                        @if (source.derniereMiseAJour) {
                                            <div class="discret">maj {{ formaterDate(source.derniereMiseAJour) }}</div>
                                        }
                                    </td>
                                    <td>
                                        <span class="badge neutre">{{ source.type }}</span>
                                    </td>
                                    <td>
                                        <input
                                            class="champ"
                                            style="min-width: 120px"
                                            list="domaines-connus"
                                            [attr.name]="'domaine-' + source.id"
                                            [ngModel]="source.theme || ''"
                                            (change)="changerDomaine(source, $any($event.target).value)"
                                            placeholder="ex : Achats"
                                            [disabled]="!session.peutEditer()"
                                            title="Groupe de sources : zones et couleurs dans le modèle de données"
                                        />
                                    </td>
                                    <td>{{ lignesDe(source) ?? '—' }}</td>
                                    <td>
                                        <span class="discret">{{ source.headers.length }}</span>
                                        <button class="bouton petit" (click)="basculerColonnes(source.id)">
                                            {{ colonnesDepliees().has(source.id) ? 'masquer' : 'voir' }}
                                        </button>
                                        @if (colonnesDepliees().has(source.id)) {
                                            <div class="colonnes">
                                                @for (colonne of source.headers; track colonne) {
                                                    <code>{{ colonne }}</code>
                                                }
                                            </div>
                                        }
                                    </td>
                                    <td>
                                        @if (completudeDe(source); as completude) {
                                            <span
                                                class="badge"
                                                [class.succes]="completude.valeur >= 0.95"
                                                [class.alerte]="completude.valeur < 0.95 && completude.valeur >= 0.8"
                                                [class.erreur]="completude.valeur < 0.8"
                                                [title]="'audit du ' + formaterDate(completude.date)"
                                                >{{ (completude.valeur * 100).toFixed(0) }} %</span
                                            >
                                        } @else {
                                            <span class="discret">jamais auditée</span>
                                        }
                                    </td>
                                    <td>{{ formaterOctets(source.size) }}</td>
                                    <td class="discret">{{ formaterDate(source.enregistreLe) }}</td>
                                    <td class="actions">
                                        <button class="bouton petit" (click)="apercevoir(source)">Aperçu</button>
                                        @if (session.peutEditer()) {
                                            <label
                                                class="bouton petit"
                                                title="Recharger cette source depuis un nouveau fichier (même identifiant)"
                                            >
                                                Mettre à jour
                                                <input type="file" hidden [accept]="accept" (change)="mettreAJour($event, source)" />
                                            </label>
                                            @if (source.origine === 'adresse') {
                                                <button class="bouton petit" (click)="relancerAdresse(source)">Relancer l'adresse</button>
                                            }
                                            @if (source.storage !== 'parquet') {
                                                <button class="bouton petit" (click)="optimiser(source)">Optimiser</button>
                                            }
                                            <button
                                                class="bouton petit"
                                                (click)="ouvrirObjetMetier(source)"
                                                title="Constituer ou rattacher un objet métier depuis cette source"
                                            >
                                                Objet métier
                                            </button>
                                            <button class="bouton petit danger" (click)="supprimer(source)">Supprimer</button>
                                        }
                                    </td>
                                </tr>
                                @if (parametresVisibles && estUnCsv(source)) {
                                    <tr class="parametres">
                                        <td colspan="9">
                                            <div class="formulaire-ligne" style="align-items: center">
                                                <span class="discret">Lecture de « {{ source.name }} » :</span>
                                                <label class="etiquette" style="margin: 0">Séparateur</label>
                                                <select
                                                    class="champ"
                                                    style="width: auto"
                                                    [attr.name]="'separateur-' + source.id"
                                                    [ngModel]="configDe(source).delim"
                                                    (ngModelChange)="relire(source, { delim: $event })"
                                                >
                                                    @for (separateur of separateurs(); track separateur[0]) {
                                                        <option [value]="separateur[0]">{{ separateur[1] }}</option>
                                                    }
                                                </select>
                                                <label
                                                    class="etiquette"
                                                    style="margin: 0"
                                                    title="À changer si les accents s'affichent mal (é → Ã© ou �)"
                                                    >Encodage</label
                                                >
                                                <select
                                                    class="champ"
                                                    style="width: auto"
                                                    [attr.name]="'encodage-' + source.id"
                                                    [ngModel]="configDe(source).enc"
                                                    (ngModelChange)="relire(source, { enc: $event })"
                                                >
                                                    @for (encodage of encodages(); track encodage[0]) {
                                                        <option [value]="encodage[0]">{{ encodage[1] }}</option>
                                                    }
                                                </select>
                                                <label class="etiquette" style="margin: 0">Guillemets</label>
                                                <select
                                                    class="champ"
                                                    style="width: auto"
                                                    [attr.name]="'guillemets-' + source.id"
                                                    [ngModel]="configDe(source).quote"
                                                    (ngModelChange)="relire(source, { quote: $event })"
                                                >
                                                    <option value="">automatique (")</option>
                                                    <option value="none">aucun</option>
                                                </select>
                                                <label class="case"
                                                    ><input
                                                        type="checkbox"
                                                        [attr.name]="'erreurs-' + source.id"
                                                        [ngModel]="configDe(source).ignoreErrors"
                                                        (ngModelChange)="relire(source, { ignoreErrors: $event })"
                                                    />
                                                    ignorer les lignes en erreur</label
                                                >
                                                @if (relectureEnCours() === source.id) {
                                                    <span class="discret">relecture…</span>
                                                }
                                            </div>
                                        </td>
                                    </tr>
                                }
                            }
                        </tbody>
                    </table>
                </div>
                <datalist id="domaines-connus">
                    @for (domaine of domainesConnus(); track domaine) {
                        <option [value]="domaine"></option>
                    }
                </datalist>
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
        .cases {
            display: flex;
            flex-wrap: wrap;
            gap: 6px 14px;
        }
        .colonnes {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            max-width: 360px;
            margin-top: 4px;
        }
        .parametres td {
            background: color-mix(in srgb, var(--accent) 5%, transparent);
        }
        .case {
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
        }
    `
})
export class SourcesComponent {
    readonly session = inject(SessionService);
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);

    readonly sources = signal<Source[]>([]);
    readonly depots = signal<Depot[]>([]);
    readonly enCours = signal(false);
    readonly apercu$ = signal<{ source: Source; resultat: ResultatSql; total: string } | null>(null);
    readonly apercu = this.apercu$;
    readonly livraison$ = signal<Livraison | null>(null);
    readonly livraison = this.livraison$;
    readonly fusion$ = signal<Fusion | null>(null);
    readonly fusion = this.fusion$;
    readonly adresse$ = signal<ParametresAdresse | null>(null);
    readonly adresse = this.adresse$;
    readonly accept = EXTENSIONS_ACCEPTEES.map(extension => '.' + extension).join(',');
    private readonly router = inject(Router);
    readonly vocabulaire = signal<VocabulaireImportation | null>(null);
    /** Nombre de lignes par nom de source (volumétrie du cockpit) et dernier profilage par identifiant de source. */
    readonly lignesParNom = signal<Record<string, number>>({});
    readonly dernierProfilage = signal<Record<string, AuditQualite>>({});
    readonly colonnesDepliees = signal(new Set<string>());
    readonly relectureEnCours = signal('');
    readonly rechercheSaisie = signal('');
    parametresVisibles = false;
    /** Sources filtrées par la recherche (nom, domaine ou colonne, casse et accents ignorés). */
    readonly sourcesVisibles = computed(() => {
        const question = normaliserTexte(this.rechercheSaisie());
        if (!question) return this.sources();
        return this.sources().filter(
            source =>
                normaliserTexte(source.name).includes(question) ||
                normaliserTexte(source.theme || '').includes(question) ||
                source.headers.some(colonne => normaliserTexte(colonne).includes(question))
        );
    });
    readonly domainesConnus = computed(() =>
        [
            ...new Set(
                this.sources()
                    .map(source => source.theme || '')
                    .filter(Boolean)
            )
        ].sort()
    );
    get recherche(): string {
        return this.rechercheSaisie();
    }
    set recherche(valeur: string) {
        this.rechercheSaisie.set(valeur);
    }
    readonly genresAdresse = Object.entries(GENRES_ADRESSE) as [GenreAdresse, string][];
    readonly formaterOctets = formaterOctets;
    readonly formaterDate = formaterDate;

    constructor() {
        this.recharger();
    }

    async recharger(): Promise<void> {
        try {
            const [sources, cockpit, audits] = await Promise.all([
                this.api.sources(),
                this.api.cockpit(),
                this.api.auditsQualite(undefined, 500)
            ]);
            this.sources.set(sources);
            this.lignesParNom.set(Object.fromEntries(cockpit.volumetrie.map(ligne => [ligne.nom, ligne.lignes])));
            const profilages: Record<string, AuditQualite> = {};
            for (const audit of audits) if (audit.genre === 'profilage' && !profilages[audit.sourceId]) profilages[audit.sourceId] = audit;
            this.dernierProfilage.set(profilages);
            if (!this.vocabulaire()) this.vocabulaire.set(await this.api.vocabulaireImportation());
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
    lignesDe(source: Source): number | undefined {
        return this.lignesParNom()[source.name];
    }
    completudeDe(source: Source): { valeur: number; date: string } | null {
        const audit = this.dernierProfilage()[source.id];
        const valeur = audit ? Number((audit.resume as Record<string, unknown>)['completudeMoyenne']) : NaN;
        return Number.isFinite(valeur) ? { valeur, date: audit.lanceLe } : null;
    }
    basculerColonnes(sourceId: string): void {
        this.colonnesDepliees.update(ensemble => {
            const copie = new Set(ensemble);
            if (copie.has(sourceId)) copie.delete(sourceId);
            else copie.add(sourceId);
            return copie;
        });
    }
    estUnCsv(source: Source): boolean {
        return ['csv', 'txt', 'tsv'].includes(source.type) && !!source.fichier;
    }
    configDe(source: Source): Required<OptionsLectureCsv> {
        const config = (source.config || {}) as OptionsLectureCsv;
        return { delim: config.delim || '', enc: config.enc || 'UTF-8', quote: config.quote || '', ignoreErrors: !!config.ignoreErrors };
    }
    separateurs(): [string, string][] {
        return Object.entries(this.vocabulaire()?.separateurs || { '': 'automatique' });
    }
    encodages(): [string, string][] {
        return Object.entries(this.vocabulaire()?.encodages || { 'UTF-8': 'UTF-8' });
    }

    /** Le domaine (groupe de sources) est une métadonnée : on réenregistre le document de la source. */
    async changerDomaine(source: Source, domaine: string): Promise<void> {
        try {
            const { id, ...document } = source;
            await this.api.enregistrerSource(id, { ...document, theme: domaine.trim() });
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
    /** Relit le fichier avec un paramètre changé ; les tables conçues et préparations dépendantes suivent. */
    async relire(source: Source, changement: OptionsLectureCsv): Promise<void> {
        this.relectureEnCours.set(source.id);
        try {
            const resultat = await this.api.relireSource(source.id, { ...this.configDe(source), ...changement });
            await this.terminerImport(resultat, 'relue');
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.relectureEnCours.set('');
        }
    }
    ouvrirObjetMetier(source: Source): void {
        void this.router.navigate(['/objets-metier'], { queryParams: { source: source.name } });
    }
    colonnesDe(sourceId: string | undefined): string[] {
        return this.sources().find(source => source.id === sourceId)?.headers || [];
    }

    // ---- dépôt et mise à jour ----
    async deposer(evenement: Event): Promise<void> {
        const champ = evenement.target as HTMLInputElement;
        const fichiers = Array.from(champ.files || []);
        champ.value = '';
        for (const fichier of fichiers) {
            if ((fichier.name.split('.').pop() || '').toLowerCase() === 'zip') await this.deposerLivraison(fichier);
            else await this.deposerUnFichier(fichier);
        }
        await this.recharger();
    }
    async mettreAJour(evenement: Event, source: Source): Promise<void> {
        const champ = evenement.target as HTMLInputElement;
        const fichier = champ.files?.[0];
        champ.value = '';
        if (!fichier) return;
        await this.deposerUnFichier(fichier, source);
        await this.recharger();
    }

    /** Dépose un fichier sur le serveur avec progression ; rend le nom sous lequel il est déposé. */
    private async televerser(fichier: File, nomServeur: string, depot: Depot): Promise<void> {
        const mettreAJour = (changements: Partial<Depot>) =>
            this.depots.update(liste => liste.map(candidat => (candidat === depot ? Object.assign(candidat, changements) : candidat)));
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
    }

    /** Crée une source depuis un fichier, ou met à jour `existante` (même identifiant). */
    private async deposerUnFichier(fichier: File, existante?: Source): Promise<void> {
        const extension = (fichier.name.split('.').pop() || '').toLowerCase();
        if (!EXTENSIONS_ACCEPTEES.includes(extension) || extension === 'zip') {
            this.notifications.erreur(
                `« ${fichier.name} » : format .${extension} non pris en charge (formats : ${EXTENSIONS_ACCEPTEES.join(', ')}).`
            );
            return;
        }
        if (!existante && this.sources().some(source => source.name === fichier.name)) {
            this.notifications.erreur(
                `Une source nommée « ${fichier.name} » existe déjà : utilisez « Mettre à jour » sur cette source, ou renommez le fichier.`
            );
            return;
        }
        const nomServeur = existante ? `maj_${existante.id}_${Date.now().toString(36)}` : 'src_' + genererIdentifiant('tb_');
        const depot: Depot = {
            nom: fichier.name,
            progression: 0,
            etape: existante ? `mise à jour de « ${existante.name} »` : 'dépôt sur le serveur'
        };
        this.depots.update(liste => [...liste, depot]);
        try {
            await this.televerser(fichier, nomServeur, depot);
            const feuille = extension === 'xlsx' ? await this.choisirFeuille(nomServeur) : undefined;
            const resultat = await this.api.importerFichier(
                { nomServeur, nomFichier: fichier.name, taille: fichier.size, modifieLe: fichier.lastModified, feuille },
                existante?.id
            );
            await this.terminerImport(resultat, existante ? 'mise à jour' : 'chargée');
        } catch (erreur) {
            this.notifications.erreur(`« ${fichier.name} » : ${(erreur as Error).message}`);
        } finally {
            this.depots.update(liste => liste.filter(candidat => candidat !== depot));
        }
    }

    /** Un classeur à plusieurs feuilles : l'utilisateur choisit l'onglet (la première feuille par défaut). */
    private async choisirFeuille(nomServeur: string): Promise<string | undefined> {
        const feuilles = await this.api.feuillesExcel(nomServeur);
        if (feuilles.length <= 1) return feuilles[0];
        const reponse = prompt(
            `Quelle feuille du classeur charger ?\n${feuilles.map((feuille, index) => `${index + 1}. ${feuille}`).join('\n')}`,
            '1'
        );
        const index = Number(reponse) - 1;
        return feuilles[Number.isInteger(index) && index >= 0 && index < feuilles.length ? index : 0];
    }

    /** Après un import : message, alerte sur les colonnes disparues (avec impact), reconstruction des dépendances. */
    private async terminerImport(resultat: ResultatImport, verbe: string): Promise<void> {
        const source = resultat.source;
        const differentiel = resultat.differentiel
            ? ` — différentiel : +${resultat.differentiel.ajoutees} ajoutée(s), −${resultat.differentiel.disparues} disparue(s)${resultat.differentiel.modifiees !== null ? `, ${resultat.differentiel.modifiees} modifiée(s)` : ''}`
            : '';
        this.notifications.succes(
            `« ${source.name} » ${verbe} : ${resultat.lignes} ligne(s), ${source.headers.length} colonne(s)${differentiel}.`
        );
        for (const colonne of resultat.colonnesDisparues) await this.signalerColonneDisparue(source.name, colonne);
        await this.reconstruireTablesConcuesDependantes(source.name);
        await this.rejouerPreparations(source.name);
    }
    private async signalerColonneDisparue(nomSource: string, colonne: string): Promise<void> {
        try {
            const impact = await this.api.analyseImpact(nomSource, colonne);
            const touches = [...impact.direct, ...impact.viaLineage, ...impact.viaRelations].map(actif => actif.name);
            const detail = touches.length
                ? ` — ${touches.length} actif(s) dépendant(s) : ${[...new Set(touches)].slice(0, 5).join(' · ')}`
                : '';
            this.notifications.erreur(`La colonne « ${colonne} » a disparu de « ${nomSource} » à la mise à jour${detail}.`);
        } catch {
            this.notifications.erreur(`La colonne « ${colonne} » a disparu de « ${nomSource} » à la mise à jour.`);
        }
    }

    /** Les tables conçues qui s'appuient sur cette source sont reconstruites sur son nouveau contenu. */
    private async reconstruireTablesConcuesDependantes(nomSource: string): Promise<void> {
        try {
            const resultat = await this.api.reconstruireTablesDependantes(nomSource);
            if (resultat.reconstruites.length)
                this.notifications.succes(`Table(s) conçue(s) reconstruite(s) : ${resultat.reconstruites.join(', ')}.`);
            for (const echec of resultat.erreurs) this.notifications.erreur(`Table conçue « ${echec.table} » : ${echec.erreur}`);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
    /** Les préparations attachées à cette source sont rejouées : leurs tables propres suivent le nouveau contenu. */
    private async rejouerPreparations(nomSource: string): Promise<void> {
        try {
            const resultat = await this.api.executerPreparationsPourSource(nomSource);
            if (resultat.executees.length) this.notifications.succes(`Préparation(s) rejouée(s) : ${resultat.executees.join(', ')}.`);
            for (const echec of resultat.erreurs) this.notifications.erreur(`Préparation « ${echec.preparation} » : ${echec.erreur}`);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    // ---- livraison ZIP ----
    private async deposerLivraison(fichier: File): Promise<void> {
        const nomServeur = `livraison_${Date.now().toString(36)}.zip`;
        const depot: Depot = { nom: fichier.name, progression: 0, etape: 'dépôt de la livraison' };
        this.depots.update(liste => [...liste, depot]);
        try {
            await this.televerser(fichier, nomServeur, depot);
            const entrees = await this.api.inventaireZip(nomServeur);
            if (!entrees.length) {
                this.notifications.erreur(`« ${fichier.name} » : aucun fichier de données dans cette archive.`);
                return;
            }
            this.livraison$.set({
                nomServeur,
                nomArchive: fichier.name,
                entrees: entrees.map(entree => ({ ...entree, action: entree.sourceExistante ? 'mettreAJour' : 'importer' }))
            });
            this.notifications.succes(
                `« ${fichier.name} » : ${entrees.length} fichier(s) — vérifiez les actions puis importez la livraison.`
            );
        } catch (erreur) {
            this.notifications.erreur(`« ${fichier.name} » : ${(erreur as Error).message}`);
        } finally {
            this.depots.update(liste => liste.filter(candidat => candidat !== depot));
        }
    }
    async importerLivraison(): Promise<void> {
        const livraison = this.livraison$();
        if (!livraison) return;
        this.enCours.set(true);
        try {
            const bilan = await this.api.importerZip(
                livraison.nomServeur,
                livraison.entrees.map(entree => ({ nom: entree.nom, action: entree.action }))
            );
            this.notifications.succes(
                `Livraison « ${livraison.nomArchive} » : ${bilan.importees.length} import(s), ${bilan.misesAJour.length} mise(s) à jour, ${bilan.ignorees.length} ignoré(s).`
            );
            for (const echec of bilan.erreurs) this.notifications.erreur(`${echec.nom} : ${echec.erreur}`);
            this.livraison$.set(null);
            for (const nom of [...bilan.importees, ...bilan.misesAJour]) {
                await this.reconstruireTablesConcuesDependantes(nom);
                await this.rejouerPreparations(nom);
            }
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    // ---- fusion ----
    ouvrirFusion(): void {
        this.fusion$.set({ nom: '', fichiers: [], sourceIds: [], retirerOrigines: false });
    }
    choisirFichiersFusion(evenement: Event): void {
        const champ = evenement.target as HTMLInputElement;
        const fichiers = Array.from(champ.files || []);
        champ.value = '';
        this.fusion$.update(fusion => (fusion ? { ...fusion, fichiers: [...fusion.fichiers, ...fichiers] } : fusion));
    }
    basculerSourceFusion(sourceId: string): void {
        this.fusion$.update(fusion =>
            fusion
                ? {
                      ...fusion,
                      sourceIds: fusion.sourceIds.includes(sourceId)
                          ? fusion.sourceIds.filter(candidat => candidat !== sourceId)
                          : [...fusion.sourceIds, sourceId]
                  }
                : fusion
        );
    }
    async fusionner(): Promise<void> {
        const fusion = this.fusion$();
        if (!fusion) return;
        this.enCours.set(true);
        const depot: Depot = { nom: fusion.nom, progression: 0, etape: 'dépôt des fichiers à fusionner' };
        this.depots.update(liste => [...liste, depot]);
        try {
            const fichiers = [];
            for (const [index, fichier] of fusion.fichiers.entries()) {
                const nomServeur = `fusion_${Date.now().toString(36)}_${index}`;
                await this.televerser(fichier, nomServeur, depot);
                fichiers.push({ nomServeur, nomFichier: fichier.name, taille: fichier.size, modifieLe: fichier.lastModified });
            }
            const resultat = await this.api.fusionnerSources({
                nom: fusion.nom,
                fichiers,
                sourceIds: fusion.sourceIds,
                retirerOrigines: fusion.retirerOrigines
            });
            this.fusion$.set(null);
            await this.terminerImport(resultat, 'créée par fusion');
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.depots.update(liste => liste.filter(candidat => candidat !== depot));
            this.enCours.set(false);
        }
    }

    // ---- import par adresse ----
    ouvrirAdresse(): void {
        this.adresse$.set(ADRESSE_VIDE());
    }
    /** Relance l'import d'une source créée par adresse (mêmes paramètres, mise à jour avec différentiel). */
    relancerAdresse(source: Source): void {
        const memoire = (source.adresse || {}) as Partial<ParametresAdresse>;
        this.adresse$.set({ ...ADRESSE_VIDE(), ...memoire, sourceId: source.id, adresse: memoire.adresse || '' });
    }
    async importerAdresse(): Promise<void> {
        const adresse = this.adresse$();
        if (!adresse) return;
        this.enCours.set(true);
        try {
            const parametres: ParametresAdresse = { ...adresse };
            if (!parametres.sourceId) delete parametres.sourceId;
            const resultat = await this.api.importerDepuisAdresse(parametres);
            this.adresse$.set(null);
            await this.terminerImport(resultat, adresse.sourceId ? 'mise à jour depuis son adresse' : 'importée depuis son adresse');
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    // ---- aperçu, optimisation, suppression ----
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
