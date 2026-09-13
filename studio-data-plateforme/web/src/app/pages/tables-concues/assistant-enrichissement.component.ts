/**
 * Assistant pas à pas d'un enrichissement (repris de l'application classique) : ramener une donnée d'une autre
 * table en trois étapes — 1. où se trouve la donnée et sous quel nom la ramener ; 2. comment on y accède
 * (clé commune directe, ou table de lien) et par quelle colonne d'accroche ; 3. quelles lignes retenir (toutes,
 * valides par statut, période active). Le résultat est un enrichissement prêt à être ajouté à la recette ; il
 * reste modifiable ensuite dans le formulaire détaillé.
 */
import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Enrichissement, ModeValidite, Source } from '../../coeur/modeles';

type ModeAcces = 'direct' | 'via';

const ETAPE_VIDE = (): Enrichissement => ({
    src: '',
    srcKey: '',
    attr: '',
    col: '',
    as: '',
    viaSrc: '',
    viaIn: '',
    viaOut: '',
    validMode: '',
    vCol: '',
    vOp: 'eq',
    vVal: '',
    vStart: '',
    vEnd: ''
});

@Component({
    selector: 'app-assistant-enrichissement',
    imports: [FormsModule],
    template: `
        <div class="assistant">
            <div class="entete-page" style="margin: 0 0 8px">
                <b>🧭 Assistant — ramener une donnée d'une autre table</b>
                <span class="espace"></span>
                <button class="bouton petit" type="button" (click)="annuler.emit()">Annuler</button>
            </div>

            <div class="etape">
                <span class="numero">Étape 1</span>
                <span>La donnée se trouve dans</span>
                <select class="champ" name="assistant-table" [ngModel]="brouillon().src" (ngModelChange)="choisirTable($event)">
                    <option value="">— table —</option>
                    @for (source of sources(); track source.id) {
                        <option [value]="source.name">{{ source.name }}</option>
                    }
                </select>
                @if (brouillon().src) {
                    <span>· colonne à ramener</span>
                    <select class="champ" name="assistant-colonne" [ngModel]="brouillon().col" (ngModelChange)="choisirColonne($event)">
                        <option value="">— colonne —</option>
                        @for (colonne of colonnesDe(brouillon().src); track colonne) {
                            <option [value]="colonne">{{ colonne }}</option>
                        }
                    </select>
                    <span>· nom dans ma table</span>
                    <input class="champ" name="assistant-nom" [ngModel]="brouillon().as" (ngModelChange)="modifier({ as: $event })" />
                }
            </div>

            @if (brouillon().src) {
                <div class="etape">
                    <span class="numero">Étape 2</span>
                    <span>J'y accède</span>
                    <label class="case"
                        ><input
                            type="radio"
                            name="assistant-acces"
                            value="direct"
                            [ngModel]="mode()"
                            (ngModelChange)="choisirMode($event)"
                        />
                        directement (clé commune)</label
                    >
                    <label class="case"
                        ><input type="radio" name="assistant-acces" value="via" [ngModel]="mode()" (ngModelChange)="choisirMode($event)" />
                        par une table de lien</label
                    >
                </div>
                @if (mode() === 'via') {
                    <div class="etape retrait">
                        <span>Table de lien :</span>
                        <select
                            class="champ"
                            name="assistant-lien"
                            [ngModel]="brouillon().viaSrc"
                            (ngModelChange)="choisirTableDeLien($event)"
                        >
                            <option value="">— table —</option>
                            @for (source of sources(); track source.id) {
                                @if (source.name !== brouillon().src) {
                                    <option [value]="source.name">{{ source.name }}</option>
                                }
                            }
                        </select>
                        @if (brouillon().viaSrc) {
                            <span>· sa colonne côté MA table</span>
                            <select
                                class="champ"
                                name="assistant-lien-entree"
                                [ngModel]="brouillon().viaIn"
                                (ngModelChange)="modifier({ viaIn: $event })"
                            >
                                <option value="">— colonne —</option>
                                @for (colonne of colonnesDe(brouillon().viaSrc); track colonne) {
                                    <option [value]="colonne">{{ colonne }}</option>
                                }
                            </select>
                            <span>· sa colonne côté « {{ brouillon().src }} »</span>
                            <select
                                class="champ"
                                name="assistant-lien-sortie"
                                [ngModel]="brouillon().viaOut"
                                (ngModelChange)="modifier({ viaOut: $event })"
                            >
                                <option value="">— colonne —</option>
                                @for (colonne of colonnesDe(brouillon().viaSrc); track colonne) {
                                    <option [value]="colonne">{{ colonne }}</option>
                                }
                            </select>
                        }
                    </div>
                }
                <div class="etape retrait">
                    <span>Ma colonne d'accroche :</span>
                    <select
                        class="champ"
                        name="assistant-accroche"
                        [ngModel]="brouillon().attr"
                        (ngModelChange)="modifier({ attr: $event })"
                    >
                        <option value="">— colonne de ma table —</option>
                        @for (colonne of colonnesProduites(); track colonne) {
                            <option [value]="colonne">{{ colonne }}</option>
                        }
                    </select>
                    <span>= clé de « {{ brouillon().src }} » :</span>
                    <select
                        class="champ"
                        name="assistant-cle"
                        [ngModel]="brouillon().srcKey"
                        (ngModelChange)="modifier({ srcKey: $event })"
                    >
                        <option value="">— colonne —</option>
                        @for (colonne of colonnesDe(brouillon().src); track colonne) {
                            <option [value]="colonne">{{ colonne }}</option>
                        }
                    </select>
                </div>

                @if (mode() !== 'via' || brouillon().viaSrc) {
                    <div class="etape">
                        <span class="numero">Étape 3</span>
                        <span>Lignes {{ mode() === 'via' ? 'de lien' : 'de « ' + brouillon().src + ' »' }} à retenir :</span>
                        <select
                            class="champ"
                            name="assistant-validite"
                            [ngModel]="brouillon().validMode"
                            (ngModelChange)="modifier({ validMode: $event })"
                        >
                            <option value="">toutes</option>
                            <option value="status">valides par statut</option>
                            <option value="period">période active (aujourd'hui)</option>
                        </select>
                        @if (brouillon().validMode === 'status') {
                            <select
                                class="champ"
                                name="assistant-statut"
                                [ngModel]="brouillon().vCol"
                                (ngModelChange)="modifier({ vCol: $event })"
                            >
                                <option value="">— colonne statut —</option>
                                @for (colonne of colonnesDe(tableDeValidite()); track colonne) {
                                    <option [value]="colonne">{{ colonne }}</option>
                                }
                            </select>
                            <select
                                class="champ"
                                name="assistant-statut-operateur"
                                [ngModel]="brouillon().vOp"
                                (ngModelChange)="modifier({ vOp: $event })"
                            >
                                @for (operateur of operateurs(); track operateur.cle) {
                                    <option [value]="operateur.cle">{{ operateur.libelle }}</option>
                                }
                            </select>
                            <input
                                class="champ"
                                name="assistant-statut-valeur"
                                placeholder="valeur (ex. ACTIF)"
                                [ngModel]="brouillon().vVal"
                                (ngModelChange)="modifier({ vVal: $event })"
                            />
                        }
                        @if (brouillon().validMode === 'period') {
                            <span>début</span>
                            <select
                                class="champ"
                                name="assistant-debut"
                                [ngModel]="brouillon().vStart"
                                (ngModelChange)="modifier({ vStart: $event })"
                            >
                                <option value="">— colonne —</option>
                                @for (colonne of colonnesDe(tableDeValidite()); track colonne) {
                                    <option [value]="colonne">{{ colonne }}</option>
                                }
                            </select>
                            <span>fin</span>
                            <select
                                class="champ"
                                name="assistant-fin"
                                [ngModel]="brouillon().vEnd"
                                (ngModelChange)="modifier({ vEnd: $event })"
                            >
                                <option value="">— (ouverte) —</option>
                                @for (colonne of colonnesDe(tableDeValidite()); track colonne) {
                                    <option [value]="colonne">{{ colonne }}</option>
                                }
                            </select>
                            <span class="discret">(si plusieurs périodes actives : la plus récente)</span>
                        }
                    </div>
                }
            }

            <div class="etape" style="margin-top: 6px">
                <button class="bouton principal petit" type="button" (click)="valider()">✔ Ajouter cet enrichissement</button>
                @if (probleme()) {
                    <span class="discret probleme">{{ probleme() }}</span>
                } @else {
                    <span class="discret">
                        Donnée encore plus loin (deux tables de lien) ? Ajoutez d'abord l'identifiant intermédiaire, puis relancez
                        l'assistant en vous accrochant dessus.
                    </span>
                }
            </div>
        </div>
    `,
    styles: `
        .assistant {
            border: 2px solid var(--accent);
            background: var(--accent-2);
            border-radius: var(--rayon);
            padding: 10px 12px;
            margin-bottom: 10px;
            font-size: 13px;
        }
        .etape {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
            margin-bottom: 6px;
        }
        .etape.retrait {
            padding-left: 64px;
        }
        .etape .champ {
            width: auto;
            max-width: 200px;
            padding: 4px 6px;
            font-size: 12px;
        }
        .numero {
            font-weight: 700;
            color: var(--texte-2);
            width: 58px;
        }
        .case {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .probleme {
            color: var(--erreur);
        }
    `
})
export class AssistantEnrichissementComponent {
    /** Tables utilisables (toutes sauf celle en cours) et colonnes déjà produites par la recette. */
    readonly sources = input<Source[]>([]);
    readonly colonnesProduites = input<string[]>([]);
    readonly operateurs = input<{ cle: string; libelle: string }[]>([]);
    readonly ajouter = output<Enrichissement>();
    readonly annuler = output<void>();

    readonly brouillon = signal<Enrichissement>(ETAPE_VIDE());
    readonly mode = signal<ModeAcces>('via');
    readonly tableDeValidite = computed(() => (this.mode() === 'via' ? this.brouillon().viaSrc : this.brouillon().src));
    /** Ce qui manque encore pour valider, en une phrase ; vide quand tout est prêt. */
    readonly probleme = computed(() => {
        const brouillon = this.brouillon();
        if (!brouillon.src) return 'Choisissez la table où se trouve la donnée à ramener (étape 1).';
        if (!brouillon.col) return 'Choisissez la colonne à ramener (étape 1).';
        if (!brouillon.as.trim()) return 'Donnez un nom à la nouvelle colonne (étape 1).';
        if (!brouillon.attr) return "Choisissez la colonne de VOTRE table qui sert d'accroche (étape 2).";
        if (!brouillon.srcKey) return `Choisissez la clé de la table « ${brouillon.src} » (étape 2).`;
        if (this.mode() === 'via' && (!brouillon.viaSrc || !brouillon.viaIn || !brouillon.viaOut))
            return "Complétez la table de lien : ses colonnes d'entrée et de sortie (étape 2).";
        if (brouillon.validMode === 'status' && !brouillon.vCol) return 'Choisissez la colonne de statut (étape 3).';
        if (brouillon.validMode === 'period' && !brouillon.vStart) return 'Choisissez la colonne de début de période (étape 3).';
        return '';
    });

    colonnesDe(nomTable: string): string[] {
        return this.sources().find(source => source.name === nomTable)?.headers || [];
    }
    modifier(changement: Partial<Enrichissement>): void {
        this.brouillon.update(brouillon => ({ ...brouillon, ...changement }));
    }
    choisirTable(nomTable: string): void {
        this.modifier({ src: nomTable, col: '', srcKey: '' });
    }
    choisirColonne(colonne: string): void {
        const brouillon = this.brouillon();
        this.modifier({ col: colonne, as: brouillon.as.trim() ? brouillon.as : colonne });
    }
    choisirMode(mode: ModeAcces): void {
        this.mode.set(mode);
        this.modifier({ viaSrc: '', viaIn: '', viaOut: '', vCol: '', vStart: '', vEnd: '' });
    }
    choisirTableDeLien(nomTable: string): void {
        this.modifier({ viaSrc: nomTable, viaIn: '', viaOut: '', vCol: '', vStart: '', vEnd: '' });
    }
    valider(): void {
        if (this.probleme()) return;
        const brouillon = this.brouillon();
        const direct = this.mode() === 'direct';
        this.ajouter.emit({
            ...brouillon,
            as: brouillon.as.trim(),
            viaSrc: direct ? '' : brouillon.viaSrc,
            viaIn: direct ? '' : brouillon.viaIn,
            viaOut: direct ? '' : brouillon.viaOut,
            validMode: (brouillon.validMode || '') as ModeValidite
        });
        this.brouillon.set(ETAPE_VIDE());
    }
}
