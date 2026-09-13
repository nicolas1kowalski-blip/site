/**
 * Les trois assistants de colonnes avancées de l'écran Extraction, repris tels quels de l'application classique :
 *
 *   Σ  Synthèse d'une table liée — compter les lignes, compter les valeurs uniques, transposer en texte ou en
 *      colonnes. Une ligne de la table de départ reste une ligne : jamais de multiplication.
 *   🌳 Hiérarchie aplatie — colonnes niveau 1…N, dans la même table ou via une table de liaison datée.
 *   ƒx Colonne calculée — façon tableur : CONCATENER, GAUCHE, DROITE, STXT, NBCAR, SI. L'assistant écrit la
 *      formule ; elle reste modifiable à la main ensuite, dans le tableau des colonnes.
 *
 * Chaque assistant est un dépliant qui compose une colonne et l'émet ; il ne connaît pas le reste de l'écran.
 */
import { Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ColonneExtraction, ModeSynthese, Source } from '../../coeur/modeles';
import { Chemin, cheminParCle } from './chemins';
import { SelecteurColonneComponent } from './selecteur-colonne.component';

/** Fonctions de tableur proposées, avec le libellé de l'application classique. */
export const FONCTIONS_TABLEUR = {
    concat: 'CONCATENER (2 colonnes ou plus + séparateur)',
    left: 'GAUCHE (n premiers caractères)',
    right: 'DROITE (n derniers)',
    mid: 'STXT (extraire du milieu)',
    len: 'NBCAR (longueur)',
    si: 'SI (condition → valeur A sinon B)'
} as const;
export type FonctionTableur = keyof typeof FONCTIONS_TABLEUR;

/** Opérateurs du test d'un SI, avec leur libellé. */
export const OPERATEURS_SI = {
    '=': 'égal à',
    '!=': 'différent de',
    contains: 'contient',
    startsWith: 'commence par',
    '>=': 'supérieur ou égal à (nombre)',
    '<=': 'inférieur ou égal à (nombre)',
    empty: 'est vide',
    notempty: "n'est pas vide"
} as const;
export type OperateurSi = keyof typeof OPERATEURS_SI;

/** Une colonne désignée dans un assistant : sa table, son chemin et son nom. */
export type ColonneDesignee = { tableId: string; route: string; nomColonne: string };

/** Texte SQL d'une valeur : les apostrophes sont doublées. */
function litteral(valeur: string): string {
    return `'${String(valeur).replace(/'/g, "''")}'`;
}

/**
 * Référence d'une colonne dans une formule : « [colonne] » pour la table de départ, « [table.colonne] » sinon.
 * L'extension du nom de fichier est retirée, comme dans l'application classique.
 */
export function referenceFormule(colonne: ColonneDesignee, baseId: string, nomDe: (tableId: string) => string): string {
    if (colonne.tableId === baseId) return `[${colonne.nomColonne}]`;
    return `[${nomDe(colonne.tableId).replace(/\.[^.]+$/, '')}.${colonne.nomColonne}]`;
}

/** Condition SQL du test d'un SI, avec la même tolérance que les filtres (texte normalisé, nombres convertis). */
export function conditionSi(reference: string, operateur: OperateurSi, valeur: string): string {
    const texte = `CAST(${reference} AS VARCHAR)`;
    switch (operateur) {
        case '=':
            return `UPPER(TRIM(${texte})) = ${litteral(valeur.trim().toUpperCase())}`;
        case '!=':
            return `COALESCE(UPPER(TRIM(${texte})), '') <> ${litteral(valeur.trim().toUpperCase())}`;
        case 'contains':
            return `LOWER(COALESCE(${texte}, '')) LIKE '%' || ${litteral(valeur.toLowerCase())} || '%'`;
        case 'startsWith':
            return `LOWER(COALESCE(${texte}, '')) LIKE ${litteral(valeur.toLowerCase())} || '%'`;
        case '>=':
            return `TRY_CAST(REPLACE(${texte}, ',', '.') AS DOUBLE) >= ${Number(String(valeur).replace(',', '.')) || 0}`;
        case '<=':
            return `TRY_CAST(REPLACE(${texte}, ',', '.') AS DOUBLE) <= ${Number(String(valeur).replace(',', '.')) || 0}`;
        case 'empty':
            return `(${reference} IS NULL OR TRIM(${texte}) = '')`;
        case 'notempty':
            return `(${reference} IS NOT NULL AND TRIM(${texte}) <> '')`;
    }
}

/** Paramètres saisis dans l'assistant de colonne calculée. */
export type SaisieCalcul = {
    fonction: FonctionTableur;
    parties: string[];
    separateur: string;
    debut: number;
    nombre: number;
    operateur: OperateurSi;
    valeurTest: string;
    alors: string;
    sinon: string;
};

/** Traduit la saisie de l'assistant en formule, dans la syntaxe à crochets comprise par le serveur. */
export function formuleDeLaSaisie(saisie: SaisieCalcul, references: string[]): string {
    const premiere = references[0] || '';
    switch (saisie.fonction) {
        case 'concat':
            return saisie.parties.join(` || ${litteral(saisie.separateur)} || `);
        case 'left':
            return `left(CAST(${premiere} AS VARCHAR), ${saisie.nombre})`;
        case 'right':
            return `right(CAST(${premiere} AS VARCHAR), ${saisie.nombre})`;
        case 'mid':
            return `substr(CAST(${premiere} AS VARCHAR), ${saisie.debut}, ${saisie.nombre})`;
        case 'len':
            return `length(CAST(${premiere} AS VARCHAR))`;
        case 'si':
            return `CASE WHEN ${conditionSi(premiere, saisie.operateur, saisie.valeurTest)} THEN ${litteral(saisie.alors)} ELSE ${litteral(saisie.sinon)} END`;
    }
}

@Component({
    selector: 'app-assistants-colonnes',
    imports: [FormsModule, SelecteurColonneComponent],
    template: `
        <!-- Σ Synthèse d'une table liée -->
        <details class="assistant synthese">
            <summary>
                Σ Synthèse d'une table liée
                <span class="discret">— compter les lignes, compter les valeurs uniques, transposer en texte ou en colonnes</span>
            </summary>
            <div class="corps-assistant">
                <div class="champ-guide">
                    <label class="etiquette">Table liée</label>
                    <div class="ligne-champs">
                        <app-selecteur-colonne
                            identifiant="synthese"
                            [sources]="sources()"
                            [chemins]="cheminsLies()"
                            [avecColonne]="false"
                            [(tableId)]="syntheseTableId"
                            [(route)]="syntheseRoute"
                        />
                    </div>
                </div>
                <div class="champ-guide">
                    <label class="etiquette">Mode</label>
                    <select class="champ petit" [(ngModel)]="syntheseMode" name="synthese_mode">
                        @for (mode of modesSynthese(); track mode[0]) {
                            <option [value]="mode[0]">{{ mode[1] }}</option>
                        }
                    </select>
                </div>
                @if (syntheseMode() !== 'count') {
                    <div class="champ-guide">
                        <label class="etiquette">Colonne</label>
                        <select class="champ petit" [(ngModel)]="syntheseColonne" name="synthese_colonne">
                            <option value="">—</option>
                            @for (colonne of colonnesDe(syntheseTableId()); track colonne) {
                                <option [value]="colonne">{{ colonne }}</option>
                            }
                        </select>
                    </div>
                }
                @if (syntheseMode() === 'first') {
                    <div class="champ-guide">
                        <label class="etiquette">N colonnes</label>
                        <input class="champ petit court" type="number" min="1" max="12" [(ngModel)]="syntheseNombre" name="synthese_n" />
                    </div>
                }
                <div class="champ-guide">
                    <label class="etiquette">Nom en sortie</label>
                    <input class="champ petit" placeholder="auto" [(ngModel)]="syntheseAlias" name="synthese_alias" />
                </div>
                <button class="bouton petit principal" type="button" name="ajouterSynthese" (click)="ajouterSynthese()">+ Synthèse</button>
                <p class="discret note">1 ligne par ligne de la table de départ — jamais de multiplication de lignes.</p>
            </div>
        </details>

        <!-- 🌳 Hiérarchie aplatie -->
        <details class="assistant hierarchie">
            <summary>
                🌳 Hiérarchie aplatie
                <span class="discret"
                    >— colonnes niveau 1…N (dans la même table ou via une table de liaison, avec période de validité)</span
                >
            </summary>
            <div class="corps-assistant">
                <div class="champ-guide">
                    <label class="etiquette">Table hiérarchique</label>
                    <div class="ligne-champs">
                        <app-selecteur-colonne
                            identifiant="hier"
                            [sources]="sources()"
                            [chemins]="chemins()"
                            [avecColonne]="false"
                            [(tableId)]="hierTableId"
                            [(route)]="hierRoute"
                        />
                    </div>
                </div>
                <div class="champ-guide">
                    <label class="etiquette">Type</label>
                    <select class="champ petit" [(ngModel)]="hierType" name="hier_type">
                        <option value="simple">Parent dans la même table</option>
                        <option value="liaison">Via table de liaison</option>
                    </select>
                </div>
                <div class="champ-guide">
                    <label class="etiquette">Identifiant</label>
                    <select class="champ petit" [(ngModel)]="hierIdentifiant" name="hier_id">
                        @for (colonne of colonnesDe(hierTableId()); track colonne) {
                            <option [value]="colonne">{{ colonne }}</option>
                        }
                    </select>
                </div>
                @if (hierType() === 'simple') {
                    <div class="champ-guide">
                        <label class="etiquette">Parent</label>
                        <select class="champ petit" [(ngModel)]="hierParent" name="hier_parent">
                            @for (colonne of colonnesDe(hierTableId()); track colonne) {
                                <option [value]="colonne">{{ colonne }}</option>
                            }
                        </select>
                    </div>
                } @else {
                    <div class="champ-guide">
                        <label class="etiquette">Table de liaison</label>
                        <select
                            class="champ petit"
                            [ngModel]="hierLiaisonTableId()"
                            (ngModelChange)="changerTableDeLiaison($event)"
                            name="hier_ltable"
                        >
                            <option value="">—</option>
                            @for (source of sources(); track source.id) {
                                <option [value]="source.id">{{ source.name }}</option>
                            }
                        </select>
                    </div>
                    <div class="champ-guide">
                        <label class="etiquette">Enfant</label>
                        <select class="champ petit" [(ngModel)]="hierLiaisonEnfant" name="hier_lenfant">
                            @for (colonne of colonnesDe(hierLiaisonTableId()); track colonne) {
                                <option [value]="colonne">{{ colonne }}</option>
                            }
                        </select>
                    </div>
                    <div class="champ-guide">
                        <label class="etiquette">Parent</label>
                        <select class="champ petit" [(ngModel)]="hierLiaisonParent" name="hier_lparent">
                            @for (colonne of colonnesDe(hierLiaisonTableId()); track colonne) {
                                <option [value]="colonne">{{ colonne }}</option>
                            }
                        </select>
                    </div>
                    <div class="champ-guide">
                        <label class="etiquette">Valide du</label>
                        <select class="champ petit" [(ngModel)]="hierValideDu" name="hier_du">
                            <option value="">— non utilisé —</option>
                            @for (colonne of colonnesDe(hierLiaisonTableId()); track colonne) {
                                <option [value]="colonne">{{ colonne }}</option>
                            }
                        </select>
                    </div>
                    <div class="champ-guide">
                        <label class="etiquette">Valide au</label>
                        <select class="champ petit" [(ngModel)]="hierValideAu" name="hier_au">
                            <option value="">— non utilisé —</option>
                            @for (colonne of colonnesDe(hierLiaisonTableId()); track colonne) {
                                <option [value]="colonne">{{ colonne }}</option>
                            }
                        </select>
                    </div>
                    <div class="champ-guide">
                        <label class="etiquette">Date de réf.</label>
                        <input class="champ petit" type="date" [(ngModel)]="hierDateReference" name="hier_date" />
                    </div>
                }
                <div class="champ-guide large">
                    <label class="etiquette" title="Colonnes de la table hiérarchique à restituer par niveau (ex. code ET libellé).">
                        Attributs à extraire par niveau (1 ou plusieurs)
                    </label>
                    <div class="ligne-champs">
                        <select class="champ petit" [(ngModel)]="hierAttributChoisi" name="hier_attr">
                            <option value="">— l'identifiant —</option>
                            @for (colonne of colonnesDe(hierTableId()); track colonne) {
                                <option [value]="colonne">{{ colonne }}</option>
                            }
                        </select>
                        <button class="bouton petit" type="button" (click)="ajouterAttribut()">➕ ajouter l'attribut</button>
                        @for (attribut of hierAttributs(); track $index; let index = $index) {
                            <span class="badge neutre">
                                {{ attribut }}
                                <button class="lien-retirer" type="button" (click)="retirerAttribut(index)">✕</button>
                            </span>
                        }
                    </div>
                </div>
                <div class="champ-guide">
                    <label class="etiquette">Profondeur</label>
                    <input class="champ petit court" type="number" min="1" max="20" [(ngModel)]="hierProfondeur" name="hier_prof" />
                </div>
                <div class="champ-guide">
                    <label class="etiquette">Préfixe en sortie</label>
                    <input class="champ petit" placeholder="auto" [(ngModel)]="hierAlias" name="hier_alias" />
                </div>
                <button class="bouton petit principal" type="button" name="ajouterHierarchie" (click)="ajouterHierarchie()">
                    + Hiérarchie
                </button>
            </div>
        </details>

        <!-- ƒx Colonne calculée -->
        <details class="assistant calcul">
            <summary>
                ƒx Colonne calculée
                <span class="discret">— façon tableur (CONCATENER, GAUCHE, DROITE, STXT, NBCAR, SI)</span>
            </summary>
            <div class="corps-assistant">
                <div class="champ-guide">
                    <label class="etiquette">Fonction</label>
                    <select class="champ petit" [(ngModel)]="calculFonction" name="calc_fn">
                        @for (fonction of fonctions; track fonction[0]) {
                            <option [value]="fonction[0]">{{ fonction[1] }}</option>
                        }
                    </select>
                </div>
                <div class="champ-guide large">
                    <label class="etiquette">Colonne source</label>
                    <div class="ligne-champs">
                        <app-selecteur-colonne
                            identifiant="calc"
                            [sources]="sources()"
                            [chemins]="chemins()"
                            [(tableId)]="calculTableId"
                            [(route)]="calculRoute"
                            [(nomColonne)]="calculColonne"
                        />
                    </div>
                </div>
                @if (calculFonction() === 'concat') {
                    <div class="champ-guide large">
                        <label class="etiquette"
                            >Colonnes à concaténer (choisissez « Colonne source » puis ➕, dans l'ordre — 2 ou plus)</label
                        >
                        <div class="ligne-champs">
                            <button class="bouton petit" type="button" (click)="ajouterPartie()">➕ ajouter cette colonne</button>
                            @if (!calculParties().length) {
                                <span class="discret">Empilez au moins 2 colonnes (dans l'ordre).</span>
                            }
                            @for (partie of calculParties(); track $index; let index = $index) {
                                <span class="badge neutre">
                                    {{ partie.libelle }}
                                    <button class="lien-retirer" type="button" (click)="retirerPartie(index)">✕</button>
                                </span>
                            }
                        </div>
                    </div>
                    <div class="champ-guide">
                        <label class="etiquette">Séparateur</label>
                        <input class="champ petit court" [(ngModel)]="calculSeparateur" name="calc_sep" />
                    </div>
                }
                @if (calculFonction() === 'mid') {
                    <div class="champ-guide">
                        <label class="etiquette">Début</label>
                        <input class="champ petit court" type="number" min="1" [(ngModel)]="calculDebut" name="calc_debut" />
                    </div>
                }
                @if (calculFonction() === 'left' || calculFonction() === 'right' || calculFonction() === 'mid') {
                    <div class="champ-guide">
                        <label class="etiquette">N caractères</label>
                        <input class="champ petit court" type="number" min="1" [(ngModel)]="calculNombre" name="calc_n" />
                    </div>
                }
                @if (calculFonction() === 'si') {
                    <div class="champ-guide">
                        <label class="etiquette">Opérateur</label>
                        <select class="champ petit" [(ngModel)]="calculOperateur" name="calc_op">
                            @for (operateur of operateursSi; track operateur[0]) {
                                <option [value]="operateur[0]">{{ operateur[1] }}</option>
                            }
                        </select>
                    </div>
                    <div class="champ-guide">
                        <label class="etiquette">Valeur test</label>
                        <input class="champ petit" [(ngModel)]="calculValeurTest" name="calc_test" />
                    </div>
                    <div class="champ-guide">
                        <label class="etiquette">Alors</label>
                        <input class="champ petit court" [(ngModel)]="calculAlors" name="calc_alors" />
                    </div>
                    <div class="champ-guide">
                        <label class="etiquette">Sinon</label>
                        <input class="champ petit court" [(ngModel)]="calculSinon" name="calc_sinon" />
                    </div>
                }
                <div class="champ-guide">
                    <label class="etiquette">Nom en sortie</label>
                    <input class="champ petit" placeholder="auto" [(ngModel)]="calculAlias" name="calc_alias" />
                </div>
                <button class="bouton petit principal" type="button" name="ajouterCalcul" (click)="ajouterCalcul()">
                    + Colonne calculée
                </button>
                <p class="discret note">
                    Aperçu de la formule : <code>{{ apercuFormule() }}</code>
                </p>
            </div>
        </details>
    `,
    styles: `
        .assistant {
            border: 1px solid var(--bordure);
            border-radius: 8px;
            margin-top: 8px;
            background: var(--surface-2);
        }
        .assistant > summary {
            cursor: pointer;
            padding: 7px 10px;
            font-weight: 700;
            font-size: 12px;
        }
        .assistant.synthese > summary {
            color: var(--accent);
        }
        .assistant.hierarchie > summary {
            color: var(--violet, #7c3aed);
        }
        .assistant.calcul > summary {
            color: var(--alerte);
        }
        .corps-assistant {
            display: flex;
            flex-wrap: wrap;
            align-items: flex-end;
            gap: 8px;
            padding: 4px 10px 10px;
        }
        .champ-guide {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        .champ-guide.large {
            flex-basis: 100%;
        }
        .ligne-champs {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            align-items: center;
        }
        .etiquette {
            font-size: 9px;
            text-transform: uppercase;
            font-weight: 700;
            color: var(--texte-2);
        }
        .champ.petit {
            padding: 4px 6px;
            font-size: 12px;
        }
        .champ.petit.court {
            width: 74px;
        }
        .note {
            flex-basis: 100%;
            margin: 0;
            font-size: 11px;
        }
        .lien-retirer {
            border: 0;
            background: none;
            cursor: pointer;
            color: inherit;
            padding: 0 0 0 4px;
        }
    `
})
export class AssistantsColonnesComponent {
    readonly sources = input.required<Source[]>();
    /** Chemins vers chaque table atteignable, table de départ comprise. */
    readonly chemins = input.required<Map<string, Chemin[]>>();
    readonly baseId = input.required<string>();
    readonly modesSynthese = input.required<[ModeSynthese, string][]>();
    /** La colonne composée par l'assistant, prête à être ajoutée au tableau des colonnes en sortie. */
    readonly ajouter = output<ColonneExtraction>();

    readonly fonctions = Object.entries(FONCTIONS_TABLEUR) as [FonctionTableur, string][];
    readonly operateursSi = Object.entries(OPERATEURS_SI) as [OperateurSi, string][];

    // ---- synthèse ----
    readonly syntheseTableId = signal('');
    readonly syntheseRoute = signal('');
    readonly syntheseMode = signal<ModeSynthese>('count');
    readonly syntheseColonne = signal('');
    readonly syntheseNombre = signal(3);
    readonly syntheseAlias = signal('');
    /** Une synthèse résume une table qui n'est pas la table de départ : celle-ci n'est donc pas proposée. */
    readonly cheminsLies = computed(() => {
        const lies = new Map<string, Chemin[]>();
        for (const [tableId, chemins] of this.chemins()) if (tableId !== this.baseId()) lies.set(tableId, chemins);
        return lies;
    });

    // ---- hiérarchie ----
    readonly hierTableId = signal('');
    readonly hierRoute = signal('');
    readonly hierType = signal<'simple' | 'liaison'>('simple');
    readonly hierIdentifiant = signal('');
    readonly hierParent = signal('');
    readonly hierLiaisonTableId = signal('');
    readonly hierLiaisonEnfant = signal('');
    readonly hierLiaisonParent = signal('');
    readonly hierValideDu = signal('');
    readonly hierValideAu = signal('');
    readonly hierDateReference = signal('');
    readonly hierAttributChoisi = signal('');
    readonly hierAttributs = signal<string[]>([]);
    readonly hierProfondeur = signal(5);
    readonly hierAlias = signal('');

    // ---- colonne calculée ----
    readonly calculFonction = signal<FonctionTableur>('concat');
    readonly calculTableId = signal('');
    readonly calculRoute = signal('');
    readonly calculColonne = signal('');
    readonly calculParties = signal<{ libelle: string; reference: string }[]>([]);
    readonly calculSeparateur = signal(' ');
    readonly calculDebut = signal(1);
    readonly calculNombre = signal(3);
    readonly calculOperateur = signal<OperateurSi>('=');
    readonly calculValeurTest = signal('');
    readonly calculAlors = signal('OUI');
    readonly calculSinon = signal('NON');
    readonly calculAlias = signal('');

    constructor() {
        // Quand la table de départ change, les trois assistants repartent de zéro sur des tables cohérentes.
        effect(() => this.reinitialiserSurLaBase(this.baseId()));
    }

    /** La hiérarchie et le calcul partent de la table de départ ; la synthèse, de la première table liée. */
    private reinitialiserSurLaBase(baseId: string): void {
        if (!baseId) return;
        const premiereLiee = [...this.cheminsLies().keys()][0] || '';
        this.hierTableId.set(baseId);
        this.hierRoute.set('');
        this.hierIdentifiant.set(this.colonnesDe(baseId)[0] || '');
        this.hierParent.set(this.colonnesDe(baseId)[0] || '');
        this.hierAttributs.set([]);
        this.calculTableId.set(baseId);
        this.calculRoute.set('');
        this.calculColonne.set(this.colonnesDe(baseId)[0] || '');
        this.calculParties.set([]);
        this.syntheseTableId.set(premiereLiee);
        this.syntheseRoute.set('');
        this.syntheseColonne.set('');
    }

    nomDe(tableId: string): string {
        return this.sources().find(source => source.id === tableId)?.name || tableId;
    }
    colonnesDe(tableId: string): string[] {
        return this.sources().find(source => source.id === tableId)?.headers || [];
    }

    // ---- synthèse : ajout ----
    ajouterSynthese(): void {
        const chemins = this.chemins().get(this.syntheseTableId()) || [];
        const chemin = cheminParCle(chemins, this.syntheseRoute()) || chemins[0];
        const derniere = chemin?.[chemin.length - 1];
        if (!derniere) return;
        this.ajouter.emit({
            tableId: derniere.deTableId,
            route: this.routeAncrage(chemin),
            nomColonne: '',
            genre: 'synthese',
            alias: this.syntheseAlias().trim(),
            transformation: 'none',
            synthese: {
                tableId: this.syntheseTableId(),
                deTableId: derniere.deTableId,
                deRoute: this.routeAncrage(chemin),
                deColonne: derniere.deColonne,
                versColonne: derniere.versColonne,
                mode: this.syntheseMode(),
                nomColonne: this.syntheseColonne(),
                n: Number(this.syntheseNombre()) || 3
            }
        });
        this.syntheseAlias.set('');
    }
    /** La synthèse s'ancre sur l'avant-dernière étape du chemin : la table qui porte la clé. */
    private routeAncrage(chemin: Chemin): string {
        return chemin
            .slice(0, -1)
            .map(etape => etape.relationId)
            .join('>');
    }

    // ---- hiérarchie : ajout ----
    ajouterAttribut(): void {
        const attribut = this.hierAttributChoisi() || this.hierIdentifiant();
        if (attribut && !this.hierAttributs().includes(attribut)) this.hierAttributs.update(liste => [...liste, attribut]);
    }
    retirerAttribut(index: number): void {
        this.hierAttributs.update(liste => liste.filter((_, position) => position !== index));
    }
    changerTableDeLiaison(tableId: string): void {
        this.hierLiaisonTableId.set(tableId);
        const colonnes = this.colonnesDe(tableId);
        this.hierLiaisonEnfant.set(colonnes[0] || '');
        this.hierLiaisonParent.set(colonnes[1] || colonnes[0] || '');
    }
    ajouterHierarchie(): void {
        if (!this.hierIdentifiant()) return;
        this.ajouter.emit({
            tableId: this.hierTableId(),
            route: this.hierRoute(),
            nomColonne: '',
            genre: 'hierarchie',
            alias: this.hierAlias().trim(),
            transformation: 'none',
            hierarchie: {
                idColonne: this.hierIdentifiant(),
                parentColonne: this.hierType() === 'simple' ? this.hierParent() : '',
                attributs: [...this.hierAttributs()],
                profondeur: Number(this.hierProfondeur()) || 5,
                type: this.hierType(),
                liaisonTableId: this.hierLiaisonTableId(),
                liaisonEnfant: this.hierLiaisonEnfant(),
                liaisonParent: this.hierLiaisonParent(),
                valideDu: this.hierValideDu(),
                valideAu: this.hierValideAu(),
                dateReference: this.hierDateReference()
            }
        });
        this.hierAlias.set('');
    }

    // ---- colonne calculée : ajout ----
    /** La référence de la colonne actuellement choisie dans « Colonne source ». */
    private referenceCourante(): string {
        return referenceFormule(
            { tableId: this.calculTableId(), route: this.calculRoute(), nomColonne: this.calculColonne() },
            this.baseId(),
            tableId => this.nomDe(tableId)
        );
    }
    ajouterPartie(): void {
        if (!this.calculColonne()) return;
        this.calculParties.update(liste => [
            ...liste,
            { libelle: `${this.nomDe(this.calculTableId())}.${this.calculColonne()}`, reference: this.referenceCourante() }
        ]);
    }
    retirerPartie(index: number): void {
        this.calculParties.update(liste => liste.filter((_, position) => position !== index));
    }
    readonly saisieCalcul = computed<SaisieCalcul>(() => ({
        fonction: this.calculFonction(),
        parties: this.calculParties().map(partie => partie.reference),
        separateur: this.calculSeparateur(),
        debut: Number(this.calculDebut()) || 1,
        nombre: Number(this.calculNombre()) || 3,
        operateur: this.calculOperateur(),
        valeurTest: this.calculValeurTest(),
        alors: this.calculAlors(),
        sinon: this.calculSinon()
    }));
    readonly apercuFormule = computed(() =>
        formuleDeLaSaisie(
            this.saisieCalcul(),
            this.calculFonction() === 'concat' ? this.saisieCalcul().parties : [this.referenceCourante()]
        )
    );
    ajouterCalcul(): void {
        const formule = this.apercuFormule();
        if (!formule) return;
        this.ajouter.emit({
            tableId: this.calculTableId() || this.baseId(),
            route: this.calculRoute(),
            nomColonne: '',
            genre: 'calcul',
            formule,
            alias: this.calculAlias().trim(),
            transformation: 'none'
        });
        this.calculAlias.set('');
        this.calculParties.set([]);
    }
}
