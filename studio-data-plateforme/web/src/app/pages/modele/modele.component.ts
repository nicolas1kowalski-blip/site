/**
 * Modèle de données : les liens entre sources (clé étrangère → clé primaire), partagés avec l'application
 * classique. L'écran montre le graphe des tables (composant SVG maison), la liste des liens avec leur cardinalité
 * déclarée et leur nature (association, composition, agrégation, référence), la mesure de chaque lien sur les
 * données réelles (cardinalité constatée, orphelins), la détection de liens d'après le contenu, l'ajout manuel,
 * et les règles métier sur les liens (cardinalités conditionnelles : « 1 emplacement doit avoir exactement 1 accès
 * de type GÉNÉRAL »), testables sur les données.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import {
    PageLignes,
    PaireDeColonnes,
    PropositionLien,
    RegleLien,
    Relation,
    ResultatRegleLien,
    Source,
    VocabulaireReglesLiens,
    genererIdentifiant
} from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';
import { LIGNES_BLOC_COMPACT, LIGNES_BLOC_SCHEMA, couleurDuDomaine, lignesDuBloc } from '../../composants/blocs-graphe';
import { GrapheSvgComponent, LienDessine, NoeudDessine } from '../../composants/graphe-svg.component';
import { PageLignesComponent } from '../qualite/page-lignes.component';

const NATURES_LIEN: Record<string, string> = {
    '': 'association',
    composition: '◆ composition (fait partie de)',
    aggregation: '◇ agrégation',
    reference: '→ référence'
};
const CARDINALITES = ['', '1-1', '1-N', 'N-1', 'N-N'];
/** Le symbole qui précède l'étiquette d'un lien, selon sa nature (relKindSymbol du classique). */
const SYMBOLE_NATURE: Record<string, string> = { composition: '◆ ', aggregation: '◇ ', reference: '→ ' };

type BrouillonRegle = {
    relationId: string;
    sens: 'source' | 'cible';
    condCol: string;
    condOp: string;
    condVal: string;
    expect: '=' | '<=' | '>=';
    n: number;
};

@Component({
    selector: 'app-modele',
    imports: [FormsModule, GrapheSvgComponent, PageLignesComponent],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Modèle de données</h1>
                <p class="discret">
                    {{ relations().length }} lien(s) entre {{ sources().length }} source(s) — utilisés par l'extraction, la qualité et le
                    lineage
                </p>
            </div>
            @if (session.peutEditer()) {
                <button class="bouton" (click)="detecter()" [disabled]="detectionEnCours()">
                    {{ detectionEnCours() ? 'Analyse…' : 'Détecter les liens' }}
                </button>
                <button class="bouton principal" (click)="ouvrirAjout()">Nouveau lien</button>
            }
        </div>

        <!-- ---- graphe ---- -->
        <div class="carte">
            <div class="entete-page" style="margin: 0 0 6px">
                <h2 class="espace">Vue graphique</h2>
                <label class="case"><input type="radio" name="vue" value="compacte" [(ngModel)]="vue" /> vue compacte</label>
                <label class="case"><input type="radio" name="vue" value="schema" [(ngModel)]="vue" /> schéma complet (colonnes)</label>
                <span class="discret">— couleur par domaine ; cliquez une table pour la mettre en avant</span>
            </div>
            @if (sources().length) {
                <app-graphe-svg
                    nomImage="modele-de-donnees"
                    disposition="domaines"
                    [noeuds]="noeuds()"
                    [liens]="liens()"
                    [hauteur]="vue === 'schema' ? 560 : 420"
                    (noeudChoisi)="choisirTable($event.id)"
                />
            } @else {
                <div class="vide">Aucune table : déposez des sources pour dessiner le modèle.</div>
            }
        </div>

        @if (propositions().length) {
            <div class="carte">
                <h2>Liens proposés d'après le contenu</h2>
                <p class="discret">
                    Une colonne de même nom, unique dans la table cible, et dont les valeurs de la table source s'y retrouvent (couverture ≥
                    80 %).
                </p>
                <table class="tableau">
                    <thead>
                        <tr>
                            <th>Source (côté N)</th>
                            <th>Cible (côté 1)</th>
                            <th>Couverture</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        @for (
                            proposition of propositions();
                            track proposition.sourceTable + proposition.sourceCol + proposition.targetTable
                        ) {
                            <tr>
                                <td>
                                    <b>{{ proposition.sourceTable }}</b
                                    >.<code>{{ proposition.sourceCol }}</code>
                                </td>
                                <td>
                                    <b>{{ proposition.targetTable }}</b
                                    >.<code>{{ proposition.targetCol }}</code>
                                </td>
                                <td>
                                    <span class="badge succes">{{ (proposition.couverture * 100).toFixed(0) }} %</span>
                                    <span class="discret">sur {{ proposition.valeursSource }} valeur(s)</span>
                                </td>
                                <td><button class="bouton petit principal" (click)="accepter(proposition)">Ajouter</button></td>
                            </tr>
                        }
                    </tbody>
                </table>
            </div>
        } @else if (detectionFaite()) {
            <div class="carte discret">Aucun nouveau lien détecté d'après le contenu.</div>
        }

        <!-- ---- liens ---- -->
        <div class="carte">
            <h2>Liens du modèle</h2>
            @if (relations().length === 0) {
                <div class="vide">Aucun lien. Ajoutez-en un ou lancez la détection.</div>
            } @else {
                <table class="tableau">
                    <thead>
                        <tr>
                            <th>Source (côté N)</th>
                            <th></th>
                            <th>Cible (côté 1)</th>
                            <th title="Les colonnes qui identifient le lien. Une seule ne suffit pas toujours.">Clé du lien</th>
                            <th>Cardinalité déclarée</th>
                            <th>Nature</th>
                            <th>Mesure sur les données</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        @for (relation of relations(); track relation.id) {
                            <tr
                                [class.orphelin]="!relation.sourceId || !relation.targetId"
                                [class.choisie]="
                                    tableChoisie() && (relation.sourceTable === tableChoisie() || relation.targetTable === tableChoisie())
                                "
                            >
                                <td>
                                    <b>{{ relation.sourceTable }}</b
                                    >.<code>{{ relation.sourceCol }}</code>
                                </td>
                                <td>→</td>
                                <td>
                                    <b>{{ relation.targetTable }}</b
                                    >.<code>{{ relation.targetCol }}</code>
                                    @if (!relation.sourceId || !relation.targetId) {
                                        <span class="badge alerte" title="Une des deux sources n'est pas chargée dans cet espace"
                                            >source absente</span
                                        >
                                    }
                                </td>
                                <td>
                                    <!--
                                        Clé composite : quand une seule colonne ne suffit pas à identifier le lien.
                                        Un élément présent dans plusieurs groupes se retrouve une fois par groupe ;
                                        joint sur le seul élément, il multiplie les lignes. La clé (groupe, élément)
                                        rétablit la vérité, une fois pour toutes et pour toutes les extractions.
                                    -->
                                    <div class="cle-du-lien" [attr.name]="'cleDuLien-' + relation.id">
                                        <span class="paire principale">{{ relation.sourceCol }} = {{ relation.targetCol }}</span>
                                        @for (
                                            paire of relation.extraCols || [];
                                            track paire.sourceCol + paire.targetCol;
                                            let rang = $index
                                        ) {
                                            <span class="paire">
                                                + {{ paire.sourceCol }} = {{ paire.targetCol }}
                                                @if (session.peutEditer()) {
                                                    <a title="Retirer cette colonne de la clé" (click)="retirerDeLaCle(relation, rang)"
                                                        >✕</a
                                                    >
                                                }
                                            </span>
                                        }
                                    </div>
                                    @if (session.peutEditer()) {
                                        <div class="ajout-cle">
                                            <select
                                                class="champ"
                                                style="width: auto"
                                                [attr.name]="'cleSource-' + relation.id"
                                                [(ngModel)]="colonneSourceEnPlus[relation.id]"
                                            >
                                                <option value="">+ colonne de {{ relation.sourceTable }}…</option>
                                                @for (colonne of colonnesDe(relation.sourceTable); track colonne) {
                                                    <option [value]="colonne">{{ colonne }}</option>
                                                }
                                            </select>
                                            <select
                                                class="champ"
                                                style="width: auto"
                                                [attr.name]="'cleCible-' + relation.id"
                                                [(ngModel)]="colonneCibleEnPlus[relation.id]"
                                            >
                                                <option value="">= colonne de {{ relation.targetTable }}…</option>
                                                @for (colonne of colonnesDe(relation.targetTable); track colonne) {
                                                    <option [value]="colonne">{{ colonne }}</option>
                                                }
                                            </select>
                                            <button
                                                class="bouton petit"
                                                type="button"
                                                [attr.name]="'ajouterALaCle-' + relation.id"
                                                (click)="ajouterALaCle(relation)"
                                            >
                                                Ajouter à la clé
                                            </button>
                                        </div>
                                    }
                                </td>
                                <td>
                                    <select
                                        class="champ"
                                        style="width: auto"
                                        [attr.name]="'cardinalite-' + relation.id"
                                        [ngModel]="relation.cardinality || ''"
                                        (ngModelChange)="modifier(relation, { cardinality: $event })"
                                        [disabled]="!session.peutEditer()"
                                    >
                                        @for (cardinalite of cardinalites; track cardinalite) {
                                            <option [value]="cardinalite">{{ cardinalite || '—' }}</option>
                                        }
                                    </select>
                                    @if (
                                        relation.measured && relation.cardinality && relation.measured.suggested !== relation.cardinality
                                    ) {
                                        <span class="badge erreur" title="La cardinalité mesurée diffère de la cardinalité déclarée"
                                            >≠ mesurée</span
                                        >
                                    }
                                </td>
                                <td>
                                    <select
                                        class="champ"
                                        style="width: auto"
                                        [attr.name]="'nature-' + relation.id"
                                        [ngModel]="relation.kind || ''"
                                        (ngModelChange)="modifier(relation, { kind: $event })"
                                        [disabled]="!session.peutEditer()"
                                    >
                                        @for (nature of natures; track nature[0]) {
                                            <option [value]="nature[0]">{{ nature[1] }}</option>
                                        }
                                    </select>
                                </td>
                                <td>
                                    @if (relation.measured; as mesure) {
                                        <span
                                            class="badge"
                                            [class.succes]="!mesure.sorph && !mesure.torph"
                                            [class.alerte]="mesure.sorph || mesure.torph"
                                            >mesuré {{ mesure.suggested }}</span
                                        >
                                        <div class="discret">
                                            max {{ mesure.tmax }} ligne(s) de {{ relation.targetTable }} par clé ·
                                            {{ mesure.sorph }} ligne(s) de {{ relation.sourceTable }} sans correspondance ·
                                            {{ mesure.torph }} orpheline(s) de {{ relation.targetTable }}
                                        </div>
                                    } @else {
                                        <span class="discret">non mesuré</span>
                                    }
                                    <button
                                        class="bouton petit"
                                        (click)="mesurer(relation)"
                                        [disabled]="mesureEnCours() === relation.id || !relation.sourceId || !relation.targetId"
                                    >
                                        {{ mesureEnCours() === relation.id ? 'Mesure…' : 'Mesurer sur les données' }}
                                    </button>
                                </td>
                                <td style="white-space: nowrap">
                                    @if (session.peutEditer()) {
                                        <button class="bouton petit danger" (click)="supprimer(relation)">Supprimer</button>
                                    }
                                </td>
                            </tr>
                        }
                    </tbody>
                </table>
            }
        </div>

        @if (ajoutOuvert() && session.peutEditer()) {
            <form class="carte" (ngSubmit)="ajouter()">
                <h2>Ajouter un lien</h2>
                <div class="formulaire-ligne">
                    <div>
                        <label class="etiquette">Table source (côté N, ex. commandes)</label>
                        <select
                            class="champ"
                            name="sourceTable"
                            [(ngModel)]="nouveau.sourceTable"
                            (ngModelChange)="nouveau.sourceCol = ''"
                            required
                        >
                            <option value="">—</option>
                            @for (source of sources(); track source.id) {
                                <option [value]="source.name">{{ source.name }}</option>
                            }
                        </select>
                    </div>
                    <div>
                        <label class="etiquette">Colonne source</label>
                        <select class="champ" name="sourceCol" [(ngModel)]="nouveau.sourceCol" required>
                            <option value="">—</option>
                            @for (colonne of colonnesDe(nouveau.sourceTable); track colonne) {
                                <option [value]="colonne">{{ colonne }}</option>
                            }
                        </select>
                    </div>
                    <div>
                        <label class="etiquette">Table cible (côté 1, ex. clients)</label>
                        <select
                            class="champ"
                            name="targetTable"
                            [(ngModel)]="nouveau.targetTable"
                            (ngModelChange)="nouveau.targetCol = ''"
                            required
                        >
                            <option value="">—</option>
                            @for (source of sources(); track source.id) {
                                <option [value]="source.name">{{ source.name }}</option>
                            }
                        </select>
                    </div>
                    <div>
                        <label class="etiquette">Colonne cible</label>
                        <select class="champ" name="targetCol" [(ngModel)]="nouveau.targetCol" required>
                            <option value="">—</option>
                            @for (colonne of colonnesDe(nouveau.targetTable); track colonne) {
                                <option [value]="colonne">{{ colonne }}</option>
                            }
                        </select>
                    </div>
                    <div style="flex: 0 0 120px">
                        <label class="etiquette">Cardinalité</label>
                        <select class="champ" name="cardinality" [(ngModel)]="nouveau.cardinality">
                            <option value="N-1">N-1</option>
                            <option value="1-1">1-1</option>
                            <option value="1-N">1-N</option>
                            <option value="N-N">N-N</option>
                        </select>
                    </div>
                    <button class="bouton principal" type="submit" style="flex: 0">Ajouter</button>
                    <button class="bouton" type="button" style="flex: 0" (click)="ajoutOuvert.set(false)">Annuler</button>
                </div>
            </form>
        }

        <!-- ---- règles métier sur les liens ---- -->
        <div class="carte">
            <div class="entete-page" style="margin: 0 0 6px">
                <h2 class="espace">Règles métier sur les liens (cardinalités conditionnelles)</h2>
                <span class="discret"
                    >Ex. : un emplacement est rattaché à exactement 1 accès de type GÉNÉRAL — contrôlées ici et dans l'audit qualité.</span
                >
            </div>
            @if (session.peutEditer() && relations().length) {
                <form class="formulaire-ligne" (ngSubmit)="ajouterRegle()">
                    <div style="flex: 2">
                        <label class="etiquette">Lien concerné</label>
                        <select
                            class="champ"
                            name="regle-lien"
                            [(ngModel)]="brouillonRegle.relationId"
                            (ngModelChange)="brouillonRegle.condCol = ''"
                        >
                            @for (relation of relations(); track relation.id) {
                                <option [value]="relation.id">
                                    {{ relation.sourceTable }}.{{ relation.sourceCol }} ↔ {{ relation.targetTable }}.{{
                                        relation.targetCol
                                    }}
                                </option>
                            }
                        </select>
                    </div>
                    <div style="flex: 2">
                        <label class="etiquette">Sens de la règle</label>
                        <select
                            class="champ"
                            name="regle-sens"
                            [(ngModel)]="brouillonRegle.sens"
                            (ngModelChange)="brouillonRegle.condCol = ''"
                        >
                            <option value="cible">
                                parent = {{ relationDuBrouillon()?.targetTable }}, enfants = {{ relationDuBrouillon()?.sourceTable }}
                            </option>
                            <option value="source">
                                parent = {{ relationDuBrouillon()?.sourceTable }}, enfants = {{ relationDuBrouillon()?.targetTable }}
                            </option>
                        </select>
                    </div>
                    <div>
                        <label class="etiquette">Condition sur l'enfant (facultatif)</label>
                        <select class="champ" name="regle-condition-colonne" [(ngModel)]="brouillonRegle.condCol">
                            <option value="">— sans condition —</option>
                            @for (colonne of colonnesDe(tableEnfantDuBrouillon()); track colonne) {
                                <option [value]="colonne">{{ colonne }}</option>
                            }
                        </select>
                    </div>
                    @if (brouillonRegle.condCol) {
                        <div style="flex: 0 0 130px">
                            <label class="etiquette">Opérateur</label>
                            <select class="champ" name="regle-condition-operateur" [(ngModel)]="brouillonRegle.condOp">
                                @for (operateur of operateursCondition(); track operateur[0]) {
                                    <option [value]="operateur[0]">{{ operateur[1] }}</option>
                                }
                            </select>
                        </div>
                        @if (brouillonRegle.condOp !== 'empty' && brouillonRegle.condOp !== 'notempty') {
                            <div style="flex: 0 0 140px">
                                <label class="etiquette">Valeur</label>
                                <input
                                    class="champ"
                                    name="regle-condition-valeur"
                                    [(ngModel)]="brouillonRegle.condVal"
                                    placeholder="ex : GENERAL"
                                />
                            </div>
                        }
                    }
                    <div style="flex: 0 0 130px">
                        <label class="etiquette">Attendu</label>
                        <select class="champ" name="regle-attendu" [(ngModel)]="brouillonRegle.expect">
                            @for (operateur of operateursAttendu(); track operateur[0]) {
                                <option [value]="operateur[0]">{{ operateur[1] }}</option>
                            }
                        </select>
                    </div>
                    <div style="flex: 0 0 80px">
                        <label class="etiquette">N</label>
                        <input class="champ" type="number" min="0" name="regle-n" [(ngModel)]="brouillonRegle.n" />
                    </div>
                    <button class="bouton principal" type="submit" style="flex: 0" [disabled]="!relationDuBrouillon()">+ Règle</button>
                </form>
            }
            @if (!regles().length) {
                <div class="vide" style="margin-top: 8px">Aucune règle définie.</div>
            }
            @for (regle of regles(); track regle.id) {
                <div class="regle">
                    <div class="entete-page" style="margin: 0">
                        <b>⚖️ {{ regle.libelle }}</b>
                        @if (resultatsRegles()[regle.id]; as resultat) {
                            <span class="badge" [class.succes]="resultat.violations === 0" [class.erreur]="resultat.violations > 0"
                                >{{ resultat.violations }} violation(s) sur {{ resultat.total }} parent(s)</span
                            >
                            @if (resultat.exemples.length) {
                                <span class="discret">ex. {{ resultat.exemples.join(', ') }}</span>
                            }
                            @if (resultat.violations > 0) {
                                <button class="bouton petit" (click)="voirLignesRegle(regle)">Voir les lignes</button>
                            }
                        }
                        <span class="espace"></span>
                        <button class="bouton petit" (click)="testerRegle(regle)" [disabled]="testEnCours() === regle.id">
                            {{ testEnCours() === regle.id ? 'Test…' : '▶ Tester' }}
                        </button>
                        @if (session.peutEditer()) {
                            <button class="bouton petit danger" (click)="supprimerRegle(regle)">Supprimer</button>
                        }
                    </div>
                    @if (session.peutEditer()) {
                        <div class="formulaire-ligne" style="margin-top: 6px; align-items: center">
                            <span class="discret">1 {{ regle.parentTable }} doit avoir</span>
                            <select
                                class="champ"
                                style="width: auto"
                                [attr.name]="'attendu-' + regle.id"
                                [ngModel]="regle.expect"
                                (ngModelChange)="modifierRegle(regle, { expect: $event })"
                            >
                                @for (operateur of operateursAttendu(); track operateur[0]) {
                                    <option [value]="operateur[0]">{{ operateur[1] }}</option>
                                }
                            </select>
                            <input
                                class="champ"
                                type="number"
                                min="0"
                                style="width: 70px"
                                [attr.name]="'n-' + regle.id"
                                [ngModel]="regle.n"
                                (ngModelChange)="modifierRegle(regle, { n: $event })"
                            />
                            <span class="discret">{{ regle.childTable }}</span>
                            @if (regle.cond?.col) {
                                <span class="discret"
                                    >quand <b>{{ regle.cond!.col }}</b>
                                    {{ operateursCondition()[0] ? libelleOperateur(regle.cond!.op) : regle.cond!.op }}</span
                                >
                                @if (regle.cond!.op !== 'empty' && regle.cond!.op !== 'notempty') {
                                    <input
                                        class="champ"
                                        style="width: 140px"
                                        [attr.name]="'condition-' + regle.id"
                                        [ngModel]="regle.cond!.val"
                                        (ngModelChange)="
                                            modifierRegle(regle, { cond: { col: regle.cond!.col, op: regle.cond!.op, val: $event } })
                                        "
                                    />
                                }
                            }
                            <span class="discret">libellé</span>
                            <input
                                class="champ"
                                style="width: 220px"
                                [attr.name]="'libelle-' + regle.id"
                                [ngModel]="regle.label"
                                (ngModelChange)="modifierRegle(regle, { label: $event })"
                                placeholder="(auto)"
                            />
                        </div>
                    }
                </div>
            }
            @if (pageRegle()) {
                <div style="margin-top: 10px">
                    <app-page-lignes
                        [titre]="'Parents en défaut — ' + (regleInspectee()?.libelle || '')"
                        [page]="pageRegle()"
                        (changerOffset)="chargerLignesRegle($event)"
                        (exporter)="exporterLignesRegle()"
                        (fermer)="pageRegle.set(null)"
                    />
                </div>
            }
        </div>
    `,
    styles: `
        /* La clé d'un lien : la paire principale, puis les colonnes qui s'y ajoutent. */
        .cle-du-lien {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            margin-bottom: 4px;
        }
        .cle-du-lien .paire {
            font-size: 11px;
            padding: 1px 6px;
            border: 1px solid var(--bordure);
            border-radius: 6px;
            background: var(--surface-2);
            white-space: nowrap;
        }
        .cle-du-lien .paire.principale {
            border-color: color-mix(in srgb, var(--accent) 45%, transparent);
        }
        .cle-du-lien .paire a {
            cursor: pointer;
            margin-left: 4px;
            color: var(--erreur);
        }
        .ajout-cle {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
        }
        .orphelin td {
            opacity: 0.6;
        }
        tr.choisie td {
            background: color-mix(in srgb, var(--accent) 8%, transparent);
        }
        .case {
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
        }
        .regle {
            margin-top: 8px;
            padding: 8px 10px;
            border: 1px solid var(--bordure);
            border-radius: 8px;
        }
    `
})
export class ModeleComponent {
    readonly session = inject(SessionService);
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);

    readonly sources = signal<Source[]>([]);
    readonly relations = signal<Relation[]>([]);
    readonly propositions = signal<PropositionLien[]>([]);
    readonly regles = signal<RegleLien[]>([]);
    readonly vocabulaire = signal<VocabulaireReglesLiens | null>(null);
    readonly resultatsRegles = signal<Record<string, ResultatRegleLien>>({});
    readonly detectionEnCours = signal(false);
    readonly detectionFaite = signal(false);
    readonly ajoutOuvert = signal(false);
    readonly mesureEnCours = signal('');
    readonly testEnCours = signal('');
    readonly tableChoisie = signal('');
    readonly regleInspectee = signal<RegleLien | null>(null);
    readonly pageRegle = signal<PageLignes | null>(null);
    readonly cardinalites = CARDINALITES;
    readonly natures = Object.entries(NATURES_LIEN);
    vue: 'compacte' | 'schema' = 'compacte';
    nouveau = { sourceTable: '', sourceCol: '', targetTable: '', targetCol: '', cardinality: 'N-1' };
    /** La colonne que l'on est en train d'ajouter à la clé d'un lien, de chaque côté. */
    colonneSourceEnPlus: Record<string, string> = {};
    colonneCibleEnPlus: Record<string, string> = {};
    brouillonRegle: BrouillonRegle = { relationId: '', sens: 'cible', condCol: '', condOp: '=', condVal: '', expect: '=', n: 1 };

    /**
     * Nœuds du graphe, façon V13 : un **bloc** par table — en-tête coloré par domaine, puis une ligne par
     * colonne avec son marqueur (🔑 clé, 🔐 clé étrangère, 🔗 colonne de jointure). En vue compacte, sept
     * colonnes au plus, puis « … N autre(s) colonne(s) » ; en vue schéma, quarante.
     */
    readonly noeuds = computed<NoeudDessine[]>(() => {
        const domaines = this.sources().map(source => String(source.theme || ''));
        const maximum = this.vue === 'schema' ? LIGNES_BLOC_SCHEMA : LIGNES_BLOC_COMPACT;
        return this.sources().map(source => {
            const domaine = String(source.theme || '');
            const couleurs = couleurDuDomaine(domaines, domaine);
            const recette = source.type === 'designed' ? source.design : undefined;
            const roles = {
                cles: recette?.key || [],
                clesEtrangeres: (recette?.fks || []).map(cle => cle.attr),
                jointures: this.colonnesDeJointure(source.name)
            };
            const pictogramme = source.type === 'designed' ? '🧱 ' : source.type === 'extraction' ? '⤓ ' : '📄 ';
            return {
                id: source.name,
                titre: pictogramme + source.name,
                lignes: lignesDuBloc(source.headers || [], roles, maximum),
                domaine,
                fondEnTete: couleurs.entete,
                couleurTitre: couleurs.titre,
                bordure: couleurs.trait,
                selectionne: this.tableChoisie() === source.name
            };
        });
    });

    /** Les colonnes d'une table qui servent à un lien du modèle : ce sont elles que l'on cherche d'abord. */
    private colonnesDeJointure(nomTable: string): string[] {
        const colonnes = new Set<string>();
        for (const relation of this.relations()) {
            if (relation.sourceTable === nomTable && relation.sourceCol) colonnes.add(relation.sourceCol);
            if (relation.targetTable === nomTable && relation.targetCol) colonnes.add(relation.targetCol);
        }
        return [...colonnes];
    }
    readonly liens = computed<LienDessine[]>(() =>
        this.relations()
            .filter(relation => relation.sourceId && relation.targetId)
            .map(relation => ({
                id: relation.id,
                source: relation.sourceTable,
                target: relation.targetTable,
                // Même écriture que le classique : « ◆ id_client = id_client [N-1] ».
                libelle: `${SYMBOLE_NATURE[relation.kind || ''] || ''}${relation.sourceCol} = ${relation.targetCol}${relation.cardinality ? ' [' + relation.cardinality + ']' : ''}`,
                pointille: relation.kind === 'reference',
                epaisseur:
                    this.tableChoisie() && (relation.sourceTable === this.tableChoisie() || relation.targetTable === this.tableChoisie())
                        ? 3
                        : undefined
            }))
    );

    constructor() {
        this.recharger();
    }

    async recharger(): Promise<void> {
        try {
            const [sources, relations, regles, vocabulaire] = await Promise.all([
                this.api.sources(),
                this.api.relations(),
                this.api.reglesLiens(),
                this.api.vocabulaireReglesLiens()
            ]);
            this.sources.set(sources);
            this.relations.set(relations);
            this.regles.set(regles);
            this.vocabulaire.set(vocabulaire);
            if (!this.brouillonRegle.relationId) this.brouillonRegle.relationId = relations[0]?.id || '';
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    colonnesDe(nomSource: string): string[] {
        return this.sources().find(source => source.name === nomSource)?.headers || [];
    }
    choisirTable(nom: string): void {
        this.tableChoisie.set(this.tableChoisie() === nom ? '' : nom);
    }
    operateursAttendu(): [string, string][] {
        return Object.entries(this.vocabulaire()?.operateursAttendu || { '=': 'exactement', '<=': 'au plus', '>=': 'au moins' });
    }
    operateursCondition(): [string, string][] {
        return Object.entries(this.vocabulaire()?.operateursCondition || { '=': '=' });
    }
    libelleOperateur(operateur: string): string {
        return this.vocabulaire()?.operateursCondition[operateur] || operateur;
    }
    /** Lien choisi pour la nouvelle règle ; à défaut le premier lien du modèle (celui que la liste affiche). */
    relationDuBrouillon(): Relation | undefined {
        return this.relations().find(relation => relation.id === this.brouillonRegle.relationId) || this.relations()[0];
    }
    tableEnfantDuBrouillon(): string {
        const relation = this.relationDuBrouillon();
        if (!relation) return '';
        return this.brouillonRegle.sens === 'cible' ? relation.sourceTable : relation.targetTable;
    }

    // ---- liens ----
    async detecter(): Promise<void> {
        this.detectionEnCours.set(true);
        try {
            this.propositions.set(await this.api.detecterRelations());
            this.detectionFaite.set(true);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.detectionEnCours.set(false);
        }
    }
    async accepter(proposition: PropositionLien): Promise<void> {
        await this.enregistrer({
            sourceTable: proposition.sourceTable,
            sourceCol: proposition.sourceCol,
            targetTable: proposition.targetTable,
            targetCol: proposition.targetCol,
            cardinality: proposition.cardinality
        });
        this.propositions.update(liste => liste.filter(candidat => candidat !== proposition));
    }
    ouvrirAjout(): void {
        this.ajoutOuvert.set(true);
    }
    async ajouter(): Promise<void> {
        const { sourceTable, sourceCol, targetTable, targetCol } = this.nouveau;
        if (!sourceTable || !sourceCol || !targetTable || !targetCol) {
            this.notifications.erreur('Choisissez une table et une colonne de chaque côté.');
            return;
        }
        if (sourceTable === targetTable) {
            this.notifications.erreur('Un lien relie deux tables différentes.');
            return;
        }
        await this.enregistrer({ ...this.nouveau });
        this.nouveau = { sourceTable: '', sourceCol: '', targetTable: '', targetCol: '', cardinality: 'N-1' };
        this.ajoutOuvert.set(false);
    }
    private async enregistrer(relation: Omit<Relation, 'id' | 'sourceId' | 'targetId'>): Promise<void> {
        try {
            const resultat = await this.api.ajouterRelation(relation);
            this.relations.set(resultat.relations);
            if (!this.brouillonRegle.relationId) this.brouillonRegle.relationId = resultat.relations[0]?.id || '';
            this.notifications[resultat.ajoute ? 'succes' : 'info'](
                resultat.ajoute
                    ? `Lien ${relation.sourceTable}.${relation.sourceCol} → ${relation.targetTable}.${relation.targetCol} ajouté.`
                    : 'Ce lien existe déjà.'
            );
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
    /**
     * Ajoute une colonne à la clé du lien. C'est ce qui empêche une jointure de multiplier les lignes : un
     * élément présent dans plusieurs groupes se retrouve une fois par groupe, et seule la clé (groupe,
     * élément) le retrouve une seule fois. Toutes les extractions qui passent par ce lien en profitent.
     */
    async ajouterALaCle(relation: Relation): Promise<void> {
        const sourceCol = this.colonneSourceEnPlus[relation.id] || '';
        const targetCol = this.colonneCibleEnPlus[relation.id] || '';
        if (!sourceCol || !targetCol) return this.notifications.erreur('Choisissez une colonne de chaque côté.');
        const deja = relation.extraCols || [];
        if (sourceCol === relation.sourceCol && targetCol === relation.targetCol)
            return this.notifications.erreur('Cette paire est déjà la clé principale du lien.');
        if (deja.some(paire => paire.sourceCol === sourceCol && paire.targetCol === targetCol))
            return this.notifications.erreur('Cette paire fait déjà partie de la clé.');
        await this.modifier(relation, { extraCols: [...deja, { sourceCol, targetCol }] });
        this.colonneSourceEnPlus[relation.id] = '';
        this.colonneCibleEnPlus[relation.id] = '';
    }

    /** Retire une colonne de la clé : le lien redevient plus large, et peut de nouveau multiplier. */
    async retirerDeLaCle(relation: Relation, rang: number): Promise<void> {
        await this.modifier(relation, { extraCols: (relation.extraCols || []).filter((paire, position) => position !== rang) });
    }

    async modifier(relation: Relation, changements: { cardinality?: string; kind?: string; extraCols?: PaireDeColonnes[] }): Promise<void> {
        try {
            this.relations.set(await this.api.modifierRelation(relation.id, changements));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
    async mesurer(relation: Relation): Promise<void> {
        this.mesureEnCours.set(relation.id);
        try {
            const mesure = await this.api.mesurerRelation(relation.id);
            this.relations.set(await this.api.relations());
            this.notifications.succes(
                `Lien mesuré : ${mesure.suggested}, ${mesure.sorph} ligne(s) sans correspondance, ${mesure.torph} orpheline(s).`
            );
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.mesureEnCours.set('');
        }
    }
    async supprimer(relation: Relation): Promise<void> {
        if (!confirm(`Supprimer le lien ${relation.sourceTable}.${relation.sourceCol} → ${relation.targetTable}.${relation.targetCol} ?`))
            return;
        try {
            this.relations.set(await this.api.supprimerRelation(relation.id));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    // ---- règles métier sur les liens ----
    async ajouterRegle(): Promise<void> {
        const relation = this.relationDuBrouillon();
        if (!relation) return;
        const brouillon = this.brouillonRegle;
        if (brouillon.condCol && !['empty', 'notempty'].includes(brouillon.condOp) && !brouillon.condVal.trim()) {
            this.notifications.erreur('Indiquez la valeur de la condition (ex : GENERAL).');
            return;
        }
        const versLaCible = brouillon.sens === 'cible';
        const regle: RegleLien = {
            id: genererIdentifiant('rul_'),
            parentTable: versLaCible ? relation.targetTable : relation.sourceTable,
            parentCol: versLaCible ? relation.targetCol : relation.sourceCol,
            childTable: versLaCible ? relation.sourceTable : relation.targetTable,
            childCol: versLaCible ? relation.sourceCol : relation.targetCol,
            cond: brouillon.condCol ? { col: brouillon.condCol, op: brouillon.condOp, val: brouillon.condVal.trim() } : null,
            expect: brouillon.expect,
            n: Math.max(0, Number(brouillon.n) || 0),
            label: ''
        };
        await this.enregistrerRegle(regle, "Règle métier ajoutée — elle sera contrôlée dans l'audit qualité et l'audit des objets.");
        this.brouillonRegle = { ...this.brouillonRegle, condCol: '', condVal: '', n: 1, expect: '=' };
    }
    async modifierRegle(regle: RegleLien, changements: Partial<RegleLien>): Promise<void> {
        const modifiee = { ...regle, ...changements, n: Math.max(0, Number(changements.n ?? regle.n) || 0) };
        await this.enregistrerRegle(modifiee);
    }
    private async enregistrerRegle(regle: RegleLien, message?: string): Promise<void> {
        try {
            await this.api.ecrireRegleLien(regle);
            this.regles.set(await this.api.reglesLiens());
            if (message) this.notifications.succes(message);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
    async supprimerRegle(regle: RegleLien): Promise<void> {
        if (!confirm(`Supprimer la règle « ${regle.libelle} » ?`)) return;
        try {
            await this.api.supprimerRegleLien(regle.id);
            this.regles.set(await this.api.reglesLiens());
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
    async testerRegle(regle: RegleLien): Promise<void> {
        this.testEnCours.set(regle.id);
        try {
            const resultat = await this.api.testerRegleLien(regle.id);
            this.resultatsRegles.update(resultats => ({ ...resultats, [regle.id]: resultat }));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.testEnCours.set('');
        }
    }
    async voirLignesRegle(regle: RegleLien): Promise<void> {
        this.regleInspectee.set(regle);
        await this.chargerLignesRegle(0);
    }
    async chargerLignesRegle(offset: number): Promise<void> {
        const regle = this.regleInspectee();
        if (!regle) return;
        try {
            this.pageRegle.set(await this.api.lignesRegleLien(regle.id, Math.max(0, offset)));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
    exporterLignesRegle(): void {
        const page = this.pageRegle();
        if (!page) return;
        const contenu = [
            page.colonnes.join(';'),
            ...page.lignes.map(ligne => ligne.map(valeur => `"${String(valeur ?? '').replace(/"/g, '""')}"`).join(';'))
        ].join('\r\n');
        const lien = document.createElement('a');
        lien.href = URL.createObjectURL(new Blob(['﻿' + contenu], { type: 'text/csv;charset=utf-8' }));
        lien.download = `defauts ${this.regleInspectee()?.libelle || 'regle'}.csv`;
        lien.click();
        URL.revokeObjectURL(lien.href);
    }
}
