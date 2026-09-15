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
    Personne,
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
import { UsagesObjetComponent } from './usages-objet.component';
import { FicheValidable, STATUTS_FICHE, changerLeStatut, depuisQuand, statutDe } from '../dictionnaire/validation-fiche';
import { BilanEchantillonnage, bilanNeuf, classerAvantEchantillonnage, phraseDuBilan, poserDesExemples } from './usages-objet';
import {
    CARDINALITES_VARIANTE,
    GroupeDInformations,
    OPERATEURS_PORTEE,
    OPTIONS_NOMBRE_DE_VALEURS,
    VarianteObjet,
    colonnesDuGroupe,
    ecrireSurLeGroupe,
    groupeRepetable,
    informationDeVarianteNeuve,
    libelleDuFiltre,
    libelleDuNombreDeValeurs,
    nombreDeValeurs,
    pourquoiCeNombreDeValeurs,
    renommerLeGroupe,
    repetitionsDuGroupe,
    replierLesRepetitions,
    resumeDeLaVariante,
    valeurDuGroupe,
    varianteNeuve
} from './variantes-objet';
import { ProposerCorrectionComponent } from '../../composants/proposer-correction.component';
import { PropositionObjetComponent } from './proposition-objet.component';

/**
 * Les six onglets de la fiche, dans l'ordre de la V13. « structure » réunit les informations du cœur et
 * les variantes : c'est le plan de travail de l'objet, et la V13 n'en fait qu'un.
 */
type OngletFiche = 'structure' | 'sources' | 'hierarchies' | 'maitrise' | 'usage' | 'audit';

/** Combien de valeurs on reprend du fichier pour illustrer une information : de quoi comprendre, pas plus. */
const EXEMPLES_PAR_INFORMATION = 4;

/** Ce que l'on est en train de saisir pour ajouter un filtre de portée à une variante. */
type FiltreEnCours = { col: string; op: string; val: string };
const FILTRE_VIDE = (): FiltreEnCours => ({ col: '', op: '=', val: '' });

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
        AssistantObjetComponent,
        UsagesObjetComponent
    ],
    template: `
        <!--
            Écran repris du classique : le balisage est celui de la V13, classe pour classe. « ecran-v13 »
            pose ce que le preflight de Tailwind apporte, sans toucher au reste de l'application.
        -->
        <div class="ecran-v13">
            <!-- La barre d'amorçage : une source n'INITIALISE qu'un objet, qui vit ensuite sa propre vie. -->
            @if (session.peutEditer()) {
                <div class="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 mb-4 flex flex-wrap items-end gap-3">
                    <div>
                        <label class="text-xs font-bold text-slate-500 block mb-1" for="sourceInitiale">
                            Initialiser un objet métier depuis une source
                        </label>
                        <select
                            id="sourceInitiale"
                            class="border border-slate-300 p-2 rounded text-sm bg-white"
                            [(ngModel)]="sourceInitiale"
                            name="sourceInitiale"
                        >
                            @for (source of sources(); track source.id) {
                                <option [value]="source.name">{{ source.name }}</option>
                            } @empty {
                                <option value="">Aucune table chargée</option>
                            }
                        </select>
                    </div>
                    <button
                        class="bg-emerald-600 text-white text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
                        type="button"
                        [disabled]="!sourceInitiale"
                        (click)="initialiserDepuisSource()"
                    >
                        <span>🏛️</span> Initialiser
                    </button>
                    <button
                        class="bg-white border border-emerald-300 text-emerald-700 text-sm font-bold px-4 py-2 rounded-lg"
                        type="button"
                        name="decrireDepuisFichier"
                        (click)="propositionOuverte.set(true)"
                    >
                        ✨ Décrire depuis un fichier / modèle
                    </button>
                    <button
                        class="bg-white border border-emerald-300 text-emerald-700 text-sm font-bold px-4 py-2 rounded-lg"
                        type="button"
                        name="assistantObjet"
                        (click)="assistantOuvert.set(true)"
                    >
                        🪄 Assistant en 3 étapes
                    </button>
                    <button
                        class="bg-white border border-emerald-300 text-emerald-700 text-sm font-bold px-4 py-2 rounded-lg"
                        type="button"
                        (click)="nouvelObjet()"
                    >
                        + Objet vierge
                    </button>
                    <p class="text-xs text-slate-500 w-full md:w-auto md:flex-1">
                        La source ne sert qu'à <strong>initialiser</strong> l'objet : les informations sont ensuite renommables et d'autres
                        sources peuvent être rattachées (👑 maître, ✍️ contributeur, 📥 destinataire).
                    </p>
                </div>
            }

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

            <!--
            V13 : la liste des objets prend une largeur fixe et la fiche tout le reste — le tableau des
            informations a besoin de place, la liste n'en a pas besoin. Sous 1536 px, la liste passe
            au-dessus de la fiche, en cartes alignées.
        -->
            <div class="flex flex-col 2xl:flex-row gap-4">
                <div id="listeDesObjets" class="flex flex-wrap gap-2 2xl:block 2xl:w-[230px] shrink-0">
                    <input
                        class="border border-slate-300 p-2 rounded text-sm bg-white w-full 2xl:mb-2"
                        placeholder="Filtrer…"
                        [(ngModel)]="filtre"
                        name="filtre"
                    />
                    @for (objet of objetsFiltres(); track objet.id) {
                        @let etat = etatDeLObjet(objet);
                        <button
                            type="button"
                            class="2xl:w-full min-w-[210px] text-left p-3 rounded-lg border 2xl:mb-2 transition-colors"
                            [class]="
                                objet.id === selectionId()
                                    ? '2xl:w-full min-w-[210px] text-left p-3 rounded-lg border 2xl:mb-2 transition-colors bg-emerald-50 border-emerald-300 shadow-sm'
                                    : '2xl:w-full min-w-[210px] text-left p-3 rounded-lg border 2xl:mb-2 transition-colors bg-white border-slate-200 hover:border-emerald-200'
                            "
                            (click)="selectionner(objet)"
                        >
                            <div class="flex items-center gap-1.5 mb-1">
                                <span>🏛️</span>
                                <span class="font-bold text-sm text-slate-800 truncate">{{ objet.name || '(sans nom)' }}</span>
                            </div>
                            <div class="flex items-center gap-1.5 flex-wrap">
                                <span class="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded" [class]="etat.classes">
                                    {{ etat.libelle }}
                                </span>
                                <span class="text-[10px] text-slate-400">
                                    {{ objet.sources.length }} source(s) · {{ objet.elements.length }} information(s)
                                </span>
                            </div>
                        </button>
                    } @empty {
                        <p class="text-sm text-slate-400 italic py-10 text-center w-full">
                            Aucun objet métier. Initialisez-en un depuis une source ci-dessus.
                        </p>
                    }
                </div>

                <!-- ---- fiche ---- -->
                @if (edition(); as objet) {
                    <div id="ficheDeLObjet" class="flex-1 min-w-0">
                        <!-- Carte d'identité de l'objet, telle que la V13 la dessine. -->
                        <div class="border-2 border-emerald-200 rounded-xl bg-white overflow-hidden">
                            <div class="bg-emerald-50/70 border-b border-emerald-100 p-4">
                                <div class="flex items-center gap-2 flex-wrap mb-3">
                                    <span class="text-xl" aria-hidden="true">🏛️</span>
                                    <input
                                        class="font-black text-lg border border-slate-300 px-2.5 py-1.5 rounded-lg w-72 bg-white"
                                        name="nom"
                                        aria-label="Nom de l'objet métier"
                                        [(ngModel)]="objet.name"
                                        [disabled]="!session.peutEditer()"
                                    />
                                    <span
                                        class="text-[10px] px-2 py-0.5 rounded font-bold"
                                        [class]="classesDuStatut(objet)"
                                        [title]="depuisQuandLeStatut(objet)"
                                    >
                                        {{ objet.status || 'Brouillon' }}
                                    </span>
                                    @if (session.peutEditer()) {
                                        <select
                                            class="border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white font-bold"
                                            name="statut"
                                            aria-label="Statut"
                                            [ngModel]="objet.status || 'Brouillon'"
                                            (ngModelChange)="changerLeStatutDeLObjet(objet, $event)"
                                        >
                                            @for (statut of statutsDeFiche; track statut) {
                                                <option [value]="statut">{{ statut }}</option>
                                            }
                                        </select>
                                    }
                                    <span
                                        class="ml-auto text-[10px] px-2 py-0.5 rounded font-bold"
                                        [class]="
                                            completude(objet).score >= 80
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-amber-100 text-amber-700'
                                        "
                                    >
                                        complétude {{ completude(objet).score }} %
                                    </span>
                                    @if (!nouveau()) {
                                        <a
                                            class="text-xs bg-white border border-indigo-300 text-indigo-700 px-3 py-1.5 rounded-lg font-bold"
                                            name="parcoursObjet"
                                            title="D'où vient la donnée de cet objet, et où elle va"
                                            [routerLink]="'/lineage'"
                                            [queryParams]="{ objet: objet.id }"
                                        >
                                            🔎 Parcours
                                        </a>
                                    }
                                    @if (session.peutEditer()) {
                                        <button
                                            class="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-bold shadow-sm disabled:opacity-50"
                                            type="button"
                                            [disabled]="enCours()"
                                            (click)="enregistrer()"
                                        >
                                            Enregistrer
                                        </button>
                                        @if (!nouveau()) {
                                            <button
                                                class="text-xs bg-white border border-slate-300 text-slate-600 px-3 py-1.5 rounded-lg font-bold"
                                                type="button"
                                                name="dupliquerObjet"
                                                (click)="dupliquer(objet)"
                                            >
                                                ⧉ Dupliquer
                                            </button>
                                            <button
                                                class="text-red-500 hover:text-red-700 px-2 py-1.5 rounded-lg border border-red-200 bg-white text-xs font-bold"
                                                type="button"
                                                name="supprimerObjet"
                                                title="Supprimer l'objet"
                                                (click)="supprimer(objet)"
                                            >
                                                🗑
                                            </button>
                                        }
                                    }
                                </div>
                                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div class="bo-fld">
                                        <label for="bo-proprietaire">Propriétaire global</label>
                                        <input
                                            id="bo-proprietaire"
                                            name="proprietaire"
                                            list="personnesConnues"
                                            placeholder="ex : Direction immobilière, ou une personne"
                                            [(ngModel)]="objet.globalOwner"
                                            [disabled]="!session.peutEditer()"
                                        />
                                        <datalist id="personnesConnues">
                                            @for (personne of personnes(); track personne.id) {
                                                <option [value]="personne.name"></option>
                                            }
                                        </datalist>
                                    </div>
                                    <div class="bo-fld">
                                        <label for="bo-domaine">
                                            Domaine métier <span class="font-normal text-slate-400">— qui valide</span>
                                        </label>
                                        <input
                                            id="bo-domaine"
                                            name="domaine"
                                            list="domaines"
                                            [(ngModel)]="objet.domain"
                                            [disabled]="!session.peutEditer()"
                                        />
                                        <datalist id="domaines">
                                            @for (domaine of domaines(); track domaine) {
                                                <option [value]="domaine"></option>
                                            }
                                        </datalist>
                                    </div>
                                    <div class="bo-fld">
                                        <label for="bo-definition">Définition</label>
                                        <textarea
                                            id="bo-definition"
                                            rows="2"
                                            name="definition"
                                            placeholder="Ce qu'est cet objet pour le métier, en une ou deux phrases."
                                            [(ngModel)]="objet.definition"
                                            [disabled]="!session.peutEditer()"
                                        ></textarea>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2 flex-wrap mt-2 text-[11px] text-slate-500">
                                    <span class="font-bold">Contributeurs :</span>
                                    <input
                                        class="border border-slate-200 rounded-lg px-2 py-1 text-[11px] bg-white w-72"
                                        name="contributeurs"
                                        placeholder="ex : DSI, BU Sud (virgules)"
                                        [ngModel]="objet.contributors.join(', ')"
                                        (ngModelChange)="definirContributeurs($event)"
                                        [disabled]="!session.peutEditer()"
                                    />
                                </div>
                                @if (completude(objet).aFaire.length) {
                                    <div class="text-[11px] text-slate-500 mt-2">À faire : {{ completude(objet).aFaire.join(' · ') }}</div>
                                }
                                <!-- V13 : contribuer sans risque — le responsable valide avant que rien ne change. -->
                                <app-proposer-correction
                                    [genre]="'bo'"
                                    [cible]="{ boId: objet.id }"
                                    [sujet]="objet.name"
                                    [valeurActuelle]="objet.definition"
                                    [domaine]="objet.domain || ''"
                                />
                            </div>

                            <!-- Les six onglets de la V13, avec leur compteur : une seule section à la fois. -->
                            <div class="border-b border-slate-200 px-4 flex gap-1 flex-wrap bg-slate-50/60">
                                @for (onglet of onglets; track onglet.cle) {
                                    @let compte = compteDeLOnglet(objet, onglet.cle);
                                    <button
                                        type="button"
                                        class="px-3 py-2.5 text-xs font-bold border-b-2 -mb-px transition-colors"
                                        [class]="
                                            ongletActif() === onglet.cle
                                                ? 'px-3 py-2.5 text-xs font-bold border-b-2 -mb-px transition-colors border-emerald-500 text-emerald-700'
                                                : 'px-3 py-2.5 text-xs font-bold border-b-2 -mb-px transition-colors border-transparent text-slate-400 hover:text-slate-600'
                                        "
                                        [attr.name]="'onglet-' + onglet.cle"
                                        (click)="ongletActif.set(onglet.cle)"
                                    >
                                        {{ onglet.libelle }}
                                        @if (compte) {
                                            <span
                                                class="ml-0.5 text-[10px] rounded-full px-1.5 py-0.5"
                                                [class]="
                                                    ongletActif() === onglet.cle
                                                        ? 'ml-0.5 text-[10px] rounded-full px-1.5 py-0.5 bg-emerald-100 text-emerald-700'
                                                        : 'ml-0.5 text-[10px] rounded-full px-1.5 py-0.5 bg-slate-100 text-slate-500'
                                                "
                                            >
                                                {{ compte }}
                                            </span>
                                        }
                                    </button>
                                }
                            </div>
                            <div class="p-4">
                                <!-- informations : la liste, et la fiche en trois questions de celle qu'on ouvre (V13) -->
                                @if (ongletActif() === 'structure') {
                                    @if (objet.elements.length) {
                                        <div class="entete-page" style="margin: 0 0 8px">
                                            <span class="discret espace">{{ objet.elements.length }} information(s)</span>
                                            <!-- V13 : adresse_1, adresse_2… ne sont pas trois informations mais une seule, à trois valeurs. -->
                                            @if (colonnesRepliables(objet) > 0) {
                                                <button
                                                    class="bouton petit"
                                                    type="button"
                                                    name="replierRepetitions"
                                                    [title]="
                                                        'Les colonnes numérotées (adresse_1, adresse_2…) sont vues comme une seule information ' +
                                                        'à plusieurs valeurs.'
                                                    "
                                                    (click)="repliActif.set(!repliActif())"
                                                >
                                                    {{ repliActif() ? '⇱ Déplier' : '⇲ Replier' }}
                                                    {{ colonnesRepliables(objet) }} colonne(s) répétée(s)
                                                </button>
                                            }
                                            @if (session.peutEditer()) {
                                                <!-- V13 : des exemples réels valent mieux qu'une description, et on peut les prendre tous d'un coup. -->
                                                <button
                                                    class="bouton petit"
                                                    type="button"
                                                    name="exemplesPourToutes"
                                                    title="Prendre, pour chaque information, les valeurs les plus fréquentes de sa colonne"
                                                    [disabled]="echantillonnage()"
                                                    (click)="exemplesPourToutes(objet)"
                                                >
                                                    {{ echantillonnage() ? '…' : '🎲' }} Exemples pour toutes
                                                </button>
                                                <button
                                                    class="bouton petit"
                                                    type="button"
                                                    name="actionsGroupees"
                                                    (click)="basculerGeste(objet)"
                                                >
                                                    ☑ Actions groupées
                                                </button>
                                            }
                                        </div>
                                    }
                                    <!-- V11 : poser le même geste sur plusieurs informations d'un coup -->
                                    @if (gesteOuvert()) {
                                        <div class="carte geste">
                                            <div class="entete-page" style="margin: 0 0 8px">
                                                <b class="espace"
                                                    >Actions groupées — {{ informationsChoisies().length }} information(s) choisie(s)</b
                                                >
                                                <button
                                                    class="bouton petit"
                                                    type="button"
                                                    name="choixTout"
                                                    (click)="choisir(objet, 'tout')"
                                                >
                                                    Tout
                                                </button>
                                                <button
                                                    class="bouton petit"
                                                    type="button"
                                                    name="choixAucun"
                                                    (click)="choisir(objet, 'aucun')"
                                                >
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
                                                <button
                                                    class="bouton petit"
                                                    type="button"
                                                    name="fermerGeste"
                                                    (click)="gesteOuvert.set(false)"
                                                >
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
                                                <button
                                                    class="bouton principal"
                                                    type="button"
                                                    name="appliquerGeste"
                                                    (click)="appliquerGeste(objet)"
                                                >
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
                                                    <th title="Combien de valeurs pour une occurrence de l'objet">Nb valeurs</th>
                                                    <th title="Terme technique : mapping">D'où ça vient</th>
                                                    <th>Fiche</th>
                                                    <th></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <!-- Une ligne par information — ou, repli actif, une ligne par groupe de colonnes répétées. -->
                                                <!-- Suivi par identifiant, jamais par nom : deux informations peuvent porter le même. -->
                                                @for (
                                                    groupe of groupesAffiches(objet);
                                                    track groupe.informations[0].id;
                                                    let index = $index
                                                ) {
                                                    @let attribut = groupe.informations[0];
                                                    @let valeurs = valeursDuGroupe(groupe);
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
                                                                    [checked]="groupeChoisi(groupe)"
                                                                    [attr.name]="'geste-' + index"
                                                                    (change)="basculerChoixDuGroupe(groupe)"
                                                                />
                                                            </td>
                                                        }
                                                        <td>
                                                            <!--
                                                    La saisie n'est reprise qu'une fois quittée : sur un groupe replié, chaque
                                                    frappe renommerait les colonnes et déferait le groupe sous les doigts.
                                                -->
                                                            <input
                                                                class="champ"
                                                                [value]="groupe.base"
                                                                [attr.name]="'attribut-nom-' + index"
                                                                [disabled]="!session.peutEditer()"
                                                                (change)="renommerLeGroupe(groupe, $any($event.target).value)"
                                                            />
                                                            @if (groupe.replie) {
                                                                <span class="badge" [title]="colonnesDuGroupe(groupe).join(', ')">
                                                                    ⇲ {{ groupe.informations.length }} colonnes
                                                                </span>
                                                            }
                                                        </td>
                                                        <td>
                                                            <input
                                                                class="champ"
                                                                [value]="valeurDuGroupe(groupe, 'definition')"
                                                                [attr.name]="'attribut-definition-' + index"
                                                                [disabled]="!session.peutEditer()"
                                                                (change)="
                                                                    ecrireSurLeGroupe(groupe, 'definition', $any($event.target).value)
                                                                "
                                                            />
                                                            @if (!session.peutEditer()) {
                                                                <button class="bouton petit" (click)="proposerDefinition(objet, attribut)">
                                                                    Proposer une définition
                                                                </button>
                                                            }
                                                        </td>
                                                        <td style="white-space: nowrap">
                                                            <span
                                                                class="badge"
                                                                [class.alerte]="valeurs.plusieurs"
                                                                [title]="valeurs.pourquoi"
                                                            >
                                                                {{ valeurs.libelle }}
                                                            </span>
                                                            @if (valeurs.deduit) {
                                                                <span
                                                                    class="discret"
                                                                    title="Déduit des colonnes numérotées — déclarez-le pour l'affirmer"
                                                                >
                                                                    déduit
                                                                </span>
                                                            }
                                                            @if (session.peutEditer()) {
                                                                <select
                                                                    class="champ"
                                                                    [value]="valeurDuGroupe(groupe, 'multi')"
                                                                    [attr.name]="'attribut-valeurs-' + index"
                                                                    title="Combien de valeurs cette information peut prendre pour une occurrence de l'objet"
                                                                    (change)="ecrireSurLeGroupe(groupe, 'multi', $any($event.target).value)"
                                                                >
                                                                    @for (choix of optionsNombreDeValeurs; track choix.valeur) {
                                                                        <option [value]="choix.valeur">{{ choix.libelle }}</option>
                                                                    }
                                                                </select>
                                                            }
                                                        </td>
                                                        <td class="discret">{{ provenanceDuGroupe(groupe) || '—' }}</td>
                                                        <td style="white-space: nowrap">
                                                            <span class="badge" [class.succes]="complet(attribut) === 100">
                                                                {{ complet(attribut) }} %
                                                            </span>
                                                            <button
                                                                class="bouton petit"
                                                                type="button"
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
                                                                <button
                                                                    class="bouton petit danger"
                                                                    (click)="supprimerLeGroupe(objet, groupe)"
                                                                >
                                                                    ✕
                                                                </button>
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
                                        <button class="bouton petit" style="margin-top: 8px" (click)="ajouterAttribut(objet)">
                                            + Information
                                        </button>
                                    }
                                }

                                <!--
                        Variantes (« facettes » en langage technique) : une même table porte souvent plusieurs
                        choses. Un fichier d'adresses contient l'adresse principale, celles de livraison,
                        celles d'intervention. Chacune est une vue filtrée de la table, avec son nom métier.
                    -->
                                @if (ongletActif() === 'structure') {
                                    <p class="discret" style="margin-top: 0">
                                        Une variante est une vue filtrée d'une table : elle porte un nom métier, dit combien de fois elle se
                                        répète pour un objet, ce qu'elle garde de la table, et quand elle s'applique.
                                    </p>
                                    @for (variante of variantes(objet); track variante.id; let rang = $index) {
                                        <div class="carte variante">
                                            <div class="entete-page" style="margin: 0 0 6px">
                                                <input
                                                    class="champ espace"
                                                    [(ngModel)]="variante.name"
                                                    [name]="'variante-nom-' + rang"
                                                    [attr.name]="'variante-nom-' + rang"
                                                    placeholder="Nom métier de la variante"
                                                    [disabled]="!session.peutEditer()"
                                                />
                                                <select
                                                    class="champ"
                                                    style="width: auto"
                                                    [ngModel]="variante.table"
                                                    [name]="'variante-table-' + rang"
                                                    [attr.name]="'variante-table-' + rang"
                                                    [disabled]="!session.peutEditer()"
                                                    (ngModelChange)="changerLaTableDeLaVariante(objet, variante, $event)"
                                                >
                                                    @for (source of sources(); track source.id) {
                                                        <option [value]="source.name">{{ source.name }}</option>
                                                    }
                                                </select>
                                                <select
                                                    class="champ"
                                                    style="width: auto"
                                                    [(ngModel)]="variante.cardinality"
                                                    [name]="'variante-cardinalite-' + rang"
                                                    [attr.name]="'variante-cardinalite-' + rang"
                                                    title="Combien d'occurrences de cette variante pour un objet"
                                                    [disabled]="!session.peutEditer()"
                                                >
                                                    @for (cardinalite of cardinalitesVariante; track cardinalite) {
                                                        <option [value]="cardinalite">{{ cardinalite }}</option>
                                                    }
                                                </select>
                                                <span
                                                    class="badge"
                                                    [class.alerte]="groupeRepetable(variante)"
                                                    [title]="
                                                        groupeRepetable(variante)
                                                            ? 'Plusieurs occurrences de ce groupe par objet.'
                                                            : 'Une seule occurrence de ce groupe par objet.'
                                                    "
                                                >
                                                    {{ groupeRepetable(variante) ? 'groupe répétable' : 'groupe unique' }}
                                                </span>
                                                @if (session.peutEditer()) {
                                                    <button
                                                        class="bouton petit danger"
                                                        type="button"
                                                        [attr.name]="'supprimerVariante-' + rang"
                                                        (click)="supprimerVariante(objet, variante)"
                                                    >
                                                        ✕
                                                    </button>
                                                }
                                            </div>
                                            <div class="discret" style="margin-bottom: 8px">{{ resumeDeLaVariante(variante) }}</div>

                                            <div class="formulaire-ligne">
                                                <div>
                                                    <label class="etiquette" title="Ce que la variante garde de sa table"
                                                        >Ce qu'elle garde</label
                                                    >
                                                    @for (filtre of variante.scope || []; track $index; let position = $index) {
                                                        <span class="puce">
                                                            {{ libelleDuFiltre(filtre) }}
                                                            @if (session.peutEditer()) {
                                                                <a (click)="retirerFiltre(variante, 'scope', position)">✕</a>
                                                            }
                                                        </span>
                                                    } @empty {
                                                        <span class="discret">Toute la table.</span>
                                                    }
                                                    @if (session.peutEditer()) {
                                                        <div class="ligne-champs" style="margin-top: 6px">
                                                            <select
                                                                class="champ"
                                                                [(ngModel)]="saisieDePortee(variante).col"
                                                                [name]="'portee-col-' + rang"
                                                                [attr.name]="'portee-col-' + rang"
                                                            >
                                                                <option value="">— colonne —</option>
                                                                @for (colonne of colonnesDeLaVariante(variante); track colonne) {
                                                                    <option [value]="colonne">{{ colonne }}</option>
                                                                }
                                                            </select>
                                                            <select
                                                                class="champ"
                                                                [(ngModel)]="saisieDePortee(variante).op"
                                                                [name]="'portee-op-' + rang"
                                                                [attr.name]="'portee-op-' + rang"
                                                            >
                                                                @for (operateur of operateursPortee; track operateur.cle) {
                                                                    <option [value]="operateur.cle">{{ operateur.libelle }}</option>
                                                                }
                                                            </select>
                                                            @if (!sansValeur(saisieDePortee(variante).op)) {
                                                                <input
                                                                    class="champ"
                                                                    [(ngModel)]="saisieDePortee(variante).val"
                                                                    [name]="'portee-val-' + rang"
                                                                    [attr.name]="'portee-val-' + rang"
                                                                    placeholder="valeur"
                                                                />
                                                            }
                                                            <button
                                                                class="bouton petit"
                                                                type="button"
                                                                [attr.name]="'ajouterPortee-' + rang"
                                                                (click)="ajouterFiltre(variante, 'scope')"
                                                            >
                                                                + Filtre
                                                            </button>
                                                        </div>
                                                    }
                                                </div>
                                                <div>
                                                    <label
                                                        class="etiquette"
                                                        title="Conditions, sur l'objet lui-même, pour que la variante s'applique"
                                                    >
                                                        Quand elle s'applique
                                                    </label>
                                                    @for (filtre of variante.applies || []; track $index; let position = $index) {
                                                        <span class="puce">
                                                            {{ libelleDuFiltre(filtre) }}
                                                            @if (session.peutEditer()) {
                                                                <a (click)="retirerFiltre(variante, 'applies', position)">✕</a>
                                                            }
                                                        </span>
                                                    } @empty {
                                                        <span class="discret">Toujours.</span>
                                                    }
                                                    @if (session.peutEditer()) {
                                                        <div class="ligne-champs" style="margin-top: 6px">
                                                            <select
                                                                class="champ"
                                                                [(ngModel)]="saisieDApplication(variante).col"
                                                                [name]="'applique-col-' + rang"
                                                                [attr.name]="'applique-col-' + rang"
                                                            >
                                                                <option value="">— colonne de l'objet —</option>
                                                                @for (colonne of colonnesDuCoeur(objet); track colonne) {
                                                                    <option [value]="colonne">{{ colonne }}</option>
                                                                }
                                                            </select>
                                                            <select
                                                                class="champ"
                                                                [(ngModel)]="saisieDApplication(variante).op"
                                                                [name]="'applique-op-' + rang"
                                                                [attr.name]="'applique-op-' + rang"
                                                            >
                                                                @for (operateur of operateursPortee; track operateur.cle) {
                                                                    <option [value]="operateur.cle">{{ operateur.libelle }}</option>
                                                                }
                                                            </select>
                                                            @if (!sansValeur(saisieDApplication(variante).op)) {
                                                                <input
                                                                    class="champ"
                                                                    [(ngModel)]="saisieDApplication(variante).val"
                                                                    [name]="'applique-val-' + rang"
                                                                    [attr.name]="'applique-val-' + rang"
                                                                    placeholder="valeur"
                                                                />
                                                            }
                                                            <button
                                                                class="bouton petit"
                                                                type="button"
                                                                [attr.name]="'ajouterApplique-' + rang"
                                                                (click)="ajouterFiltre(variante, 'applies')"
                                                            >
                                                                + Condition
                                                            </button>
                                                        </div>
                                                    }
                                                </div>
                                            </div>

                                            <div class="defilement-x" style="margin-top: 10px">
                                                <table class="tableau">
                                                    <thead>
                                                        <tr>
                                                            <th>Information</th>
                                                            <th>Colonne</th>
                                                            <th>Propriétaire</th>
                                                            <th></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        @for (
                                                            information of variante.elements || [];
                                                            track information.id;
                                                            let ligne = $index
                                                        ) {
                                                            <tr>
                                                                <td>
                                                                    <input
                                                                        class="champ"
                                                                        [(ngModel)]="information.name"
                                                                        [name]="'vinfo-nom-' + rang + '-' + ligne"
                                                                        [attr.name]="'vinfo-nom-' + rang + '-' + ligne"
                                                                        [disabled]="!session.peutEditer()"
                                                                    />
                                                                </td>
                                                                <td>
                                                                    <select
                                                                        class="champ"
                                                                        [ngModel]="information.col"
                                                                        [name]="'vinfo-col-' + rang + '-' + ligne"
                                                                        [attr.name]="'vinfo-col-' + rang + '-' + ligne"
                                                                        [disabled]="!session.peutEditer()"
                                                                        (ngModelChange)="changerLaColonne(variante, information, $event)"
                                                                    >
                                                                        <option value="">—</option>
                                                                        @for (colonne of colonnesDeLaVariante(variante); track colonne) {
                                                                            <option [value]="colonne">{{ colonne }}</option>
                                                                        }
                                                                    </select>
                                                                </td>
                                                                <td>
                                                                    <input
                                                                        class="champ"
                                                                        [(ngModel)]="information.owner"
                                                                        [name]="'vinfo-proprietaire-' + rang + '-' + ligne"
                                                                        [attr.name]="'vinfo-proprietaire-' + rang + '-' + ligne"
                                                                        [disabled]="!session.peutEditer()"
                                                                    />
                                                                </td>
                                                                <td>
                                                                    @if (session.peutEditer()) {
                                                                        <button
                                                                            class="bouton petit danger"
                                                                            type="button"
                                                                            (click)="
                                                                                supprimerInformationDeVariante(variante, information.id)
                                                                            "
                                                                        >
                                                                            ✕
                                                                        </button>
                                                                    }
                                                                </td>
                                                            </tr>
                                                        } @empty {
                                                            <tr>
                                                                <td colspan="4" class="discret">Aucune information dans cette variante.</td>
                                                            </tr>
                                                        }
                                                    </tbody>
                                                </table>
                                            </div>
                                            @if (session.peutEditer()) {
                                                <button
                                                    class="bouton petit"
                                                    type="button"
                                                    style="margin-top: 8px"
                                                    [attr.name]="'ajouterInfoVariante-' + rang"
                                                    (click)="ajouterInformationDeVariante(variante)"
                                                >
                                                    + Information
                                                </button>
                                            }
                                        </div>
                                    } @empty {
                                        <div class="vide">
                                            Aucune variante. Une seule table peut pourtant porter plusieurs choses : ajoutez-en une
                                            ci-dessous.
                                        </div>
                                    }

                                    @if (session.peutEditer()) {
                                        <div class="ligne-champs" style="margin-top: 10px">
                                            <select class="champ" [(ngModel)]="varianteTable" name="varianteTable">
                                                <option value="">— table dont la variante est une vue —</option>
                                                @for (source of sources(); track source.id) {
                                                    <option [value]="source.name">{{ source.name }}</option>
                                                }
                                            </select>
                                            <input
                                                class="champ"
                                                [(ngModel)]="varianteNom"
                                                name="varianteNom"
                                                placeholder="Nom métier de la variante"
                                            />
                                            <select class="champ" [(ngModel)]="varianteCardinalite" name="varianteCardinalite">
                                                @for (cardinalite of cardinalitesVariante; track cardinalite) {
                                                    <option [value]="cardinalite">{{ cardinalite }}</option>
                                                }
                                            </select>
                                            <button
                                                class="bouton principal"
                                                type="button"
                                                name="ajouterVariante"
                                                [disabled]="!varianteTable"
                                                (click)="ajouterVariante(objet)"
                                            >
                                                + Variante
                                            </button>
                                        </div>
                                    }
                                }

                                <!-- V13 : qui se sert de quelle information — par application, ou en matrice complète -->
                                @if (ongletActif() === 'usage') {
                                    <app-usages-objet [objet]="objet" [actifs]="actifs()" [modifiable]="session.peutEditer()" />
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
                                                            <button class="bouton petit danger" (click)="objet.sources.splice(index, 1)">
                                                                ✕
                                                            </button>
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
                                @if (ongletActif() === 'sources') {
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

                                <!-- audit : l'historique des décisions, en attendant l'audit global de la V13 -->
                                @if (ongletActif() === 'audit') {
                                    <h4 class="text-[10px] uppercase font-bold text-slate-400 mb-1.5">Historique des décisions</h4>
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
                        </div>
                    </div>
                } @else {
                    <p class="flex-1 text-sm text-slate-400 italic py-10 text-center">Choisissez un objet métier, ou créez-en un.</p>
                }
            </div>
        </div>
    `,
    styles: `
        /* Les champs de la carte d'identité, repris tels quels du classique (.bo-fld). */
        .bo-fld label {
            display: block;
            font-size: 10.5px;
            font-weight: 700;
            color: #475569;
            margin-bottom: 3px;
        }
        .bo-fld input[type='text'],
        .bo-fld input:not([type]),
        .bo-fld select,
        .bo-fld textarea {
            width: 100%;
            font-size: 12.5px;
            padding: 7px 9px;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            background: #fff;
            min-height: 34px;
        }
        .bo-fld textarea {
            min-height: 64px;
            resize: vertical;
            line-height: 1.4;
        }
        .bo-fld .hint {
            font-size: 10.5px;
            color: #64748b;
            margin-top: 3px;
        }

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
        /* V13 : une variante est un bloc à part entière, posé en retrait du reste de la fiche. */
        .carte.variante {
            margin-bottom: 12px;
            background: var(--surface-2);
        }
        /* Le nombre de variantes, posé dans l'onglet : on sait avant d'y aller s'il y a quelque chose. */
        .onglets .compte {
            display: inline-block;
            margin-left: 5px;
            min-width: 15px;
            padding: 0 4px;
            border-radius: 7px;
            background: var(--accent-2);
            color: var(--accent);
            font-size: 10.5px;
            font-weight: 700;
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
        /* Sélecteur segmenté, comme dans la V13 : un fond teinté, et l'onglet actif en pastille posée. */
        .onglets {
            display: inline-flex;
            gap: 2px;
            margin-bottom: 14px;
            flex-wrap: wrap;
            background: color-mix(in srgb, var(--texte) 5%, transparent);
            border-radius: 9px;
            padding: 2px;
        }
        .onglets button {
            border: 0;
            background: none;
            padding: 6px 12px;
            border-radius: 7px;
            font: inherit;
            font-size: 12px;
            font-weight: 530;
            color: var(--texte-2);
            cursor: pointer;
            transition:
                background-color 0.16s var(--souple),
                color 0.16s var(--souple);
        }
        .onglets button.actif {
            background: var(--surface);
            color: var(--texte);
            box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
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
    /** Les personnes déclarées : ce sont elles que l'on propose comme propriétaire d'un objet. */
    readonly personnes = signal<Personne[]>([]);
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
    readonly ongletActif = signal<OngletFiche>('structure');
    readonly enCours = signal(false);
    readonly onglets: { cle: OngletFiche; libelle: string }[] = [
        { cle: 'structure', libelle: '🧩 Attributs & composition' },
        { cle: 'sources', libelle: '🔗 Sources' },
        { cle: 'hierarchies', libelle: '🌳 Hiérarchies' },
        { cle: 'maitrise', libelle: '⚖️ Maîtrise' },
        { cle: 'usage', libelle: '🔌 Applis & usages' },
        { cle: 'audit', libelle: '🔎 Audit' }
    ];
    readonly statutsDeFiche = STATUTS_FICHE;
    /** Vrai quand les colonnes numérotées sont vues comme une seule information (comme la V13, par défaut). */
    readonly repliActif = signal(true);
    /** Vrai pendant que l'on va chercher des exemples dans les fichiers : le bouton ne se relance pas. */
    readonly echantillonnage = signal(false);
    readonly cardinalitesVariante = CARDINALITES_VARIANTE;
    readonly optionsNombreDeValeurs = OPTIONS_NOMBRE_DE_VALEURS;
    readonly operateursPortee = Object.entries(OPERATEURS_PORTEE).map(([cle, libelle]) => ({ cle, libelle }));
    readonly libelleDuFiltre = libelleDuFiltre;
    readonly resumeDeLaVariante = resumeDeLaVariante;
    readonly groupeRepetable = groupeRepetable;
    readonly valeurDuGroupe = valeurDuGroupe;
    readonly colonnesDuGroupe = colonnesDuGroupe;
    /** La variante que l'on est en train de créer : sa table, son nom métier, sa cardinalité. */
    varianteTable = '';
    varianteNom = '';
    varianteCardinalite = '1–N';
    /** Les filtres en cours de saisie, une par variante : ce qu'elle garde, et quand elle s'applique. */
    porteeEnCours: Record<string, FiltreEnCours> = {};
    applicationEnCours: Record<string, FiltreEnCours> = {};
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
            const [objets, sources, actifs, termes, domaines, personnes, vocabulaire] = await Promise.all([
                this.api.objetsMetier(),
                this.api.sources(),
                this.api.actifs(),
                this.api.glossaire(),
                this.api.domaines(),
                this.api.personnes(),
                this.vocabulaire() ?? this.api.vocabulaireGouvernance()
            ]);
            this.objets.set(objets.map(objet => ({ ...OBJET_VIDE(), ...objet })));
            this.sources.set(sources);
            this.actifs.set(actifs);
            this.termes.set(termes);
            this.domaines.set(domaines);
            this.personnes.set(personnes);
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
        this.ongletActif.set('structure');
        this.notifications.info(`Objet « ${objet.name} » proposé avec ${objet.elements.length} information(s). Relisez, puis enregistrez.`);
    }

    nouvelObjet(): void {
        const objet = OBJET_VIDE();
        this.selectionId.set(objet.id);
        this.nouveau.set(true);
        this.edition.set(objet);
        this.ongletActif.set('structure');
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

    /**
     * L'état d'un objet, tel que la V13 le résume d'un badge dans la liste : sans propriétaire d'abord,
     * puis sans source maître, puis la maîtrise contextuelle, et sinon tout va bien.
     */
    etatDeLObjet(objet: ObjetMetier): { libelle: string; classes: string } {
        if (!objet.globalOwner) return { libelle: 'sans propriétaire', classes: 'bg-red-100 text-red-600' };
        const maitres = objet.sources.filter(source => source.role === 'maitre');
        const regles = ((objet['contextRules'] as { rules?: unknown[] })?.rules || []).length > 0;
        if (objet.sources.length && !maitres.length && !regles) return { libelle: 'sans maître', classes: 'bg-amber-100 text-amber-700' };
        if (regles) return { libelle: 'maîtrise contextuelle', classes: 'bg-blue-100 text-blue-700' };
        return { libelle: 'ok', classes: 'bg-emerald-100 text-emerald-700' };
    }

    /** Le badge du statut de la fiche, teinté selon ce qu'il annonce — comme dans le dictionnaire. */
    classesDuStatut(objet: ObjetMetier): string {
        const statut = statutDe(objet as FicheValidable);
        if (statut === 'Validé') return 'bg-emerald-100 text-emerald-700';
        if (statut === 'Proposé') return 'bg-amber-100 text-amber-700';
        if (statut === 'Obsolète') return 'bg-slate-200 text-slate-500 line-through';
        return 'bg-slate-100 text-slate-500';
    }

    depuisQuandLeStatut(objet: ObjetMetier): string {
        return depuisQuand(objet as FicheValidable, formaterDate);
    }

    /**
     * Changer le statut d'un objet le date, l'attribue et l'historise — le même cycle que pour une fiche
     * du dictionnaire. Valider demande un commentaire, facultatif : c'est le « pourquoi » qu'on relira.
     */
    changerLeStatutDeLObjet(objet: ObjetMetier, nouveau: string): void {
        const commentaire = nouveau === 'Validé' ? (prompt('Commentaire de validation (facultatif) :') ?? '') : '';
        const qui = this.session.utilisateur()?.nomAffiche || this.session.utilisateur()?.identifiant || '';
        changerLeStatut(objet as FicheValidable, nouveau, qui, commentaire);
    }

    /**
     * Le compteur posé sur un onglet. Celui des usages compte ce qui manque — les informations dont
     * personne ne dit se servir — et non ce qui est fait : c'est ce qui reste à faire qui doit sauter aux yeux.
     */
    compteDeLOnglet(objet: ObjetMetier, onglet: OngletFiche): number {
        if (onglet === 'structure') return (objet.structure || []).length + (objet.elements || []).length;
        if (onglet === 'sources') return objet.sources.length;
        if (onglet === 'hierarchies') return ((objet['hierarchies'] as unknown[]) || []).length;
        if (onglet === 'maitrise') return ((objet['contextRules'] as { rules?: unknown[] })?.rules || []).length;
        if (onglet === 'usage')
            return this.actifs().length ? (objet.elements || []).filter(information => !(information.usedBy || []).length).length : 0;
        return 0;
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

    // ---- V13 : colonnes répétées repliées, et nombre de valeurs d'une information ----

    /**
     * Les lignes du tableau des informations. Repli actif, adresse_1 / adresse_2 / adresse_3 deviennent une
     * seule ligne « adresse » à trois valeurs ; repli inactif, chaque colonne garde sa ligne.
     */
    groupesAffiches(objet: ObjetMetier): GroupeDInformations[] {
        const informations = objet.elements || [];
        if (this.repliActif()) return replierLesRepetitions(informations);
        return informations.map(information => ({ base: information.name, replie: false, informations: [information], rangs: [] }));
    }

    /** Combien de lignes le repli ferait gagner : sans gain, le bouton n'a pas lieu d'être montré. */
    colonnesRepliables(objet: ObjetMetier): number {
        const informations = objet.elements || [];
        return informations.length - replierLesRepetitions(informations).length;
    }

    /** Le nombre de valeurs d'un groupe : ce qui est déclaré sur l'information, sinon ce que disent les colonnes. */
    valeursDuGroupe(groupe: GroupeDInformations): { plusieurs: boolean; libelle: string; deduit: boolean; pourquoi: string } {
        const compte = nombreDeValeurs(valeurDuGroupe(groupe, 'multi'), repetitionsDuGroupe(groupe));
        return {
            plusieurs: compte.plusieurs,
            libelle: libelleDuNombreDeValeurs(compte),
            deduit: compte.origine === 'déduit',
            pourquoi: pourquoiCeNombreDeValeurs(compte, colonnesDuGroupe(groupe))
        };
    }

    /** Renommer une ligne : sur un groupe replié, chaque colonne garde son numéro (courriel_1, courriel_2). */
    renommerLeGroupe(groupe: GroupeDInformations, nom: string): void {
        renommerLeGroupe(groupe, nom);
    }

    /** Écrire un champ sur la ligne : sur un groupe replié, la saisie vaut pour toutes ses colonnes. */
    ecrireSurLeGroupe(groupe: GroupeDInformations, champ: string, valeur: string): void {
        ecrireSurLeGroupe(groupe, champ, valeur);
    }

    /** Supprimer une ligne, c'est supprimer toutes les colonnes qu'elle recouvre. */
    supprimerLeGroupe(objet: ObjetMetier, groupe: GroupeDInformations): void {
        const aRetirer = new Set(groupe.informations.map(information => information.id));
        objet.elements = objet.elements.filter(information => !aRetirer.has(information.id));
    }

    /** Cocher une ligne repliée coche toutes ses colonnes : le geste groupé porte sur ce que l'on voit. */
    basculerChoixDuGroupe(groupe: GroupeDInformations): void {
        const identifiants = groupe.informations.map(information => information.id);
        const dejaChoisi = this.informationsChoisies().includes(identifiants[0]);
        this.informationsChoisies.update(choisies =>
            dejaChoisi ? choisies.filter(autre => !identifiants.includes(autre)) : [...choisies, ...identifiants]
        );
    }

    groupeChoisi(groupe: GroupeDInformations): boolean {
        return this.informationsChoisies().includes(groupe.informations[0].id);
    }

    /** D'où vient la ligne : les colonnes repliées, ou la provenance ordinaire de l'information. */
    provenanceDuGroupe(groupe: GroupeDInformations): string {
        if (groupe.replie) return colonnesDuGroupe(groupe).join(', ');
        return this.provenance(groupe.informations[0]);
    }

    // ---- V13 : des exemples pris dans les données, pour toutes les informations d'un coup ----

    /**
     * Va chercher, pour chaque information rattachée à une colonne, les valeurs les plus fréquentes du
     * fichier. On ne remplace jamais des exemples écrits à la main — ce serait détruire du travail — et on
     * rend compte de tout : ce qui a été complété, ce qui a été laissé, et ce qui n'a rien donné.
     */
    async exemplesPourToutes(objet: ObjetMetier): Promise<void> {
        this.echantillonnage.set(true);
        const bilan: BilanEchantillonnage = bilanNeuf();
        try {
            for (const information of objet.elements || []) {
                if (!classerAvantEchantillonnage(information, bilan)) continue;
                const colonne = information.mappings[0];
                const source = this.sources().find(candidat => candidat.name === colonne.table);
                if (!source) {
                    bilan.sansColonne++;
                    continue;
                }
                const valeurs = await this.valeursDUneColonne(String(source.id), colonne.col);
                if (!valeurs.length) {
                    bilan.sansValeur++;
                    continue;
                }
                poserDesExemples(information, valeurs);
                bilan.completees++;
            }
            this.notifications.info(`${phraseDuBilan(bilan)} Enregistrez pour conserver.`);
        } finally {
            this.echantillonnage.set(false);
        }
    }

    /** Les valeurs les plus fréquentes d'une colonne ; un fichier illisible ne fait pas échouer le reste. */
    private async valeursDUneColonne(sourceId: string, colonne: string): Promise<string[]> {
        try {
            const valeurs = await this.api.valeursColonne(sourceId, colonne);
            return valeurs.slice(0, EXEMPLES_PAR_INFORMATION).map(suggestion => suggestion.valeur);
        } catch {
            return [];
        }
    }

    // ---- V13 : les variantes (« facettes ») d'un objet ----

    /** Les variantes de l'objet, toujours sous forme de liste : la fiche les modifie sur place. */
    variantes(objet: ObjetMetier): VarianteObjet[] {
        if (!Array.isArray(objet.structure)) objet.structure = [];
        return objet.structure;
    }

    /** Les colonnes de la table dont une variante est la vue : ce dans quoi ses filtres puisent. */
    colonnesDeLaVariante(variante: VarianteObjet): string[] {
        return this.colonnesDe(variante.table);
    }

    /** Les colonnes de la table maître de l'objet : c'est sur elles que porte l'applicabilité d'une variante. */
    colonnesDuCoeur(objet: ObjetMetier): string[] {
        const maitre = objet.sources.find(source => source.role === 'maitre') || objet.sources[0];
        return this.colonnesDe(maitre?.table);
    }

    /** Ajoute une variante : une vue de la table choisie, une information par colonne, rien de filtré. */
    ajouterVariante(objet: ObjetMetier): void {
        if (!this.varianteTable) return;
        const variante = varianteNeuve(
            this.varianteTable,
            this.varianteNom,
            this.colonnesDe(this.varianteTable),
            genererIdentifiant,
            this.varianteCardinalite
        );
        this.variantes(objet).push(variante);
        // La table devient une source de l'objet : sans cela, la variante n'apparaîtrait dans aucun parcours.
        if (!objet.sources.some(source => source.table === variante.table))
            objet.sources.push({ table: variante.table, role: 'contributeur' });
        this.varianteNom = '';
        this.varianteTable = '';
        this.notifications.info(`Variante « ${variante.name} » ajoutée (vue de ${variante.table}) — enregistrez pour conserver.`);
    }

    /** Retire une variante, et avec elle la source qu'aucune autre variante n'utilise plus. */
    supprimerVariante(objet: ObjetMetier, variante: VarianteObjet): void {
        objet.structure = this.variantes(objet).filter(autre => autre.id !== variante.id);
        if (!objet.structure.some(autre => autre.table === variante.table))
            objet.sources = objet.sources.filter(source => !(source.table === variante.table && source.role !== 'maitre'));
    }

    /** Changer la table d'une variante remet ses informations à plat sur les colonnes de la nouvelle table. */
    changerLaTableDeLaVariante(objet: ObjetMetier, variante: VarianteObjet, table: string): void {
        variante.table = table;
        variante.scope = [];
        variante.elements = varianteNeuve(table, variante.name, this.colonnesDe(table), genererIdentifiant).elements;
        if (!objet.sources.some(source => source.table === table)) objet.sources.push({ table, role: 'contributeur' });
    }

    /** Le filtre en cours de saisie pour une variante : créé à la demande, une entrée par variante. */
    saisieDePortee(variante: VarianteObjet): FiltreEnCours {
        return (this.porteeEnCours[variante.id] ||= FILTRE_VIDE());
    }
    saisieDApplication(variante: VarianteObjet): FiltreEnCours {
        return (this.applicationEnCours[variante.id] ||= FILTRE_VIDE());
    }

    /** Vrai pour les opérateurs qui n'attendent aucune valeur : « est vide », « n'est pas vide ». */
    sansValeur(operateur: string): boolean {
        return operateur === 'empty' || operateur === 'notempty';
    }

    /** Ajoute un filtre à ce que la variante garde (portée) ou à ce qui la déclenche (applicabilité). */
    ajouterFiltre(variante: VarianteObjet, ou: 'scope' | 'applies'): void {
        const saisie = ou === 'scope' ? this.saisieDePortee(variante) : this.saisieDApplication(variante);
        if (!saisie.col) return this.notifications.erreur('Choisissez la colonne du filtre.');
        const valeur = this.sansValeur(saisie.op) ? '' : saisie.val.trim();
        if (!this.sansValeur(saisie.op) && !valeur)
            return this.notifications.erreur('Indiquez la valeur du filtre (par exemple : PRINCIPALE).');
        const filtres = variante[ou] || [];
        if (filtres.some(autre => autre.col === saisie.col && autre.op === saisie.op && (autre.val || '') === valeur))
            return this.notifications.erreur('Ce filtre est déjà présent.');
        filtres.push({ col: saisie.col, op: saisie.op, val: valeur });
        if (ou === 'scope') variante.scope = filtres;
        else variante.applies = filtres;
        saisie.val = '';
    }

    retirerFiltre(variante: VarianteObjet, ou: 'scope' | 'applies', position: number): void {
        (variante[ou] || []).splice(position, 1);
    }

    ajouterInformationDeVariante(variante: VarianteObjet): void {
        const informations = variante.elements || [];
        informations.push(informationDeVarianteNeuve(variante, this.colonnesDeLaVariante(variante)[0] || '', genererIdentifiant));
        variante.elements = informations;
    }

    /** Rattacher une information de variante à une autre colonne : la correspondance suit le choix. */
    changerLaColonne(
        variante: VarianteObjet,
        information: { col: string; mappings: { table: string; col: string }[] },
        colonne: string
    ): void {
        information.col = colonne;
        information.mappings = colonne ? [{ table: variante.table, col: colonne }] : [];
    }

    supprimerInformationDeVariante(variante: VarianteObjet, identifiant: string): void {
        variante.elements = (variante.elements || []).filter(information => information.id !== identifiant);
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
