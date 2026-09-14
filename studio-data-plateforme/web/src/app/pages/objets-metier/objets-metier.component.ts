/**
 * Objets métier : la liste (gauche) et la fiche de l'objet choisi (droite).
 *   • Identité : nom, définition, domaine, propriétaire, contributeurs, statut, complétude de la fiche ;
 *   • Informations (V13 : « attribut » en langage technique) : nom et définition dans la liste, et pour
 *     chacune une fiche en trois questions — c'est quoi, d'où ça vient, qui s'en sert ;
 *   • Sources : tables techniques et leur rôle (maître, contributeur, destinataire) ;
 *   • Actifs producteurs et consommateurs, objets référencés ;
 *   • Historique des décisions (propositions validées ou refusées).
 * Un objet peut être initialisé depuis une source : une information par colonne, déjà rattachée à la table ;
 * « ✨ Décrire depuis un fichier / modèle » va plus loin et propose aussi les noms, les définitions et des
 * exemples de valeurs. Chacun peut proposer une correction sur une fiche ; le responsable valide.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AnnulationService } from '../../coeur/annulation.service';
import { ClientApiService } from '../../coeur/client-api.service';
import { MoyensDuRetour, questionAvantSuppression, retourDUneEcriture, retourDUneSuppression } from '../../coeur/gestes-annulables';
import { copieDUnObjet, messageDeCopie } from '../../coeur/duplication';
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
import { completudeInformation, feuDeLObjet } from './description-information';
import { originesValides, provenanceDe } from './origines-information';
import { ACTIONS_GROUPEES, ActionGroupee, ChoixRapide, objetApresGeste, refusDuGeste, selonLeChoix } from './actions-groupees';
import { AssistantObjetComponent } from './assistant-objet.component';
import { ColonneOfferte, colonneLachee, colonneTransportee, colonnesDeLObjet, informationAvecColonne } from './colonnes-a-rattacher';
import { FicheInformationComponent } from './fiche-information.component';
import { ProposerCorrectionComponent } from '../../composants/proposer-correction.component';
import { PropositionObjetComponent } from './proposition-objet.component';

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
    // Une information héritée d'un autre objet est alimentée, même sans colonne de fichier (V12.6).
    const sansAlimentation = attributs.filter(attribut => !(attribut.mappings || []).length && !(attribut.origins || []).length).length;
    const sansDefinition = attributs.filter(attribut => !attribut.definition).length;
    const sansUsage = attributs.filter(attribut => !(attribut.usedBy || []).length).length;
    const criteres: { poids: number; ok: boolean; libelle: string }[] = [
        { poids: 15, ok: !!objet.definition.trim(), libelle: 'Écrire la définition' },
        { poids: 15, ok: !!objet.globalOwner.trim(), libelle: 'Désigner un propriétaire' },
        { poids: 15, ok: objet.sources.some(source => source.role === 'maitre'), libelle: 'Désigner une source maître' },
        { poids: 10, ok: attributs.length > 0, libelle: 'Ajouter des informations' },
        {
            poids: 15,
            ok: attributs.length > 0 && sansAlimentation === 0,
            libelle: `${sansAlimentation} information(s) dont on ne sait pas d'où elles viennent`
        },
        { poids: 15, ok: attributs.length > 0 && sansDefinition === 0, libelle: `${sansDefinition} information(s) sans définition` },
        ...(avecActifs
            ? [
                  {
                      poids: 10,
                      ok: attributs.length > 0 && sansUsage === 0,
                      libelle: `${sansUsage} information(s) dont personne ne dit se servir`
                  }
              ]
            : []),
        { poids: 5, ok: objet.status === 'Validé', libelle: "Faire valider l'objet" }
    ];
    const total = criteres.reduce((somme, critere) => somme + critere.poids, 0);
    const obtenu = criteres.filter(critere => critere.ok).reduce((somme, critere) => somme + critere.poids, 0);
    return { score: Math.round((100 * obtenu) / total), aFaire: criteres.filter(critere => !critere.ok).map(critere => critere.libelle) };
}

@Component({
    selector: 'app-objets-metier',
    imports: [
        FormsModule,
        RouterLink,
        FicheInformationComponent,
        PropositionObjetComponent,
        ProposerCorrectionComponent,
        AssistantObjetComponent
    ],
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
                <button class="bouton" name="decrireDepuisFichier" (click)="propositionOuverte.set(true)">
                    ✨ Décrire depuis un fichier / modèle
                </button>
                <button class="bouton" name="assistantObjet" (click)="assistantOuvert.set(true)">🪄 Assistant en 3 étapes</button>
                <button class="bouton principal" (click)="nouvelObjet()">Nouvel objet</button>
            }
        </div>

        @if (assistantOuvert()) {
            <app-assistant-objet
                [sources]="sources()"
                [domaines]="domaines()"
                (creerObjet)="adopterAssistant($event)"
                (fermer)="assistantOuvert.set(false)"
            />
        }

        @if (propositionOuverte()) {
            <app-proposition-objet
                [sources]="sources()"
                [objets]="objets()"
                (creerObjet)="adopterProposition($event)"
                (fermer)="propositionOuverte.set(false)"
            />
        }

        <div class="disposition">
            <!-- ---- liste ---- -->
            <div class="carte liste">
                <input class="champ" placeholder="Filtrer…" [(ngModel)]="filtre" name="filtre" />
                @for (objet of objetsFiltres(); track objet.id) {
                    <button class="element" [class.actif]="objet.id === selectionId()" (click)="selectionner(objet)">
                        <span class="nom">
                            <span class="feu" [class]="'feu ' + feu(objet).couleur" [title]="feu(objet).titre"></span>
                            {{ objet.name || '(sans nom)' }}
                        </span>
                        <span class="discret"
                            >{{ objet.domain || '—' }} · {{ objet.elements.length }} information(s) · {{ completude(objet).score }} %</span
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
                        <!-- V13 : d'une fiche, on va voir d'où vient la donnée et où elle va. -->
                        @if (!nouveau()) {
                            <a class="bouton" name="parcoursObjet" [routerLink]="'/lineage'" [queryParams]="{ objet: objet.id }">
                                🔎 Parcours
                            </a>
                        }
                        @if (session.peutEditer()) {
                            <button class="bouton principal" (click)="enregistrer()" [disabled]="enCours()">Enregistrer</button>
                            @if (!nouveau()) {
                                <button class="bouton" name="dupliquerObjet" (click)="dupliquer(objet)">⧉ Dupliquer</button>
                                <button class="bouton danger" (click)="supprimer(objet)">Supprimer</button>
                            }
                        }
                    </div>
                    @if (completude(objet).aFaire.length) {
                        <div class="discret" style="margin-bottom: 8px">À faire : {{ completude(objet).aFaire.join(' · ') }}</div>
                    }
                    <!-- V13 : contribuer sans risque — le responsable valide avant que quoi que ce soit change. -->
                    <app-proposer-correction
                        [genre]="'bo'"
                        [cible]="{ boId: objet.id }"
                        [sujet]="objet.name"
                        [valeurActuelle]="objet.definition"
                        [domaine]="objet.domain || ''"
                    />
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

                    <!-- informations : la liste, et la fiche en trois questions de celle qu'on ouvre (V13) -->
                    @if (ongletActif() === 'attributs') {
                        @if (session.peutEditer() && objet.elements.length) {
                            <div class="entete-page" style="margin: 0 0 8px">
                                <span class="discret espace">{{ objet.elements.length }} information(s)</span>
                                <button class="bouton petit" type="button" name="actionsGroupees" (click)="basculerGeste(objet)">
                                    ☑ Actions groupées
                                </button>
                            </div>
                        }
                        <!-- V11 : poser le même geste sur plusieurs informations d'un coup -->
                        @if (gesteOuvert()) {
                            <div class="carte geste">
                                <div class="entete-page" style="margin: 0 0 8px">
                                    <b class="espace">Actions groupées — {{ informationsChoisies().length }} information(s) choisie(s)</b>
                                    <button class="bouton petit" type="button" name="choixTout" (click)="choisir(objet, 'tout')">
                                        Tout
                                    </button>
                                    <button class="bouton petit" type="button" name="choixAucun" (click)="choisir(objet, 'aucun')">
                                        Aucune
                                    </button>
                                    <button
                                        class="bouton petit"
                                        type="button"
                                        name="choixSansDefinition"
                                        (click)="choisir(objet, 'sansDefinition')"
                                    >
                                        Sans définition
                                    </button>
                                    <button
                                        class="bouton petit"
                                        type="button"
                                        name="choixSansOrigine"
                                        (click)="choisir(objet, 'sansOrigine')"
                                    >
                                        Sans provenance
                                    </button>
                                    <button class="bouton petit" type="button" name="fermerGeste" (click)="gesteOuvert.set(false)">
                                        Fermer
                                    </button>
                                </div>
                                <div class="ligne-champs">
                                    <select class="champ" name="gesteAction" [(ngModel)]="gesteAction">
                                        @for (choix of actionsGroupees; track choix.action) {
                                            <option [value]="choix.action">{{ choix.libelle }}</option>
                                        }
                                    </select>
                                    @if (gesteAction === 'usage') {
                                        <select class="champ" name="gesteValeur" [(ngModel)]="gesteValeur">
                                            <option value="">— application ou processus —</option>
                                            @for (actif of actifs(); track actif.id) {
                                                <option [value]="actif.id">{{ actif.name }}</option>
                                            }
                                        </select>
                                    } @else {
                                        <input
                                            class="champ"
                                            name="gesteValeur"
                                            [(ngModel)]="gesteValeur"
                                            [placeholder]="valeurAttendue()"
                                            [attr.list]="gesteAction === 'terme' ? 'geste-termes' : null"
                                        />
                                        <datalist id="geste-termes">
                                            @for (terme of termes(); track terme.id) {
                                                <option [value]="terme.term"></option>
                                            }
                                        </datalist>
                                    }
                                    <button class="bouton principal" type="button" name="appliquerGeste" (click)="appliquerGeste(objet)">
                                        Appliquer
                                    </button>
                                </div>
                            </div>
                        }
                        <!-- V11 : les colonnes des sources de l'objet, à glisser sur une information -->
                        @if (session.peutEditer() && colonnesOffertes(objet).length) {
                            <div class="colonnes-a-glisser">
                                <span class="discret">Glissez une colonne sur une information pour dire d'où elle vient :</span>
                                @for (offerte of colonnesOffertes(objet); track offerte.table + '.' + offerte.colonne) {
                                    <span
                                        class="puce colonne"
                                        [class.utilisee]="offerte.dejaRattachee"
                                        draggable="true"
                                        [title]="offerte.table + ' · ' + offerte.colonne"
                                        (dragstart)="commencerGlissement($event, offerte)"
                                    >
                                        {{ offerte.colonne }}
                                    </span>
                                }
                            </div>
                        }
                        <div class="defilement-x">
                            <table class="tableau">
                                <thead>
                                    <tr>
                                        @if (gesteOuvert()) {
                                            <th></th>
                                        }
                                        <th title="Terme technique : attribut">Information</th>
                                        <th>Définition</th>
                                        <th title="Terme technique : mapping">D'où ça vient</th>
                                        <th>Fiche</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @for (attribut of objet.elements; track attribut.id; let index = $index) {
                                        <tr
                                            [class.ouverte]="attribut.id === informationOuverte()"
                                            [class.survolee]="attribut.id === informationSurvolee()"
                                            (dragover)="survolerInformation($event, attribut)"
                                            (dragleave)="informationSurvolee.set('')"
                                            (drop)="lacherSurInformation($event, attribut)"
                                        >
                                            @if (gesteOuvert()) {
                                                <td>
                                                    <input
                                                        type="checkbox"
                                                        [checked]="informationsChoisies().includes(attribut.id)"
                                                        [attr.name]="'geste-' + index"
                                                        (change)="basculerChoix(attribut.id)"
                                                    />
                                                </td>
                                            }
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
                                            <td class="discret">{{ provenance(attribut) || '—' }}</td>
                                            <td style="white-space: nowrap">
                                                <span class="badge" [class.succes]="complet(attribut) === 100">
                                                    {{ complet(attribut) }} %
                                                </span>
                                                <button
                                                    class="bouton petit"
                                                    type="button"
                                                    [name]="'ouvrirFiche-' + index"
                                                    [attr.name]="'ouvrirFiche-' + index"
                                                    (click)="ouvrirInformation(attribut)"
                                                >
                                                    {{ attribut.id === informationOuverte() ? 'Fermer' : 'Ouvrir la fiche' }}
                                                </button>
                                                <a
                                                    class="bouton petit"
                                                    [attr.name]="'parcours-' + index"
                                                    title="D'où vient cette information, et où elle va"
                                                    [routerLink]="'/lineage'"
                                                    [queryParams]="{ objet: objet.id, information: attribut.id }"
                                                >
                                                    🔎
                                                </a>
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
                        @if (informationChoisie(objet); as information) {
                            <app-fiche-information
                                [attribut]="information"
                                [objet]="objet"
                                [objets]="objets()"
                                [sources]="sources()"
                                [actifs]="actifs()"
                                [termes]="termes()"
                                (fermer)="informationOuverte.set('')"
                            />
                        }
                        @if (session.peutEditer()) {
                            <button class="bouton petit" style="margin-top: 8px" (click)="ajouterAttribut(objet)">+ Information</button>
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
        /* V11 : le bandeau des colonnes que l'on fait glisser sur une information. */
        .colonnes-a-glisser {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 6px;
            margin-bottom: 10px;
        }
        .puce.colonne {
            cursor: grab;
        }
        /* Une colonne déjà rattachée reste visible, mais en retrait : on voit ce qui n'a pas trouvé sa place. */
        .puce.colonne.utilisee {
            opacity: 0.45;
        }
        tr.survolee td {
            background: var(--accent-2);
        }
        .carte.geste {
            margin-bottom: 10px;
        }

        /* Feu tricolore d'un objet : d'un coup d'œil, ce qui est documenté et ce qui n'a pas de responsable. */
        .feu {
            display: inline-block;
            width: 9px;
            height: 9px;
            border-radius: 50%;
            margin-right: 6px;
            vertical-align: middle;
        }
        .feu.vert {
            background: var(--succes);
        }
        .feu.orange {
            background: var(--alerte);
        }
        .feu.rouge {
            background: var(--erreur);
        }
        tr.ouverte td {
            background: color-mix(in srgb, var(--accent) 7%, transparent);
        }
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
    private readonly annulation = inject(AnnulationService);
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
    /** Identifiant de l'information dont la fiche en trois questions est ouverte ; vide = aucune. */
    readonly informationOuverte = signal('');
    /** L'assistant en trois étapes (V11) : ouvert ou non. */
    readonly assistantOuvert = signal(false);
    /** Le panneau des actions groupées (V11) : ouvert ou non. */
    readonly gesteOuvert = signal(false);
    /** Les informations cochées pour le geste groupé. */
    readonly informationsChoisies = signal<string[]>([]);
    /** L'information survolée pendant un glissement de colonne : elle s'éclaire pour dire où l'on va lâcher. */
    readonly informationSurvolee = signal('');
    gesteAction: ActionGroupee = 'confidentialite';
    gesteValeur = '';
    readonly actionsGroupees = ACTIONS_GROUPEES;
    /** Vrai quand le panneau « ✨ Décrire depuis un fichier / modèle » est ouvert. */
    readonly propositionOuverte = signal(false);
    readonly nouveau = signal(false);
    readonly ongletActif = signal<OngletFiche>('attributs');
    readonly enCours = signal(false);
    readonly onglets: { cle: OngletFiche; libelle: string }[] = [
        { cle: 'attributs', libelle: 'Informations' },
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

    /** Source demandée dans l'adresse (?source=nom) : l'objet est initialisé depuis elle dès le chargement. */
    private readonly sourceDemandee = inject(ActivatedRoute).snapshot.queryParamMap.get('source') || '';
    /** Objet demandé dans l'adresse (?objet=identifiant) : sa fiche s'ouvre dès le chargement. */
    private readonly objetDemande = inject(ActivatedRoute).snapshot.queryParamMap.get('objet') || '';

    constructor() {
        void this.recharger().then(() => {
            const demande = this.objets().find(objet => objet.id === this.objetDemande);
            if (demande) this.selectionner(demande);
            if (!this.sourceDemandee || !this.sources().some(source => source.name === this.sourceDemandee)) return;
            this.sourceInitiale = this.sourceDemandee;
            this.initialiserDepuisSource();
        });
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

    /** L'objet proposé devient la fiche en cours d'édition : il ne sera enregistré qu'après relecture. */
    adopterProposition(objet: ObjetMetier): void {
        this.propositionOuverte.set(false);
        this.selectionId.set(objet.id);
        this.nouveau.set(true);
        this.edition.set(objet);
        this.ongletActif.set('attributs');
        this.notifications.info(`Objet « ${objet.name} » proposé avec ${objet.elements.length} information(s). Relisez, puis enregistrez.`);
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

    /** Le feu tricolore d'un objet : rouge sans responsable, vert bien documenté, orange entre les deux. */
    feu(objet: ObjetMetier): { couleur: string; titre: string } {
        return feuDeLObjet(objet, this.completude(objet).score);
    }
    /** Où en est la fiche d'une information, en pourcentage (une origine déclarée compte comme provenance). */
    complet(attribut: AttributObjetMetier): number {
        return completudeInformation(attribut, originesValides(this.objets(), attribut).length > 0).score;
    }
    /** D'où vient l'information, en clair : la colonne du fichier, et ce dont elle hérite. */
    provenance(attribut: AttributObjetMetier): string {
        return provenanceDe(this.objets(), attribut);
    }
    /** L'information dont la fiche est ouverte, si elle appartient toujours à l'objet affiché. */
    informationChoisie(objet: ObjetMetier): AttributObjetMetier | null {
        return objet.elements.find(candidat => candidat.id === this.informationOuverte()) || null;
    }
    ouvrirInformation(attribut: AttributObjetMetier): void {
        this.informationOuverte.update(courant => (courant === attribut.id ? '' : attribut.id));
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

    // ---- V11 : actions groupées sur plusieurs informations ----

    basculerGeste(objet: ObjetMetier): void {
        this.gesteOuvert.update(ouvert => !ouvert);
        // À l'ouverture, on part de ce qui manque le plus souvent : les informations sans définition.
        if (this.gesteOuvert()) this.choisir(objet, 'sansDefinition');
    }

    choisir(objet: ObjetMetier, choix: ChoixRapide): void {
        this.informationsChoisies.set(selonLeChoix(objet.elements || [], choix));
    }

    basculerChoix(identifiant: string): void {
        this.informationsChoisies.update(choisies =>
            choisies.includes(identifiant) ? choisies.filter(autre => autre !== identifiant) : [...choisies, identifiant]
        );
    }

    /** Ce que l'on attend comme valeur pour l'action choisie — affiché en repère dans le champ. */
    valeurAttendue(): string {
        return ACTIONS_GROUPEES.find(choix => choix.action === this.gesteAction)?.valeur || '';
    }

    appliquerGeste(objet: ObjetMetier): void {
        const refus = refusDuGeste(this.informationsChoisies(), this.gesteAction, this.gesteValeur);
        if (refus) return this.notifications.erreur(refus);
        const apres = objetApresGeste(objet, this.informationsChoisies(), this.gesteAction, this.gesteValeur);
        objet.elements = apres.objet.elements;
        this.notifications.info(`${apres.modifiees} information(s) modifiée(s) — enregistrez pour conserver.`);
    }

    // ---- V11 : glisser une colonne du fichier sur une information ----

    /** Les colonnes des sources de l'objet ; une méthode, car l'objet est modifié sur place dans la fiche. */
    colonnesOffertes(objet: ObjetMetier): ColonneOfferte[] {
        return colonnesDeLObjet(objet, this.sources());
    }

    commencerGlissement(evenement: DragEvent, offerte: ColonneOfferte): void {
        evenement.dataTransfer?.setData('text/plain', colonneTransportee(offerte.table, offerte.colonne));
    }

    /** Sans ce « préventif », le navigateur refuse le dépôt : c'est ainsi qu'on déclare une zone d'accueil. */
    survolerInformation(evenement: DragEvent, attribut: AttributObjetMetier): void {
        evenement.preventDefault();
        this.informationSurvolee.set(attribut.id);
    }

    lacherSurInformation(evenement: DragEvent, attribut: AttributObjetMetier): void {
        evenement.preventDefault();
        this.informationSurvolee.set('');
        const lachee = colonneLachee(evenement.dataTransfer?.getData('text/plain') || '');
        if (!lachee) return;
        const apres = informationAvecColonne(attribut, lachee.table, lachee.colonne);
        if (!apres.ajoutee) return this.notifications.info(`« ${lachee.colonne} » était déjà rattachée à « ${attribut.name} ».`);
        attribut.mappings = apres.information.mappings;
        this.notifications.info(`« ${lachee.colonne} » rattachée à « ${attribut.name} » — enregistrez pour conserver.`);
    }

    // ---- V11 : dupliquer et assistant en trois étapes ----

    /** Une copie repart en brouillon, sans historique, avec des informations aux identifiants neufs. */
    async dupliquer(objet: ObjetMetier): Promise<void> {
        const copie = copieDUnObjet(objet, genererIdentifiant);
        try {
            const { id, ...corps } = copie;
            await this.api.enregistrerObjetMetier(id, corps);
            await this.recharger();
            this.selectionner(this.objets().find(candidat => candidat.id === id) || copie);
            this.annulation.retenir(
                retourDUneEcriture(`l'objet métier « ${copie.name} »`, id, null, this.moyensDuRetour()),
                messageDeCopie(copie.name)
            );
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    /** L'objet monté par l'assistant est enregistré tel quel, puis ouvert pour être complété. */
    async adopterAssistant(objet: ObjetMetier): Promise<void> {
        this.assistantOuvert.set(false);
        this.edition.set(objet);
        this.nouveau.set(true);
        await this.enregistrer();
        this.selectionner(this.objets().find(candidat => candidat.id === objet.id) || objet);
    }

    /**
     * Ce qu'il faut pour défaire une écriture sur un objet métier : les mêmes appels que la saisie
     * ordinaire, et la relecture de l'écran.
     */
    private moyensDuRetour(): MoyensDuRetour<ObjetMetier> {
        return {
            ecrire: (id, contenu) => this.api.enregistrerObjetMetier(id, contenu),
            effacer: id => this.api.supprimerObjetMetier(id),
            relire: () => this.recharger()
        };
    }

    async enregistrer(): Promise<void> {
        const objet = this.edition();
        if (!objet) return;
        if (!objet.name.trim()) return this.notifications.erreur("Donnez un nom à l'objet métier.");
        this.enCours.set(true);
        // La version d'avant est prise avant l'appel : c'est elle que « ⟲ Annuler » réécrira.
        const avant = this.objets().find(candidat => candidat.id === objet.id) || null;
        try {
            const { id, ...corps } = objet;
            await this.api.enregistrerObjetMetier(id, corps);
            this.nouveau.set(false);
            await this.recharger();
            const quoi = `l'objet métier « ${objet.name} »`;
            this.annulation.retenir(retourDUneEcriture(quoi, id, avant, this.moyensDuRetour()), `Objet « ${objet.name} » enregistré.`);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    /** Suppression sûre : on nomme ce qui va disparaître, et le retour en arrière reste offert ensuite. */
    async supprimer(objet: ObjetMetier): Promise<void> {
        if (!confirm(questionAvantSuppression(`l'objet métier « ${objet.name} »`))) return;
        try {
            await this.api.supprimerObjetMetier(objet.id);
            this.edition.set(null);
            this.selectionId.set(null);
            await this.recharger();
            this.annulation.retenir(
                retourDUneSuppression(`l'objet métier « ${objet.name} »`, objet, this.moyensDuRetour()),
                `Objet « ${objet.name} » supprimé.`
            );
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
