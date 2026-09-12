/**
 * Objets métier : la liste (gauche) et la fiche de l'objet choisi (droite).
 *   • Identité : nom, définition, domaine, propriétaire, contributeurs, statut, complétude de la fiche ;
 *   • Attributs : nom, définition, sensibilité, terme du glossaire, colonnes techniques qui les alimentent
 *     (table.colonne), actifs qui les utilisent ;
 *   • Sources : tables techniques et leur rôle (maître, contributeur, destinataire) ;
 *   • Actifs producteurs et consommateurs, objets référencés ;
 *   • Historique des décisions (propositions validées ou refusées).
 * Un objet peut être initialisé depuis une source : un attribut par colonne, déjà rattaché à la table.
 * Un lecteur peut proposer une définition d'attribut ; un éditeur modifie directement.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import {
    Actif,
    AttributObjetMetier,
    ObjetMetier,
    RoleObjetSource,
    Source,
    TermeGlossaire,
    VocabulaireGouvernance,
    formaterDate,
    genererIdentifiant
} from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

type OngletFiche = 'attributs' | 'sources' | 'liens' | 'historique';

const OBJET_VIDE = (): ObjetMetier => ({
    id: genererIdentifiant('bo'),
    name: '',
    definition: '',
    domain: '',
    globalOwner: '',
    contributors: [],
    status: 'Brouillon',
    elements: [],
    sources: [],
    producedBy: [],
    consumedBy: [],
    references: []
});

/** Complétude de la fiche : mêmes critères pondérés que l'application classique (boCompleteness). */
export function completudeObjet(objet: ObjetMetier, avecActifs: boolean): { score: number; aFaire: string[] } {
    const attributs = objet.elements || [];
    const sansAlimentation = attributs.filter(attribut => !(attribut.mappings || []).length).length;
    const sansDefinition = attributs.filter(attribut => !attribut.definition).length;
    const sansUsage = attributs.filter(attribut => !(attribut.usedBy || []).length).length;
    const criteres: { poids: number; ok: boolean; libelle: string }[] = [
        { poids: 15, ok: !!objet.definition.trim(), libelle: 'Écrire la définition' },
        { poids: 15, ok: !!objet.globalOwner.trim(), libelle: 'Désigner un propriétaire' },
        { poids: 15, ok: objet.sources.some(source => source.role === 'maitre'), libelle: 'Désigner une source maître' },
        { poids: 10, ok: attributs.length > 0, libelle: 'Ajouter des attributs' },
        { poids: 15, ok: attributs.length > 0 && sansAlimentation === 0, libelle: `${sansAlimentation} attribut(s) non alimenté(s)` },
        { poids: 15, ok: attributs.length > 0 && sansDefinition === 0, libelle: `${sansDefinition} attribut(s) sans définition` },
        ...(avecActifs ? [{ poids: 10, ok: attributs.length > 0 && sansUsage === 0, libelle: `${sansUsage} attribut(s) sans usage` }] : []),
        { poids: 5, ok: objet.status === 'Validé', libelle: "Faire valider l'objet" }
    ];
    const total = criteres.reduce((somme, critere) => somme + critere.poids, 0);
    const obtenu = criteres.filter(critere => critere.ok).reduce((somme, critere) => somme + critere.poids, 0);
    return { score: Math.round((100 * obtenu) / total), aFaire: criteres.filter(critere => !critere.ok).map(critere => critere.libelle) };
}

@Component({
    selector: 'app-objets-metier',
    imports: [FormsModule],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Objets métier</h1>
                <p class="discret">
                    {{ objets().length }} objet(s) — ce que l'entreprise manipule, décrit en langage métier et relié aux sources.
                </p>
            </div>
            @if (session.peutEditer()) {
                <select class="champ" style="width: auto" [(ngModel)]="sourceInitiale" name="sourceInitiale">
                    <option value="">Initialiser depuis une source…</option>
                    @for (source of sources(); track source.id) {
                        <option [value]="source.name">{{ source.name }}</option>
                    }
                </select>
                <button class="bouton" (click)="initialiserDepuisSource()" [disabled]="!sourceInitiale">Initialiser</button>
                <button class="bouton principal" (click)="nouvelObjet()">Nouvel objet</button>
            }
        </div>

        <div class="disposition">
            <!-- ---- liste ---- -->
            <div class="carte liste">
                <input class="champ" placeholder="Filtrer…" [(ngModel)]="filtre" name="filtre" />
                @for (objet of objetsFiltres(); track objet.id) {
                    <button class="element" [class.actif]="objet.id === selectionId()" (click)="selectionner(objet)">
                        <span class="nom">{{ objet.name || '(sans nom)' }}</span>
                        <span class="discret"
                            >{{ objet.domain || '—' }} · {{ objet.elements.length }} attribut(s) · {{ completude(objet).score }} %</span
                        >
                    </button>
                } @empty {
                    <div class="discret" style="padding: 12px">Aucun objet métier.</div>
                }
            </div>

            <!-- ---- fiche ---- -->
            @if (edition(); as objet) {
                <div class="carte fiche">
                    <div class="entete-page" style="margin: 0 0 8px">
                        <h2 class="espace">{{ objet.name || 'Nouvel objet métier' }}</h2>
                        <span class="badge" [class.succes]="completude(objet).score >= 80" [class.alerte]="completude(objet).score < 80"
                            >complétude {{ completude(objet).score }} %</span
                        >
                        @if (session.peutEditer()) {
                            <button class="bouton principal" (click)="enregistrer()" [disabled]="enCours()">Enregistrer</button>
                            @if (!nouveau()) {
                                <button class="bouton danger" (click)="supprimer(objet)">Supprimer</button>
                            }
                        }
                    </div>
                    @if (completude(objet).aFaire.length) {
                        <div class="discret" style="margin-bottom: 8px">À faire : {{ completude(objet).aFaire.join(' · ') }}</div>
                    }
                    <div class="formulaire-ligne">
                        <div>
                            <label class="etiquette">Nom</label
                            ><input class="champ" name="nom" [(ngModel)]="objet.name" [disabled]="!session.peutEditer()" />
                        </div>
                        <div>
                            <label class="etiquette">Domaine métier</label
                            ><input
                                class="champ"
                                name="domaine"
                                [(ngModel)]="objet.domain"
                                list="domaines"
                                [disabled]="!session.peutEditer()"
                            />
                            <datalist id="domaines">
                                @for (domaine of domaines(); track domaine) {
                                    <option [value]="domaine"></option>
                                }
                            </datalist>
                        </div>
                        <div>
                            <label class="etiquette">Propriétaire</label
                            ><input class="champ" name="proprietaire" [(ngModel)]="objet.globalOwner" [disabled]="!session.peutEditer()" />
                        </div>
                        <div>
                            <label class="etiquette">Statut</label>
                            <select class="champ" name="statut" [(ngModel)]="objet.status" [disabled]="!session.peutEditer()">
                                <option>Brouillon</option>
                                <option>En revue</option>
                                <option>Validé</option>
                            </select>
                        </div>
                    </div>
                    <label class="etiquette" style="margin-top: 8px">Définition</label>
                    <textarea
                        class="champ"
                        name="definition"
                        [(ngModel)]="objet.definition"
                        style="font-family: inherit"
                        [disabled]="!session.peutEditer()"
                    ></textarea>
                    <label class="etiquette" style="margin-top: 8px">Contributeurs (séparés par des virgules)</label>
                    <input
                        class="champ"
                        name="contributeurs"
                        [ngModel]="objet.contributors.join(', ')"
                        (ngModelChange)="definirContributeurs($event)"
                        [disabled]="!session.peutEditer()"
                    />

                    <div class="onglets">
                        @for (onglet of onglets; track onglet.cle) {
                            <button [class.actif]="ongletActif() === onglet.cle" (click)="ongletActif.set(onglet.cle)">
                                {{ onglet.libelle }}
                            </button>
                        }
                    </div>

                    <!-- attributs -->
                    @if (ongletActif() === 'attributs') {
                        <div class="defilement-x">
                            <table class="tableau">
                                <thead>
                                    <tr>
                                        <th>Attribut</th>
                                        <th>Définition</th>
                                        <th>Sensibilité</th>
                                        <th>Terme</th>
                                        <th>Colonnes techniques</th>
                                        <th>Utilisé par</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @for (attribut of objet.elements; track attribut.id; let index = $index) {
                                        <tr>
                                            <td>
                                                <input
                                                    class="champ"
                                                    [(ngModel)]="attribut.name"
                                                    [name]="'attribut-nom-' + index"
                                                    [attr.name]="'attribut-nom-' + index"
                                                    [disabled]="!session.peutEditer()"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    class="champ"
                                                    [(ngModel)]="attribut.definition"
                                                    [name]="'attribut-definition-' + index"
                                                    [attr.name]="'attribut-definition-' + index"
                                                    [disabled]="!session.peutEditer()"
                                                />
                                                @if (!session.peutEditer()) {
                                                    <button class="bouton petit" (click)="proposerDefinition(objet, attribut)">
                                                        Proposer une définition
                                                    </button>
                                                }
                                            </td>
                                            <td>
                                                <select
                                                    class="champ"
                                                    [(ngModel)]="attribut.sensitivity"
                                                    [name]="'attribut-sensibilite-' + index"
                                                    [disabled]="!session.peutEditer()"
                                                >
                                                    <option value="">—</option>
                                                    <option>Public</option>
                                                    <option>Interne</option>
                                                    <option>Sensible</option>
                                                    <option>Personnel (RGPD)</option>
                                                </select>
                                            </td>
                                            <td>
                                                <select
                                                    class="champ"
                                                    [(ngModel)]="attribut.term"
                                                    [name]="'attribut-terme-' + index"
                                                    [disabled]="!session.peutEditer()"
                                                >
                                                    <option value="">—</option>
                                                    @for (terme of termes(); track terme.id) {
                                                        <option [value]="terme.term">{{ terme.term }}</option>
                                                    }
                                                </select>
                                            </td>
                                            <td>
                                                @for (correspondance of attribut.mappings; track $index; let indexCorrespondance = $index) {
                                                    <span class="puce"
                                                        >{{ correspondance.table }}.{{ correspondance.col }}
                                                        @if (session.peutEditer()) {
                                                            <a (click)="attribut.mappings.splice(indexCorrespondance, 1)">✕</a>
                                                        }
                                                    </span>
                                                }
                                                @if (session.peutEditer()) {
                                                    <div class="ajout-colonne">
                                                        <select
                                                            class="champ"
                                                            [(ngModel)]="choixTable[attribut.id]"
                                                            [name]="'attribut-table-' + index"
                                                            [attr.name]="'attribut-table-' + index"
                                                        >
                                                            <option value="">— table —</option>
                                                            @for (source of sources(); track source.id) {
                                                                <option [value]="source.name">{{ source.name }}</option>
                                                            }
                                                        </select>
                                                        <select
                                                            class="champ"
                                                            [(ngModel)]="choixColonne[attribut.id]"
                                                            [name]="'attribut-colonne-' + index"
                                                            [attr.name]="'attribut-colonne-' + index"
                                                        >
                                                            <option value="">— colonne —</option>
                                                            @for (colonne of colonnesDe(choixTable[attribut.id]); track colonne) {
                                                                <option [value]="colonne">{{ colonne }}</option>
                                                            }
                                                        </select>
                                                        <button class="bouton petit" (click)="ajouterCorrespondance(attribut)">+</button>
                                                    </div>
                                                }
                                            </td>
                                            <td>
                                                @for (actif of actifs(); track actif.id) {
                                                    <label class="case">
                                                        <input
                                                            type="checkbox"
                                                            [checked]="attribut.usedBy.includes(actif.id)"
                                                            (change)="basculer(attribut.usedBy, actif.id)"
                                                            [disabled]="!session.peutEditer()"
                                                        />
                                                        {{ actif.name }}
                                                    </label>
                                                }
                                            </td>
                                            <td>
                                                @if (session.peutEditer()) {
                                                    <button class="bouton petit danger" (click)="objet.elements.splice(index, 1)">✕</button>
                                                }
                                            </td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        </div>
                        @if (session.peutEditer()) {
                            <button class="bouton petit" style="margin-top: 8px" (click)="ajouterAttribut(objet)">+ attribut</button>
                        }
                    }

                    <!-- sources -->
                    @if (ongletActif() === 'sources') {
                        <table class="tableau">
                            <thead>
                                <tr>
                                    <th>Table technique</th>
                                    <th>Rôle</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                @for (source of objet.sources; track source.table; let index = $index) {
                                    <tr>
                                        <td>{{ source.table }}</td>
                                        <td>
                                            <select
                                                class="champ"
                                                [(ngModel)]="source.role"
                                                [name]="'source-role-' + index"
                                                [attr.name]="'source-role-' + index"
                                                [disabled]="!session.peutEditer()"
                                            >
                                                @for (role of rolesSource(); track role.cle) {
                                                    <option [value]="role.cle">{{ role.libelle }}</option>
                                                }
                                            </select>
                                        </td>
                                        <td>
                                            @if (session.peutEditer()) {
                                                <button class="bouton petit danger" (click)="objet.sources.splice(index, 1)">✕</button>
                                            }
                                        </td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                        @if (session.peutEditer()) {
                            <div class="formulaire-ligne" style="margin-top: 8px; max-width: 620px">
                                <select class="champ" [(ngModel)]="sourceARattacher" name="sourceARattacher">
                                    <option value="">— table —</option>
                                    @for (source of sources(); track source.id) {
                                        <option [value]="source.name">{{ source.name }}</option>
                                    }
                                </select>
                                <select class="champ" [(ngModel)]="roleARattacher" name="roleARattacher">
                                    @for (role of rolesSource(); track role.cle) {
                                        <option [value]="role.cle">{{ role.libelle }}</option>
                                    }
                                </select>
                                <label class="case"
                                    ><input type="checkbox" [(ngModel)]="genererAttributs" name="genererAttributs" /> créer les
                                    attributs</label
                                >
                                <button
                                    class="bouton"
                                    (click)="rattacherSource(objet)"
                                    [disabled]="!sourceARattacher"
                                    style="flex: 0 0 auto"
                                >
                                    Rattacher
                                </button>
                            </div>
                        }
                    }

                    <!-- liens : actifs et objets référencés -->
                    @if (ongletActif() === 'liens') {
                        <div class="formulaire-ligne">
                            <div>
                                <label class="etiquette">Produit par</label>
                                @for (actif of actifs(); track actif.id) {
                                    <label class="case"
                                        ><input
                                            type="checkbox"
                                            [checked]="objet.producedBy.includes(actif.id)"
                                            (change)="basculer(objet.producedBy, actif.id)"
                                            [disabled]="!session.peutEditer()"
                                        />
                                        {{ actif.name }}</label
                                    >
                                } @empty {
                                    <div class="discret">Aucun actif déclaré (écran Applications & processus).</div>
                                }
                            </div>
                            <div>
                                <label class="etiquette">Consommé par</label>
                                @for (actif of actifs(); track actif.id) {
                                    <label class="case"
                                        ><input
                                            type="checkbox"
                                            [checked]="objet.consumedBy.includes(actif.id)"
                                            (change)="basculer(objet.consumedBy, actif.id)"
                                            [disabled]="!session.peutEditer()"
                                        />
                                        {{ actif.name }}</label
                                    >
                                }
                            </div>
                            <div>
                                <label class="etiquette">Objets référencés</label>
                                @for (autre of autresObjets(); track autre.id) {
                                    <label class="case"
                                        ><input
                                            type="checkbox"
                                            [checked]="referencie(objet, autre.id)"
                                            (change)="basculerReference(objet, autre.id)"
                                            [disabled]="!session.peutEditer()"
                                        />
                                        {{ autre.name }}</label
                                    >
                                } @empty {
                                    <div class="discret">Aucun autre objet.</div>
                                }
                            </div>
                        </div>
                    }

                    <!-- historique -->
                    @if (ongletActif() === 'historique') {
                        @for (entree of objet.history || []; track $index) {
                            <div class="discret">
                                {{ formaterDate(entree.at) }} — {{ entree.from }} → {{ entree.to }} par {{ entree.by }} :
                                {{ entree.comment }}
                            </div>
                        } @empty {
                            <div class="discret">Aucune décision enregistrée sur cet objet.</div>
                        }
                    }
                </div>
            } @else {
                <div class="carte fiche discret" style="text-align: center; padding: 40px">Choisissez un objet métier, ou créez-en un.</div>
            }
        </div>
    `,
    styles: `
        .disposition {
            display: grid;
            grid-template-columns: 280px 1fr;
            gap: 14px;
            align-items: start;
        }
        @media (max-width: 900px) {
            .disposition {
                grid-template-columns: 1fr;
            }
        }
        .liste .element {
            display: block;
            width: 100%;
            text-align: left;
            border: 0;
            background: none;
            padding: 8px;
            border-radius: 8px;
            cursor: pointer;
            font: inherit;
        }
        .liste .element:hover {
            background: var(--surface-2);
        }
        .liste .element.actif {
            background: var(--accent-2);
        }
        .liste .nom {
            display: block;
            font-weight: 700;
        }
        .liste .champ {
            margin-bottom: 8px;
        }
        .onglets {
            display: flex;
            gap: 4px;
            margin: 14px 0 10px;
            border-bottom: 1px solid var(--bordure);
        }
        .onglets button {
            border: 0;
            background: none;
            padding: 8px 12px;
            font: inherit;
            font-weight: 600;
            color: var(--texte-2);
            cursor: pointer;
            border-bottom: 2px solid transparent;
        }
        .onglets button.actif {
            color: var(--accent);
            border-bottom-color: var(--accent);
        }
        .puce {
            display: inline-block;
            font-size: 11px;
            padding: 2px 6px;
            margin: 0 4px 4px 0;
            border: 1px solid var(--bordure);
            border-radius: 6px;
            background: var(--surface-2);
        }
        .puce a {
            cursor: pointer;
            margin-left: 4px;
            color: var(--erreur);
        }
        .ajout-colonne {
            display: flex;
            gap: 4px;
        }
        .ajout-colonne .champ {
            min-width: 110px;
        }
        .case {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
        }
    `
})
export class ObjetsMetierComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    readonly session = inject(SessionService);
    readonly formaterDate = formaterDate;

    readonly objets = signal<ObjetMetier[]>([]);
    readonly sources = signal<Source[]>([]);
    readonly actifs = signal<Actif[]>([]);
    readonly termes = signal<TermeGlossaire[]>([]);
    readonly domaines = signal<string[]>([]);
    readonly vocabulaire = signal<VocabulaireGouvernance | null>(null);
    readonly selectionId = signal<string | null>(null);
    readonly edition = signal<ObjetMetier | null>(null);
    readonly nouveau = signal(false);
    readonly ongletActif = signal<OngletFiche>('attributs');
    readonly enCours = signal(false);
    readonly onglets: { cle: OngletFiche; libelle: string }[] = [
        { cle: 'attributs', libelle: 'Attributs' },
        { cle: 'sources', libelle: 'Sources' },
        { cle: 'liens', libelle: 'Actifs et références' },
        { cle: 'historique', libelle: 'Historique' }
    ];
    filtre = '';
    sourceInitiale = '';
    sourceARattacher = '';
    roleARattacher: RoleObjetSource = 'maitre';
    genererAttributs = true;
    choixTable: Record<string, string> = {};
    choixColonne: Record<string, string> = {};

    readonly objetsFiltres = computed(() => {
        const texte = this.filtre.trim().toLowerCase();
        return this.objets().filter(
            objet => !texte || `${objet.name} ${objet.domain || ''} ${objet.definition}`.toLowerCase().includes(texte)
        );
    });
    readonly rolesSource = computed(() =>
        Object.entries(this.vocabulaire()?.rolesSource || {}).map(([cle, libelle]) => ({ cle, libelle }))
    );
    readonly autresObjets = computed(() => this.objets().filter(objet => objet.id !== this.selectionId()));

    constructor() {
        void this.recharger();
    }

    async recharger(): Promise<void> {
        try {
            const [objets, sources, actifs, termes, domaines, vocabulaire] = await Promise.all([
                this.api.objetsMetier(),
                this.api.sources(),
                this.api.actifs(),
                this.api.glossaire(),
                this.api.domaines(),
                this.vocabulaire() ?? this.api.vocabulaireGouvernance()
            ]);
            this.objets.set(objets.map(objet => ({ ...OBJET_VIDE(), ...objet })));
            this.sources.set(sources);
            this.actifs.set(actifs);
            this.termes.set(termes);
            this.domaines.set(domaines);
            this.vocabulaire.set(vocabulaire);
            const selection = this.objets().find(objet => objet.id === this.selectionId());
            if (selection) this.selectionner(selection);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    selectionner(objet: ObjetMetier): void {
        this.selectionId.set(objet.id);
        this.nouveau.set(false);
        this.edition.set(structuredClone(objet));
    }

    nouvelObjet(): void {
        const objet = OBJET_VIDE();
        this.selectionId.set(objet.id);
        this.nouveau.set(true);
        this.edition.set(objet);
        this.ongletActif.set('attributs');
    }

    /** Un objet par source : nom dérivé du fichier, un attribut par colonne, la source en rôle maître. */
    initialiserDepuisSource(): void {
        const source = this.sources().find(candidat => candidat.name === this.sourceInitiale);
        if (!source) return;
        const objet = OBJET_VIDE();
        objet.name = source.name
            .replace(/\.(csv|xlsx|xls|txt|tsv|parquet)$/i, '')
            .replace(/[_-]+/g, ' ')
            .trim();
        this.edition.set(objet);
        this.selectionId.set(objet.id);
        this.nouveau.set(true);
        this.sourceARattacher = source.name;
        this.roleARattacher = 'maitre';
        this.genererAttributs = true;
        this.rattacherSource(objet);
        this.sourceInitiale = '';
    }

    /** Rattache une table (avec son rôle) et, si demandé, crée ou complète un attribut par colonne. */
    rattacherSource(objet: ObjetMetier): void {
        const source = this.sources().find(candidat => candidat.name === this.sourceARattacher);
        if (!source) return;
        const existante = objet.sources.find(candidat => candidat.table === source.name);
        if (existante) existante.role = this.roleARattacher;
        else objet.sources.push({ table: source.name, role: this.roleARattacher });
        if (this.genererAttributs)
            for (const colonne of source.headers) {
                let attribut = objet.elements.find(
                    candidat =>
                        candidat.name.toLowerCase() === colonne.toLowerCase() ||
                        candidat.mappings.some(correspondance => correspondance.col === colonne)
                );
                if (!attribut) {
                    attribut = { id: genererIdentifiant('be'), name: colonne, definition: '', mappings: [], usedBy: [], owner: '' };
                    objet.elements.push(attribut);
                }
                if (!attribut.mappings.some(correspondance => correspondance.table === source.name && correspondance.col === colonne))
                    attribut.mappings.push({ table: source.name, col: colonne });
            }
        this.sourceARattacher = '';
        this.edition.update(courant => (courant ? { ...courant } : courant));
    }

    ajouterAttribut(objet: ObjetMetier): void {
        objet.elements.push({ id: genererIdentifiant('be'), name: 'Nouvel attribut', definition: '', mappings: [], usedBy: [], owner: '' });
    }

    ajouterCorrespondance(attribut: AttributObjetMetier): void {
        const table = this.choixTable[attribut.id];
        const colonne = this.choixColonne[attribut.id];
        if (!table || !colonne) return;
        if (!attribut.mappings.some(correspondance => correspondance.table === table && correspondance.col === colonne))
            attribut.mappings.push({ table, col: colonne });
        this.choixColonne[attribut.id] = '';
    }

    definirContributeurs(texte: string): void {
        const objet = this.edition();
        if (objet)
            objet.contributors = String(texte)
                .split(',')
                .map(partie => partie.trim())
                .filter(Boolean);
    }

    basculer(liste: string[], valeur: string): void {
        const position = liste.indexOf(valeur);
        if (position >= 0) liste.splice(position, 1);
        else liste.push(valeur);
    }

    referencie(objet: ObjetMetier, autreId: string): boolean {
        return objet.references.some(reference => reference.boId === autreId);
    }

    basculerReference(objet: ObjetMetier, autreId: string): void {
        if (this.referencie(objet, autreId)) objet.references = objet.references.filter(reference => reference.boId !== autreId);
        else objet.references.push({ boId: autreId, cardinality: '' });
    }

    colonnesDe(nomSource: string | undefined): string[] {
        return this.sources().find(source => source.name === nomSource)?.headers || [];
    }

    completude(objet: ObjetMetier): { score: number; aFaire: string[] } {
        return completudeObjet(objet, this.actifs().length > 0);
    }

    async enregistrer(): Promise<void> {
        const objet = this.edition();
        if (!objet) return;
        if (!objet.name.trim()) return this.notifications.erreur("Donnez un nom à l'objet métier.");
        this.enCours.set(true);
        try {
            const { id, ...corps } = objet;
            await this.api.enregistrerObjetMetier(id, corps);
            this.notifications.succes(`Objet « ${objet.name} » enregistré.`);
            this.nouveau.set(false);
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    async supprimer(objet: ObjetMetier): Promise<void> {
        if (!confirm(`Supprimer l'objet métier « ${objet.name} » ?`)) return;
        try {
            await this.api.supprimerObjetMetier(objet.id);
            this.edition.set(null);
            this.selectionId.set(null);
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    /** Un lecteur ne modifie pas : il dépose une proposition, qu'un éditeur validera. */
    async proposerDefinition(objet: ObjetMetier, attribut: AttributObjetMetier): Promise<void> {
        const nouvelle = prompt(`Définition proposée pour « ${attribut.name} » :`, attribut.definition || '');
        if (nouvelle === null) return;
        try {
            await this.api.proposer({
                kind: 'attr',
                field: 'definition',
                target: { boId: objet.id, elId: attribut.id },
                label: `${objet.name} · ${attribut.name} : définition`,
                before: attribut.definition || '',
                after: nouvelle,
                domain: objet.domain || ''
            });
            this.notifications.succes('Proposition enregistrée, en attente de validation.');
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
}
