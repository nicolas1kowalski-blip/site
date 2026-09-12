/**
 * Tables conçues : consolider plusieurs sources en une table unique, aux colonnes renommées en libellés métier.
 *   • Liste des tables conçues (attributs, clé, lignes, formats, alertes de conformité et d'orphelins), avec
 *     reconstruction, rapport d'écarts entre sources, contribution par source, suppression ;
 *   • Éditeur de recette : sources contributrices (correspondance des colonnes, filtres d'entrée), attributs
 *     (ordre, clé, format), enrichissements (colonnes ramenées d'une autre source), colonnes calculées,
 *     clés étrangères ; SQL produit, aperçu, construction.
 * La recette est exécutée par le serveur (DuckDB) ; la table obtenue est une source comme les autres.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import {
    Contribution,
    Ecart,
    Enrichissement,
    FormatAttribut,
    RapportEcarts,
    Recette,
    ResultatSql,
    Source,
    TableConcue,
    VocabulaireTablesConcues,
    formaterDate
} from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

const RECETTE_VIDE = (): Recette => ({
    name: '',
    sources: [],
    attrs: [],
    calcs: [],
    key: [],
    formats: {},
    joins: [],
    fks: [],
    targetId: null
});
const ENRICHISSEMENT_VIDE = (): Enrichissement => ({
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

/** Nom de colonne comparable entre sources : minuscules, sans accents ni ponctuation. */
function nomComparable(nom: string): string {
    return nom
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

type GroupeEcarts = { cle: string; attributs: { attribut: string; valeurs: { source: string; valeur: string }[] }[] };

@Component({
    selector: 'app-tables-concues',
    imports: [FormsModule],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Tables conçues</h1>
                <p class="discret">
                    Consolider plusieurs sources en une table unique, renommer les colonnes en libellés métier, normaliser les formats,
                    enrichir depuis d'autres sources et détecter les écarts.
                </p>
            </div>
            @if (session.peutEditer()) {
                <button class="bouton principal" (click)="nouvelleTable()" [disabled]="!!brouillon()">Nouvelle table</button>
            }
        </div>

        <!-- ---- tables existantes ---- -->
        @if (tables().length) {
            <div class="grille">
                @for (table of tables(); track table.id) {
                    <div class="carte table-concue">
                        <div class="entete-page" style="margin: 0 0 6px">
                            <h3 class="espace" [title]="table.name">🧱 {{ table.name }}</h3>
                            <span class="badge succes">prête</span>
                        </div>
                        <div class="discret">
                            {{ table.design.attrs.length + calculsValides(table.design).length }} attribut(s)
                            @if (table.design.key.length) {
                                · 🔑 {{ table.design.key.join(' + ') }}
                            }
                            @if (table.design.lastRows != null) {
                                · {{ table.design.lastRows }} ligne(s)
                            }
                            @if (nombreFormats(table.design)) {
                                · {{ nombreFormats(table.design) }} format(s)
                            }
                            @if (table.design.fks.length) {
                                · {{ table.design.fks.length }} clé(s) étrangère(s)
                            }
                            @if (table.design.lastBuild) {
                                · construite le {{ formaterDate(table.design.lastBuild) }}
                            }
                        </div>
                        @if (nonConformes(table.design) || orphelins(table.design)) {
                            <div class="alerte-texte">
                                @if (nonConformes(table.design)) {
                                    ⚠ {{ nonConformes(table.design) }} valeur(s) non conforme(s) au format
                                }
                                @if (orphelins(table.design)) {
                                    ⚠ {{ orphelins(table.design) }} orphelin(s) de clé étrangère
                                }
                            </div>
                        }
                        <div class="puces">
                            @for (source of table.design.sources; track source.src) {
                                <span class="puce">{{ source.src }}</span>
                            }
                        </div>
                        <div class="actions">
                            @if (session.peutEditer()) {
                                <button class="bouton petit" (click)="modifier(table)">Modifier</button>
                                <button class="bouton petit" (click)="reconstruire(table)" [disabled]="enCours()">Reconstruire</button>
                            }
                            <button class="bouton petit" (click)="voirContributions(table)">Contribution par source</button>
                            @if (table.design.key.length && table.design.sources.length > 1) {
                                <button class="bouton petit" (click)="voirEcarts(table)">Écarts entre sources</button>
                            }
                            @if (session.peutEditer()) {
                                <button class="bouton petit danger" (click)="supprimer(table)">Supprimer</button>
                            }
                        </div>
                    </div>
                }
            </div>
        } @else if (!brouillon()) {
            <div class="carte vide">
                Aucune table conçue pour l'instant.
                @if (session.peutEditer()) {
                    Cliquez sur <strong>« Nouvelle table »</strong>.
                }
                <div class="discret">
                    Exemples : consolider trois fichiers d'emplacements en une table unique · renommer des colonnes techniques en libellés
                    métier · rapprocher deux référentiels et détecter leurs écarts.
                </div>
            </div>
        }

        <!-- ---- contribution par source ---- -->
        @if (contributions(); as listeContributions) {
            <div class="carte">
                <div class="entete-page" style="margin: 0 0 8px">
                    <h2 class="espace">Contribution par source — {{ tableOuverte()?.name }}</h2>
                    <button class="bouton petit" (click)="contributions.set(null)">Fermer</button>
                </div>
                <table class="tableau">
                    <thead>
                        <tr>
                            <th>Source</th>
                            <th>Lignes</th>
                            <th>Part</th>
                            <th>Complétude</th>
                        </tr>
                    </thead>
                    <tbody>
                        @for (contribution of listeContributions; track contribution.source) {
                            <tr>
                                <td>{{ contribution.source }}</td>
                                <td>{{ contribution.lignes }}</td>
                                <td>{{ pourcent(contribution.part) }}</td>
                                <td>{{ pourcent(contribution.completude) }}</td>
                            </tr>
                        }
                    </tbody>
                </table>
            </div>
        }

        <!-- ---- rapport d'écarts ---- -->
        @if (ecarts(); as rapport) {
            <div class="carte">
                <div class="entete-page" style="margin: 0 0 8px">
                    <h2 class="espace">Écarts entre sources — {{ tableOuverte()?.name }}</h2>
                    <span class="badge" [class.succes]="rapport.nombreCles === 0" [class.alerte]="rapport.nombreCles > 0"
                        >{{ rapport.nombreCles }} clé(s) divergente(s)</span
                    >
                    <span class="discret">clé : {{ rapport.cle.join(' + ') }}</span>
                    <button class="bouton petit" (click)="ecarts.set(null)">Fermer</button>
                </div>
                @if (rapport.nombreCles === 0) {
                    <p class="discret">Aucun écart : toutes les clés partagées entre sources portent des données identiques.</p>
                } @else {
                    @for (groupe of groupesEcarts(); track groupe.cle) {
                        <div class="groupe-ecart">
                            <div class="cle-ecart">🔑 {{ groupe.cle }}</div>
                            @for (attribut of groupe.attributs; track attribut.attribut) {
                                <div class="ligne-ecart">
                                    <span class="nom-attribut">{{ attribut.attribut }}</span>
                                    @for (valeur of attribut.valeurs; track valeur.source) {
                                        <span class="valeur-ecart"
                                            ><span class="discret">{{ valeur.source }} :</span>
                                            @if (valeur.valeur === '') {
                                                <em class="discret">vide</em>
                                            } @else {
                                                <strong>{{ valeur.valeur }}</strong>
                                            }
                                        </span>
                                    }
                                </div>
                            }
                        </div>
                    }
                    @if (rapport.tronque) {
                        <p class="discret">Affichage tronqué aux premiers écarts.</p>
                    }
                }
            </div>
        }

        <!-- ---- éditeur de recette ---- -->
        @if (brouillon(); as recette) {
            <div class="carte editeur">
                <div class="entete-page" style="margin: 0 0 10px">
                    <h2 class="espace">{{ recette.targetId ? 'Modifier la table' : 'Nouvelle table' }}</h2>
                    <button class="bouton" (click)="annuler()">Annuler</button>
                </div>

                <label class="etiquette">Nom de la table</label>
                <input class="champ" name="nom" [(ngModel)]="recette.name" placeholder="ex. Sites consolidés" style="max-width: 420px" />

                <!-- sources contributrices -->
                <h3>1. Sources contributrices</h3>
                <p class="discret">
                    La première source définit les attributs ; les suivantes sont rapprochées automatiquement par nom de colonne.
                </p>
                <div class="formulaire-ligne" style="max-width: 560px">
                    <select class="champ" name="ajoutSource" [(ngModel)]="sourceAAjouter">
                        <option value="">Ajouter une source…</option>
                        @for (source of sourcesDisponibles(); track source.id) {
                            <option [value]="source.name">{{ source.name }}</option>
                        }
                    </select>
                    <button class="bouton" (click)="ajouterSource()" [disabled]="!sourceAAjouter" style="flex: 0 0 auto">
                        Ajouter la source
                    </button>
                </div>
                @for (source of recette.sources; track $index; let indexSource = $index) {
                    <div class="bloc-source">
                        <div class="entete-page" style="margin: 0">
                            <strong class="espace">{{ source.src }}</strong>
                            <button class="bouton petit" (click)="ajouterFiltre(indexSource)">+ filtre d'entrée</button>
                            <button class="bouton petit danger" (click)="retirerSource(indexSource)">Retirer</button>
                        </div>
                        @for (filtre of source.filters; track $index; let indexFiltre = $index) {
                            <div class="formulaire-ligne filtre">
                                <select
                                    class="champ"
                                    [(ngModel)]="filtre.col"
                                    [name]="'filtre-colonne-' + indexSource + '-' + indexFiltre"
                                    [attr.name]="'filtre-colonne-' + indexSource + '-' + indexFiltre"
                                >
                                    <option value="">— colonne —</option>
                                    @for (colonne of colonnesDe(source.src); track colonne) {
                                        <option [value]="colonne">{{ colonne }}</option>
                                    }
                                </select>
                                <select
                                    class="champ"
                                    [(ngModel)]="filtre.op"
                                    [name]="'filtre-operateur-' + indexSource + '-' + indexFiltre"
                                    [attr.name]="'filtre-operateur-' + indexSource + '-' + indexFiltre"
                                >
                                    @for (operateur of operateurs(); track operateur.cle) {
                                        <option [value]="operateur.cle">{{ operateur.libelle }}</option>
                                    }
                                </select>
                                @if (filtre.op !== 'empty' && filtre.op !== 'nempty') {
                                    <input
                                        class="champ"
                                        [(ngModel)]="filtre.val"
                                        [name]="'filtre-valeur-' + indexSource + '-' + indexFiltre"
                                        [attr.name]="'filtre-valeur-' + indexSource + '-' + indexFiltre"
                                        placeholder="valeur"
                                    />
                                }
                                <button
                                    class="bouton petit danger"
                                    (click)="retirerFiltre(indexSource, indexFiltre)"
                                    style="flex: 0 0 auto"
                                >
                                    ✕
                                </button>
                            </div>
                        }
                    </div>
                }

                <!-- attributs -->
                @if (recette.sources.length) {
                    <h3>2. Attributs de la table</h3>
                    <p class="discret">
                        L'ordre des attributs est l'ordre des colonnes. Un format déclaré normalise la valeur (dates AAAA-MM-JJ, décimaux à
                        point, booléens OUI/NON, codes en majuscules) ; une valeur inconvertible est conservée et comptée non conforme.
                    </p>
                    <div class="defilement-x">
                        <table class="tableau attributs">
                            <thead>
                                <tr>
                                    <th></th>
                                    <th>Attribut</th>
                                    <th title="Clé : les lignes de même clé strictement identiques sont dédoublonnées">Clé</th>
                                    <th>Format</th>
                                    @for (source of recette.sources; track source.src) {
                                        <th>{{ source.src }}</th>
                                    }
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                @for (attribut of recette.attrs; track $index; let index = $index) {
                                    <tr>
                                        <td class="ordre">
                                            <button class="bouton petit" (click)="deplacerAttribut(index, -1)" [disabled]="index === 0">
                                                ↑
                                            </button>
                                            <button
                                                class="bouton petit"
                                                (click)="deplacerAttribut(index, 1)"
                                                [disabled]="index === recette.attrs.length - 1"
                                            >
                                                ↓
                                            </button>
                                        </td>
                                        <td>
                                            <input
                                                class="champ"
                                                [ngModel]="attribut"
                                                (change)="renommerAttribut(index, $any($event.target).value)"
                                                [name]="'attribut-' + index"
                                                [attr.name]="'attribut-' + index"
                                            />
                                        </td>
                                        <td>
                                            <input
                                                type="checkbox"
                                                [checked]="recette.key.includes(attribut)"
                                                (change)="basculerCle(attribut)"
                                                [attr.name]="'cle-' + index"
                                            />
                                        </td>
                                        <td>
                                            <select
                                                class="champ"
                                                [ngModel]="recette.formats[attribut] || ''"
                                                (ngModelChange)="definirFormat(attribut, $event)"
                                                [name]="'format-' + index"
                                                [attr.name]="'format-' + index"
                                            >
                                                @for (format of formats(); track format.cle) {
                                                    <option [value]="format.cle">{{ format.libelle }}</option>
                                                }
                                            </select>
                                        </td>
                                        @for (source of recette.sources; track $index; let indexSource = $index) {
                                            <td>
                                                <select
                                                    class="champ"
                                                    [ngModel]="source.map[attribut] || ''"
                                                    (ngModelChange)="definirCorrespondance(indexSource, attribut, $event)"
                                                    [name]="'correspondance-' + indexSource + '-' + index"
                                                    [attr.name]="'correspondance-' + indexSource + '-' + index"
                                                >
                                                    <option value="">— absent —</option>
                                                    @for (colonne of colonnesDe(source.src); track colonne) {
                                                        <option [value]="colonne">{{ colonne }}</option>
                                                    }
                                                </select>
                                            </td>
                                        }
                                        <td><button class="bouton petit danger" (click)="retirerAttribut(index)">✕</button></td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    </div>
                    <button class="bouton petit" (click)="ajouterAttribut()">+ attribut</button>

                    <!-- enrichissements -->
                    <h3>3. Enrichissements <span class="discret">(ramener une donnée d'une autre source)</span></h3>
                    @for (jointure of recette.joins; track $index; let index = $index) {
                        <div class="bloc-source">
                            <div class="formulaire-ligne">
                                <div>
                                    <label class="etiquette">La donnée se trouve dans</label>
                                    <select
                                        class="champ"
                                        [ngModel]="jointure.src"
                                        (ngModelChange)="changerSourceEnrichissement(index, $event)"
                                        [name]="'enrichissement-source-' + index"
                                        [attr.name]="'enrichissement-source-' + index"
                                    >
                                        <option value="">— source —</option>
                                        @for (source of sourcesPourEnrichir(); track source.id) {
                                            <option [value]="source.name">{{ source.name }}</option>
                                        }
                                    </select>
                                </div>
                                <div>
                                    <label class="etiquette">Colonne à ramener</label>
                                    <select
                                        class="champ"
                                        [(ngModel)]="jointure.col"
                                        (ngModelChange)="proposerNomEnrichissement(jointure)"
                                        [name]="'enrichissement-colonne-' + index"
                                        [attr.name]="'enrichissement-colonne-' + index"
                                    >
                                        <option value="">— colonne —</option>
                                        @for (colonne of colonnesDe(jointure.src); track colonne) {
                                            <option [value]="colonne">{{ colonne }}</option>
                                        }
                                    </select>
                                </div>
                                <div>
                                    <label class="etiquette">Nom dans ma table</label>
                                    <input
                                        class="champ"
                                        [(ngModel)]="jointure.as"
                                        [name]="'enrichissement-nom-' + index"
                                        [attr.name]="'enrichissement-nom-' + index"
                                    />
                                </div>
                                <div>
                                    <label class="etiquette">Ma colonne d'accroche</label>
                                    <select
                                        class="champ"
                                        [(ngModel)]="jointure.attr"
                                        [name]="'enrichissement-accroche-' + index"
                                        [attr.name]="'enrichissement-accroche-' + index"
                                    >
                                        <option value="">— colonne de ma table —</option>
                                        @for (colonne of colonnesProduites(); track colonne) {
                                            <option [value]="colonne">{{ colonne }}</option>
                                        }
                                    </select>
                                </div>
                                <div>
                                    <label class="etiquette">= clé de la source</label>
                                    <select
                                        class="champ"
                                        [(ngModel)]="jointure.srcKey"
                                        [name]="'enrichissement-cle-' + index"
                                        [attr.name]="'enrichissement-cle-' + index"
                                    >
                                        <option value="">— colonne —</option>
                                        @for (colonne of colonnesDe(jointure.src); track colonne) {
                                            <option [value]="colonne">{{ colonne }}</option>
                                        }
                                    </select>
                                </div>
                                <button class="bouton petit danger" (click)="retirerEnrichissement(index)" style="flex: 0 0 auto">✕</button>
                            </div>
                            <div class="formulaire-ligne">
                                <div>
                                    <label class="etiquette">Table de lien (facultatif)</label>
                                    <select
                                        class="champ"
                                        [(ngModel)]="jointure.viaSrc"
                                        [name]="'enrichissement-lien-' + index"
                                        [attr.name]="'enrichissement-lien-' + index"
                                    >
                                        <option value="">— accès direct —</option>
                                        @for (source of sourcesPourEnrichir(); track source.id) {
                                            @if (source.name !== jointure.src) {
                                                <option [value]="source.name">{{ source.name }}</option>
                                            }
                                        }
                                    </select>
                                </div>
                                @if (jointure.viaSrc) {
                                    <div>
                                        <label class="etiquette">Sa colonne côté ma table</label>
                                        <select
                                            class="champ"
                                            [(ngModel)]="jointure.viaIn"
                                            [name]="'enrichissement-lien-entree-' + index"
                                            [attr.name]="'enrichissement-lien-entree-' + index"
                                        >
                                            <option value="">— colonne —</option>
                                            @for (colonne of colonnesDe(jointure.viaSrc); track colonne) {
                                                <option [value]="colonne">{{ colonne }}</option>
                                            }
                                        </select>
                                    </div>
                                    <div>
                                        <label class="etiquette">Sa colonne côté « {{ jointure.src }} »</label>
                                        <select
                                            class="champ"
                                            [(ngModel)]="jointure.viaOut"
                                            [name]="'enrichissement-lien-sortie-' + index"
                                            [attr.name]="'enrichissement-lien-sortie-' + index"
                                        >
                                            <option value="">— colonne —</option>
                                            @for (colonne of colonnesDe(jointure.viaSrc); track colonne) {
                                                <option [value]="colonne">{{ colonne }}</option>
                                            }
                                        </select>
                                    </div>
                                }
                                <div>
                                    <label class="etiquette">Lignes à retenir</label>
                                    <select
                                        class="champ"
                                        [(ngModel)]="jointure.validMode"
                                        [name]="'enrichissement-validite-' + index"
                                        [attr.name]="'enrichissement-validite-' + index"
                                    >
                                        @for (mode of modesValidite(); track mode.cle) {
                                            <option [value]="mode.cle">{{ mode.libelle }}</option>
                                        }
                                    </select>
                                </div>
                                @if (jointure.validMode === 'status') {
                                    <div>
                                        <label class="etiquette">Colonne de statut</label>
                                        <select
                                            class="champ"
                                            [(ngModel)]="jointure.vCol"
                                            [name]="'enrichissement-statut-' + index"
                                            [attr.name]="'enrichissement-statut-' + index"
                                        >
                                            <option value="">— colonne —</option>
                                            @for (colonne of colonnesDe(jointure.viaSrc || jointure.src); track colonne) {
                                                <option [value]="colonne">{{ colonne }}</option>
                                            }
                                        </select>
                                    </div>
                                    <div>
                                        <label class="etiquette">Condition</label>
                                        <select
                                            class="champ"
                                            [(ngModel)]="jointure.vOp"
                                            [name]="'enrichissement-statut-operateur-' + index"
                                            [attr.name]="'enrichissement-statut-operateur-' + index"
                                        >
                                            @for (operateur of operateurs(); track operateur.cle) {
                                                <option [value]="operateur.cle">{{ operateur.libelle }}</option>
                                            }
                                        </select>
                                    </div>
                                    <div>
                                        <label class="etiquette">Valeur</label>
                                        <input
                                            class="champ"
                                            [(ngModel)]="jointure.vVal"
                                            [name]="'enrichissement-statut-valeur-' + index"
                                            [attr.name]="'enrichissement-statut-valeur-' + index"
                                            placeholder="ex. ACTIF"
                                        />
                                    </div>
                                }
                                @if (jointure.validMode === 'period') {
                                    <div>
                                        <label class="etiquette">Début de période</label>
                                        <select
                                            class="champ"
                                            [(ngModel)]="jointure.vStart"
                                            [name]="'enrichissement-debut-' + index"
                                            [attr.name]="'enrichissement-debut-' + index"
                                        >
                                            <option value="">— colonne —</option>
                                            @for (colonne of colonnesDe(jointure.viaSrc || jointure.src); track colonne) {
                                                <option [value]="colonne">{{ colonne }}</option>
                                            }
                                        </select>
                                    </div>
                                    <div>
                                        <label class="etiquette">Fin de période</label>
                                        <select
                                            class="champ"
                                            [(ngModel)]="jointure.vEnd"
                                            [name]="'enrichissement-fin-' + index"
                                            [attr.name]="'enrichissement-fin-' + index"
                                        >
                                            <option value="">— (ouverte) —</option>
                                            @for (colonne of colonnesDe(jointure.viaSrc || jointure.src); track colonne) {
                                                <option [value]="colonne">{{ colonne }}</option>
                                            }
                                        </select>
                                    </div>
                                }
                            </div>
                        </div>
                    }
                    <button class="bouton petit" (click)="ajouterEnrichissement()">+ enrichissement</button>

                    <!-- colonnes calculées -->
                    <h3>4. Colonnes calculées <span class="discret">(SQL DuckDB, attributs entre crochets : [Prix] * [Quantité])</span></h3>
                    @for (calcul of recette.calcs; track $index; let index = $index) {
                        <div class="formulaire-ligne">
                            <input
                                class="champ"
                                [(ngModel)]="calcul.name"
                                [name]="'calcul-nom-' + index"
                                [attr.name]="'calcul-nom-' + index"
                                placeholder="nom"
                                style="flex: 0 1 200px"
                            />
                            <input
                                class="champ"
                                [(ngModel)]="calcul.formula"
                                [name]="'calcul-formule-' + index"
                                [attr.name]="'calcul-formule-' + index"
                                placeholder="formule"
                            />
                            <button class="bouton petit danger" (click)="retirerCalcul(index)" style="flex: 0 0 auto">✕</button>
                        </div>
                    }
                    <button class="bouton petit" (click)="ajouterCalcul()">+ colonne calculée</button>

                    <!-- clés étrangères -->
                    <h3>
                        5. Clés étrangères déclarées <span class="discret">(lien créé dans le modèle de données, orphelins comptés)</span>
                    </h3>
                    @for (cle of recette.fks; track $index; let index = $index) {
                        <div class="formulaire-ligne">
                            <select
                                class="champ"
                                [(ngModel)]="cle.attr"
                                [name]="'cle-etrangere-attribut-' + index"
                                [attr.name]="'cle-etrangere-attribut-' + index"
                            >
                                <option value="">— attribut —</option>
                                @for (colonne of colonnesProduites(); track colonne) {
                                    <option [value]="colonne">{{ colonne }}</option>
                                }
                            </select>
                            <select
                                class="champ"
                                [(ngModel)]="cle.table"
                                (ngModelChange)="cle.col = ''"
                                [name]="'cle-etrangere-table-' + index"
                                [attr.name]="'cle-etrangere-table-' + index"
                            >
                                <option value="">— source cible —</option>
                                @for (source of sourcesPourEnrichir(); track source.id) {
                                    <option [value]="source.name">{{ source.name }}</option>
                                }
                            </select>
                            <select
                                class="champ"
                                [(ngModel)]="cle.col"
                                [name]="'cle-etrangere-colonne-' + index"
                                [attr.name]="'cle-etrangere-colonne-' + index"
                            >
                                <option value="">— colonne cible —</option>
                                @for (colonne of colonnesDe(cle.table); track colonne) {
                                    <option [value]="colonne">{{ colonne }}</option>
                                }
                            </select>
                            <button class="bouton petit danger" (click)="retirerCleEtrangere(index)" style="flex: 0 0 auto">✕</button>
                        </div>
                    }
                    <button class="bouton petit" (click)="ajouterCleEtrangere()">+ clé étrangère</button>

                    <!-- actions -->
                    <div class="entete-page" style="margin: 16px 0 0">
                        <button class="bouton" (click)="voirSql()" [disabled]="enCours()">Voir le SQL</button>
                        <button class="bouton" (click)="apercevoir()" [disabled]="enCours()">Aperçu (50 lignes)</button>
                        <button class="bouton principal" (click)="construire()" [disabled]="enCours()">
                            {{ enCours() ? 'Construction…' : recette.targetId ? 'Reconstruire la table' : 'Construire la table' }}
                        </button>
                    </div>
                    @if (sql(); as sql) {
                        <pre class="sql">{{ sql }}</pre>
                    }
                    @if (apercu(); as apercu) {
                        <div class="defilement-x" style="margin-top: 10px">
                            <table class="tableau">
                                <thead>
                                    <tr>
                                        @for (colonne of apercu.colonnes; track colonne.nom) {
                                            <th>{{ colonne.nom }}</th>
                                        }
                                    </tr>
                                </thead>
                                <tbody>
                                    @for (ligne of apercu.lignes; track $index) {
                                        <tr>
                                            @for (valeur of ligne; track $index) {
                                                <td>{{ valeur ?? '' }}</td>
                                            }
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        </div>
                    }
                }
            </div>
        }
    `,
    styles: `
        .table-concue h3 {
            margin: 0;
            font-size: 15px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .alerte-texte {
            color: var(--alerte);
            font-size: 12px;
            font-weight: 600;
            margin-top: 6px;
        }
        .puces {
            margin: 8px 0;
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
        .actions {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }
        .vide {
            text-align: center;
            padding: 40px 16px;
            border-style: dashed;
        }
        .editeur {
            margin-top: 14px;
        }
        .editeur h3 {
            margin: 18px 0 4px;
            font-size: 14px;
        }
        .bloc-source {
            border: 1px solid var(--bordure);
            border-radius: var(--rayon);
            padding: 10px;
            margin: 8px 0;
            background: var(--surface-2);
        }
        .bloc-source .filtre {
            margin-top: 6px;
        }
        .attributs .champ {
            min-width: 120px;
        }
        .ordre {
            white-space: nowrap;
        }
        .sql {
            margin-top: 10px;
            padding: 10px;
            background: var(--surface-2);
            border-radius: var(--rayon);
            font-size: 12px;
            white-space: pre-wrap;
            word-break: break-word;
        }
        .groupe-ecart {
            border-top: 1px solid var(--bordure);
            padding: 8px 0;
        }
        .cle-ecart {
            font-weight: 700;
            font-size: 13px;
        }
        .ligne-ecart {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            align-items: baseline;
            padding: 2px 0 2px 16px;
            font-size: 12px;
        }
        .nom-attribut {
            color: var(--alerte);
            font-weight: 700;
            min-width: 140px;
        }
        .valeur-ecart {
            border: 1px solid var(--bordure);
            border-radius: 6px;
            padding: 1px 6px;
            background: var(--surface-2);
        }
    `
})
export class TablesConcuesComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    readonly session = inject(SessionService);
    readonly formaterDate = formaterDate;

    readonly sources = signal<Source[]>([]);
    readonly tables = signal<TableConcue[]>([]);
    readonly vocabulaire = signal<VocabulaireTablesConcues | null>(null);
    readonly brouillon = signal<Recette | null>(null);
    readonly sql = signal<string | null>(null);
    readonly apercu = signal<ResultatSql | null>(null);
    readonly ecarts = signal<RapportEcarts | null>(null);
    readonly contributions = signal<Contribution[] | null>(null);
    readonly tableOuverte = signal<TableConcue | null>(null);
    readonly enCours = signal(false);
    sourceAAjouter = '';

    readonly formats = computed(() => Object.entries(this.vocabulaire()?.formats || {}).map(([cle, libelle]) => ({ cle, libelle })));
    readonly operateurs = computed(() =>
        Object.entries(this.vocabulaire()?.operateursFiltre || {}).map(([cle, libelle]) => ({ cle, libelle }))
    );
    readonly modesValidite = computed(() =>
        Object.entries(this.vocabulaire()?.modesValidite || {}).map(([cle, libelle]) => ({ cle, libelle }))
    );
    /** Sources ordinaires (pas des tables conçues) pas encore contributrices de la recette en cours. */
    readonly sourcesDisponibles = computed(() => {
        const recette = this.brouillon();
        return this.sources().filter(
            source => source.type !== 'designed' && !recette?.sources.some(candidat => candidat.src === source.name)
        );
    });
    /** Sources utilisables comme cible d'enrichissement ou de clé étrangère : toutes sauf la table en cours. */
    readonly sourcesPourEnrichir = computed(() => this.sources().filter(source => source.id !== this.brouillon()?.targetId));
    readonly groupesEcarts = computed(() => grouperEcarts(this.ecarts()?.ecarts || []));

    constructor() {
        void this.recharger();
    }

    async recharger(): Promise<void> {
        try {
            const [sources, tables, vocabulaire] = await Promise.all([
                this.api.sources(),
                this.api.tablesConcues(),
                this.vocabulaire() ?? this.api.vocabulaireTablesConcues()
            ]);
            this.sources.set(sources);
            this.tables.set(tables);
            this.vocabulaire.set(vocabulaire);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    // ---- liste ----
    nouvelleTable(): void {
        this.fermerPanneaux();
        this.brouillon.set(RECETTE_VIDE());
    }

    modifier(table: TableConcue): void {
        this.fermerPanneaux();
        this.brouillon.set({ ...structuredClone(table.design), name: table.name, targetId: table.id });
    }

    annuler(): void {
        this.brouillon.set(null);
        this.sql.set(null);
        this.apercu.set(null);
    }

    async reconstruire(table: TableConcue): Promise<void> {
        this.enCours.set(true);
        try {
            const reconstruite = await this.api.reconstruireTableConcue(table.id);
            this.notifications.succes(`Table « ${reconstruite.name} » reconstruite : ${reconstruite.design.lastRows} ligne(s).`);
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    async supprimer(table: TableConcue): Promise<void> {
        if (!confirm(`Supprimer la table conçue « ${table.name} » ?`)) return;
        try {
            await this.api.supprimerSource(table.id);
            this.notifications.succes(`« ${table.name} » supprimée.`);
            this.fermerPanneaux();
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async voirEcarts(table: TableConcue): Promise<void> {
        this.fermerPanneaux();
        this.tableOuverte.set(table);
        try {
            this.ecarts.set(await this.api.ecartsTableConcue(table.id));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async voirContributions(table: TableConcue): Promise<void> {
        this.fermerPanneaux();
        this.tableOuverte.set(table);
        try {
            this.contributions.set(await this.api.contributionsTableConcue(table.id));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    private fermerPanneaux(): void {
        this.ecarts.set(null);
        this.contributions.set(null);
        this.tableOuverte.set(null);
    }

    // ---- éditeur : sources ----
    ajouterSource(): void {
        const recette = this.brouillon();
        const source = this.sources().find(candidat => candidat.name === this.sourceAAjouter);
        if (!recette || !source) return;
        const contributrice = { src: source.name, map: {} as Record<string, string>, filters: [] };
        if (!recette.attrs.length) {
            // Première source : elle définit les attributs (correspondance identité, renommables ensuite).
            for (const colonne of source.headers) {
                recette.attrs.push(colonne);
                contributrice.map[colonne] = colonne;
            }
        } else {
            // Sources suivantes : rapprochement automatique par nom comparable.
            for (const attribut of recette.attrs) {
                const colonne = source.headers.find(candidat => nomComparable(candidat) === nomComparable(attribut));
                if (colonne) contributrice.map[attribut] = colonne;
            }
        }
        recette.sources.push(contributrice);
        this.sourceAAjouter = '';
        this.rafraichir();
    }

    retirerSource(index: number): void {
        this.brouillon()?.sources.splice(index, 1);
        this.rafraichir();
    }

    ajouterFiltre(indexSource: number): void {
        this.brouillon()?.sources[indexSource].filters.push({ col: '', op: 'eq', val: '' });
        this.rafraichir();
    }

    retirerFiltre(indexSource: number, indexFiltre: number): void {
        this.brouillon()?.sources[indexSource].filters.splice(indexFiltre, 1);
        this.rafraichir();
    }

    // ---- éditeur : attributs ----
    ajouterAttribut(): void {
        const recette = this.brouillon();
        if (!recette) return;
        let numero = recette.attrs.length + 1;
        while (recette.attrs.includes('Attribut_' + numero)) numero++;
        recette.attrs.push('Attribut_' + numero);
        this.rafraichir();
    }

    retirerAttribut(index: number): void {
        const recette = this.brouillon();
        if (!recette) return;
        const [attribut] = recette.attrs.splice(index, 1);
        recette.key = recette.key.filter(candidat => candidat !== attribut);
        for (const source of recette.sources) delete source.map[attribut];
        delete recette.formats[attribut];
        recette.fks = recette.fks.filter(cle => cle.attr !== attribut);
        this.rafraichir();
    }

    /** Renomme un attribut partout où il est cité : correspondances, clé, formules, formats, clés étrangères, accroches. */
    renommerAttribut(index: number, nouveauNom: string): void {
        const recette = this.brouillon();
        if (!recette) return;
        const ancien = recette.attrs[index];
        const nouveau = String(nouveauNom || '').trim();
        if (!nouveau || (nouveau !== ancien && recette.attrs.includes(nouveau))) {
            this.notifications.erreur(nouveau ? `L'attribut « ${nouveau} » existe déjà.` : "Nom d'attribut vide.");
            this.rafraichir();
            return;
        }
        recette.attrs[index] = nouveau;
        for (const source of recette.sources)
            if (ancien in source.map) {
                source.map[nouveau] = source.map[ancien];
                delete source.map[ancien];
            }
        recette.key = recette.key.map(candidat => (candidat === ancien ? nouveau : candidat));
        for (const calcul of recette.calcs) calcul.formula = calcul.formula.split('[' + ancien + ']').join('[' + nouveau + ']');
        if (ancien in recette.formats) {
            recette.formats[nouveau] = recette.formats[ancien];
            delete recette.formats[ancien];
        }
        for (const cle of recette.fks) if (cle.attr === ancien) cle.attr = nouveau;
        for (const jointure of recette.joins) if (jointure.attr === ancien) jointure.attr = nouveau;
        this.rafraichir();
    }

    deplacerAttribut(index: number, sens: -1 | 1): void {
        const recette = this.brouillon();
        if (!recette) return;
        const destination = index + sens;
        if (destination < 0 || destination >= recette.attrs.length) return;
        [recette.attrs[index], recette.attrs[destination]] = [recette.attrs[destination], recette.attrs[index]];
        this.rafraichir();
    }

    basculerCle(attribut: string): void {
        const recette = this.brouillon();
        if (!recette) return;
        recette.key = recette.key.includes(attribut) ? recette.key.filter(candidat => candidat !== attribut) : [...recette.key, attribut];
        this.rafraichir();
    }

    definirFormat(attribut: string, format: FormatAttribut): void {
        const recette = this.brouillon();
        if (!recette) return;
        if (format) recette.formats[attribut] = format;
        else delete recette.formats[attribut];
        this.rafraichir();
    }

    definirCorrespondance(indexSource: number, attribut: string, colonne: string): void {
        const source = this.brouillon()?.sources[indexSource];
        if (!source) return;
        if (colonne) source.map[attribut] = colonne;
        else delete source.map[attribut];
        this.rafraichir();
    }

    // ---- éditeur : enrichissements, calculs, clés étrangères ----
    ajouterEnrichissement(): void {
        this.brouillon()?.joins.push(ENRICHISSEMENT_VIDE());
        this.rafraichir();
    }

    retirerEnrichissement(index: number): void {
        this.brouillon()?.joins.splice(index, 1);
        this.rafraichir();
    }

    changerSourceEnrichissement(index: number, nomSource: string): void {
        const jointure = this.brouillon()?.joins[index];
        if (!jointure) return;
        Object.assign(jointure, { ...ENRICHISSEMENT_VIDE(), attr: jointure.attr, as: jointure.as, src: nomSource });
        this.rafraichir();
    }

    proposerNomEnrichissement(jointure: Enrichissement): void {
        if (!String(jointure.as || '').trim()) jointure.as = jointure.col;
    }

    ajouterCalcul(): void {
        const recette = this.brouillon();
        if (!recette) return;
        let numero = recette.calcs.length + 1;
        while (recette.calcs.some(calcul => calcul.name === 'Calcul_' + numero)) numero++;
        recette.calcs.push({ name: 'Calcul_' + numero, formula: '' });
        this.rafraichir();
    }

    retirerCalcul(index: number): void {
        this.brouillon()?.calcs.splice(index, 1);
        this.rafraichir();
    }

    ajouterCleEtrangere(): void {
        this.brouillon()?.fks.push({ attr: '', table: '', col: '' });
        this.rafraichir();
    }

    retirerCleEtrangere(index: number): void {
        this.brouillon()?.fks.splice(index, 1);
        this.rafraichir();
    }

    // ---- éditeur : SQL, aperçu, construction ----
    async voirSql(): Promise<void> {
        const recette = this.brouillon();
        if (!recette) return;
        try {
            this.sql.set((await this.api.sqlTableConcue(recette)).sql);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async apercevoir(): Promise<void> {
        const recette = this.brouillon();
        if (!recette) return;
        this.enCours.set(true);
        try {
            this.apercu.set(await this.api.apercuTableConcue(recette, 50));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    async construire(): Promise<void> {
        const recette = this.brouillon();
        if (!recette) return;
        recette.name = recette.name.trim();
        if (!recette.name) return this.notifications.erreur('Donnez un nom à la table.');
        if (!recette.sources.length) return this.notifications.erreur('Ajoutez au moins une source.');
        if (!recette.attrs.length) return this.notifications.erreur('Ajoutez au moins un attribut.');
        this.enCours.set(true);
        try {
            const table = await this.api.construireTableConcue(recette);
            this.notifications.succes(`Table « ${table.name} » construite : ${table.design.lastRows} ligne(s).`);
            this.annuler();
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    // ---- aides d'affichage ----
    colonnesDe(nomSource: string): string[] {
        return this.sources().find(source => source.name === nomSource)?.headers || [];
    }

    /** Colonnes que la table produira : attributs, enrichissements nommés, calculs nommés. */
    colonnesProduites(): string[] {
        const recette = this.brouillon();
        if (!recette) return [];
        return [
            ...recette.attrs,
            ...recette.joins.map(jointure => jointure.as.trim()).filter(nom => nom && !recette.attrs.includes(nom)),
            ...recette.calcs.map(calcul => calcul.name.trim()).filter(Boolean)
        ];
    }

    calculsValides(recette: Recette): { name: string; formula: string }[] {
        return recette.calcs.filter(calcul => calcul.name && calcul.formula.trim());
    }

    nombreFormats(recette: Recette): number {
        return Object.values(recette.formats || {}).filter(Boolean).length;
    }

    nonConformes(recette: Recette): number {
        return Object.values(recette.lastConform || {}).reduce((somme, nombre) => somme + nombre, 0);
    }

    orphelins(recette: Recette): number {
        return (recette.lastFk || []).reduce((somme, cle) => somme + (cle.orphans && cle.orphans > 0 ? cle.orphans : 0), 0);
    }

    pourcent(valeur: number): string {
        return (valeur * 100).toFixed(1).replace('.', ',') + ' %';
    }

    /** Force le rafraîchissement des vues calculées après une mutation de la recette en cours. */
    private rafraichir(): void {
        this.brouillon.update(recette => (recette ? { ...recette } : recette));
    }
}

/** Regroupe les écarts par clé puis par attribut, pour un affichage comparatif source par source. */
function grouperEcarts(ecarts: Ecart[]): GroupeEcarts[] {
    const groupes = new Map<string, Map<string, { source: string; valeur: string }[]>>();
    for (const ecart of ecarts) {
        if (!groupes.has(ecart.cle)) groupes.set(ecart.cle, new Map());
        const parAttribut = groupes.get(ecart.cle)!;
        if (!parAttribut.has(ecart.attribut)) parAttribut.set(ecart.attribut, []);
        parAttribut.get(ecart.attribut)!.push({ source: ecart.source, valeur: ecart.valeur });
    }
    return [...groupes].map(([cle, parAttribut]) => ({
        cle,
        attributs: [...parAttribut].map(([attribut, valeurs]) => ({ attribut, valeurs }))
    }));
}
