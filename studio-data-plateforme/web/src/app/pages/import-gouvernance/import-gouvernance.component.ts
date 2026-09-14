/**
 * Remplir la gouvernance depuis un fichier — l'écran, en quatre temps (V13).
 *
 *   1 · que voulez-vous remplir ?     la cible : dictionnaire, glossaire, applications, informations…
 *   2 · votre fichier                 un modèle pré-rempli à télécharger, ou votre propre CSV ;
 *   3 · quelle colonne veut dire quoi les colonnes du fichier sont reconnues d'elles-mêmes, et corrigibles ;
 *   4 · aperçu, puis import           on voit ce qui va être écrit avant que quoi que ce soit ne le soit.
 *
 * L'import travaille sur une copie de la gouvernance chargée depuis l'API, puis ne réécrit que ce qu'il a
 * touché : un fichier de mille lignes qui n'en change que trois ne provoque que trois écritures.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';
import { Source, genererIdentifiant } from '../../coeur/modeles';
import { telechargerCsv } from '../../coeur/telechargement';
import { AideEcranComponent } from '../../composants/aide-ecran.component';
import { nombreDeValeursDeclare } from '../objets-metier/variantes-objet';
import { FichierLu, clesDuModele, lireLeCsv, modeleDAlimentation } from './fichier-import';
import {
    AReecrire,
    BilanImport,
    CIBLES_IMPORT,
    CibleImport,
    GouvernanceEnMemoire,
    appliquerLImport,
    cibleParCle,
    clesManquantes,
    correspondanceAutomatique,
    ecartsParFrequence,
    phraseDuBilan,
    valeurDuChamp
} from './import-gouvernance';

/** Combien de lignes on montre en aperçu : assez pour reconnaître son fichier, pas assez pour s'y perdre. */
const LIGNES_DAPERCU = 5;

@Component({
    selector: 'app-import-gouvernance',
    imports: [FormsModule, AideEcranComponent],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Import en masse</h1>
                <p class="discret">
                    Remplir la gouvernance depuis un fichier : définitions, glossaire, applications, usages. Rien n'est écrit avant
                    l'aperçu.
                </p>
            </div>
        </div>
        <app-aide-ecran />

        <div class="carte etape">
            <h2>1 · Que voulez-vous remplir ?</h2>
            <select class="champ" name="cible" [ngModel]="cibleChoisie()" (ngModelChange)="changerDeCible($event)">
                @for (cible of cibles; track cible.cle) {
                    <option [value]="cible.cle">{{ cible.libelle }}</option>
                }
            </select>
        </div>

        <div class="carte etape">
            <h2>2 · Votre fichier</h2>
            <!-- Le modèle porte déjà les clés internes réelles : il suffit de compléter les cases vides. -->
            <div class="conseil">
                <span aria-hidden="true">💡</span>
                <div class="espace">
                    <b>Partez du modèle pré-rempli</b> : il contient déjà
                    @if (clesDuModele()) {
                        vos <b>{{ clesDuModele() }} clé(s) interne(s)</b> et les valeurs déjà connues
                    } @else {
                        les bons en-têtes de colonnes
                    }
                    — complétez les cases vides dans votre tableur, puis réimportez le fichier tel quel : les colonnes seront reconnues
                    toutes seules.
                </div>
                <button class="bouton petit" type="button" name="telechargerModele" (click)="telechargerLeModele()">
                    📥 Télécharger le modèle
                </button>
            </div>
            <div class="ligne-champs">
                <input class="champ" type="file" name="fichier" accept=".csv,.txt" (change)="choisirLeFichier($event)" />
                @if (nomDuFichier()) {
                    <span class="badge">{{ nomDuFichier() }}</span>
                    <span class="discret">{{ fichier().lignes.length }} ligne(s), {{ fichier().colonnes.length }} colonne(s)</span>
                } @else {
                    <span class="discret">1 ligne = 1 élément à créer ou à mettre à jour.</span>
                }
            </div>
        </div>

        @if (fichier().colonnes.length) {
            <div class="carte etape">
                <h2>3 · Quelle colonne veut dire quoi ?</h2>
                @for (champ of cible().champs; track champ.champ) {
                    <div class="ligne-champs correspondance">
                        <label class="etiquette" [class.cle]="champ.cle">{{ champ.libelle }}{{ champ.cle ? ' *' : '' }}</label>
                        <select
                            class="champ"
                            [ngModel]="correspondance()[champ.champ] || ''"
                            [name]="'colonne-' + champ.champ"
                            [attr.name]="'colonne-' + champ.champ"
                            (ngModelChange)="associer(champ.champ, $event)"
                        >
                            <option value="">— ne pas importer —</option>
                            @for (colonne of fichier().colonnes; track colonne) {
                                <option [value]="colonne">{{ colonne }}</option>
                            }
                        </select>
                    </div>
                }
                <p class="discret">
                    * champs clés : ils disent de quel élément parle la ligne — mise à jour s'il existe, création sinon. Une colonne laissée
                    sur « ne pas importer » n'est jamais touchée.
                </p>
            </div>

            <div class="carte etape">
                <h2>4 · Aperçu, puis import</h2>
                <div class="defilement-x">
                    <table class="tableau">
                        <thead>
                            <tr>
                                @for (champ of champsAssocies(); track champ.champ) {
                                    <th>{{ champ.libelle }}</th>
                                }
                            </tr>
                        </thead>
                        <tbody>
                            @for (ligne of apercu(); track $index) {
                                <tr>
                                    @for (champ of champsAssocies(); track champ.champ) {
                                        <td>{{ valeur(ligne, champ.champ) || '—' }}</td>
                                    }
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>
                @if (clesAbsentes().length) {
                    <div class="badge alerte" style="margin-top: 10px">Champs clés manquants : {{ clesAbsentes().join(', ') }}</div>
                } @else if (session.peutEditer()) {
                    <button
                        class="bouton principal"
                        type="button"
                        name="importer"
                        style="margin-top: 10px"
                        [disabled]="enCours()"
                        (click)="importer()"
                    >
                        {{ enCours() ? 'Import en cours…' : '✔ Importer ' + fichier().lignes.length + ' ligne(s)' }}
                    </button>
                }

                @if (bilan(); as resultat) {
                    <div class="carte compte-rendu" [class.rien]="!resultat.crees && !resultat.misAJour">
                        <b>
                            {{ !resultat.crees && !resultat.misAJour ? '⚠️ Aucune ligne importée' : '✔ Import terminé' }} :
                            {{ phraseDuBilan(resultat) }}
                        </b>
                        @if (resultat.ecarts.length) {
                            <div class="discret" style="margin: 6px 0 4px">Détail des {{ resultat.ignores }} ligne(s) ignorée(s) :</div>
                            <ul class="puces">
                                @for (ecart of ecarts(); track ecart.motif) {
                                    <li>
                                        <b>{{ ecart.nombre }}</b> {{ ecart.motif }}
                                        @if (ecart.exemples.length) {
                                            <span class="discret">
                                                — ex : {{ ecart.exemples.join(', ') }}{{ ecart.nombre > ecart.exemples.length ? '…' : '' }}
                                            </span>
                                        }
                                    </li>
                                }
                            </ul>
                            @if (nomsExistants()) {
                                <div class="discret">
                                    <b>Objets métier existants</b> (comparez l'orthographe exacte) : {{ nomsExistants() }}
                                </div>
                            }
                        }
                    </div>
                }
            </div>
        }
    `,
    styles: `
        .carte.etape {
            margin-bottom: 14px;
        }
        .etape h2 {
            margin-top: 0;
        }
        /* Le conseil du modèle pré-rempli : posé, pas criard — on peut l'ignorer et charger son fichier. */
        .conseil {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            background: var(--accent-2);
            border-radius: var(--rayon);
            padding: 10px 12px;
            margin-bottom: 10px;
            font-size: 12px;
        }
        .correspondance {
            margin-bottom: 6px;
        }
        .correspondance .etiquette {
            flex: 0 0 260px;
            margin: 0;
        }
        /* Un champ clé se distingue : sans lui, la ligne ne désigne rien. */
        .correspondance .etiquette.cle {
            color: var(--texte);
            font-weight: 700;
        }
        .compte-rendu {
            margin-top: 12px;
            background: color-mix(in srgb, var(--succes) 8%, transparent);
        }
        .compte-rendu.rien {
            background: color-mix(in srgb, var(--alerte) 10%, transparent);
        }
        .puces {
            margin: 0 0 6px;
            padding-left: 18px;
            font-size: 12px;
        }
    `
})
export class ImportGouvernanceComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    readonly session = inject(SessionService);
    readonly cibles = CIBLES_IMPORT;
    readonly phraseDuBilan = phraseDuBilan;

    readonly cibleChoisie = signal(CIBLES_IMPORT[0].cle);
    readonly cible = computed<CibleImport>(() => cibleParCle(this.cibleChoisie()));
    readonly fichier = signal<FichierLu>({ colonnes: [], lignes: [] });
    readonly nomDuFichier = signal('');
    readonly correspondance = signal<Record<string, string>>({});
    readonly bilan = signal<BilanImport | null>(null);
    readonly enCours = signal(false);
    readonly sources = signal<Source[]>([]);
    /** La gouvernance chargée depuis l'API ; l'import travaille dessus, puis on réécrit ce qui a bougé. */
    readonly gouvernance = signal<GouvernanceEnMemoire | null>(null);

    readonly champsAssocies = computed(() => this.cible().champs.filter(champ => this.correspondance()[champ.champ]));
    readonly apercu = computed(() => this.fichier().lignes.slice(0, LIGNES_DAPERCU));
    readonly clesAbsentes = computed(() => clesManquantes(this.cible(), this.correspondance()).map(champ => champ.libelle));
    readonly ecarts = computed(() => (this.bilan() ? ecartsParFrequence(this.bilan() as BilanImport) : []));
    readonly clesDuModele = computed(() => {
        const gouvernance = this.gouvernance();
        return gouvernance ? clesDuModele(modeleDAlimentation(this.cible(), gouvernance, this.sources())) : 0;
    });

    constructor() {
        void this.recharger();
    }

    /** Charge la gouvernance et les sources : c'est le point de départ de tout import. */
    async recharger(): Promise<void> {
        try {
            const [dictionnaire, glossaire, actifs, objets, sources] = await Promise.all([
                this.api.dictionnaire(),
                this.api.glossaire(),
                this.api.actifs(),
                this.api.objetsMetier(),
                this.api.sources()
            ]);
            this.gouvernance.set({ dictionnaire, glossaire, actifs, objets });
            this.sources.set(sources);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    /** Changer de cible garde le fichier chargé : les colonnes se reposent sur les champs de la nouvelle. */
    changerDeCible(cle: string): void {
        this.cibleChoisie.set(cle);
        this.bilan.set(null);
        this.correspondance.set(correspondanceAutomatique(this.cible(), this.fichier().colonnes));
    }

    /** Le modèle pré-rempli de la cible courante, à compléter dans un tableur. */
    telechargerLeModele(): void {
        const gouvernance = this.gouvernance();
        if (!gouvernance) return;
        const modele = modeleDAlimentation(this.cible(), gouvernance, this.sources());
        telechargerCsv(`modele-${this.cible().cle}.csv`, modele.colonnes, modele.lignes);
    }

    async choisirLeFichier(evenement: Event): Promise<void> {
        const choisi = (evenement.target as HTMLInputElement).files?.[0];
        if (!choisi) return;
        this.nomDuFichier.set(choisi.name);
        this.bilan.set(null);
        const contenu = lireLeCsv(await choisi.text());
        this.fichier.set(contenu);
        this.correspondance.set(correspondanceAutomatique(this.cible(), contenu.colonnes));
        if (!contenu.lignes.length) this.notifications.erreur('Ce fichier ne contient aucune ligne à importer.');
    }

    associer(champ: string, colonne: string): void {
        this.correspondance.update(courante => ({ ...courante, [champ]: colonne }));
        this.bilan.set(null);
    }

    valeur(ligne: Record<string, string>, champ: string): string {
        return valeurDuChamp(ligne, this.correspondance(), champ);
    }

    /** Les objets existants, nommés : c'est ce qui permet de repérer un écart d'orthographe d'un coup d'œil. */
    nomsExistants(): string {
        if (!this.ecarts().some(ecart => /Objet métier introuvable/.test(ecart.motif))) return '';
        return (this.gouvernance()?.objets || []).map(objet => objet.name).join(', ');
    }

    /** Fusionne le fichier dans la gouvernance, puis réécrit seulement ce qui a changé. */
    async importer(): Promise<void> {
        const gouvernance = this.gouvernance();
        if (!gouvernance) return;
        this.enCours.set(true);
        try {
            const resultat = appliquerLImport(gouvernance, this.cible(), this.fichier().lignes, this.correspondance(), {
                identifiant: genererIdentifiant,
                comprendreLeNombreDeValeurs: nombreDeValeursDeclare
            });
            await this.enregistrerCeQuiABouge(gouvernance, resultat.reecriture);
            this.bilan.set(resultat.bilan);
            this.notifications.succes(`Import de la gouvernance : ${phraseDuBilan(resultat.bilan)}`);
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    /** Réécrit uniquement les éléments touchés par l'import, chacun par la route qui le concerne. */
    private async enregistrerCeQuiABouge(gouvernance: GouvernanceEnMemoire, reecriture: AReecrire): Promise<void> {
        for (const table of reecriture.dictionnaire) await this.api.enregistrerFiche(table, gouvernance.dictionnaire[table]);
        for (const identifiant of reecriture.glossaire) {
            const terme = gouvernance.glossaire.find(candidat => candidat.id === identifiant);
            if (terme) await this.api.enregistrerTerme(identifiant, terme);
        }
        for (const identifiant of reecriture.actifs) {
            const actif = gouvernance.actifs.find(candidat => candidat.id === identifiant);
            if (actif) await this.api.enregistrerActif(identifiant, actif);
        }
        for (const identifiant of reecriture.objets) {
            const objet = gouvernance.objets.find(candidat => candidat.id === identifiant);
            if (objet) await this.api.enregistrerObjetMetier(identifiant, objet);
        }
    }
}
