/**
 * Formulaire d'une règle de qualité : nom, colonne (sauf pour les règles sans colonne), type, criticité, et les
 * paramètres propres à chaque type — expression régulière, liste, liste de valeurs de la gouvernance, bornes,
 * fraîcheur, référence, condition « si… alors… », formule de cohérence, condition SQL, agrégat par groupe,
 * colonnes supplémentaires d'une clé unique. Le composant reçoit une copie de la définition, l'édite, et rend
 * la définition prête à envoyer au serveur.
 */
import { Component, OnInit, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfigurationSerie, DefinitionRegle, ListeValeurs, Source, TypeRegle, VocabulaireQualite } from '../../coeur/modeles';

export type BrouillonRegle = { id: string | null; definition: DefinitionRegle };

/** Texte « a;b;c » → liste de valeurs sans blancs ; liste → texte. */
const enListe = (texte: string) =>
    texte
        .split(';')
        .map(valeur => valeur.trim())
        .filter(Boolean);
const enTexte = (liste: string[] | undefined) => (liste || []).join(';');

@Component({
    selector: 'app-formulaire-regle',
    imports: [FormsModule, NgTemplateOutlet],
    template: `
        <form class="carte" (ngSubmit)="soumettre()">
            <h2>{{ brouillon().id ? 'Modifier la règle' : 'Nouvelle règle' }}</h2>
            <div class="formulaire-ligne">
                <div><label class="etiquette">Nom</label><input class="champ" name="nom" [(ngModel)]="definition.nom" required /></div>
                <div>
                    <label class="etiquette">Type</label>
                    <select class="champ" name="type" [(ngModel)]="definition.type" (ngModelChange)="changerType($event)">
                        @for (type of typesRegle(); track type[0]) {
                            <option [value]="type[0]">{{ type[1] }}</option>
                        }
                    </select>
                </div>
                @if (!sansColonne()) {
                    <div>
                        <label class="etiquette">{{ definition.type === 'condition' ? 'Colonne « si »' : 'Colonne' }}</label>
                        <select class="champ" name="colonne" [(ngModel)]="definition.colonne" required>
                            @for (colonne of source().headers; track colonne) {
                                <option [value]="colonne">{{ colonne }}</option>
                            }
                        </select>
                    </div>
                }
                <div style="flex: 0 0 140px">
                    <label class="etiquette">Criticité</label>
                    <select class="champ" name="criticite" [(ngModel)]="definition.criticite">
                        <option value="bloquante">bloquante</option>
                        <option value="majeure">majeure</option>
                        <option value="mineure">mineure</option>
                    </select>
                </div>
            </div>
            <div class="formulaire-ligne" style="margin-top: 8px">
                @switch (definition.type) {
                    @case ('unique') {
                        <div>
                            <label class="etiquette">Autres colonnes de la clé (unicité composite, facultatif)</label>
                            <div class="cases">
                                @for (colonne of autresColonnes(); track colonne) {
                                    <label class="case"
                                        ><input
                                            type="checkbox"
                                            [checked]="colonnesSupplementaires().includes(colonne)"
                                            (change)="basculer(colonnesSupplementaires, colonne)"
                                        />
                                        <code>{{ colonne }}</code></label
                                    >
                                }
                            </div>
                        </div>
                    }
                    @case ('format') {
                        <div>
                            <label class="etiquette">Expression régulière</label
                            ><input
                                class="champ"
                                name="expression"
                                [(ngModel)]="definition.parametres.expression"
                                placeholder="^[0-9]{5}$"
                            />
                        </div>
                    }
                    @case ('dansListe') {
                        <div>
                            <label class="etiquette">Valeurs autorisées (séparées par ;)</label
                            ><input class="champ" name="valeurs" [(ngModel)]="valeursTexte" placeholder="Paris;Lyon" />
                        </div>
                    }
                    @case ('listeValeurs') {
                        <div>
                            <label class="etiquette">Liste de valeurs de la gouvernance</label>
                            <select class="champ" name="listeId" [(ngModel)]="definition.parametres.listeId">
                                @for (liste of listesValeurs(); track liste.id) {
                                    <option [value]="liste.id">{{ liste.name }}</option>
                                }
                            </select>
                            @if (!listesValeurs().length) {
                                <div class="discret">Aucune liste : créez-en une dans Gouvernance › Listes de valeurs.</div>
                            }
                        </div>
                    }
                    @case ('plage') {
                        <div>
                            <label class="etiquette">Minimum</label
                            ><input class="champ" type="number" name="minimum" [(ngModel)]="definition.parametres.minimum" />
                        </div>
                        <div>
                            <label class="etiquette">Maximum</label
                            ><input class="champ" type="number" name="maximum" [(ngModel)]="definition.parametres.maximum" />
                        </div>
                    }
                    @case ('longueur') {
                        <div>
                            <label class="etiquette">Longueur minimale</label
                            ><input class="champ" type="number" name="minimum" [(ngModel)]="definition.parametres.minimum" />
                        </div>
                        <div>
                            <label class="etiquette">Longueur maximale</label
                            ><input class="champ" type="number" name="maximum" [(ngModel)]="definition.parametres.maximum" />
                        </div>
                    }
                    @case ('fraicheur') {
                        <div>
                            <label class="etiquette">Âge maximal (jours)</label
                            ><input class="champ" type="number" name="jours" [(ngModel)]="definition.parametres.jours" placeholder="365" />
                        </div>
                    }
                    @case ('reference') {
                        <div>
                            <label class="etiquette">Source cible</label>
                            <select class="champ" name="sourceCibleId" [(ngModel)]="definition.parametres.sourceCibleId">
                                @for (candidate of sources(); track candidate.id) {
                                    <option [value]="candidate.id">{{ candidate.name }}</option>
                                }
                            </select>
                        </div>
                        <div>
                            <label class="etiquette">Colonne cible</label>
                            <select class="champ" name="colonneCible" [(ngModel)]="definition.parametres.colonneCible">
                                @for (colonne of colonnesDe(definition.parametres.sourceCibleId); track colonne) {
                                    <option [value]="colonne">{{ colonne }}</option>
                                }
                            </select>
                        </div>
                    }
                    @case ('condition') {
                        <div>
                            <label class="etiquette">Si la colonne « si »…</label>
                            <select class="champ" name="siOperateur" [(ngModel)]="definition.parametres.siOperateur">
                                @for (operateur of operateursCondition(); track operateur[0]) {
                                    <option [value]="operateur[0]">{{ operateur[1] }}</option>
                                }
                            </select>
                        </div>
                        @if (definition.parametres.siOperateur === 'dans') {
                            <div>
                                <label class="etiquette">Valeurs « si » (séparées par ;)</label
                                ><input class="champ" name="siValeurs" [(ngModel)]="siValeursTexte" placeholder="PRO;ENTREPRISE" />
                            </div>
                        }
                        <div>
                            <label class="etiquette">… alors la colonne</label>
                            <select class="champ" name="alorsColonne" [(ngModel)]="definition.parametres.alorsColonne">
                                @for (colonne of source().headers; track colonne) {
                                    <option [value]="colonne">{{ colonne }}</option>
                                }
                            </select>
                        </div>
                        <div>
                            <label class="etiquette">doit…</label>
                            <select class="champ" name="alorsOperateur" [(ngModel)]="definition.parametres.alorsOperateur">
                                @for (operateur of operateursCondition(); track operateur[0]) {
                                    <option [value]="operateur[0]">{{ operateur[1] }}</option>
                                }
                            </select>
                        </div>
                        @if (definition.parametres.alorsOperateur === 'dans') {
                            <div>
                                <label class="etiquette">Valeurs « alors » (séparées par ;)</label
                                ><input class="champ" name="alorsValeurs" [(ngModel)]="alorsValeursTexte" />
                            </div>
                        }
                    }
                    @case ('expression') {
                        <div style="flex: 1 1 100%">
                            <label class="etiquette"
                                >Formule de cohérence (colonnes entre crochets ; comparaisons typées date / nombre / texte)</label
                            ><input
                                class="champ"
                                name="formule"
                                [(ngModel)]="definition.parametres.formule"
                                placeholder="[date_debut] <= [date_fin] AND ([montant] > 0 OR [statut] = 'GRATUIT')"
                            />
                        </div>
                    }
                    @case ('sql') {
                        <div style="flex: 1 1 100%">
                            <label class="etiquette">Condition SQL (DuckDB) que chaque ligne doit vérifier</label
                            ><input
                                class="champ"
                                name="condition"
                                [(ngModel)]="definition.parametres.condition"
                                placeholder="length(code) = 5 AND code NOT LIKE '%X%'"
                            />
                        </div>
                    }
                    @case ('serieTrou') {
                        <ng-container *ngTemplateOutlet="choixSerie" />
                    }
                    @case ('serieDoublon') {
                        <ng-container *ngTemplateOutlet="choixSerie" />
                    }
                    @case ('seriePlateau') {
                        <ng-container *ngTemplateOutlet="choixSerie" />
                        <div style="flex: 0 0 160px">
                            <label class="etiquette">Points identiques d'affilée (min.)</label
                            ><input
                                class="champ"
                                type="number"
                                name="longueurMinimale"
                                [(ngModel)]="definition.parametres.longueurMinimale"
                                placeholder="3"
                            />
                        </div>
                    }
                    @case ('serieSaut') {
                        <ng-container *ngTemplateOutlet="choixSerie" />
                        <div style="flex: 0 0 160px">
                            <label class="etiquette">Écart absolu maximal</label
                            ><input
                                class="champ"
                                type="number"
                                step="any"
                                name="sautAbsolu"
                                [(ngModel)]="definition.parametres.sautAbsolu"
                            />
                        </div>
                        <div style="flex: 0 0 160px">
                            <label class="etiquette">ou variation maximale (%)</label
                            ><input
                                class="champ"
                                type="number"
                                step="any"
                                name="sautPourcent"
                                [(ngModel)]="definition.parametres.sautPourcent"
                            />
                        </div>
                    }
                    @case ('serieMonotonie') {
                        <ng-container *ngTemplateOutlet="choixSerie" />
                        <div style="flex: 0 0 160px">
                            <label class="etiquette">Sens attendu</label>
                            <select class="champ" name="sens" [(ngModel)]="definition.parametres.sens">
                                <option value="croissant">croissant</option>
                                <option value="decroissant">décroissant</option>
                            </select>
                        </div>
                    }
                    @case ('serieFraicheur') {
                        <ng-container *ngTemplateOutlet="choixSerie" />
                        <div style="flex: 0 0 160px">
                            <label class="etiquette">Retard maximal (heures)</label
                            ><input
                                class="champ"
                                type="number"
                                name="ageMaximalHeures"
                                [(ngModel)]="definition.parametres.ageMaximalHeures"
                                placeholder="24"
                            />
                        </div>
                        <div style="flex: 0 0 200px">
                            <label class="etiquette">Comparé à</label>
                            <select class="champ" name="reference" [(ngModel)]="definition.parametres.reference">
                                <option value="fichier">au point le plus récent du fichier</option>
                                <option value="maintenant">à maintenant</option>
                            </select>
                        </div>
                    }
                    @case ('serieSaisonnalite') {
                        <ng-container *ngTemplateOutlet="choixSerie" />
                        <div style="flex: 0 0 160px">
                            <label class="etiquette">Créneau</label>
                            <select class="champ" name="creneau" [(ngModel)]="definition.parametres.creneau">
                                @for (creneau of creneauxSaison(); track creneau[0]) {
                                    <option [value]="creneau[0]">{{ creneau[1] }}</option>
                                }
                            </select>
                        </div>
                        <div style="flex: 0 0 120px">
                            <label class="etiquette">Sensibilité k</label
                            ><input
                                class="champ"
                                type="number"
                                step="any"
                                name="sensibilite"
                                [(ngModel)]="definition.parametres.sensibilite"
                                placeholder="4"
                            />
                        </div>
                    }
                    @case ('serieCouverture') {
                        <ng-container *ngTemplateOutlet="choixSerie" />
                        <div style="flex: 0 0 160px">
                            <label class="etiquette">Couverture minimale (%)</label
                            ><input
                                class="champ"
                                type="number"
                                name="couvertureMinimale"
                                [(ngModel)]="definition.parametres.couvertureMinimale"
                                placeholder="95"
                            />
                        </div>
                    }
                    @case ('groupe') {
                        <div style="flex: 1 1 100%">
                            <label class="etiquette">Regrouper par</label>
                            <div class="cases">
                                @for (colonne of source().headers; track colonne) {
                                    <label class="case"
                                        ><input
                                            type="checkbox"
                                            [checked]="colonnesGroupe().includes(colonne)"
                                            (change)="basculer(colonnesGroupe, colonne)"
                                        />
                                        <code>{{ colonne }}</code></label
                                    >
                                }
                            </div>
                        </div>
                        <div>
                            <label class="etiquette">Agrégat</label>
                            <select class="champ" name="agregat" [(ngModel)]="definition.parametres.agregat">
                                @for (agregat of agregatsGroupe(); track agregat[0]) {
                                    <option [value]="agregat[0]">{{ agregat[1] }}</option>
                                }
                            </select>
                        </div>
                        @if (definition.parametres.agregat !== 'count') {
                            <div>
                                <label class="etiquette">Colonne agrégée</label>
                                <select class="champ" name="colonneAgregee" [(ngModel)]="definition.parametres.colonneAgregee">
                                    @for (colonne of source().headers; track colonne) {
                                        <option [value]="colonne">{{ colonne }}</option>
                                    }
                                </select>
                            </div>
                        }
                        <div style="flex: 0 0 90px">
                            <label class="etiquette">Doit être</label>
                            <select class="champ" name="operateur" [(ngModel)]="definition.parametres.operateur">
                                @for (operateur of vocabulaire().operateursGroupe; track operateur) {
                                    <option [value]="operateur">{{ operateur }}</option>
                                }
                            </select>
                        </div>
                        <div style="flex: 0 0 120px">
                            <label class="etiquette">Seuil</label
                            ><input class="champ" type="number" step="any" name="seuil" [(ngModel)]="definition.parametres.seuil" />
                        </div>
                        <div style="flex: 1 1 100%">
                            <label class="etiquette">Condition SQL préalable sur les lignes (facultatif)</label
                            ><input
                                class="champ"
                                name="conditionGroupe"
                                [(ngModel)]="definition.parametres.condition"
                                placeholder="statut = 'ACTIF'"
                            />
                        </div>
                    }
                }
            </div>
            <ng-template #choixSerie>
                <div>
                    <label class="etiquette">Série temporelle déclarée (sur cette source)</label>
                    <select class="champ" name="serieId" [(ngModel)]="definition.parametres.serieId">
                        @for (serie of seriesDeLaSource(); track serie.id) {
                            <option [value]="serie.id">{{ serie.name }}</option>
                        }
                    </select>
                    @if (!seriesDeLaSource().length) {
                        <div class="discret">Aucune série sur cette source : déclarez-en une dans Séries temporelles.</div>
                    }
                </div>
            </ng-template>
            <div class="formulaire-ligne" style="margin-top: 10px">
                <button class="bouton principal" type="submit" style="flex: 0">Enregistrer</button>
                <button class="bouton" type="button" style="flex: 0" (click)="annuler.emit()">Annuler</button>
            </div>
        </form>
    `,
    styles: `
        .cases {
            display: flex;
            flex-wrap: wrap;
            gap: 6px 14px;
        }
        .case {
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
        }
    `
})
export class FormulaireRegleComponent implements OnInit {
    readonly brouillon = input.required<BrouillonRegle>();
    readonly source = input.required<Source>();
    readonly sources = input<Source[]>([]);
    readonly vocabulaire = input.required<VocabulaireQualite>();
    readonly listesValeurs = input<ListeValeurs[]>([]);
    readonly series = input<ConfigurationSerie[]>([]);
    readonly enregistrer = output<DefinitionRegle>();
    readonly annuler = output<void>();

    /** Copie éditable de la définition (les champs textuels des listes sont tenus à part). */
    definition!: DefinitionRegle;
    valeursTexte = '';
    siValeursTexte = '';
    alorsValeursTexte = '';
    readonly colonnesSupplementaires = signal<string[]>([]);
    readonly colonnesGroupe = signal<string[]>([]);

    ngOnInit(): void {
        const origine = this.brouillon().definition;
        this.definition = { ...origine, parametres: { ...origine.parametres } };
        this.valeursTexte = enTexte(origine.parametres.valeurs);
        this.siValeursTexte = enTexte(origine.parametres.siValeurs);
        this.alorsValeursTexte = enTexte(origine.parametres.alorsValeurs);
        this.colonnesSupplementaires.set(origine.parametres.colonnes || []);
        this.colonnesGroupe.set(origine.parametres.colonnesGroupe || []);
        this.poserValeursParDefaut();
    }

    typesRegle(): [TypeRegle, string][] {
        return Object.entries(this.vocabulaire().typesRegle) as [TypeRegle, string][];
    }
    operateursCondition(): [string, string][] {
        return Object.entries(this.vocabulaire().operateursCondition);
    }
    agregatsGroupe(): [string, string][] {
        return Object.entries(this.vocabulaire().agregatsGroupe);
    }
    creneauxSaison(): [string, string][] {
        return Object.entries(this.vocabulaire().creneauxSaison || {});
    }
    /** Les séries temporelles déclarées sur la source de la règle. */
    seriesDeLaSource(): ConfigurationSerie[] {
        return this.series().filter(serie => serie.table === this.source().name);
    }
    sansColonne(): boolean {
        return this.vocabulaire().typesSansColonne.includes(this.definition.type);
    }
    autresColonnes(): string[] {
        return this.source().headers.filter(colonne => colonne !== this.definition.colonne);
    }
    colonnesDe(sourceId: string | undefined): string[] {
        return this.sources().find(candidate => candidate.id === sourceId)?.headers || [];
    }
    basculer(liste: ReturnType<typeof signal<string[]>>, colonne: string): void {
        liste.update(valeurs => (valeurs.includes(colonne) ? valeurs.filter(candidat => candidat !== colonne) : [...valeurs, colonne]));
    }
    changerType(type: TypeRegle): void {
        this.definition.type = type;
        this.poserValeursParDefaut();
    }
    /** Valeurs initiales des paramètres selon le type, pour que le formulaire soit cohérent dès l'ouverture. */
    private poserValeursParDefaut(): void {
        const parametres = this.definition.parametres;
        if (this.definition.type === 'condition') {
            parametres.siOperateur ||= 'renseigne';
            parametres.alorsOperateur ||= 'renseigne';
            parametres.alorsColonne ||= this.source().headers.find(colonne => colonne !== this.definition.colonne) || '';
        }
        if (this.definition.type === 'groupe') {
            parametres.agregat ||= 'count';
            parametres.operateur ||= '<=';
        }
        if (this.definition.type === 'fraicheur') parametres.jours ||= 365;
        if (this.definition.type.startsWith('serie')) {
            parametres.serieId ||= this.seriesDeLaSource()[0]?.id;
            parametres.sens ||= 'croissant';
            parametres.reference ||= 'fichier';
            parametres.creneau ||= 'heure';
        }
        if (this.definition.type === 'listeValeurs') parametres.listeId ||= this.listesValeurs()[0]?.id;
        if (this.definition.type === 'reference') parametres.sourceCibleId ||= this.sources()[0]?.id;
    }

    /** Assemble la définition : listes depuis les textes, nombres depuis les champs, colonne vidée si sans objet. */
    soumettre(): void {
        const definition: DefinitionRegle = { ...this.definition, parametres: { ...this.definition.parametres } };
        const parametres = definition.parametres;
        if (definition.type === 'dansListe') parametres.valeurs = enListe(this.valeursTexte);
        if (definition.type === 'condition') {
            parametres.siValeurs = enListe(this.siValeursTexte);
            parametres.alorsValeurs = enListe(this.alorsValeursTexte);
        }
        if (definition.type === 'unique') parametres.colonnes = this.colonnesSupplementaires();
        if (definition.type === 'groupe') parametres.colonnesGroupe = this.colonnesGroupe();
        if (this.sansColonne()) definition.colonne = '';
        for (const champ of [
            'minimum',
            'maximum',
            'jours',
            'seuil',
            'longueurMinimale',
            'sautAbsolu',
            'sautPourcent',
            'ageMaximalHeures',
            'sensibilite',
            'couvertureMinimale'
        ] as const) {
            const valeur = parametres[champ] as unknown;
            parametres[champ] = valeur === '' || valeur === null || valeur === undefined ? undefined : Number(valeur);
        }
        this.enregistrer.emit(definition);
    }
}
