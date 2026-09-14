/**
 * Filtre « dans le fichier » — la V12.3 de l'application classique, écran pour écran.
 *
 * On répond ici à la demande la plus fréquente du quotidien : « donne-moi ces données pour cette liste ».
 * On dépose un fichier (CSV, texte, tabulé, Excel) ou on colle une liste, on dit à quelle colonne elle
 * correspond, et l'extraction ne garde — ou n'exclut — que ces lignes.
 *
 * Le fichier ne devient jamais une source : ses valeurs voyagent avec la spécification, et le serveur les
 * pose dans une table éphémère de la requête. On peut en plus rapatrier ses autres colonnes dans le
 * résultat (un commentaire, une référence interne) et conserver l'ordre du fichier.
 *
 * Le bouton « Vérifier » répond à la question qu'on se pose vraiment en déposant une liste : sur mes
 * 400 SIREN, combien sont inconnus ici, et lesquels ?
 */
import { Component, computed, inject, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import {
    ComparaisonFichier,
    CorrespondanceFichier,
    FiltreFichierExtraction,
    ModeFichier,
    Source,
    TableauFichier,
    VerificationFichier
} from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { Chemin } from './chemins';
import { SelecteurColonneComponent } from './selecteur-colonne.component';

/** Lignes du fichier montrées en aperçu : assez pour reconnaître son contenu, pas assez pour encombrer. */
const LIGNES_APERCU = 5;

/** Nom comparable entre un en-tête de fichier et une colonne de table : minuscules, sans accents ni ponctuation. */
export function nomComparable(nom: string): string {
    return nom
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

/** Un filtre fichier vide, prêt à recevoir une liste. */
export function fichierVide(): FiltreFichierExtraction {
    return {
        nom: '',
        colonnes: [],
        lignes: [],
        correspondances: [],
        mode: 'garder',
        comparaison: 'tolerante',
        joindreColonnes: false,
        conserverOrdre: false
    };
}

/** Résumé d'un filtre fichier en une ligne, pour la pastille. */
export function resumeDuFichier(fichier: FiltreFichierExtraction, nomDeLaTable: (tableId: string) => string): string {
    const action = fichier.mode === 'exclure' ? 'hors de' : 'dans';
    const cibles = fichier.correspondances.map(lien => `${nomDeLaTable(lien.tableId)}.${lien.nomColonne}`).join(' + ');
    return `${cibles || 'colonne à choisir'} ${action} « ${fichier.nom || 'liste fournie'} »`;
}

@Component({
    selector: 'app-filtre-fichier',
    imports: [FormsModule, SelecteurColonneComponent],
    template: `
        @if (fichiers().length) {
            <div class="puces">
                @for (fichier of fichiers(); track $index; let index = $index) {
                    <span class="puce">
                        <span class="pictogramme">📄</span>
                        <b>{{ resume(fichier) }}</b>
                        <span class="badge neutre">{{ fichier.lignes.length }} ligne(s)</span>
                        @if (fichier.joindreColonnes) {
                            <span class="badge">colonnes jointes</span>
                        }
                        @if (fichier.conserverOrdre) {
                            <span class="badge">ordre du fichier</span>
                        }
                        <button class="bouton petit" type="button" (click)="modifier(index)">modifier</button>
                        <button class="lien-retirer" type="button" (click)="retirer(index)">✕</button>
                    </span>
                }
            </div>
        }

        @if (!ouvert()) {
            <div class="ligne-ajout">
                <button class="bouton petit" type="button" name="ouvrirFiltreFichier" (click)="ouvrir()">📄 Filtrer sur un fichier…</button>
                <span class="discret">une liste de valeurs déposée ou collée : on garde (ou on exclut) ces lignes</span>
            </div>
        } @else {
            <div class="bloc fichier">
                <div class="titre-bloc">📄 Filtrer sur une liste fournie</div>

                <!-- 1. La liste : un fichier déposé, ou un texte collé -->
                <div class="ligne-champs">
                    <label class="bouton petit principal">
                        Choisir un fichier…
                        <input type="file" hidden accept=".csv,.txt,.tsv,.xlsx" (change)="deposer($event)" />
                    </label>
                    <button class="bouton petit" type="button" name="collerFichier" (click)="collageOuvert.set(!collageOuvert())">
                        ou coller une liste
                    </button>
                    @if (edition().colonnes.length) {
                        <span class="badge">{{ edition().nom }}</span>
                        <span class="discret"> {{ edition().lignes.length }} ligne(s), {{ edition().colonnes.length }} colonne(s) </span>
                        <button class="bouton petit" type="button" name="premiereLigne" (click)="reintegrerPremiereLigne()">
                            la 1<sup>re</sup> ligne est une valeur
                        </button>
                    }
                </div>
                @if (collageOuvert()) {
                    <div class="ligne-champs haut">
                        <textarea
                            class="champ zone"
                            [(ngModel)]="texteColle"
                            name="texteColle"
                            rows="4"
                            placeholder="Collez ici vos valeurs, une par ligne (ou un tableau complet avec ses en-têtes)"
                        ></textarea>
                        <button class="bouton petit principal" type="button" name="lireColle" (click)="lireLeTexteColle()">Lire</button>
                    </div>
                }

                @if (edition().colonnes.length) {
                    <!-- Aperçu : on reconnaît son fichier d'un coup d'œil -->
                    <div class="defilement-x">
                        <table class="tableau compact">
                            <thead>
                                <tr>
                                    @for (colonne of edition().colonnes; track colonne) {
                                        <th>{{ colonne }}</th>
                                    }
                                </tr>
                            </thead>
                            <tbody>
                                @for (ligne of apercu(); track $index) {
                                    <tr>
                                        @for (cellule of ligne; track $index) {
                                            <td>{{ cellule || '—' }}</td>
                                        }
                                    </tr>
                                }
                            </tbody>
                        </table>
                    </div>

                    <!-- 2. À quoi la liste correspond -->
                    <div class="titre-bloc">À quelle colonne cette liste correspond-elle ?</div>
                    @if (edition().correspondances.length) {
                        <div class="puces">
                            @for (lien of edition().correspondances; track $index; let index = $index) {
                                <span class="puce">
                                    <b>{{ lien.colonneFichier }}</b> → {{ nomDe(lien.tableId) }}.{{ lien.nomColonne }}
                                    <button class="lien-retirer" type="button" (click)="retirerCorrespondance(index)">✕</button>
                                </span>
                            }
                        </div>
                    }
                    <div class="ligne-ajout">
                        <select class="champ petit" [(ngModel)]="colonneFichier" name="colonneFichier" title="Colonne du fichier">
                            @for (colonne of edition().colonnes; track colonne) {
                                <option [value]="colonne">{{ colonne }}</option>
                            }
                        </select>
                        <span class="discret">correspond à</span>
                        <app-selecteur-colonne
                            identifiant="cible-fichier"
                            [sources]="sources()"
                            [chemins]="chemins()"
                            [routesParDefaut]="routesParDefaut()"
                            [(tableId)]="cibleTableId"
                            [(route)]="cibleRoute"
                            [(nomColonne)]="cibleColonne"
                        />
                        <button class="bouton petit" type="button" name="ajouterCorrespondance" (click)="ajouterCorrespondance()">
                            + Correspondance
                        </button>
                    </div>

                    <!-- 3. Ce qu'on en fait -->
                    <div class="ligne-champs">
                        <select class="champ petit" [(ngModel)]="mode" name="modeFichier" title="Garder ou exclure ces lignes">
                            <option value="garder">✔ Garder ces lignes</option>
                            <option value="exclure">✖ Exclure ces lignes</option>
                        </select>
                        <select class="champ petit large" [(ngModel)]="comparaison" name="comparaisonFichier" title="Façon de comparer">
                            <option value="tolerante">Comparaison tolérante (majuscules et espaces ignorés)</option>
                            <option value="exacte">Comparaison exacte</option>
                            <option value="normalisee">Comparaison normalisée (accents, ponctuation, zéros de tête ignorés)</option>
                        </select>
                        <label class="case">
                            <input type="checkbox" [(ngModel)]="joindreColonnes" name="joindreColonnes" [disabled]="mode() === 'exclure'" />
                            ramener les colonnes du fichier
                        </label>
                        <label class="case">
                            <input type="checkbox" [(ngModel)]="conserverOrdre" name="conserverOrdre" [disabled]="mode() === 'exclure'" />
                            conserver l'ordre du fichier
                        </label>
                    </div>

                    <!-- 4. Vérification : combien de valeurs sont inconnues ? -->
                    <div class="ligne-champs">
                        <button class="bouton petit" type="button" name="verifierFichier" (click)="verifier()" [disabled]="occupe()">
                            🔎 Vérifier les valeurs
                        </button>
                        @if (verification(); as bilan) {
                            <span class="badge" [class.alerte]="bilan.manquantes > 0">
                                {{ bilan.manquantes }} valeur(s) sur {{ bilan.lignesDuFichier }} absente(s) de la table
                            </span>
                            @if (bilan.exemples.length) {
                                <span class="discret">par exemple : {{ bilan.exemples.join(', ') }}</span>
                            }
                        }
                    </div>
                }

                <div class="ligne-champs">
                    <button class="bouton petit principal" type="button" name="validerFiltreFichier" (click)="valider()">
                        {{ indexEdite() < 0 ? '+ Ajouter ce filtre' : 'Enregistrer' }}
                    </button>
                    <button class="bouton petit" type="button" name="annulerFiltreFichier" (click)="fermer()">Annuler</button>
                </div>
            </div>
        }
    `,
    styles: `
        .bloc.fichier {
            border: 1px solid var(--bord);
            border-radius: 8px;
            padding: 10px;
            margin-top: 8px;
            display: grid;
            gap: 8px;
        }
        .ligne-champs.haut {
            align-items: flex-start;
        }
        .champ.zone {
            flex: 1;
            min-width: 260px;
            font-family: inherit;
        }
        .champ.large {
            min-width: 280px;
        }
        .tableau.compact td,
        .tableau.compact th {
            padding: 2px 6px;
            font-size: 12px;
        }
    `
})
export class FiltreFichierComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);

    /** Les filtres fichier posés sur l'extraction : le composant les affiche et les modifie. */
    readonly fichiers = model<FiltreFichierExtraction[]>([]);
    /** Toutes les sources de l'espace, pour nommer les tables et lister leurs colonnes. */
    readonly sources = input.required<Source[]>();
    /** Chemins possibles vers chaque table atteignable depuis la table de départ. */
    readonly chemins = input.required<Map<string, Chemin[]>>();
    /** Lien retenu par défaut pour chaque table, décidé dans le bandeau « Quel lien utiliser ? ». */
    readonly routesParDefaut = input<Record<string, string>>({});
    /** Table de départ de l'extraction : c'est sur elle que le sélecteur de correspondance s'ouvre. */
    readonly baseId = input('');

    readonly ouvert = signal(false);
    readonly indexEdite = signal(-1);
    readonly edition = signal<FiltreFichierExtraction>(fichierVide());
    readonly collageOuvert = signal(false);
    readonly texteColle = signal('');
    readonly verification = signal<VerificationFichier | null>(null);
    readonly occupe = signal(false);

    readonly mode = signal<ModeFichier>('garder');
    readonly comparaison = signal<ComparaisonFichier>('tolerante');
    readonly joindreColonnes = signal(false);
    readonly conserverOrdre = signal(false);

    readonly colonneFichier = signal('');
    readonly cibleTableId = signal('');
    readonly cibleRoute = signal('');
    readonly cibleColonne = signal('');

    readonly apercu = computed(() => this.edition().lignes.slice(0, LIGNES_APERCU));

    nomDe(tableId: string): string {
        return this.sources().find(source => source.id === tableId)?.name || tableId;
    }
    resume(fichier: FiltreFichierExtraction): string {
        return resumeDuFichier(fichier, tableId => this.nomDe(tableId));
    }

    // ---- ouverture et fermeture de l'éditeur ----
    ouvrir(): void {
        this.reprendre(fichierVide(), -1);
    }
    modifier(index: number): void {
        const fichier = this.fichiers()[index];
        if (fichier) this.reprendre({ ...fichier }, index);
    }
    fermer(): void {
        this.ouvert.set(false);
        this.collageOuvert.set(false);
        this.texteColle.set('');
        this.verification.set(null);
    }
    retirer(index: number): void {
        this.fichiers.update(liste => liste.filter((_, position) => position !== index));
    }

    /** Recharge l'éditeur avec un filtre donné : les listes déroulantes suivent son contenu. */
    private reprendre(fichier: FiltreFichierExtraction, index: number): void {
        this.edition.set(fichier);
        this.indexEdite.set(index);
        this.mode.set(fichier.mode);
        this.comparaison.set(fichier.comparaison);
        this.joindreColonnes.set(fichier.joindreColonnes);
        this.conserverOrdre.set(fichier.conserverOrdre);
        this.colonneFichier.set(fichier.colonnes[0] || '');
        const cible = fichier.correspondances[0]?.tableId || this.baseId();
        this.cibleTableId.set(cible);
        this.cibleRoute.set(fichier.correspondances[0]?.route || this.routesParDefaut()[cible] || '');
        this.cibleColonne.set(this.sources().find(source => source.id === cible)?.headers?.[0] || '');
        this.verification.set(null);
        this.ouvert.set(true);
    }

    // ---- lecture de la liste fournie ----
    /** Le texte est lu ici, le classeur Excel est déposé puis lu par le serveur : même résultat des deux côtés. */
    async deposer(evenement: Event): Promise<void> {
        const champ = evenement.target as HTMLInputElement;
        const fichier = champ.files?.[0];
        champ.value = '';
        if (!fichier) return;
        await this.executer(async () => {
            const excel = fichier.name.toLowerCase().endsWith('.xlsx');
            if (excel) await this.deposerSurLeServeur(fichier);
            const tableau = excel
                ? await this.api.lireFichierListe({ nomServeur: nomDeDepot(fichier.name) })
                : await this.api.lireFichierListe({ texte: await fichier.text() });
            this.appliquerLeTableau(tableau, fichier.name);
        });
    }
    async lireLeTexteColle(): Promise<void> {
        if (!this.texteColle().trim()) return;
        await this.executer(async () => {
            this.appliquerLeTableau(await this.api.lireFichierListe({ texte: this.texteColle() }), 'liste collée');
        });
    }
    /** Quand la liste n'avait pas d'en-tête : la première ligne redevient une valeur. */
    reintegrerPremiereLigne(): void {
        const fichier = this.edition();
        const colonnes = fichier.colonnes.map((_, index) => (index ? `Colonne ${index + 1}` : 'Valeurs'));
        this.appliquerLeTableau({ colonnes, lignes: [fichier.colonnes.map(entete => entete.trim()), ...fichier.lignes] }, fichier.nom);
    }

    private appliquerLeTableau(tableau: TableauFichier, nom: string): void {
        if (!tableau.colonnes.length) {
            this.notifications.erreur('Cette liste est vide : aucune colonne n’a été trouvée.');
            return;
        }
        const evidente = this.correspondanceEvidente(tableau.colonnes);
        this.edition.update(fichier => ({
            ...fichier,
            nom,
            colonnes: tableau.colonnes,
            lignes: tableau.lignes,
            correspondances: evidente ? [evidente] : []
        }));
        this.colonneFichier.set(tableau.colonnes[0]);
        this.verification.set(null);
        this.collageOuvert.set(false);
        this.notifications.info(`${tableau.lignes.length} ligne(s) lue(s) dans « ${nom} ».`);
    }

    /**
     * La correspondance qui va de soi : une colonne du fichier dont le nom ressemble à une colonne de la table
     * de départ (« SIREN » et « siren », « N° client » et « n_client »). On n'en propose qu'une : c'est un
     * point de départ, pas une décision — les autres s'ajoutent à la main.
     */
    private correspondanceEvidente(colonnes: string[]): CorrespondanceFichier | null {
        const base = this.sources().find(source => source.id === this.baseId());
        if (!base) return null;
        const parNom = new Map((base.headers || []).map(entete => [nomComparable(entete), entete]));
        for (const colonne of colonnes) {
            const cible = parNom.get(nomComparable(colonne));
            if (cible) return { colonneFichier: colonne, tableId: base.id, route: '', nomColonne: cible };
        }
        return null;
    }

    private async deposerSurLeServeur(fichier: File): Promise<void> {
        await new Promise<void>((resoudre, rejeter) => {
            this.api.deposerFichier(nomDeDepot(fichier.name), fichier).subscribe({ error: rejeter, complete: resoudre });
        });
    }

    // ---- correspondances ----
    ajouterCorrespondance(): void {
        if (!this.colonneFichier() || !this.cibleColonne()) return;
        const nouvelle: CorrespondanceFichier = {
            colonneFichier: this.colonneFichier(),
            tableId: this.cibleTableId(),
            route: this.cibleRoute(),
            nomColonne: this.cibleColonne()
        };
        this.edition.update(fichier => ({ ...fichier, correspondances: [...fichier.correspondances, nouvelle] }));
        this.verification.set(null);
    }
    retirerCorrespondance(index: number): void {
        this.edition.update(fichier => ({
            ...fichier,
            correspondances: fichier.correspondances.filter((_, position) => position !== index)
        }));
        this.verification.set(null);
    }

    // ---- vérification et validation ----
    async verifier(): Promise<void> {
        const fichier = this.fichierEnCours();
        if (!fichier.correspondances.length) {
            this.notifications.erreur('Indiquez d’abord à quelle colonne cette liste correspond.');
            return;
        }
        await this.executer(async () => this.verification.set(await this.api.verifierFichierListe(fichier)));
    }
    valider(): void {
        const fichier = this.fichierEnCours();
        if (!fichier.colonnes.length) {
            this.notifications.erreur('Déposez un fichier ou collez une liste avant d’ajouter le filtre.');
            return;
        }
        if (!fichier.correspondances.length) {
            this.notifications.erreur('Indiquez à quelle colonne cette liste correspond.');
            return;
        }
        const index = this.indexEdite();
        this.fichiers.update(liste =>
            index < 0 ? [...liste, fichier] : liste.map((candidat, position) => (position === index ? fichier : candidat))
        );
        this.fermer();
    }

    /** Le filtre tel qu'il est à l'instant : le contenu lu, plus les options des listes déroulantes. */
    private fichierEnCours(): FiltreFichierExtraction {
        return {
            ...this.edition(),
            mode: this.mode(),
            comparaison: this.comparaison(),
            joindreColonnes: this.mode() === 'garder' && this.joindreColonnes(),
            conserverOrdre: this.mode() === 'garder' && this.conserverOrdre()
        };
    }

    private async executer(action: () => Promise<void>): Promise<void> {
        this.occupe.set(true);
        try {
            await action();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.occupe.set(false);
        }
    }
}

/** Nom sous lequel un classeur est déposé le temps d'être lu : préfixé, pour ne pas écraser une source. */
export function nomDeDepot(nomFichier: string): string {
    return 'liste_' + nomFichier.replace(/[^\w.-]+/g, '_');
}
