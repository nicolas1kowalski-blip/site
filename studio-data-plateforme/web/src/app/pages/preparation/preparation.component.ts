/**
 * Préparation : des recettes de nettoyage reproductibles. Une recette lit une source, enchaîne des étapes
 * (filtrer, nettoyer, normaliser, standardiser, enrichir, calculer, dédoublonner, renommer, supprimer) et
 * produit une table propre, enregistrée comme source et rejouée automatiquement à chaque mise à jour de la
 * source. L'aperçu montre l'effet de chaque étape avant d'exécuter. Export et import en JSON (format classique).
 */
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import {
    ApercuPreparation,
    RecettePreparation,
    Source,
    TypeEtapePreparation,
    VocabulairePreparation,
    genererIdentifiant
} from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

const OPERATEURS_FILTRE: [string, string][] = [
    ['eq', '= égal à'],
    ['neq', '≠ différent de'],
    ['contains', 'contient'],
    ['ncontains', 'ne contient pas'],
    ['starts', 'commence par'],
    ['ends', 'finit par'],
    ['empty', 'est vide'],
    ['nempty', "n'est pas vide"],
    ['gt', '> supérieur à'],
    ['gte', '≥ supérieur ou égal'],
    ['lt', '< inférieur à'],
    ['lte', '≤ inférieur ou égal']
];

/** Chaîne vide à la place d'une valeur absente (recettes importées d'un fichier incomplet). */
const ouVide = (valeur: string | undefined): string => valeur || '';

/** Paramètres proposés à la création d'une étape, selon son type. */
const PARAMETRES_INITIAUX: Partial<Record<TypeEtapePreparation, Record<string, string>>> = {
    filter: { op: 'eq' },
    clean: { action: 'trim' },
    std: { what: 'phone' },
    enrich: { prefix: 'REF_' }
};

@Component({
    selector: 'app-preparation',
    imports: [FormsModule],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Préparation</h1>
                <p class="discret">
                    Décrivez le nettoyage une seule fois ; la table propre est produite, utilisable partout, et refaite à chaque mise à jour
                    de la source.
                </p>
            </div>
            @if (session.peutEditer()) {
                <button class="bouton principal" (click)="ajouter()">+ Préparation</button>
                <button class="bouton" (click)="exporter()" [disabled]="!recettes().length">Exporter (JSON)</button>
                <label class="bouton"
                    >Importer<input type="file" hidden accept="application/json,.json" (change)="importer($event)"
                /></label>
            }
        </div>
        @if (recettes().length === 0) {
            <div class="carte vide">
                Aucune préparation. Une préparation enchaîne des étapes (filtrer, standardiser, dédoublonner, enrichir…) et produit une
                table propre.
            </div>
        }
        @for (recette of recettes(); track recette.id; let indexRecette = $index) {
            <div class="carte">
                <div class="formulaire-ligne">
                    <div>
                        <label class="etiquette">Nom</label>
                        <input
                            class="champ"
                            [(ngModel)]="recette.name"
                            [name]="'nom-' + indexRecette"
                            [attr.name]="'nom-' + indexRecette"
                            [disabled]="!session.peutEditer()"
                        />
                    </div>
                    <div>
                        <label class="etiquette">Source</label>
                        <select
                            class="champ"
                            [(ngModel)]="recette.src"
                            [name]="'source-' + indexRecette"
                            [attr.name]="'source-' + indexRecette"
                            [disabled]="!session.peutEditer()"
                        >
                            <option value="">— source —</option>
                            @for (source of sourcesEntree(); track source.id) {
                                <option [value]="source.name">{{ source.name }}</option>
                            }
                        </select>
                    </div>
                    <div>
                        <label class="etiquette">Table produite</label>
                        <input
                            class="champ"
                            [(ngModel)]="recette.out"
                            [name]="'sortie-' + indexRecette"
                            [attr.name]="'sortie-' + indexRecette"
                            placeholder="ex : PROPRE_CLIENTS"
                            [disabled]="!session.peutEditer()"
                        />
                    </div>
                    <div class="actions" style="align-self: flex-end">
                        @if (recette.lastAt) {
                            <span class="badge succes"
                                >✔ {{ formaterDate(recette.lastAt) }} · {{ recette.lastRows?.toLocaleString('fr-FR') }} lignes</span
                            >
                        }
                        @if (session.peutEditer()) {
                            <button class="bouton petit" (click)="enregistrer(recette)" [disabled]="enCours()">Enregistrer</button>
                            <button
                                class="bouton petit principal"
                                (click)="executer(recette)"
                                [disabled]="enCours() || !recette.src || !recette.out"
                            >
                                Exécuter
                            </button>
                            <button class="bouton petit danger" (click)="supprimer(recette)" [disabled]="enCours()">✕</button>
                        }
                    </div>
                </div>

                @for (etape of recette.steps; track etape.id; let indexEtape = $index) {
                    <div class="etape" [class.inactive]="!etape.enabled">
                        <span class="numero">{{ indexEtape + 1 }}</span>
                        <input
                            type="checkbox"
                            [(ngModel)]="etape.enabled"
                            [name]="'active-' + indexRecette + '-' + indexEtape"
                            [attr.name]="'active-' + indexRecette + '-' + indexEtape"
                            title="Étape active"
                            [disabled]="!session.peutEditer()"
                        />
                        <select
                            class="champ compact"
                            [(ngModel)]="etape.type"
                            (ngModelChange)="etape.p = {}"
                            [name]="'type-' + indexRecette + '-' + indexEtape"
                            [attr.name]="'type-' + indexRecette + '-' + indexEtape"
                            [disabled]="!session.peutEditer()"
                        >
                            @for (type of typesEtape(); track type[0]) {
                                <option [value]="type[0]">{{ type[1] }}</option>
                            }
                        </select>

                        @switch (etape.type) {
                            @case ('filter') {
                                <select
                                    class="champ compact"
                                    [(ngModel)]="etape.p['col']"
                                    [name]="'col-' + indexRecette + '-' + indexEtape"
                                    [attr.name]="'col-' + indexRecette + '-' + indexEtape"
                                >
                                    <option value="">— colonne —</option>
                                    @for (nom of colonnesDe(recette.src); track nom) {
                                        <option [value]="nom">{{ nom }}</option>
                                    }
                                </select>
                                <select
                                    class="champ compact"
                                    [(ngModel)]="etape.p['op']"
                                    [name]="'op-' + indexRecette + '-' + indexEtape"
                                    [attr.name]="'op-' + indexRecette + '-' + indexEtape"
                                >
                                    @for (operateur of operateursFiltre; track operateur[0]) {
                                        <option [value]="operateur[0]">{{ operateur[1] }}</option>
                                    }
                                </select>
                                @if (etape.p['op'] !== 'empty' && etape.p['op'] !== 'nempty') {
                                    <input
                                        class="champ compact"
                                        [(ngModel)]="etape.p['val']"
                                        [name]="'val-' + indexRecette + '-' + indexEtape"
                                        [attr.name]="'val-' + indexRecette + '-' + indexEtape"
                                        placeholder="valeur"
                                    />
                                }
                            }
                            @case ('clean') {
                                <select
                                    class="champ compact"
                                    [(ngModel)]="etape.p['col']"
                                    [name]="'col-' + indexRecette + '-' + indexEtape"
                                    [attr.name]="'col-' + indexRecette + '-' + indexEtape"
                                >
                                    <option value="">— colonne —</option>
                                    @for (nom of colonnesDe(recette.src); track nom) {
                                        <option [value]="nom">{{ nom }}</option>
                                    }
                                </select>
                                <select
                                    class="champ compact"
                                    [(ngModel)]="etape.p['action']"
                                    [name]="'action-' + indexRecette + '-' + indexEtape"
                                    [attr.name]="'action-' + indexRecette + '-' + indexEtape"
                                >
                                    @for (action of entrees(vocabulaire()?.actionsNettoyage); track action[0]) {
                                        <option [value]="action[0]">{{ action[1] }}</option>
                                    }
                                </select>
                            }
                            @case ('normalize') {
                                <select
                                    class="champ compact"
                                    [(ngModel)]="etape.p['col']"
                                    [name]="'col-' + indexRecette + '-' + indexEtape"
                                    [attr.name]="'col-' + indexRecette + '-' + indexEtape"
                                >
                                    <option value="">— colonne —</option>
                                    @for (nom of colonnesDe(recette.src); track nom) {
                                        <option [value]="nom">{{ nom }}</option>
                                    }
                                </select>
                                <select
                                    class="champ compact"
                                    [(ngModel)]="etape.p['fmt']"
                                    [name]="'fmt-' + indexRecette + '-' + indexEtape"
                                    [attr.name]="'fmt-' + indexRecette + '-' + indexEtape"
                                >
                                    <option value="">— format —</option>
                                    @for (format of entrees(vocabulaire()?.formats); track format[0]) {
                                        <option [value]="format[0]">{{ format[1] }}</option>
                                    }
                                </select>
                            }
                            @case ('std') {
                                <select
                                    class="champ compact"
                                    [(ngModel)]="etape.p['col']"
                                    [name]="'col-' + indexRecette + '-' + indexEtape"
                                    [attr.name]="'col-' + indexRecette + '-' + indexEtape"
                                >
                                    <option value="">— colonne —</option>
                                    @for (nom of colonnesDe(recette.src); track nom) {
                                        <option [value]="nom">{{ nom }}</option>
                                    }
                                </select>
                                <select
                                    class="champ compact"
                                    [(ngModel)]="etape.p['what']"
                                    [name]="'what-' + indexRecette + '-' + indexEtape"
                                    [attr.name]="'what-' + indexRecette + '-' + indexEtape"
                                >
                                    @for (standard of entrees(vocabulaire()?.standardisations); track standard[0]) {
                                        <option [value]="standard[0]">{{ standard[1] }}</option>
                                    }
                                </select>
                            }
                            @case ('enrich') {
                                <select
                                    class="champ compact"
                                    [(ngModel)]="etape.p['col']"
                                    [name]="'col-' + indexRecette + '-' + indexEtape"
                                    [attr.name]="'col-' + indexRecette + '-' + indexEtape"
                                >
                                    <option value="">— colonne —</option>
                                    @for (nom of colonnesDe(recette.src); track nom) {
                                        <option [value]="nom">{{ nom }}</option>
                                    }
                                </select>
                                <select
                                    class="champ compact"
                                    [(ngModel)]="etape.p['ref']"
                                    [name]="'ref-' + indexRecette + '-' + indexEtape"
                                    [attr.name]="'ref-' + indexRecette + '-' + indexEtape"
                                >
                                    <option value="">— référentiel —</option>
                                    @for (referentiel of referentiels(); track referentiel[0]) {
                                        <option [value]="referentiel[0]">{{ referentiel[1].label }}</option>
                                    }
                                </select>
                                <span class="discret">préfixe</span>
                                <input
                                    class="champ compact"
                                    style="width: 70px"
                                    [(ngModel)]="etape.p['prefix']"
                                    [name]="'prefix-' + indexRecette + '-' + indexEtape"
                                    [attr.name]="'prefix-' + indexRecette + '-' + indexEtape"
                                    placeholder="REF_"
                                />
                                @if (etape.lastMatch != null) {
                                    <span class="badge" [class.succes]="etape.lastMatch >= 90" [class.alerte]="etape.lastMatch < 90"
                                        >{{ etape.lastMatch }} % appariés</span
                                    >
                                }
                            }
                            @case ('calc') {
                                <input
                                    class="champ compact"
                                    [(ngModel)]="etape.p['name']"
                                    [name]="'name-' + indexRecette + '-' + indexEtape"
                                    [attr.name]="'name-' + indexRecette + '-' + indexEtape"
                                    placeholder="nom de la colonne"
                                />
                                <span>=</span>
                                <input
                                    class="champ compact large"
                                    [(ngModel)]="etape.p['formula']"
                                    [name]="'formula-' + indexRecette + '-' + indexEtape"
                                    [attr.name]="'formula-' + indexRecette + '-' + indexEtape"
                                    placeholder="ex : [PRIX] * [QTE]"
                                />
                            }
                            @case ('dedup') {
                                <span class="discret">clé</span>
                                <input
                                    class="champ compact large"
                                    [(ngModel)]="etape.p['keys']"
                                    [name]="'keys-' + indexRecette + '-' + indexEtape"
                                    [attr.name]="'keys-' + indexRecette + '-' + indexEtape"
                                    placeholder="colonnes séparées par ;"
                                />
                            }
                            @case ('rename') {
                                <select
                                    class="champ compact"
                                    [(ngModel)]="etape.p['col']"
                                    [name]="'col-' + indexRecette + '-' + indexEtape"
                                    [attr.name]="'col-' + indexRecette + '-' + indexEtape"
                                >
                                    <option value="">— colonne —</option>
                                    @for (nom of colonnesDe(recette.src); track nom) {
                                        <option [value]="nom">{{ nom }}</option>
                                    }
                                </select>
                                <span>→</span>
                                <input
                                    class="champ compact"
                                    [(ngModel)]="etape.p['to']"
                                    [name]="'to-' + indexRecette + '-' + indexEtape"
                                    [attr.name]="'to-' + indexRecette + '-' + indexEtape"
                                    placeholder="nouveau nom"
                                />
                            }
                            @case ('drop') {
                                <input
                                    class="champ compact large"
                                    [(ngModel)]="etape.p['cols']"
                                    [name]="'cols-' + indexRecette + '-' + indexEtape"
                                    [attr.name]="'cols-' + indexRecette + '-' + indexEtape"
                                    placeholder="colonnes à supprimer, séparées par ;"
                                />
                            }
                        }

                        <span class="espace"></span>
                        <button
                            class="bouton petit"
                            (click)="apercevoir(recette, indexEtape)"
                            [disabled]="enCours() || !recette.src"
                            title="Aperçu après cette étape"
                        >
                            👁
                        </button>
                        @if (session.peutEditer()) {
                            <button class="bouton petit" (click)="deplacer(recette, indexEtape, -1)" [disabled]="indexEtape === 0">
                                ▲
                            </button>
                            <button
                                class="bouton petit"
                                (click)="deplacer(recette, indexEtape, 1)"
                                [disabled]="indexEtape === recette.steps.length - 1"
                            >
                                ▼
                            </button>
                            <button class="bouton petit danger" (click)="recette.steps.splice(indexEtape, 1)">✕</button>
                        }
                    </div>
                }
                @if (session.peutEditer()) {
                    <div class="ajout-etape">
                        <span class="etiquette">+ étape :</span>
                        @for (type of typesEtape(); track type[0]) {
                            <button class="bouton petit" (click)="ajouterEtape(recette, type[0])">{{ type[1] }}</button>
                        }
                    </div>
                }
                @if (apercus()[recette.id]; as apercu) {
                    <div class="apercu">
                        <div class="entete-page" style="margin-bottom: 4px">
                            <span class="discret espace"
                                >Aperçu après l'étape {{ apercu.etape + 1 }} : {{ apercu.resultat.total.toLocaleString('fr-FR') }} ligne(s),
                                30 affichées</span
                            >
                            <button class="bouton petit" (click)="fermerApercu(recette)">Fermer</button>
                        </div>
                        <div class="defilement-x">
                            <table class="tableau">
                                <thead>
                                    <tr>
                                        @for (colonne of apercu.resultat.colonnes; track colonne) {
                                            <th>{{ colonne }}</th>
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
                        <details>
                            <summary class="discret">SQL</summary>
                            <pre class="sql">{{ apercu.resultat.sql }}</pre>
                        </details>
                    </div>
                }
                <p class="discret" style="margin: 8px 0 0">
                    Rejouée automatiquement quand « {{ recette.src || 'la source' }} » est mise à jour · la table propre apparaît dans les
                    sources · même entrée → même sortie.
                </p>
            </div>
        }
    `,
    styles: `
        .actions {
            display: flex;
            gap: 6px;
            align-items: center;
            flex-wrap: wrap;
        }
        .etape {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
            padding: 6px 0;
            border-top: 1px solid var(--bordure);
        }
        .etape.inactive {
            opacity: 0.45;
        }
        .numero {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: var(--accent);
            color: white;
            font-size: 11px;
            font-weight: 700;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }
        .champ.compact {
            width: auto;
            max-width: 180px;
            padding: 3px 6px;
            font-size: 12px;
        }
        .champ.compact.large {
            max-width: 320px;
            width: 300px;
        }
        .ajout-etape {
            display: flex;
            gap: 4px;
            flex-wrap: wrap;
            align-items: center;
            margin-top: 8px;
        }
        .apercu {
            margin-top: 10px;
            border: 1px solid var(--bordure);
            border-radius: 6px;
            padding: 8px;
        }
        .sql {
            font-size: 12px;
            white-space: pre-wrap;
            background: var(--surface-2);
            padding: 8px;
            border-radius: 6px;
        }
    `
})
export class PreparationComponent {
    readonly session = inject(SessionService);
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    readonly sources = signal<Source[]>([]);
    readonly vocabulaire = signal<VocabulairePreparation | null>(null);
    readonly recettes = signal<RecettePreparation[]>([]);
    readonly apercus = signal<Record<string, { etape: number; resultat: ApercuPreparation }>>({});
    readonly enCours = signal(false);
    readonly operateursFiltre = OPERATEURS_FILTRE;

    /** Une recette lit une source déposée (pas une table conçue). */
    readonly sourcesEntree = computed(() => this.sources().filter(source => source.type !== 'designed'));
    readonly typesEtape = computed(() => Object.entries(this.vocabulaire()?.typesEtape || {}) as [TypeEtapePreparation, string][]);
    readonly referentiels = computed(() => Object.entries(this.vocabulaire()?.referentiels || {}));

    constructor() {
        void this.charger();
    }

    private async charger(): Promise<void> {
        try {
            const [sources, vocabulaire, recettes] = await Promise.all([
                this.api.sources(),
                this.api.vocabulairePreparation(),
                this.api.recettesPreparation()
            ]);
            this.sources.set(sources);
            this.vocabulaire.set(vocabulaire);
            this.recettes.set(
                recettes.map(recette => ({ ...recette, steps: recette.steps.map(etape => ({ ...etape, p: etape.p || {} })) }))
            );
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    entrees(dictionnaire: Record<string, string> | undefined): [string, string][] {
        return Object.entries(dictionnaire || {});
    }

    colonnesDe(nomSource: string): string[] {
        return this.sources().find(source => source.name === nomSource)?.headers || [];
    }

    formaterDate(horodatage: number): string {
        return new Date(horodatage).toLocaleString('fr-FR');
    }

    ajouter(): void {
        this.recettes.update(liste => [
            ...liste,
            { id: genererIdentifiant('rc_'), name: 'Nouvelle préparation', src: '', out: '', steps: [] }
        ]);
    }

    ajouterEtape(recette: RecettePreparation, type: TypeEtapePreparation): void {
        recette.steps.push({ id: genererIdentifiant('st_'), type, enabled: true, p: { ...(PARAMETRES_INITIAUX[type] || {}) } });
    }

    deplacer(recette: RecettePreparation, index: number, sens: -1 | 1): void {
        const cible = index + sens;
        if (cible < 0 || cible >= recette.steps.length) return;
        [recette.steps[index], recette.steps[cible]] = [recette.steps[cible], recette.steps[index]];
    }

    private async sauver(recette: RecettePreparation): Promise<RecettePreparation> {
        const enregistree = await this.api.enregistrerRecettePreparation(recette);
        this.recettes.update(liste =>
            liste.map(candidat => (candidat.id === recette.id ? { ...candidat, ...enregistree, steps: recette.steps } : candidat))
        );
        return enregistree;
    }

    async enregistrer(recette: RecettePreparation): Promise<void> {
        try {
            await this.sauver(recette);
            this.notifications.succes(`Préparation « ${recette.name} » enregistrée.`);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async executer(recette: RecettePreparation): Promise<void> {
        this.enCours.set(true);
        try {
            if (this.session.peutEditer()) await this.sauver(recette);
            const resultat = await this.api.executerPreparation(recette.id);
            this.recettes.update(liste =>
                liste.map(candidat => (candidat.id === recette.id ? { ...candidat, ...resultat.recette } : candidat))
            );
            this.sources.set(await this.api.sources());
            this.notifications.succes(
                `Table propre « ${recette.out} » produite : ${resultat.lignes.toLocaleString('fr-FR')} ligne(s), ${resultat.colonnes.length} colonne(s).`
            );
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    async apercevoir(recette: RecettePreparation, indexEtape: number): Promise<void> {
        this.enCours.set(true);
        try {
            if (this.session.peutEditer()) await this.sauver(recette);
            const resultat = await this.api.apercuPreparation(recette.id, indexEtape);
            this.apercus.update(actuel => ({ ...actuel, [recette.id]: { etape: indexEtape, resultat } }));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    fermerApercu(recette: RecettePreparation): void {
        this.apercus.update(actuel => {
            const copie = { ...actuel };
            delete copie[recette.id];
            return copie;
        });
    }

    async supprimer(recette: RecettePreparation): Promise<void> {
        if (!confirm(`Supprimer la préparation « ${recette.name} » ? La table produite, si elle existe, reste dans les sources.`)) return;
        try {
            await this.api.supprimerRecettePreparation(recette.id).catch(() => undefined);
            this.recettes.update(liste => liste.filter(candidat => candidat.id !== recette.id));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    /** Export au format de l'application classique : { kind: 'studio-data-recipes', recipes: [...] }. */
    exporter(): void {
        const contenu = JSON.stringify({ kind: 'studio-data-recipes', recipes: this.recettes() }, null, 2);
        const lien = document.createElement('a');
        lien.href = URL.createObjectURL(new Blob([contenu], { type: 'application/json' }));
        lien.download = 'preparations.json';
        lien.click();
        URL.revokeObjectURL(lien.href);
    }

    async importer(evenement: Event): Promise<void> {
        const champ = evenement.target as HTMLInputElement;
        const fichier = champ.files?.[0];
        if (!fichier) return;
        try {
            const contenu = JSON.parse(await fichier.text()) as { kind?: string; recipes?: RecettePreparation[] } | RecettePreparation[];
            const liste = Array.isArray(contenu) ? contenu : contenu.kind === 'studio-data-recipes' ? contenu.recipes || [] : null;
            if (!liste) throw new Error('Fichier non reconnu : attendu un export de préparations.');
            let importees = 0;
            for (const recette of liste) {
                const identifiantPris = this.recettes().some(candidat => candidat.id === recette.id);
                const identifiant = identifiantPris || !recette.id ? genererIdentifiant('rc_') : recette.id;
                const nouvelle: RecettePreparation = {
                    id: identifiant,
                    name: recette.name || 'Préparation importée',
                    src: ouVide(recette.src),
                    out: ouVide(recette.out),
                    steps: (recette.steps || []).map(etape => ({
                        id: etape.id || genererIdentifiant('st_'),
                        type: etape.type,
                        enabled: etape.enabled !== false,
                        p: etape.p || {}
                    }))
                };
                await this.api.enregistrerRecettePreparation(nouvelle);
                this.recettes.update(actuel => [...actuel, nouvelle]);
                importees++;
            }
            this.notifications.succes(`${importees} préparation(s) importée(s).`);
        } catch (erreur) {
            this.notifications.erreur(erreur instanceof SyntaxError ? 'Fichier JSON invalide.' : (erreur as Error));
        } finally {
            champ.value = '';
        }
    }
}
