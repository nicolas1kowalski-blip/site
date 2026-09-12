/**
 * Extraction : composer une requête sans écrire de SQL.
 *
 *   1. Table de départ.
 *   2. Tables liées : proposées d'après les liens du modèle de données, à partir des tables déjà présentes ;
 *      chaque table ajoutée devient une jointure (gauche par défaut : les lignes de départ sont conservées).
 *   3. Colonnes : cochées table par table, avec un nom de sortie, une transformation, et un agrégat en mode regroupé.
 *   4. Filtres : une condition par ligne, avec les opérateurs de l'application classique.
 *   5. Aperçu (200 lignes, défilement virtuel), comptage complet, export CSV, SQL généré, modèles enregistrés.
 *
 * La spécification est envoyée au serveur, qui la valide, construit le SQL et l'exécute (api/src/extraction).
 */
import { ScrollingModule } from '@angular/cdk/scrolling';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import {
    Agregat,
    ApercuExtraction,
    ColonneExtraction,
    FiltreExtraction,
    JointureExtraction,
    ModeleExtraction,
    OPERATEURS_SANS_VALEUR,
    OPERATEUR_DEUX_VALEURS,
    OperateurFiltre,
    Relation,
    Source,
    SpecificationExtraction,
    Transformation,
    VocabulaireExtraction,
    genererIdentifiant
} from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

/** Table proposée pour une jointure : le lien du modèle qui la relie à une table déjà présente. */
type TableProposee = { source: Source; jointure: JointureExtraction; relation: Relation };

@Component({
    selector: 'app-extraction',
    imports: [FormsModule, ScrollingModule],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Extraction</h1>
                <p class="discret">Composez une extraction sans SQL : tables liées, colonnes, filtres, regroupement.</p>
            </div>
            <select
                class="champ"
                style="width: auto"
                [ngModel]="''"
                (ngModelChange)="chargerModele($event)"
                name="modeleCharge"
                title="Charger un modèle enregistré"
            >
                <option value="">Charger un modèle…</option>
                @for (modele of modeles(); track modele.id) {
                    <option [value]="modele.id">{{ modele.nom }}</option>
                }
            </select>
            @if (session.peutEditer()) {
                <button class="bouton" (click)="enregistrerModele()" [disabled]="!specificationPrete()">Enregistrer le modèle</button>
            }
        </div>

        <div class="disposition">
            <section class="colonne-gauche">
                <!-- 1. table de départ -->
                <div class="carte">
                    <h2>1 · Table de départ</h2>
                    <select class="champ" [ngModel]="baseId()" (ngModelChange)="choisirBase($event)" name="base">
                        <option value="">—</option>
                        @for (source of sources(); track source.id) {
                            <option [value]="source.id">{{ source.name }}</option>
                        }
                    </select>
                </div>

                <!-- 2. tables liées -->
                @if (baseId()) {
                    <div class="carte">
                        <h2>2 · Tables liées</h2>
                        @for (jointure of jointures(); track jointure.versTableId) {
                            <div class="ligne-table">
                                <span>
                                    <b>{{ nomDe(jointure.versTableId) }}</b>
                                    <span class="discret"
                                        >via {{ nomDe(jointure.deTableId) }}.{{ jointure.deCol }} = {{ jointure.versCol }}</span
                                    >
                                </span>
                                <button class="bouton petit" (click)="retirerTable(jointure.versTableId)">Retirer</button>
                            </div>
                        }
                        @for (proposition of tablesProposees(); track proposition.source.id) {
                            <div class="ligne-table proposee">
                                <span>
                                    {{ proposition.source.name }}
                                    <span class="discret">via {{ proposition.jointure.deCol }} → {{ proposition.jointure.versCol }}</span>
                                </span>
                                <button class="bouton petit" (click)="ajouterTable(proposition)">Ajouter</button>
                            </div>
                        }
                        @if (!jointures().length && !tablesProposees().length) {
                            <p class="discret">Aucun lien ne part de cette table : déclarez-en dans le Modèle de données.</p>
                        }
                        <label class="etiquette" style="margin-top: 8px">Type de jointure</label>
                        <select class="champ" [(ngModel)]="typeJointure" name="typeJointure">
                            <option value="left">gauche — garder toutes les lignes de la table de départ</option>
                            <option value="inner">interne — garder seulement les lignes reliées</option>
                        </select>
                    </div>

                    <!-- 3. colonnes -->
                    <div class="carte">
                        <h2>3 · Colonnes</h2>
                        <label class="case"
                            ><input type="checkbox" [(ngModel)]="regrouper" name="regrouper" /> Regrouper (les colonnes sans agrégat forment
                            la clé)</label
                        >
                        <label class="case"
                            ><input type="checkbox" [(ngModel)]="dedoublonner" name="dedoublonner" [disabled]="regrouper" /> Dédoublonner
                            les lignes identiques</label
                        >
                        @for (tableId of tablesPresentes(); track tableId) {
                            <details open>
                                <summary>
                                    <b>{{ nomDe(tableId) }}</b>
                                    <span class="discret">{{ nombreCochees(tableId) }} / {{ colonnesDe(tableId).length }}</span>
                                    <button class="bouton petit" type="button" (click)="toutCocher(tableId)">tout</button>
                                    <button class="bouton petit" type="button" (click)="toutDecocher(tableId)">rien</button>
                                </summary>
                                @for (colonne of colonnesDe(tableId); track colonne) {
                                    <div class="ligne-colonne">
                                        <label class="case">
                                            <input
                                                type="checkbox"
                                                [checked]="estCochee(tableId, colonne)"
                                                (change)="basculer(tableId, colonne)"
                                            />
                                            <code>{{ colonne }}</code>
                                        </label>
                                        @if (choixDe(tableId, colonne); as choix) {
                                            <input
                                                class="champ petit"
                                                placeholder="nom en sortie"
                                                [(ngModel)]="choix.alias"
                                                [name]="'alias_' + tableId + colonne"
                                                [attr.name]="'alias_' + tableId + colonne"
                                            />
                                            <select
                                                class="champ petit"
                                                [(ngModel)]="choix.transformation"
                                                [name]="'tr_' + tableId + colonne"
                                                [attr.name]="'tr_' + tableId + colonne"
                                            >
                                                @for (entree of transformations(); track entree[0]) {
                                                    <option [value]="entree[0]">{{ entree[1] }}</option>
                                                }
                                            </select>
                                            @if (regrouper) {
                                                <select
                                                    class="champ petit"
                                                    [(ngModel)]="choix.agregat"
                                                    [name]="'ag_' + tableId + colonne"
                                                    [attr.name]="'ag_' + tableId + colonne"
                                                >
                                                    <option [ngValue]="undefined">clé de regroupement</option>
                                                    @for (entree of agregats(); track entree[0]) {
                                                        <option [value]="entree[0]">{{ entree[1] }}</option>
                                                    }
                                                </select>
                                            }
                                        }
                                    </div>
                                }
                            </details>
                        }
                    </div>

                    <!-- 4. filtres -->
                    <div class="carte">
                        <h2>4 · Filtres</h2>
                        @for (filtre of filtres(); track $index; let index = $index) {
                            <div class="ligne-filtre">
                                <select
                                    class="champ petit"
                                    [(ngModel)]="filtre.tableId"
                                    (ngModelChange)="filtre.col = ''"
                                    [name]="'ft_' + index"
                                    [attr.name]="'ft_' + index"
                                >
                                    @for (tableId of tablesPresentes(); track tableId) {
                                        <option [value]="tableId">{{ nomDe(tableId) }}</option>
                                    }
                                </select>
                                <select class="champ petit" [(ngModel)]="filtre.col" [name]="'fc_' + index" [attr.name]="'fc_' + index">
                                    <option value="">colonne…</option>
                                    @for (colonne of colonnesDe(filtre.tableId); track colonne) {
                                        <option [value]="colonne">{{ colonne }}</option>
                                    }
                                </select>
                                <select class="champ petit" [(ngModel)]="filtre.op" [name]="'fo_' + index" [attr.name]="'fo_' + index">
                                    @for (entree of operateurs(); track entree[0]) {
                                        <option [value]="entree[0]">{{ entree[1] }}</option>
                                    }
                                </select>
                                @if (!sansValeur(filtre.op)) {
                                    <input
                                        class="champ petit"
                                        [(ngModel)]="filtre.valeur"
                                        [name]="'fv_' + index"
                                        [attr.name]="'fv_' + index"
                                        placeholder="valeur"
                                    />
                                }
                                @if (filtre.op === deuxValeurs) {
                                    <input
                                        class="champ petit"
                                        [(ngModel)]="filtre.valeur2"
                                        [name]="'fv2_' + index"
                                        [attr.name]="'fv2_' + index"
                                        placeholder="et"
                                    />
                                }
                                <button class="bouton petit" type="button" (click)="retirerFiltre(index)">✕</button>
                            </div>
                        }
                        <button class="bouton petit" type="button" (click)="ajouterFiltre()">+ Ajouter un filtre</button>
                    </div>
                }
            </section>

            <section>
                <div class="carte">
                    <div class="entete-page" style="margin: 0">
                        <button class="bouton principal" (click)="apercevoir()" [disabled]="!specificationPrete() || enCours()">
                            {{ enCours() ? 'Exécution…' : 'Aperçu (200 lignes)' }}
                        </button>
                        <button class="bouton" (click)="compter()" [disabled]="!specificationPrete() || enCours()">Compter</button>
                        <button class="bouton" (click)="exporter()" [disabled]="!specificationPrete() || enCours()">Exporter en CSV</button>
                        <span class="espace"></span>
                        @if (total() !== null) {
                            <span class="badge">{{ total() }} ligne(s) au total</span>
                        }
                        <label class="case"><input type="checkbox" [(ngModel)]="afficherSql" name="afficherSql" /> SQL</label>
                    </div>
                    @if (erreur()) {
                        <p class="erreur">{{ erreur() }}</p>
                    }
                    @if (afficherSql && apercu()) {
                        <pre class="sql">{{ apercu()!.sql }}</pre>
                    }
                </div>
                @if (apercu(); as apercu) {
                    <div class="carte resultat">
                        <div class="ligne entete-colonnes">
                            @for (colonne of apercu.colonnes; track colonne.nom) {
                                <div class="cellule" [title]="colonne.type">
                                    <b>{{ colonne.nom }}</b
                                    ><span class="discret">{{ colonne.type }}</span>
                                </div>
                            }
                        </div>
                        <cdk-virtual-scroll-viewport itemSize="30" class="corps">
                            <div
                                class="ligne"
                                *cdkVirtualFor="let ligne of apercu.lignes; let index = index"
                                [class.paire]="index % 2 === 0"
                            >
                                @for (valeur of ligne; track $index) {
                                    <div class="cellule">{{ valeur === null ? '∅' : valeur }}</div>
                                }
                            </div>
                        </cdk-virtual-scroll-viewport>
                        <div class="discret" style="padding: 6px 10px">
                            {{ apercu.lignes.length }} ligne(s) affichée(s){{
                                apercu.lignes.length >= apercu.limite ? ' (aperçu limité)' : ''
                            }}
                        </div>
                    </div>
                } @else if (!baseId()) {
                    <div class="carte vide">Choisissez une table de départ pour commencer.</div>
                }
            </section>
        </div>
    `,
    styles: `
        .disposition {
            display: grid;
            grid-template-columns: minmax(340px, 460px) 1fr;
            gap: 14px;
            align-items: start;
        }
        .colonne-gauche {
            display: flex;
            flex-direction: column;
            gap: 14px;
        }
        .colonne-gauche .carte + .carte {
            margin-top: 0;
        }
        .ligne-table {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding: 6px 0;
            border-bottom: 1px solid var(--bordure);
        }
        .ligne-table.proposee {
            color: var(--texte-2);
        }
        .case {
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
        }
        .ligne-colonne {
            display: grid;
            grid-template-columns: minmax(120px, 1fr) 1fr 1fr auto;
            gap: 6px;
            align-items: center;
            padding: 3px 0;
        }
        .ligne-filtre {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr 1fr auto auto;
            gap: 6px;
            align-items: center;
            margin-bottom: 6px;
        }
        .champ.petit {
            padding: 4px 6px;
            font-size: 12px;
        }
        details summary {
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 8px 0 4px;
        }
        .erreur {
            color: var(--erreur);
            font-weight: 600;
            margin-top: 8px;
        }
        .sql {
            margin: 10px 0 0;
            padding: 10px;
            background: var(--surface-2);
            border-radius: 8px;
            font-size: 12px;
            white-space: pre-wrap;
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
            height: 55vh;
        }
        @media (max-width: 900px) {
            .disposition {
                grid-template-columns: 1fr;
            }
        }
    `
})
export class ExtractionComponent {
    readonly session = inject(SessionService);
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);

    readonly sources = signal<Source[]>([]);
    readonly relations = signal<Relation[]>([]);
    readonly vocabulaire = signal<VocabulaireExtraction | null>(null);
    readonly modeles = signal<ModeleExtraction[]>([]);

    // ---- la spécification en cours de composition ----
    readonly baseId = signal('');
    readonly jointures = signal<JointureExtraction[]>([]);
    readonly colonnes = signal<ColonneExtraction[]>([]);
    readonly filtres = signal<FiltreExtraction[]>([]);
    typeJointure: 'left' | 'inner' = 'left';
    regrouper = false;
    dedoublonner = false;
    afficherSql = false;

    readonly apercu = signal<ApercuExtraction | null>(null);
    readonly total = signal<number | null>(null);
    readonly erreur = signal('');
    readonly enCours = signal(false);
    readonly deuxValeurs = OPERATEUR_DEUX_VALEURS;

    readonly tablesPresentes = computed(() =>
        this.baseId() ? [this.baseId(), ...this.jointures().map(jointure => jointure.versTableId)] : []
    );
    readonly specificationPrete = computed(() => !!this.baseId() && this.colonnes().length > 0);
    readonly operateurs = computed(() => Object.entries(this.vocabulaire()?.operateurs || {}) as [OperateurFiltre, string][]);
    readonly transformations = computed(() => Object.entries(this.vocabulaire()?.transformations || {}) as [Transformation, string][]);
    readonly agregats = computed(() => Object.entries(this.vocabulaire()?.agregats || {}) as [Agregat, string][]);

    /** Tables joignables : un lien du modèle entre une table présente et une table absente, dans un sens ou l'autre. */
    readonly tablesProposees = computed<TableProposee[]>(() => {
        const presentes = new Set(this.tablesPresentes());
        const propositions: TableProposee[] = [];
        for (const relation of this.relations()) {
            if (!relation.sourceId || !relation.targetId) continue;
            const candidats: [string, string, string, string][] = [
                [relation.sourceId, relation.sourceCol, relation.targetId, relation.targetCol],
                [relation.targetId, relation.targetCol, relation.sourceId, relation.sourceCol]
            ];
            for (const [deTableId, deCol, versTableId, versCol] of candidats) {
                if (!presentes.has(deTableId) || presentes.has(versTableId)) continue;
                if (propositions.some(candidat => candidat.source.id === versTableId)) continue;
                const source = this.sources().find(candidat => candidat.id === versTableId);
                if (source) propositions.push({ source, jointure: { deTableId, deCol, versTableId, versCol }, relation });
            }
        }
        return propositions;
    });

    constructor() {
        this.charger();
    }

    private async charger(): Promise<void> {
        try {
            const [sources, relations, vocabulaire, modeles] = await Promise.all([
                this.api.sources(),
                this.api.relations(),
                this.api.vocabulaireExtraction(),
                this.api.modelesExtraction()
            ]);
            this.sources.set(sources);
            this.relations.set(relations);
            this.vocabulaire.set(vocabulaire);
            this.modeles.set(modeles);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    nomDe(tableId: string): string {
        return this.sources().find(source => source.id === tableId)?.name || tableId;
    }
    colonnesDe(tableId: string): string[] {
        return this.sources().find(source => source.id === tableId)?.headers || [];
    }

    choisirBase(tableId: string): void {
        this.baseId.set(tableId);
        this.jointures.set([]);
        this.colonnes.set([]);
        this.filtres.set([]);
        this.apercu.set(null);
        this.total.set(null);
    }

    ajouterTable(proposition: TableProposee): void {
        this.jointures.update(liste => [...liste, proposition.jointure]);
    }
    /** Retire une table et, par cohérence, tout ce qui en dépend : jointures qui en partent, colonnes et filtres. */
    retirerTable(tableId: string): void {
        const aRetirer = new Set([tableId]);
        let changement = true;
        while (changement) {
            changement = false;
            for (const jointure of this.jointures()) {
                if (aRetirer.has(jointure.deTableId) && !aRetirer.has(jointure.versTableId)) {
                    aRetirer.add(jointure.versTableId);
                    changement = true;
                }
            }
        }
        this.jointures.update(liste => liste.filter(jointure => !aRetirer.has(jointure.versTableId)));
        this.colonnes.update(liste => liste.filter(colonne => !aRetirer.has(colonne.tableId)));
        this.filtres.update(liste => liste.filter(filtre => !aRetirer.has(filtre.tableId)));
    }

    choixDe(tableId: string, col: string): ColonneExtraction | undefined {
        return this.colonnes().find(colonne => colonne.tableId === tableId && colonne.col === col);
    }
    estCochee(tableId: string, col: string): boolean {
        return !!this.choixDe(tableId, col);
    }
    nombreCochees(tableId: string): number {
        return this.colonnes().filter(colonne => colonne.tableId === tableId).length;
    }
    basculer(tableId: string, col: string): void {
        if (this.estCochee(tableId, col))
            this.colonnes.update(liste => liste.filter(colonne => !(colonne.tableId === tableId && colonne.col === col)));
        else this.colonnes.update(liste => [...liste, { tableId, col, alias: '', transformation: 'none' }]);
    }
    toutCocher(tableId: string): void {
        for (const col of this.colonnesDe(tableId)) if (!this.estCochee(tableId, col)) this.basculer(tableId, col);
    }
    toutDecocher(tableId: string): void {
        this.colonnes.update(liste => liste.filter(colonne => colonne.tableId !== tableId));
    }

    ajouterFiltre(): void {
        this.filtres.update(liste => [...liste, { tableId: this.baseId(), col: '', op: '=', valeur: '' }]);
    }
    retirerFiltre(index: number): void {
        this.filtres.update(liste => liste.filter((_, position) => position !== index));
    }
    sansValeur(op: OperateurFiltre): boolean {
        return OPERATEURS_SANS_VALEUR.includes(op);
    }

    /** La spécification telle que l'API l'attend (alias vides omis, filtres incomplets ignorés). */
    specification(limite?: number): SpecificationExtraction {
        return {
            baseId: this.baseId(),
            jointures: this.jointures(),
            typeJointure: this.typeJointure,
            colonnes: this.colonnes().map(colonne => ({
                tableId: colonne.tableId,
                col: colonne.col,
                transformation: colonne.transformation,
                ...(colonne.alias?.trim() ? { alias: colonne.alias.trim() } : {}),
                ...(this.regrouper && colonne.agregat ? { agregat: colonne.agregat } : {})
            })),
            filtres: this.filtres().filter(filtre => filtre.col),
            regrouper: this.regrouper,
            dedoublonner: this.dedoublonner,
            tri: [],
            ...(limite ? { limite } : {})
        };
    }

    async apercevoir(): Promise<void> {
        await this.executer(async () => this.apercu.set(await this.api.apercuExtraction(this.specification(), 200)));
    }
    async compter(): Promise<void> {
        await this.executer(async () => this.total.set((await this.api.compterExtraction(this.specification())).total));
    }
    async exporter(): Promise<void> {
        await this.executer(async () => {
            const nom = this.nomDe(this.baseId()).replace(/\.[^.]+$/, '') + '_extraction';
            const blob = await this.api.exporterExtractionCsv(this.specification(), nom);
            const lien = document.createElement('a');
            lien.href = URL.createObjectURL(blob);
            lien.download = nom + '.csv';
            lien.click();
            URL.revokeObjectURL(lien.href);
            this.notifications.succes('Export CSV téléchargé.');
        });
    }
    private async executer(action: () => Promise<void>): Promise<void> {
        this.erreur.set('');
        this.enCours.set(true);
        try {
            await action();
        } catch (erreur) {
            this.erreur.set((erreur as Error).message);
        } finally {
            this.enCours.set(false);
        }
    }

    // ---- modèles enregistrés ----
    async enregistrerModele(): Promise<void> {
        const nom = prompt("Nom du modèle d'extraction :", this.nomDe(this.baseId()).replace(/\.[^.]+$/, ''));
        if (!nom) return;
        try {
            const existant = this.modeles().find(modele => modele.nom === nom);
            const modele = await this.api.enregistrerModeleExtraction(existant ? existant.id : genererIdentifiant('ex_'), {
                nom,
                description: '',
                specification: this.specification()
            });
            this.modeles.update(liste =>
                [...liste.filter(candidat => candidat.id !== modele.id), modele].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
            );
            this.notifications.succes(`Modèle « ${nom} » enregistré.`);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
    chargerModele(id: string): void {
        const modele = this.modeles().find(candidat => candidat.id === id);
        if (!modele) return;
        const specification = modele.specification;
        this.baseId.set(specification.baseId);
        this.jointures.set([...specification.jointures]);
        this.colonnes.set(specification.colonnes.map(colonne => ({ ...colonne, alias: colonne.alias || '' })));
        this.filtres.set(specification.filtres.map(filtre => ({ ...filtre })));
        this.typeJointure = specification.typeJointure;
        this.regrouper = specification.regrouper;
        this.dedoublonner = specification.dedoublonner;
        this.apercu.set(null);
        this.total.set(null);
        this.notifications.info(`Modèle « ${modele.nom} » chargé.`);
    }
}
