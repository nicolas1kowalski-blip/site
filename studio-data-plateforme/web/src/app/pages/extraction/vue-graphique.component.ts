/**
 * La vue graphique de l'extraction — reprise de la V13 de l'application classique.
 *
 * On choisit ses colonnes **sur le schéma des liens** plutôt que dans des menus : une case par table atteinte
 * par un chemin précis, ses colonnes à cocher, et le chemin se renseigne tout seul. Une table reliée de
 * plusieurs façons apparaît une fois par lien — c'est là que cette vue est irremplaçable : on coche sur la
 * bonne case, sans avoir à désigner le lien dans une liste.
 *
 * Sous une colonne cochée : son nom en sortie et sa transformation. À droite de chaque colonne : ⛃ pour la
 * filtrer. En pied de case : tout / rien, « Σ compter » (combien de lignes liées par ce chemin) et
 * « ⭐ départ » (repartir de cette table). Les cases se déplacent par leur en-tête.
 *
 * L'écran déclaratif reste la référence : cette vue écrit dans la même spécification, et les deux restent
 * synchronisés. Les règles de disposition sont dans ./cases-extraction.ts, testées à part.
 */
import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ColonneExtraction, FiltreExtraction, OperateurFiltre, Transformation } from '../../coeur/modeles';
import { CaseExtraction, LARGEUR_CASE, casesVisibles, colonnesVisibles, flecheEntreCases, rangerLesCases } from './cases-extraction';

/** Hauteurs du dessin d'une case, reprises du classique : en-tête, ligne de colonne, ligne dépliée, pied. */
const HAUTEUR_ENTETE = 30;
const HAUTEUR_VIA = 16;
const HAUTEUR_LIGNE = 19;
const HAUTEUR_REGLAGE = 21;
const HAUTEUR_FILTRE = 23;
const HAUTEUR_PIED = 30;
/** Au-delà, la liste des colonnes défile dans la case au lieu de l'étirer sans fin. */
const HAUTEUR_COLONNES_MAXIMUM = 190;

@Component({
    selector: 'app-vue-graphique-extraction',
    imports: [FormsModule],
    template: `
        <div class="barre-graphique">
            <span class="discret">🔎 Filtrer</span>
            <input
                class="champ"
                style="width: 220px"
                name="filtreGraphique"
                placeholder="nom de colonne ou de table…"
                [(ngModel)]="recherche"
            />
            <label class="case">
                <input type="checkbox" name="choisiesSeulement" [(ngModel)]="choisiesSeulement" /> colonnes choisies seulement
            </label>
            <label class="case" title="Masquer les tables qui n'ont plus aucune colonne visible (hors table de départ)">
                <input type="checkbox" name="masquerLesVides" [(ngModel)]="masquerLesVides" /> masquer les tables sans résultat
            </label>
            <label class="case" title="Sur un modèle chargé, les étiquettes se chevauchent : décochée, elles n'apparaissent qu'au survol">
                <input type="checkbox" name="etiquettesDesLiens" [(ngModel)]="etiquettesDesLiens" /> étiquettes des liens
            </label>
            @if (filtreEnCours()) {
                <button class="bouton petit" type="button" name="toutAfficher" (click)="toutAfficher()">✕ tout afficher</button>
                <span class="discret">
                    {{ casesMontrees().length }} table(s) montrée(s) — le filtre ne change que l'affichage, rien n'est décoché
                </span>
            }
        </div>

        <div class="toile" [style.height.px]="hauteurToile()" [style.width.px]="largeurToile()">
            <svg class="fleches" [attr.width]="largeurToile()" [attr.height]="hauteurToile()">
                <defs>
                    <marker id="flecheExtraction" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto">
                        <path d="M0,0 L6,3 L0,6 Z" fill="var(--texte-2)" />
                    </marker>
                </defs>
                @for (fleche of fleches(); track fleche.cle) {
                    <path
                        [attr.d]="fleche.chemin"
                        fill="none"
                        stroke="var(--texte-2)"
                        stroke-width="2"
                        opacity="0.85"
                        marker-end="url(#flecheExtraction)"
                    />
                }
            </svg>
            @for (fleche of fleches(); track fleche.cle) {
                @if (etiquettesDesLiens || survolee() === fleche.cle) {
                    <div class="etiquette-lien" [style.left.px]="fleche.milieuX" [style.top.px]="fleche.milieuY">
                        🔗 {{ fleche.libelle }}
                    </div>
                }
            }
            @for (uneCase of casesMontrees(); track uneCase.cle) {
                <div
                    class="case-table"
                    [class.depart]="!uneCase.profondeur"
                    [style.left.px]="place(uneCase).x"
                    [style.top.px]="place(uneCase).y"
                    [style.width.px]="largeurCase"
                    (mouseenter)="survolee.set(uneCase.cle)"
                    (mouseleave)="survolee.set('')"
                >
                    <div class="entete-case" (pointerdown)="prendreLaCase($event, uneCase.cle)">
                        <span>{{ uneCase.profondeur ? '🔗' : '⭐' }}</span>
                        <span class="nom-table" [title]="uneCase.nomTable">{{ uneCase.nomTable }}</span>
                        @if (nombreChoisies(uneCase)) {
                            <span class="compte">{{ nombreChoisies(uneCase) }}</span>
                        }
                    </div>
                    @if (uneCase.via) {
                        <div class="via" [title]="uneCase.via">via {{ uneCase.via }}</div>
                    }
                    <div class="colonnes-case">
                        @for (colonne of colonnesMontrees(uneCase); track colonne) {
                            <div class="ligne-colonne" [class.choisie]="estChoisie(uneCase, colonne)">
                                <input
                                    type="checkbox"
                                    [checked]="estChoisie(uneCase, colonne)"
                                    [attr.name]="'colonne-' + uneCase.cle + '-' + colonne"
                                    (change)="basculerColonne.emit({ uneCase, colonne })"
                                />
                                <span class="nom-colonne" [title]="colonne">{{ colonne }}</span>
                                <button
                                    class="bouton minuscule"
                                    type="button"
                                    title="Filtrer sur cette colonne"
                                    (click)="ajouterFiltre.emit({ uneCase, colonne })"
                                >
                                    ⛃
                                </button>
                            </div>
                            @if (choisie(uneCase, colonne); as choix) {
                                <div class="reglages">
                                    <input
                                        class="champ"
                                        placeholder="nom en sortie"
                                        title="Nom de la colonne en sortie"
                                        [ngModel]="choix.colonne.alias || ''"
                                        [attr.name]="'alias-' + uneCase.cle + '-' + colonne"
                                        (ngModelChange)="changerColonne.emit({ index: choix.index, changement: { alias: $event } })"
                                    />
                                    <select
                                        class="champ"
                                        title="Transformation"
                                        [ngModel]="choix.colonne.transformation || 'none'"
                                        [attr.name]="'transformation-' + uneCase.cle + '-' + colonne"
                                        (ngModelChange)="
                                            changerColonne.emit({ index: choix.index, changement: { transformation: $event } })
                                        "
                                    >
                                        @for (entree of transformations(); track entree[0]) {
                                            <option [value]="entree[0]">{{ entree[1] }}</option>
                                        }
                                    </select>
                                </div>
                            }
                            @for (filtre of filtresDe(uneCase, colonne); track filtre.index) {
                                <div class="filtre-colonne">
                                    <select
                                        class="champ"
                                        [ngModel]="filtre.filtre.op"
                                        [attr.name]="'op-' + uneCase.cle + '-' + colonne + '-' + filtre.index"
                                        (ngModelChange)="changerFiltre.emit({ index: filtre.index, changement: { op: $event } })"
                                    >
                                        @for (entree of operateurs(); track entree[0]) {
                                            <option [value]="entree[0]">{{ entree[1] }}</option>
                                        }
                                    </select>
                                    <!-- « vide » et « non vide » n'attendent pas de valeur : le champ disparaît. -->
                                    @if (filtre.filtre.op !== 'empty' && filtre.filtre.op !== 'notempty') {
                                        <input
                                            class="champ"
                                            placeholder="valeur"
                                            [ngModel]="filtre.filtre.valeur || ''"
                                            [attr.name]="'valeur-' + uneCase.cle + '-' + colonne + '-' + filtre.index"
                                            (ngModelChange)="changerFiltre.emit({ index: filtre.index, changement: { valeur: $event } })"
                                        />
                                    }
                                    <button
                                        class="bouton minuscule"
                                        type="button"
                                        title="Retirer ce filtre"
                                        (click)="retirerFiltre.emit(filtre.index)"
                                    >
                                        ✕
                                    </button>
                                </div>
                            }
                        } @empty {
                            <div class="ligne-colonne discret">aucune colonne ne correspond au filtre</div>
                        }
                        @if (nombreMasquees(uneCase); as masquees) {
                            <div class="ligne-colonne discret">+ {{ masquees }} colonne(s) masquée(s) par le filtre</div>
                        }
                    </div>
                    <div class="pied-case">
                        <button class="bouton minuscule" type="button" (click)="toutesLesColonnes.emit(uneCase)">tout</button>
                        <button class="bouton minuscule" type="button" (click)="aucuneColonne.emit(uneCase)">rien</button>
                        @if (uneCase.profondeur) {
                            <button
                                class="bouton minuscule"
                                type="button"
                                title="Compter les lignes liées par ce chemin (une valeur par ligne de départ)"
                                (click)="compter.emit(uneCase)"
                            >
                                Σ compter
                            </button>
                            <button
                                class="bouton minuscule"
                                type="button"
                                title="Repartir de cette table"
                                (click)="repartirDe.emit(uneCase)"
                            >
                                ⭐ départ
                            </button>
                        } @else {
                            <span class="discret">table de départ</span>
                        }
                    </div>
                </div>
            }
        </div>
    `,
    styles: `
        .barre-graphique {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
            background: var(--surface);
            border: 1px solid var(--bordure);
            border-radius: 8px;
            padding: 8px;
            margin-bottom: 10px;
        }
        .toile {
            position: relative;
            overflow: auto;
            background: var(--surface-2);
            border: 1px solid var(--bordure);
            border-radius: 8px;
            min-height: 320px;
        }
        .fleches {
            position: absolute;
            inset: 0;
            pointer-events: none;
        }
        .case-table {
            position: absolute;
            background: var(--surface);
            border: 1px solid var(--bordure);
            border-radius: 10px;
            box-shadow: var(--ombre);
            overflow: hidden;
            font-size: 12px;
        }
        .case-table.depart {
            border-color: var(--accent);
            box-shadow: 0 0 0 2px var(--accent-2);
        }
        .entete-case {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 8px;
            background: var(--surface-2);
            font-weight: 700;
            cursor: grab;
        }
        .entete-case .nom-table {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .entete-case .compte {
            background: var(--accent);
            color: #fff;
            border-radius: 999px;
            padding: 0 6px;
            font-size: 10px;
        }
        .via {
            padding: 2px 8px;
            font-size: 10px;
            color: var(--texte-2);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .colonnes-case {
            max-height: ${HAUTEUR_COLONNES_MAXIMUM}px;
            overflow: auto;
            padding: 2px 4px;
        }
        .ligne-colonne {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 1px 4px;
            border-radius: 4px;
        }
        .ligne-colonne.choisie {
            background: var(--accent-2);
        }
        .ligne-colonne .nom-colonne {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .reglages,
        .filtre-colonne {
            display: flex;
            gap: 4px;
            padding: 2px 4px 4px 22px;
        }
        .reglages .champ,
        .filtre-colonne .champ {
            font-size: 11px;
            padding: 2px 4px;
            height: auto;
        }
        .pied-case {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 4px 6px;
            border-top: 1px solid var(--bordure);
            background: var(--surface-2);
        }
        .bouton.minuscule {
            font-size: 10px;
            padding: 2px 6px;
        }
        .etiquette-lien {
            position: absolute;
            transform: translate(-50%, -50%);
            background: var(--surface);
            border: 1px solid var(--bordure);
            border-radius: 6px;
            padding: 1px 5px;
            font-size: 10px;
            white-space: nowrap;
            pointer-events: none;
        }
    `
})
export class VueGraphiqueExtractionComponent {
    readonly cases = input<CaseExtraction[]>([]);
    readonly colonnes = input<ColonneExtraction[]>([]);
    readonly filtres = input<FiltreExtraction[]>([]);
    /** Les colonnes d'une table, telles que l'écran les connaît. */
    readonly colonnesDe = input<(tableId: string) => string[]>(() => []);
    readonly transformations = input<[Transformation, string][]>([]);
    readonly operateurs = input<[OperateurFiltre, string][]>([]);

    readonly basculerColonne = output<{ uneCase: CaseExtraction; colonne: string }>();
    readonly changerColonne = output<{ index: number; changement: Partial<ColonneExtraction> }>();
    readonly ajouterFiltre = output<{ uneCase: CaseExtraction; colonne: string }>();
    readonly changerFiltre = output<{ index: number; changement: Partial<FiltreExtraction> }>();
    readonly retirerFiltre = output<number>();
    readonly toutesLesColonnes = output<CaseExtraction>();
    readonly aucuneColonne = output<CaseExtraction>();
    readonly compter = output<CaseExtraction>();
    readonly repartirDe = output<CaseExtraction>();

    readonly largeurCase = LARGEUR_CASE;
    recherche = '';
    choisiesSeulement = false;
    masquerLesVides = false;
    etiquettesDesLiens = false;
    readonly survolee = signal('');
    /** Cases déplacées à la main : propre à la session, comme dans le classique. */
    private readonly deplacees = signal<Record<string, { x: number; y: number }>>({});
    private saisie: { cle: string; x: number; y: number; depart: { x: number; y: number } } | null = null;

    filtreEnCours(): boolean {
        return !!this.recherche.trim() || this.choisiesSeulement || this.masquerLesVides;
    }

    toutAfficher(): void {
        this.recherche = '';
        this.choisiesSeulement = false;
        this.masquerLesVides = false;
    }

    /** Le filtre d'affichage tel que les fonctions pures l'attendent. */
    private filtreDAffichage() {
        return { recherche: this.recherche, choisiesSeulement: this.choisiesSeulement, masquerLesVides: this.masquerLesVides };
    }

    colonnesMontrees(uneCase: CaseExtraction): string[] {
        return colonnesVisibles(
            this.colonnesDe()(uneCase.tableId),
            this.filtreDAffichage(),
            colonne => this.estChoisie(uneCase, colonne),
            uneCase.nomTable
        );
    }

    nombreMasquees(uneCase: CaseExtraction): number {
        return this.colonnesDe()(uneCase.tableId).length - this.colonnesMontrees(uneCase).length;
    }

    /** Les cases qui restent à l'écran : une case vidée par le filtre disparaît si on l'a demandé. */
    readonly casesMontrees = computed(() => {
        // Les champs du filtre sont des champs de formulaire ordinaires, pas des signaux : la liste se
        // recalcule à chaque passage de détection, ce qui suffit ici et garde le code lisible.
        return casesVisibles(
            this.cases(),
            uneCase => !this.masquerLesVides || !uneCase.profondeur || !!this.colonnesMontrees(uneCase).length
        );
    });

    /** La hauteur d'une case : en-tête, chemin, colonnes montrées et leurs réglages, pied. */
    private hauteurDe(uneCase: CaseExtraction): number {
        const montrees = this.colonnesMontrees(uneCase);
        const choisies = montrees.filter(colonne => this.estChoisie(uneCase, colonne)).length;
        const filtres = montrees.reduce((total, colonne) => total + this.filtresDe(uneCase, colonne).length, 0);
        const colonnes = Math.min(
            HAUTEUR_COLONNES_MAXIMUM,
            6 + Math.max(1, montrees.length) * HAUTEUR_LIGNE + choisies * HAUTEUR_REGLAGE + filtres * HAUTEUR_FILTRE
        );
        return HAUTEUR_ENTETE + (uneCase.via ? HAUTEUR_VIA : 0) + colonnes + HAUTEUR_PIED;
    }

    place(uneCase: CaseExtraction): { x: number; y: number; hauteur: number } {
        const rangees = rangerLesCases(this.casesMontrees(), autre => this.hauteurDe(autre));
        const deplacee = this.deplacees()[uneCase.cle];
        const place = rangees[uneCase.cle] || { x: 0, y: 0, hauteur: 120 };
        return deplacee ? { ...place, ...deplacee } : place;
    }

    largeurToile(): number {
        const cases = this.casesMontrees();
        if (!cases.length) return 600;
        return Math.max(600, ...cases.map(uneCase => this.place(uneCase).x + LARGEUR_CASE + 24));
    }
    hauteurToile(): number {
        const cases = this.casesMontrees();
        if (!cases.length) return 320;
        return Math.max(320, ...cases.map(uneCase => this.place(uneCase).y + this.hauteurDe(uneCase) + 24));
    }

    /** Les flèches entre une case et son parent, avec l'étiquette du lien parcouru. */
    fleches(): { cle: string; chemin: string; milieuX: number; milieuY: number; libelle: string }[] {
        const montrees = new Set(this.casesMontrees().map(uneCase => uneCase.cle));
        return this.casesMontrees()
            .filter(uneCase => uneCase.profondeur && montrees.has(uneCase.cleParent))
            .map(uneCase => {
                const parent = this.casesMontrees().find(autre => autre.cle === uneCase.cleParent)!;
                const fleche = flecheEntreCases(this.place(parent), this.place(uneCase));
                return { cle: uneCase.cle, ...fleche, libelle: uneCase.libelleLien };
            });
    }

    // ---- ce qui est déjà choisi ----

    /** La colonne choisie pour cette case, et son rang dans la liste — c'est lui que l'écran modifie. */
    choisie(uneCase: CaseExtraction, colonne: string): { colonne: ColonneExtraction; index: number } | null {
        const index = this.colonnes().findIndex(
            candidate =>
                !candidate.genre &&
                candidate.tableId === uneCase.tableId &&
                candidate.route === uneCase.route &&
                candidate.nomColonne === colonne
        );
        return index < 0 ? null : { colonne: this.colonnes()[index], index };
    }
    estChoisie(uneCase: CaseExtraction, colonne: string): boolean {
        return !!this.choisie(uneCase, colonne);
    }
    nombreChoisies(uneCase: CaseExtraction): number {
        return this.colonnes().filter(
            candidate => !candidate.genre && candidate.tableId === uneCase.tableId && candidate.route === uneCase.route
        ).length;
    }
    filtresDe(uneCase: CaseExtraction, colonne: string): { filtre: FiltreExtraction; index: number }[] {
        return this.filtres()
            .map((filtre, index) => ({ filtre, index }))
            .filter(
                entree =>
                    entree.filtre.tableId === uneCase.tableId &&
                    entree.filtre.route === uneCase.route &&
                    entree.filtre.nomColonne === colonne
            );
    }

    // ---- déplacer une case ----

    prendreLaCase(evenement: PointerEvent, cle: string): void {
        evenement.preventDefault();
        const prise = this.casesMontrees().find(uneCase => uneCase.cle === cle);
        if (!prise) return;
        const place = this.place(prise);
        this.saisie = { cle, x: evenement.clientX, y: evenement.clientY, depart: { x: place.x, y: place.y } };
        const bouger = (suivant: PointerEvent) => {
            if (!this.saisie) return;
            this.deplacees.update(deplacees => ({
                ...deplacees,
                [cle]: {
                    x: this.saisie!.depart.x + suivant.clientX - this.saisie!.x,
                    y: Math.max(0, this.saisie!.depart.y + suivant.clientY - this.saisie!.y)
                }
            }));
        };
        const lacher = () => {
            this.saisie = null;
            document.removeEventListener('pointermove', bouger);
            document.removeEventListener('pointerup', lacher);
        };
        document.addEventListener('pointermove', bouger);
        document.addEventListener('pointerup', lacher);
    }
}
