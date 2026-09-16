/**
 * Extraction avancée — le même écran que l'application classique, dans le même ordre :
 *
 *   💾 Paramétrages d'extraction  — enregistrer la configuration et la rejouer plus tard (charger, renommer, supprimer).
 *   🏛️ Partir d'un objet métier   — jointures, filtres de facettes et noms métier pré-remplis.
 *      Table de départ            — le point d'entrée de l'extraction.
 *   🔗 Quel lien utiliser ?        — quand deux tables sont reliées plusieurs fois, on choisit le lien par défaut,
 *                                    et colonne par colonne avec le sélecteur « via ».
 *   1. Colonnes en sortie          — tableau ordonné (source, nom en sortie, transformation, clé), ajout d'une
 *                                    colonne, de toutes, ou de plusieurs d'un coup ; puis les trois assistants
 *                                    Σ synthèse d'une table liée, 🌳 hiérarchie aplatie, ƒx colonne calculée.
 *   2. Filtres                     — puces, avec les opérateurs du classique, les valeurs suggérées de la colonne,
 *                                    le filtre « dans une liste fournie » (fichier ou texte collé) et le filtre
 *                                    📄 « dans le fichier » : une liste déposée (CSV, texte, Excel) ou collée que
 *                                    l'on rattache à une ou plusieurs colonnes, pour garder ou exclure ces lignes.
 *   3. Options                     — 🎯 dédoublonner par clé fonctionnelle, 🧮 regrouper & agréger avec des
 *                                    mesures à critères (NB.SI.ENS, SOMME.SI.ENS).
 *   4. Actions                     — compter, prévisualiser, bilan qualité, voir (et éditer) le SQL, type de
 *                                    jointure, aperçu rapide, générer le CSV, enregistrer le résultat en source.
 *
 * Toute la traduction en SQL est faite par le serveur (api/src/extraction) : l'écran ne compose qu'une
 * spécification. Les chemins de jointure sont calculés par ./chemins.ts à partir du modèle de données.
 */
import { ScrollingModule } from '@angular/cdk/scrolling';
import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ClientApiService } from '../../coeur/client-api.service';
import {
    Agregat,
    ApercuExtraction,
    BilanDesJointures,
    BilanExtraction,
    ColonneExtraction,
    DedoublonnageExtraction,
    FiltreExtraction,
    FiltreFichierExtraction,
    FonctionMesure,
    MesureExtraction,
    ModeSynthese,
    ModeleExtraction,
    ObjetMetier,
    OPERATEURS_SANS_VALEUR,
    OPERATEUR_DEUX_VALEURS,
    OperateurFiltre,
    Relation,
    Source,
    SpecificationExtraction,
    Transformation,
    ValeurSuggeree,
    VocabulaireExtraction,
    genererIdentifiant
} from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';
import { AssistantsColonnesComponent } from './assistants-colonnes.component';
import { FiltreFichierComponent } from './filtre-fichier.component';
import { CaseExtraction } from './cases-extraction';
import { VueGraphiqueExtractionComponent } from './vue-graphique.component';
import {
    Chemin,
    ROUTE_INDIFFERENTE,
    casesDuGraphe,
    cheminParCle,
    cheminsVers,
    cleChemin,
    libelleChemin,
    planifierJointures,
    tablesAccessibles
} from './chemins';
import { SelecteurColonneComponent } from './selecteur-colonne.component';
import { PleinEcranComponent } from '../../composants/plein-ecran.component';

/** Une valeur par ligne ; sur chaque ligne, seule la première cellule compte (séparateurs ; , tabulation, |). */
export function valeursDeListe(texte: string): string[] {
    return [
        ...new Set(
            texte
                .split(/\r?\n/)
                .map(ligne =>
                    ligne
                        .split(/[;,\t|]/)[0]
                        .trim()
                        .replace(/^"|"$/g, '')
                )
                .filter(Boolean)
        )
    ];
}

/** Correspondance entre les opérateurs de périmètre des facettes d'objet métier et ceux de l'extraction. */
const OPERATEURS_FACETTE: Record<string, OperateurFiltre> = {
    eq: '=',
    neq: '!=',
    contains: 'contains',
    starts: 'startsWith',
    empty: 'empty',
    nempty: 'notempty'
};

/** Les périmètres (« scope ») des facettes d'un objet métier deviennent des filtres, quand leur table est présente. */
export function filtresDesFacettes(
    objet: ObjetMetier,
    idDe: (nomTable: string) => string | undefined,
    tablesPresentes: string[]
): FiltreExtraction[] {
    const facettes = Array.isArray(objet['structure'])
        ? (objet['structure'] as { table: string; scope?: { col: string; op: string; val: string }[] }[])
        : [];
    const filtres: FiltreExtraction[] = [];
    for (const facette of facettes) {
        const tableId = idDe(facette.table);
        if (!tableId || !tablesPresentes.includes(tableId)) continue;
        for (const condition of facette.scope || []) {
            const operateur = OPERATEURS_FACETTE[condition.op];
            if (operateur) filtres.push({ tableId, nomColonne: condition.col, op: operateur, valeur: condition.val });
        }
    }
    return filtres;
}

/** Fonctions proposées pour une mesure de regroupement, avec le libellé de l'application classique. */
const FONCTIONS_MESURE: Record<FonctionMesure, string> = {
    count: 'Nombre de lignes (NB / NB.SI.ENS)',
    countd: 'Nombre distinct',
    sum: 'Somme (SOMME.SI.ENS)',
    avg: 'Moyenne (MOYENNE.SI.ENS)',
    min: 'Minimum',
    max: 'Maximum'
};

/** Les quatre façons d'ajouter une colonne, présentées en onglets dans le panneau « Ajouter une colonne ». */
export type ModeAjout = 'colonne' | 'synthese' | 'hierarchie' | 'calcul';
const ONGLETS_AJOUT: [ModeAjout, string][] = [
    ['colonne', "Colonne d'une table"],
    ['synthese', "Σ Synthèse d'une table liée"],
    ['hierarchie', '🌳 Hiérarchie aplatie'],
    ['calcul', 'ƒx Colonne calculée']
];

/** Nombre de lignes du mode « aperçu rapide ». */
const LIGNES_APERCU_RAPIDE = 500;

@Component({
    selector: 'app-extraction',
    imports: [
        PleinEcranComponent,
        FormsModule,
        RouterLink,
        ScrollingModule,
        SelecteurColonneComponent,
        AssistantsColonnesComponent,
        FiltreFichierComponent,
        VueGraphiqueExtractionComponent
    ],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Extraction</h1>
                <p class="discret">
                    Décrivez colonnes, filtres, dédoublonnage et agrégats : le SQL est généré, comptez et prévisualisez avant de lancer.
                </p>
            </div>
        </div>

        <!-- Bandeau : ce que fait l'extraction en un coup d'œil, et les outils rangés derrière des boutons -->
        <div class="plan-haut">
            <div class="resume">
                <span class="etiquette-forte">Table de départ</span>
                <select class="champ petit large" [ngModel]="baseId()" (ngModelChange)="choisirBase($event)" name="base">
                    <option value="">—</option>
                    @for (source of sources(); track source.id) {
                        <option [value]="source.id">{{ source.name }}</option>
                    }
                </select>
                @for (puce of resume(); track puce.texte) {
                    <span class="puce-resume" [class.alerte]="puce.alerte">{{ puce.texte }}</span>
                }
            </div>
            <div class="outils">
                <button
                    class="bouton petit"
                    type="button"
                    name="outilParametrages"
                    [class.actif]="outil() === 'parametrages'"
                    (click)="basculerOutil('parametrages')"
                    title="Enregistrer ou recharger un paramétrage"
                >
                    💾 Paramétrages
                    @if (modeles().length) {
                        <span class="compte">{{ modeles().length }}</span>
                    }
                </button>
                <button
                    class="bouton petit"
                    type="button"
                    name="outilObjet"
                    [class.actif]="outil() === 'objet'"
                    (click)="basculerOutil('objet')"
                    title="Partir d'un objet métier : jointures, filtres et noms pré-remplis"
                >
                    🏛️ Objet métier
                </button>
                <button
                    class="bouton petit"
                    type="button"
                    name="vueGraphique"
                    [class.actif]="vueGraphiqueOuverte()"
                    (click)="vueGraphiqueOuverte.set(!vueGraphiqueOuverte())"
                    title="Choisir les colonnes directement sur le schéma des liens"
                >
                    🗺️ Vue graphique
                </button>
                <button
                    class="bouton petit"
                    type="button"
                    name="outilGuide"
                    [class.actif]="outil() === 'guide'"
                    (click)="basculerOutil('guide')"
                    title="Comment se lit cet écran"
                >
                    🧭 Guide
                </button>
            </div>
        </div>

        @if (outil() === 'parametrages') {
            <div class="bloc parametrages">
                <div class="titre-bloc">
                    💾 Paramétrages d'extraction
                    <span class="discret">— enregistrez la configuration ci-dessous et rejouez-la plus tard</span>
                </div>
                <div class="ligne-champs">
                    @if (modeles().length) {
                        <select class="champ petit large" [(ngModel)]="modeleChoisi" name="modeleChoisi">
                            @for (modele of modeles(); track modele.id) {
                                <option [value]="modele.id">{{ modele.nom }}</option>
                            }
                        </select>
                        <button class="bouton petit principal" type="button" name="chargerModele" (click)="chargerModele(modeleChoisi())">
                            📂 Charger
                        </button>
                        <button class="bouton petit" type="button" title="Renommer le paramétrage sélectionné" (click)="renommerModele()">
                            ✎
                        </button>
                        <button
                            class="bouton petit danger"
                            type="button"
                            title="Supprimer le paramétrage sélectionné"
                            (click)="supprimerModele()"
                        >
                            🗑
                        </button>
                        <span class="separateur">|</span>
                    }
                    @if (session.peutEditer()) {
                        <button class="bouton petit" type="button" name="enregistrerModele" (click)="enregistrerModele()">
                            💾 Enregistrer le paramétrage actuel
                        </button>
                    }
                    @if (!modeles().length) {
                        <span class="discret">Aucun paramétrage enregistré pour l'instant.</span>
                    }
                </div>
            </div>
        }
        @if (outil() === 'objet') {
            <div class="bloc gouvernance">
                <div class="titre-bloc">
                    🏛️ Partir d'un objet métier
                    <span class="discret">— jointures, filtres de facettes et noms métier pré-remplis</span>
                </div>
                @if (objetsMetier().length) {
                    <div class="ligne-champs">
                        <select class="champ petit large" [(ngModel)]="objetChoisi" name="objetChoisi">
                            @for (objet of objetsMetier(); track objet.id) {
                                <option [value]="objet.id">{{ objet.name }}</option>
                            }
                        </select>
                        <button
                            class="bouton petit principal"
                            type="button"
                            name="chargerObjet"
                            (click)="chargerObjetMetier(objetChoisi())"
                        >
                            Charger cet objet
                        </button>
                        <span class="discret">écrase la configuration ci-dessous</span>
                    </div>
                } @else {
                    <p class="discret">
                        Aucun objet métier défini (écran Gouvernance). Vous pouvez construire l'extraction manuellement ci-dessous.
                    </p>
                }
            </div>
        }
        @if (outil() === 'guide') {
            <div class="bloc guide">
                <div class="titre-bloc">🧭 Comment se lit cet écran</div>
                <p class="discret">
                    L'extraction se lit de haut en bas comme une recette : <b>ce qui sort</b> (les colonnes), <b>quelles lignes</b> (les
                    filtres), puis <b>la forme du résultat</b> (doublons, regroupement, jointures). Le panneau <b>Résultat</b>, à droite,
                    reste à portée : comptez et prévisualisez avant de générer.
                </p>
                <p class="discret">
                    Une colonne d'une table liée s'ajoute directement : le chemin de jointure est calculé pour vous. Quand une table est
                    reliée de plusieurs façons, le sélecteur « via » propose « le lien renseigné, quel qu'il soit » — choisissez un chemin
                    précis seulement si les liens ont des sens différents (souscripteur / bénéficiaire).
                </p>
            </div>
        }

        <!-- V13 : choisir ses colonnes sur le schéma ; l'écran déclaratif reste dessous et reste synchronisé. -->
        @if (baseId() && vueGraphiqueOuverte()) {
            <section class="carte">
                <div class="entete-page" style="margin: 0 0 6px">
                    <div class="espace">
                        <h2 style="margin: 0">🗺️ Vue graphique</h2>
                        <p class="discret" style="margin: 4px 0 0">
                            Chaque case est une table <b>atteinte par un chemin précis</b>. Une table reliée plusieurs fois apparaît une
                            fois par lien : cochez la colonne sur la bonne case, le chemin se renseigne tout seul. Les cases se déplacent
                            par leur en-tête.
                        </p>
                    </div>
                    <button class="bouton petit" type="button" name="fermerVueGraphique" (click)="vueGraphiqueOuverte.set(false)">
                        Fermer
                    </button>
                </div>
                <app-vue-graphique-extraction
                    [cases]="casesDuGraphe()"
                    [colonnes]="colonnes()"
                    [filtres]="filtres()"
                    [colonnesDe]="colonnesDUneTable"
                    [transformations]="transformations()"
                    [operateurs]="operateurs()"
                    (basculerColonne)="basculerColonneDuGraphe($event)"
                    (changerColonne)="modifierColonne($event.index, $event.changement)"
                    (ajouterFiltre)="ajouterFiltreDepuisLeGraphe($event)"
                    (changerFiltre)="modifierFiltre($event.index, $event.changement)"
                    (retirerFiltre)="retirerFiltre($event)"
                    (toutesLesColonnes)="toutesLesColonnesDuGraphe($event)"
                    (aucuneColonne)="aucuneColonneDuGraphe($event)"
                    (compter)="compterDepuisLeGraphe($event)"
                    (repartirDe)="repartirDepuisLeGraphe($event)"
                />
            </section>
        }

        @if (baseId()) {
            <div class="plan-grille">
                <div class="plan-principal">
                    <!-- ▤ Ce qui sort -->
                    <section class="carte section-plan">
                        <div class="tete-section">
                            <span class="pictogramme">▤</span>
                            <div><b>Colonnes en sortie</b><span class="discret">ce que contiendra le fichier</span></div>
                            <span class="espace"></span>
                            <button class="bouton petit principal" type="button" name="ouvrirAjout" (click)="basculerAjout()">
                                ＋ Ajouter une colonne
                            </button>
                        </div>
                        @if (colonnes().length) {
                            <div class="defilement-x">
                                <table class="tableau">
                                    <thead>
                                        <tr>
                                            <th>Source</th>
                                            <th>Nom en sortie (alias métier)</th>
                                            <th>Transformation</th>
                                            @if (regrouper()) {
                                                <th>Agrégat</th>
                                            }
                                            @if (cleActive()) {
                                                <th class="centre">Clé</th>
                                            }
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @for (colonne of colonnes(); track $index; let index = $index) {
                                            <tr>
                                                <td class="source-colonne">
                                                    @if (colonne.genre && colonne.genre !== 'colonne') {
                                                        <span class="badge neutre">{{ libelleGenre(colonne.genre) }}</span>
                                                    }
                                                    <code>{{ libelleColonne(colonne) }}</code>
                                                </td>
                                                <td>
                                                    <input
                                                        class="champ petit"
                                                        [ngModel]="colonne.alias"
                                                        (ngModelChange)="modifierColonne(index, { alias: $event })"
                                                        [name]="'alias_' + index"
                                                        [attr.name]="'alias_' + index"
                                                        placeholder="auto"
                                                    />
                                                </td>
                                                <td>
                                                    @if (colonne.genre === 'colonne' || !colonne.genre) {
                                                        <select
                                                            class="champ petit"
                                                            [ngModel]="colonne.transformation"
                                                            (ngModelChange)="modifierColonne(index, { transformation: $event })"
                                                            [name]="'tr_' + index"
                                                            [attr.name]="'tr_' + index"
                                                        >
                                                            @for (entree of transformations(); track entree[0]) {
                                                                <option [value]="entree[0]">{{ entree[1] }}</option>
                                                            }
                                                        </select>
                                                    } @else if (colonne.genre === 'calcul') {
                                                        <input
                                                            class="champ petit formule"
                                                            [ngModel]="colonne.formule"
                                                            (ngModelChange)="modifierColonne(index, { formule: $event })"
                                                            [name]="'formule_' + index"
                                                            [attr.name]="'formule_' + index"
                                                            title="Formule : les colonnes s'écrivent entre crochets, le reste est du SQL"
                                                        />
                                                    } @else {
                                                        <span class="discret">—</span>
                                                    }
                                                </td>
                                                @if (regrouper()) {
                                                    <td>
                                                        <select
                                                            class="champ petit"
                                                            [ngModel]="colonne.agregat || ''"
                                                            (ngModelChange)="modifierColonne(index, { agregat: $event || undefined })"
                                                            [name]="'ag_' + index"
                                                            [attr.name]="'ag_' + index"
                                                        >
                                                            <option value="">clé de regroupement</option>
                                                            @for (entree of agregats(); track entree[0]) {
                                                                <option [value]="entree[0]">{{ entree[1] }}</option>
                                                            }
                                                        </select>
                                                    </td>
                                                }
                                                @if (cleActive()) {
                                                    <td class="centre">
                                                        <input
                                                            type="checkbox"
                                                            [checked]="estCle(colonne)"
                                                            (change)="basculerCle(colonne)"
                                                            [attr.name]="'cle_' + index"
                                                            title="Faire partie de la clé de dédoublonnage"
                                                        />
                                                    </td>
                                                }
                                                <td class="droite">
                                                    <button class="bouton petit danger" type="button" (click)="retirerColonne(index)">
                                                        ✕
                                                    </button>
                                                </td>
                                            </tr>
                                        }
                                    </tbody>
                                </table>
                            </div>
                        } @else {
                            <p class="discret">Aucune colonne. Ajoutez-en ci-dessous.</p>
                        }
                        @if (ajoutOuvert()) {
                            <div class="panneau-ajout">
                                <div class="onglets-ajout">
                                    @for (onglet of ongletsAjout; track onglet[0]) {
                                        <button
                                            class="bouton petit"
                                            type="button"
                                            [class.actif]="modeAjout() === onglet[0]"
                                            [attr.name]="'ongletAjout_' + onglet[0]"
                                            (click)="modeAjout.set(onglet[0])"
                                        >
                                            {{ onglet[1] }}
                                        </button>
                                    }
                                    <span class="espace"></span>
                                    <button class="bouton petit" type="button" title="Fermer" (click)="ajoutOuvert.set(false)">✕</button>
                                </div>
                                @if (modeAjout() === 'colonne') {
                                    <div class="ligne-ajout">
                                        <app-selecteur-colonne
                                            identifiant="ajout"
                                            [sources]="sources()"
                                            [chemins]="cheminsParTable()"
                                            [routesParDefaut]="routesParDefaut()"
                                            [(tableId)]="ajoutTableId"
                                            [(route)]="ajoutRoute"
                                            [(nomColonne)]="ajoutColonne"
                                        />
                                        <button
                                            class="bouton petit principal"
                                            type="button"
                                            name="ajouterColonne"
                                            (click)="ajouterColonne()"
                                        >
                                            + Colonne
                                        </button>
                                        <button
                                            class="bouton petit"
                                            type="button"
                                            name="ajouterToutes"
                                            (click)="ajouterToutesLesColonnes()"
                                        >
                                            + Toutes
                                        </button>
                                        <button class="bouton petit" type="button" name="ouvrirPlusieurs" (click)="basculerChoixMultiple()">
                                            ➕ Plusieurs colonnes…
                                        </button>
                                    </div>
                                    @if (choixMultipleOuvert()) {
                                        <div class="bloc choix-multiple">
                                            <div class="ligne-champs">
                                                <input
                                                    class="champ petit"
                                                    [(ngModel)]="rechercheColonnes"
                                                    name="rechercheColonnes"
                                                    placeholder="filtrer les colonnes…"
                                                />
                                                <span class="discret"
                                                    >{{ colonnesAChoisir().length }} colonne(s) — {{ nomDe(ajoutTableId()) }}</span
                                                >
                                                <span class="espace"></span>
                                                <button
                                                    class="bouton petit principal"
                                                    type="button"
                                                    name="appliquerPlusieurs"
                                                    (click)="ajouterLesCochees()"
                                                >
                                                    Ajouter les {{ colonnesCochees().length }} colonne(s) cochée(s)
                                                </button>
                                            </div>
                                            <div class="grille-colonnes">
                                                @for (colonne of colonnesAChoisir(); track colonne) {
                                                    <label class="case">
                                                        <input
                                                            type="checkbox"
                                                            [checked]="colonnesCochees().includes(colonne)"
                                                            (change)="basculerCochee(colonne)"
                                                        />
                                                        <span>{{ colonne }}</span>
                                                    </label>
                                                }
                                            </div>
                                        </div>
                                    }
                                } @else {
                                    <app-assistants-colonnes
                                        [sources]="sources()"
                                        [chemins]="cheminsParTable()"
                                        [baseId]="baseId()"
                                        [mode]="modeAjout()"
                                        [modesSynthese]="modesSynthese()"
                                        (ajouter)="ajouterColonneAvancee($event)"
                                    />
                                }
                            </div>
                        }
                    </section>

                    <!-- ⛉ Quelles lignes -->
                    <section class="carte section-plan">
                        <div class="tete-section">
                            <span class="pictogramme">⛉</span>
                            <div><b>Filtres</b><span class="discret">quelles lignes garder — sans filtre, tout est extrait</span></div>
                        </div>
                        @if (filtres().length) {
                            <div class="puces">
                                @for (filtre of filtres(); track $index; let index = $index) {
                                    <span class="puce">
                                        <b>{{ libelleFiltre(filtre) }}</b>
                                        @if (filtre.op === 'list') {
                                            <span class="badge neutre">{{ (filtre.liste || []).length }} valeur(s)</span>
                                            <label class="bouton petit">
                                                fichier<input
                                                    type="file"
                                                    hidden
                                                    accept=".csv,.txt,.tsv"
                                                    (change)="chargerListe(filtre, $event)"
                                                />
                                            </label>
                                            <button class="bouton petit" type="button" (click)="collerListe(filtre)">coller</button>
                                            <label class="case">
                                                <input
                                                    type="checkbox"
                                                    [ngModel]="filtre.exclure"
                                                    (ngModelChange)="filtre.exclure = $event"
                                                    [name]="'fx_' + index"
                                                    [attr.name]="'fx_' + index"
                                                />
                                                exclure
                                            </label>
                                        }
                                        <button class="lien-retirer" type="button" (click)="retirerFiltre(index)">✕</button>
                                    </span>
                                }
                            </div>
                        }
                        <div class="ligne-ajout">
                            <app-selecteur-colonne
                                identifiant="filtre"
                                [sources]="sources()"
                                [chemins]="cheminsParTable()"
                                [routesParDefaut]="routesParDefaut()"
                                [(tableId)]="filtreTableId"
                                [(route)]="filtreRoute"
                                [(nomColonne)]="filtreColonne"
                            />
                            <select class="champ petit" [(ngModel)]="filtreOperateur" name="filtreOperateur">
                                @for (entree of operateurs(); track entree[0]) {
                                    <option [value]="entree[0]">{{ entree[1] }}</option>
                                }
                            </select>
                            @if (!sansValeur(filtreOperateur())) {
                                <input
                                    class="champ petit"
                                    [(ngModel)]="filtreValeur"
                                    name="filtreValeur"
                                    list="valeurs-suggerees"
                                    (focus)="proposerValeurs()"
                                    (input)="proposerValeurs()"
                                    placeholder="choisir ou saisir…"
                                />
                                <datalist id="valeurs-suggerees">
                                    @for (suggestion of valeursSuggerees(); track suggestion.valeur) {
                                        <option [value]="suggestion.valeur">{{ suggestion.lignes }} ligne(s)</option>
                                    }
                                </datalist>
                            }
                            @if (filtreOperateur() === deuxValeurs) {
                                <input class="champ petit court" [(ngModel)]="filtreValeur2" name="filtreValeur2" placeholder="et" />
                            }
                            <button class="bouton petit principal" type="button" name="ajouterFiltre" (click)="ajouterFiltre()">
                                + Filtre
                            </button>
                        </div>
                        <app-filtre-fichier
                            [(fichiers)]="fichiers"
                            [baseId]="baseId()"
                            [sources]="sources()"
                            [chemins]="cheminsParTable()"
                            [routesParDefaut]="routesParDefaut()"
                        />
                        @if (tablesAmbigues().length) {
                            <div class="bloc ambiguite">
                                <div class="titre-bloc">🔗 Quel lien utiliser ?</div>
                                <p class="discret">
                                    Ces tables sont reliées par <b>plusieurs liens</b>. Choisissez ici le lien <b>par défaut</b> — et pour
                                    ramener <b>la même table par plusieurs liens à la fois</b> (par exemple le nom du souscripteur ET celui
                                    du bénéficiaire), précisez le lien <b>colonne par colonne</b> avec le sélecteur « via » de la ligne
                                    d'ajout.
                                </p>
                                @for (table of tablesAmbigues(); track table.id) {
                                    <div class="ligne-champs">
                                        <span class="badge neutre">{{ nomDe(table.id) }}</span>
                                        <select
                                            class="champ petit large"
                                            [ngModel]="routesParDefaut()[table.id] || ''"
                                            (ngModelChange)="choisirLienParDefaut(table.id, $event)"
                                            [name]="'defaut_' + table.id"
                                            [attr.name]="'defaut_' + table.id"
                                        >
                                            @for (chemin of table.chemins; track cleChemin(chemin)) {
                                                <option [value]="cleChemin(chemin)">{{ libelle(chemin) }}</option>
                                            }
                                        </select>
                                        <span class="discret">{{ table.chemins.length }} liens possibles</span>
                                    </div>
                                }
                            </div>
                        }
                    </section>

                    <!-- ◇ La forme du résultat -->
                    <section class="carte section-plan">
                        <div class="tete-section">
                            <span class="pictogramme">◇</span>
                            <div>
                                <b>Forme du résultat</b><span class="discret">doublons, regroupement et agrégats, jointures, volume</span>
                            </div>
                        </div>
                        <div class="grille deux">
                            <div class="carte">
                                <label class="case forte">
                                    <input
                                        type="checkbox"
                                        [ngModel]="dedoublonnageActif()"
                                        (ngModelChange)="basculerDedoublonnage($event)"
                                        name="dedoublonner"
                                        [disabled]="regrouper()"
                                    />
                                    🎯 Dédoublonner par clé fonctionnelle
                                </label>
                                @if (dedoublonnageActif() && !regrouper()) {
                                    <p class="discret">
                                        Cochez les colonnes « Clé » ci-dessus ({{ dedoublonnage().cles.length }} sélectionnée(s)). Conserver
                                        :
                                        <select
                                            class="champ petit"
                                            [ngModel]="dedoublonnage().garder"
                                            (ngModelChange)="choisirLigneGardee($event)"
                                            name="garder"
                                        >
                                            <option value="premiere">1re ligne</option>
                                            <option value="derniere">dernière ligne</option>
                                        </select>
                                    </p>
                                } @else if (regrouper()) {
                                    <p class="discret">Indisponible avec le regroupement.</p>
                                }
                                <label class="case">
                                    <input
                                        type="checkbox"
                                        [(ngModel)]="dedoublonnerLignes"
                                        name="dedoublonnerLignes"
                                        [disabled]="regrouper()"
                                    />
                                    Supprimer aussi les lignes en tous points identiques
                                </label>
                            </div>

                            <div class="carte">
                                <label class="case forte">
                                    <input type="checkbox" [(ngModel)]="regrouper" name="regrouper" />
                                    🧮 Regrouper &amp; agréger (group by)
                                </label>
                                @if (regrouper()) {
                                    <p class="discret">
                                        Sans colonne en sortie = totaux globaux (une seule ligne). Ajoutez des <b>critères</b> à une mesure
                                        pour reproduire NB.SI.ENS / SOMME.SI.ENS.
                                    </p>
                                    @for (mesure of mesures(); track $index; let index = $index) {
                                        <div class="ligne-mesure">
                                            <b>{{ libelleFonction(mesure.fn) }}</b>
                                            <code>{{ libelleCibleMesure(mesure) }}</code>
                                            @if (mesure.criteres.length) {
                                                <span class="badge alerte">SI {{ libelleCriteres(mesure.criteres) }}</span>
                                            }
                                            →
                                            <input
                                                class="champ petit"
                                                [ngModel]="mesure.alias"
                                                (ngModelChange)="mesure.alias = $event"
                                                [name]="'mes_' + index"
                                                [attr.name]="'mes_' + index"
                                            />
                                            <button class="bouton petit danger" type="button" (click)="retirerMesure(index)">✕</button>
                                        </div>
                                    }
                                    @if (criteresEnAttente().length) {
                                        <div class="puces">
                                            @for (critere of criteresEnAttente(); track $index; let index = $index) {
                                                <span class="puce alerte">
                                                    critère : {{ libelleFiltre(critere) }}
                                                    <button class="lien-retirer" type="button" (click)="retirerCritereEnAttente(index)">
                                                        ✕
                                                    </button>
                                                </span>
                                            }
                                        </div>
                                    }
                                    <div class="ligne-ajout critere">
                                        <span class="etiquette">Critères (optionnel, NB.SI.ENS)</span>
                                        <app-selecteur-colonne
                                            identifiant="critere"
                                            [sources]="sources()"
                                            [chemins]="cheminsParTable()"
                                            [routesParDefaut]="routesParDefaut()"
                                            [(tableId)]="critereTableId"
                                            [(route)]="critereRoute"
                                            [(nomColonne)]="critereColonne"
                                        />
                                        <select class="champ petit" [(ngModel)]="critereOperateur" name="critereOperateur">
                                            @for (entree of operateurs(); track entree[0]) {
                                                <option [value]="entree[0]">{{ entree[1] }}</option>
                                            }
                                        </select>
                                        @if (!sansValeur(critereOperateur())) {
                                            <input
                                                class="champ petit"
                                                [(ngModel)]="critereValeur"
                                                name="critereValeur"
                                                placeholder="valeur…"
                                            />
                                        }
                                        <button
                                            class="bouton petit"
                                            type="button"
                                            name="ajouterCritere"
                                            (click)="ajouterCritereEnAttente()"
                                        >
                                            + Critère
                                        </button>
                                    </div>
                                    <div class="ligne-ajout">
                                        <select class="champ petit large" [(ngModel)]="mesureFonction" name="mesureFonction">
                                            @for (entree of fonctionsMesure; track entree[0]) {
                                                <option [value]="entree[0]">{{ entree[1] }}</option>
                                            }
                                        </select>
                                        <app-selecteur-colonne
                                            identifiant="mesure"
                                            [sources]="sources()"
                                            [chemins]="cheminsParTable()"
                                            [routesParDefaut]="routesParDefaut()"
                                            [(tableId)]="mesureTableId"
                                            [(route)]="mesureRoute"
                                            [(nomColonne)]="mesureColonne"
                                        />
                                        <button class="bouton petit principal" type="button" name="ajouterMesure" (click)="ajouterMesure()">
                                            + Agrégat{{
                                                criteresEnAttente().length ? ' (avec ' + criteresEnAttente().length + ' critère(s))' : ''
                                            }}
                                        </button>
                                    </div>
                                }
                            </div>
                        </div>

                        <div class="ligne-options">
                            <span class="etiquette-forte">Jointures :</span>
                            <label class="case">
                                <input
                                    type="radio"
                                    name="typeJointure"
                                    value="left"
                                    [ngModel]="typeJointure()"
                                    (ngModelChange)="typeJointure.set($event)"
                                />
                                Conserver tout (left join)
                            </label>
                            <label class="case">
                                <input
                                    type="radio"
                                    name="typeJointure"
                                    value="inner"
                                    [ngModel]="typeJointure()"
                                    (ngModelChange)="typeJointure.set($event)"
                                />
                                Intersection (inner join)
                            </label>
                            <label class="case avertissement">
                                <input type="checkbox" [(ngModel)]="apercuRapide" name="apercuRapide" />
                                Mode « aperçu rapide » — limiter à {{ lignesApercuRapide }} lignes
                            </label>
                        </div>
                    </section>
                </div>

                <!-- ▶ Résultat : toujours à portée -->
                <aside class="plan-cote">
                    <section class="carte section-plan">
                        <div class="tete-section">
                            <span class="pictogramme">▶</span>
                            <div><b>Résultat</b><span class="discret">vérifier, puis générer</span></div>
                        </div>
                        <div class="ligne-actions">
                            <button class="bouton" type="button" name="compter" (click)="compter()" [disabled]="!prete() || enCours()">
                                🔢 Compter
                            </button>
                            <span class="total">{{ total() === null ? '—' : total()!.toLocaleString('fr-FR') }}</span>
                            <button
                                class="bouton principal"
                                type="button"
                                name="previsualiser"
                                (click)="apercevoir()"
                                [disabled]="!prete() || enCours()"
                            >
                                👁️ {{ enCours() ? 'Exécution…' : 'Prévisualiser' }}
                            </button>
                            <button class="bouton" type="button" name="bilan" (click)="bilanQualite()" [disabled]="!prete() || enCours()">
                                ✅ Bilan qualité
                            </button>
                            <button
                                class="bouton"
                                type="button"
                                name="controlerJointures"
                                (click)="controlerLesJointures()"
                                [disabled]="!prete() || enCours()"
                                title="Vérifie sur les données qu'aucune table liée ne multiplie les lignes"
                            >
                                🧮 Contrôler les tables liées
                            </button>
                            <button class="bouton" type="button" name="voirSql" (click)="basculerSql()" [disabled]="!prete()">
                                📝 Voir le SQL
                            </button>
                        </div>
                        <div class="ligne-generer">
                            <button
                                class="bouton principal"
                                type="button"
                                name="genererCsv"
                                (click)="exporter()"
                                [disabled]="!prete() || enCours()"
                            >
                                ⬇️ Générer le CSV
                            </button>
                            @if (session.peutEditer()) {
                                <button
                                    class="bouton"
                                    type="button"
                                    name="garderJeu"
                                    (click)="garderCommeJeu()"
                                    [disabled]="!prete() || enCours()"
                                    title="Garder le résultat pour la session, sans créer de source"
                                >
                                    ⏳ Garder comme jeu temporaire
                                </button>
                                <label class="case">
                                    <input type="checkbox" [(ngModel)]="ajouterCommeSource" name="ajouterCommeSource" />
                                    Ajouter aussi comme nouvelle source
                                </label>
                                <input
                                    class="champ petit"
                                    [(ngModel)]="nomSourceProduite"
                                    name="nomSourceProduite"
                                    placeholder="Nom de la source (optionnel)"
                                />
                            }
                        </div>
                        @if (erreur()) {
                            <p class="erreur">{{ erreur() }}</p>
                        }
                    </section>
                </aside>
            </div>

            <!-- Aperçu, bilan et SQL : en pleine largeur, sous le plan de travail -->
            <div class="plan-sortie" #zoneSortie>
                @if (sqlVisible()) {
                    <div class="zone-sql">
                        <label class="case">
                            <input
                                type="checkbox"
                                [ngModel]="sqlPersonnaliseActif()"
                                (ngModelChange)="basculerSqlPersonnalise($event)"
                                name="sqlPersonnalise"
                            />
                            SQL personnalisé (éditer librement la requête)
                        </label>
                        <textarea
                            class="champ sql"
                            [ngModel]="sqlAffiche()"
                            (ngModelChange)="ecrireSql($event)"
                            [readonly]="!sqlPersonnaliseActif()"
                            name="sql"
                            rows="10"
                        ></textarea>
                    </div>
                }
                @if (bilanJointures(); as controle) {
                    <div class="controle-jointures" [class.multiplie]="controle.multiplie" name="bilanDesJointures">
                        <p class="verdict">{{ controle.multiplie ? '⚠️' : '✅' }} {{ controle.phrase }}</p>
                        @for (jointure of controle.jointures; track jointure.cle) {
                            <p class="detail" [class.fautive]="jointure.multiplie">{{ jointure.phrase }}</p>
                        }
                        @if (controle.multiplie) {
                            <p class="detail">
                                Une clé incomplète fait revenir la même ligne plusieurs fois : les totaux deviennent faux sans rien
                                signaler. Ouvrez le Modèle de données, colonne « Clé du lien », et ajoutez la colonne qui manque — le
                                groupe, la date, la version…
                            </p>
                            <a class="bouton" routerLink="/modele" name="allerAuModele">🔗 Ouvrir le Modèle de données</a>
                        }
                    </div>
                }
                @if (bilan(); as bilan) {
                    <div class="bilan">
                        <div class="discret">
                            Bilan qualité du résultat — {{ bilan.total.toLocaleString('fr-FR') }} ligne(s), {{ bilan.colonnes.length }}
                            colonne(s) · taux de complétude par colonne :
                        </div>
                        <div class="kpis">
                            @for (colonne of bilan.colonnes; track colonne.nom) {
                                <div class="kpi" [title]="colonne.nom">
                                    <span class="nom-colonne">{{ colonne.nom }}</span>
                                    <b [style.color]="couleurCompletude(colonne.part)">{{ (100 * colonne.part).toFixed(0) }} %</b>
                                    <span>{{ colonne.renseignees }} / {{ bilan.total }}</span>
                                </div>
                            }
                        </div>
                    </div>
                }
                @if (apercu(); as apercu) {
                    <div class="carte resultat">
                        <app-plein-ecran />
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
                        <div class="discret pied-resultat">
                            {{ apercu.lignes.length }} ligne(s) affichée(s){{
                                apercu.lignes.length >= apercu.limite ? ' (aperçu limité)' : ''
                            }}
                        </div>
                    </div>
                }
            </div>
        } @else {
            <div class="carte vide">Choisissez une table de départ pour commencer.</div>
        }
    `,
    styles: `
        /* ---- plan de travail : bandeau, grille à deux colonnes, zone de sortie ---- */
        .plan-haut {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            margin-bottom: 12px;
            border: 1px solid var(--bordure);
            border-radius: 8px;
            background: var(--surface-2);
        }
        .plan-haut .resume {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 6px;
            flex: 1 1 420px;
        }
        .plan-haut .outils {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }
        .puce-resume {
            font-size: 11px;
            border: 1px solid var(--bordure);
            border-radius: 999px;
            padding: 3px 10px;
            background: var(--surface);
            color: var(--texte-2);
        }
        .puce-resume.alerte {
            border-color: var(--alerte);
            color: var(--alerte);
            font-weight: 700;
        }
        .outils .bouton.actif {
            border-color: var(--accent);
            color: var(--accent);
            font-weight: 700;
        }
        .outils .compte {
            display: inline-block;
            margin-left: 4px;
            padding: 0 5px;
            border-radius: 999px;
            background: var(--accent);
            color: #fff;
            font-size: 10px;
        }
        .plan-grille {
            display: grid;
            grid-template-columns: 1fr minmax(280px, 340px);
            gap: 12px;
            align-items: start;
        }
        .plan-principal {
            display: flex;
            flex-direction: column;
            gap: 12px;
            min-width: 0;
        }
        .plan-cote {
            position: sticky;
            top: 12px;
        }
        .plan-principal .carte,
        .plan-cote .carte {
            margin: 0;
        }
        .tete-section {
            display: flex;
            align-items: center;
            gap: 8px;
            padding-bottom: 8px;
            margin-bottom: 8px;
            border-bottom: 1px solid var(--bordure);
        }
        .tete-section > div {
            display: flex;
            flex-direction: column;
            line-height: 1.25;
        }
        .tete-section b {
            font-size: 14px;
        }
        .tete-section .discret {
            font-size: 11px;
        }
        .pictogramme {
            font-size: 16px;
            color: var(--accent);
        }
        .panneau-ajout {
            margin-top: 8px;
            border: 1px solid var(--accent);
            border-radius: 8px;
            padding: 8px;
        }
        .onglets-ajout {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            margin-bottom: 6px;
        }
        .onglets-ajout .bouton.actif {
            border-color: var(--accent);
            color: var(--accent);
            font-weight: 700;
        }
        .plan-sortie {
            margin-top: 12px;
        }
        .plan-cote .ligne-actions,
        .plan-cote .ligne-generer {
            flex-direction: column;
            align-items: stretch;
            margin: 0;
        }
        .plan-cote .ligne-generer {
            margin-top: 10px;
        }
        .plan-cote .bouton {
            justify-content: center;
        }
        .plan-cote .total {
            text-align: center;
        }
        .bloc.guide .titre-bloc {
            color: var(--accent);
        }
        @media (max-width: 1100px) {
            .plan-grille {
                grid-template-columns: 1fr;
            }
            .plan-cote {
                position: static;
            }
        }
        .bloc {
            border: 1px solid var(--bordure);
            border-radius: 8px;
            padding: 10px 12px;
            margin-bottom: 12px;
            background: var(--surface-2);
        }
        .titre-bloc {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            margin-bottom: 6px;
        }
        .bloc.parametrages .titre-bloc {
            color: var(--accent);
        }
        .bloc.gouvernance .titre-bloc {
            color: var(--succes);
        }
        .bloc.ambiguite {
            border-color: var(--alerte);
        }
        .bloc.ambiguite .titre-bloc {
            color: var(--alerte);
        }
        .titre-bloc .discret {
            text-transform: none;
            font-weight: 500;
        }
        .titre-section {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            color: var(--texte-2);
            margin-bottom: 8px;
        }
        .ligne-champs,
        .ligne-ajout,
        .ligne-actions,
        .ligne-options,
        .ligne-generer,
        .ligne-depart,
        .ligne-mesure {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 6px;
        }
        .ligne-depart {
            margin-bottom: 12px;
        }
        .ligne-ajout {
            background: var(--surface-2);
            border: 1px solid var(--bordure);
            border-radius: 8px;
            padding: 6px 8px;
            margin-top: 8px;
        }
        .ligne-ajout.critere {
            background: color-mix(in srgb, var(--alerte) 8%, transparent);
        }
        .ligne-actions {
            margin-bottom: 8px;
        }
        .ligne-options,
        .ligne-generer {
            margin-top: 10px;
            font-size: 12px;
        }
        .ligne-generer {
            background: color-mix(in srgb, var(--accent) 8%, transparent);
            border-radius: 8px;
            padding: 10px;
        }
        .ligne-mesure {
            font-size: 12px;
            background: var(--surface-2);
            border-radius: 6px;
            padding: 4px 6px;
            margin-bottom: 4px;
        }
        .case {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
        }
        .case.forte {
            font-weight: 700;
        }
        .case.avertissement {
            background: color-mix(in srgb, var(--alerte) 12%, transparent);
            border-radius: 6px;
            padding: 3px 8px;
        }
        .etiquette-forte {
            font-weight: 700;
            color: var(--texte-2);
            font-size: 12px;
        }
        .champ.petit {
            padding: 4px 6px;
            font-size: 12px;
            width: auto;
        }
        .champ.petit.large {
            min-width: 220px;
        }
        .champ.petit.court {
            width: 90px;
        }
        .champ.petit.formule {
            min-width: 260px;
            font-family: ui-monospace, monospace;
        }
        .separateur {
            color: var(--bordure);
        }
        .puces {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-bottom: 6px;
        }
        .puce {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            border: 1px solid var(--bordure);
            border-radius: 999px;
            padding: 3px 10px;
            background: var(--surface);
        }
        .puce.alerte {
            border-color: var(--alerte);
        }
        .lien-retirer {
            border: 0;
            background: none;
            cursor: pointer;
            color: var(--erreur);
            padding: 0;
        }
        .source-colonne {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
        }
        .centre {
            text-align: center;
        }
        .droite {
            text-align: right;
        }
        .choix-multiple {
            margin-top: 8px;
        }
        .grille-colonnes {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 2px 10px;
            max-height: 260px;
            overflow: auto;
            margin-top: 6px;
        }
        .total {
            font-weight: 800;
            font-size: 15px;
            color: var(--accent);
            min-width: 60px;
        }
        .zone-sql {
            margin: 8px 0;
        }
        .champ.sql {
            width: 100%;
            font-family: ui-monospace, monospace;
            font-size: 12px;
            margin-top: 4px;
        }
        .erreur {
            color: var(--erreur);
            font-weight: 600;
        }
        .controle-jointures {
            margin: 10px 0;
            padding: 10px 12px;
            border: 1px solid var(--bordure);
            border-left: 4px solid var(--succes, #16a34a);
            border-radius: 8px;
            background: var(--fond-2);
        }
        .controle-jointures.multiplie {
            border-left-color: var(--alerte, #d97706);
        }
        .controle-jointures .verdict {
            margin: 0 0 6px;
            font-weight: 700;
        }
        .controle-jointures .detail {
            margin: 2px 0;
            font-size: 12px;
            color: var(--texte-2);
        }
        .controle-jointures .detail.fautive {
            color: var(--texte);
            font-weight: 600;
        }
        .controle-jointures .bouton {
            margin-top: 8px;
            display: inline-block;
        }
        .bilan {
            margin: 10px 0;
        }
        .bilan .kpi {
            padding: 8px 10px;
        }
        .bilan .kpi b {
            font-size: 18px;
        }
        .nom-colonne {
            display: block;
            font-size: 11px;
            font-weight: 700;
            color: var(--texte-2);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
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
            height: 45vh;
        }
        .pied-resultat {
            padding: 6px 10px;
        }
        .grille.deux {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
        }
        @media (max-width: 900px) {
            .grille.deux {
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
    readonly objetsMetier = signal<ObjetMetier[]>([]);

    // ---- la spécification en cours de composition ----
    readonly baseId = signal('');
    /** V13 : la vue graphique, ouverte ou non ; l'écran déclaratif reste dessous dans les deux cas. */
    readonly vueGraphiqueOuverte = signal(false);
    readonly colonnes = signal<ColonneExtraction[]>([]);
    readonly filtres = signal<FiltreExtraction[]>([]);
    readonly fichiers = signal<FiltreFichierExtraction[]>([]);
    readonly mesures = signal<MesureExtraction[]>([]);
    readonly criteresEnAttente = signal<FiltreExtraction[]>([]);
    readonly dedoublonnage = signal<DedoublonnageExtraction>({ actif: false, cles: [], garder: 'premiere' });
    readonly dedoublonnerLignes = signal(false);
    readonly regrouper = signal(false);
    readonly typeJointure = signal<'left' | 'inner'>('left');
    readonly apercuRapide = signal(false);
    readonly routesParDefaut = signal<Record<string, string>>({});
    // ---- plan de travail : outil ouvert, panneau d'ajout, résumé ----
    readonly outil = signal<'' | 'parametrages' | 'objet' | 'guide'>('');
    readonly ajoutOuvert = signal(true);
    readonly modeAjout = signal<ModeAjout>('colonne');
    readonly objetCharge = signal('');
    readonly ongletsAjout = ONGLETS_AJOUT;
    readonly sqlVisible = signal(false);
    readonly sqlAffiche = signal('');
    readonly sqlPersonnaliseActif = signal(false);

    // ---- lignes d'ajout ----
    readonly ajoutTableId = signal('');
    readonly ajoutRoute = signal('');
    readonly ajoutColonne = signal('');
    readonly choixMultipleOuvert = signal(false);
    readonly rechercheColonnes = signal('');
    readonly colonnesCochees = signal<string[]>([]);
    readonly filtreTableId = signal('');
    readonly filtreRoute = signal('');
    readonly filtreColonne = signal('');
    readonly filtreOperateur = signal<OperateurFiltre>('=');
    readonly filtreValeur = signal('');
    readonly filtreValeur2 = signal('');
    readonly valeursSuggerees = signal<ValeurSuggeree[]>([]);
    readonly critereTableId = signal('');
    readonly critereRoute = signal('');
    readonly critereColonne = signal('');
    readonly critereOperateur = signal<OperateurFiltre>('=');
    readonly critereValeur = signal('');
    readonly mesureFonction = signal<FonctionMesure>('count');
    readonly mesureTableId = signal('');
    readonly mesureRoute = signal('');
    readonly mesureColonne = signal('');
    readonly modeleChoisi = signal('');
    readonly objetChoisi = signal('');
    readonly ajouterCommeSource = signal(false);
    readonly nomSourceProduite = signal('');

    // ---- résultats ----
    readonly apercu = signal<ApercuExtraction | null>(null);
    readonly total = signal<number | null>(null);
    readonly bilan = signal<BilanExtraction | null>(null);
    /** Ce que les tables liées font au nombre de lignes ; rempli par le contrôle, et avant chaque aperçu. */
    readonly bilanJointures = signal<BilanDesJointures | null>(null);
    readonly erreur = signal('');
    readonly enCours = signal(false);

    /** La zone de sortie, sous le plan de travail : on y amène l'utilisateur après chaque vérification. */
    private readonly zoneSortie = viewChild<ElementRef<HTMLElement>>('zoneSortie');
    readonly deuxValeurs = OPERATEUR_DEUX_VALEURS;
    readonly lignesApercuRapide = LIGNES_APERCU_RAPIDE;
    readonly fonctionsMesure = Object.entries(FONCTIONS_MESURE) as [FonctionMesure, string][];
    readonly cleChemin = cleChemin;

    readonly operateurs = computed(() => Object.entries(this.vocabulaire()?.operateurs || {}) as [OperateurFiltre, string][]);
    readonly transformations = computed(() => Object.entries(this.vocabulaire()?.transformations || {}) as [Transformation, string][]);
    readonly agregats = computed(() => Object.entries(this.vocabulaire()?.agregats || {}) as [Agregat, string][]);
    readonly modesSynthese = computed(() => Object.entries(this.vocabulaire()?.modesSynthese || {}) as [ModeSynthese, string][]);

    /** Les tables que l'on peut atteindre depuis la table de départ, la table de départ comprise. */
    readonly tablesAtteignables = computed(() => (this.baseId() ? tablesAccessibles(this.baseId(), this.relations()) : []));
    /** Tous les chemins vers chaque table atteignable : c'est la matière du sélecteur « via ». */
    readonly cheminsParTable = computed(() => {
        const parTable = new Map<string, Chemin[]>();
        for (const tableId of this.tablesAtteignables()) parTable.set(tableId, cheminsVers(this.baseId(), tableId, this.relations()));
        return parTable;
    });
    /** Les tables reliées de plusieurs façons : celles pour lesquelles il faut choisir un lien. */
    readonly tablesAmbigues = computed(() => {
        const ambigues: { id: string; chemins: Chemin[] }[] = [];
        for (const [tableId, chemins] of this.cheminsParTable()) if (chemins.length > 1) ambigues.push({ id: tableId, chemins });
        return ambigues;
    });
    readonly prete = computed(
        () => !!this.baseId() && (this.colonnes().length > 0 || this.mesures().length > 0 || this.sqlPersonnaliseActif())
    );
    readonly dedoublonnageActif = computed(() => this.dedoublonnage().actif);
    readonly cleActive = computed(() => this.dedoublonnage().actif && !this.regrouper());
    /** Les colonnes proposées dans le panneau « Plusieurs colonnes… », filtrées par la recherche. */
    readonly colonnesAChoisir = computed(() => {
        const recherche = this.rechercheColonnes().trim().toLowerCase();
        return this.colonnesDe(this.ajoutTableId()).filter(colonne => !recherche || colonne.toLowerCase().includes(recherche));
    });

    constructor() {
        this.charger();
    }

    private async charger(): Promise<void> {
        try {
            const [sources, relations, vocabulaire, modeles, objets] = await Promise.all([
                this.api.sourcesEtJeux(),
                this.api.relations(),
                this.api.vocabulaireExtraction(),
                this.api.modelesExtraction(),
                this.api.objetsMetier().catch(() => [] as ObjetMetier[])
            ]);
            this.sources.set(sources);
            this.relations.set(relations);
            this.vocabulaire.set(vocabulaire);
            this.modeles.set(modeles);
            this.objetsMetier.set(objets);
            this.modeleChoisi.set(modeles[0]?.id || '');
            this.objetChoisi.set(objets[0]?.id || '');
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    /** Un seul outil ouvert à la fois : le rappuyer le referme. */
    basculerOutil(nom: 'parametrages' | 'objet' | 'guide'): void {
        this.outil.update(courant => (courant === nom ? '' : nom));
    }
    basculerAjout(): void {
        this.ajoutOuvert.update(ouvert => !ouvert);
    }

    /** Le résumé du bandeau : d'un coup d'œil, ce que fait l'extraction en cours. */
    readonly resume = computed<{ texte: string; alerte: boolean }[]>(() => {
        const puces: { texte: string; alerte: boolean }[] = [];
        if (this.objetCharge()) puces.push({ texte: `🏛️ objet ${this.objetCharge()}`, alerte: false });
        puces.push({ texte: `${this.colonnes().length} colonne(s)`, alerte: !this.colonnes().length });
        puces.push({ texte: `${this.filtres().length} filtre(s)`, alerte: false });
        for (const fichier of this.fichiers())
            puces.push({ texte: `📄 ${fichier.lignes.length} valeur(s) de « ${fichier.nom} »`, alerte: false });
        if (this.dedoublonnage().actif) puces.push({ texte: `🎯 dédoublonnage (${this.dedoublonnage().cles.length} clé)`, alerte: false });
        if (this.regrouper()) puces.push({ texte: `🧮 regroupement · ${this.mesures().length} agrégat(s)`, alerte: false });
        const jointure = this.typeJointure() === 'inner' ? 'intersection' : 'conserver tout';
        puces.push({ texte: jointure + (this.apercuRapide() ? ` · ${LIGNES_APERCU_RAPIDE} lignes` : ''), alerte: false });
        if (this.sqlPersonnaliseActif()) puces.push({ texte: '📝 SQL personnalisé', alerte: true });
        return puces;
    });

    nomDe(tableId: string): string {
        return this.sources().find(source => source.id === tableId)?.name || tableId;
    }
    colonnesDe(tableId: string): string[] {
        return this.sources().find(source => source.id === tableId)?.headers || [];
    }
    /** Identifiant d'une table depuis son nom : les liens du modèle désignent leurs tables ainsi. */
    idDeLaTable(nomTable: string): string | undefined {
        return this.sources().find(source => source.name === nomTable)?.id;
    }
    /** Le plus court chemin vers une table, quand rien ne l'a encore demandée ; vide si elle est hors de portée. */
    private cheminDeSecours(tableId: string): Chemin[] {
        const chemins = this.cheminsParTable().get(tableId) || [];
        return chemins.length ? [chemins[0]] : [];
    }
    libelle(chemin: Chemin): string {
        return libelleChemin(chemin, tableId => this.nomDe(tableId));
    }
    libelleGenre(genre: NonNullable<ColonneExtraction['genre']>): string {
        return this.vocabulaire()?.genresColonne[genre] || genre;
    }
    libelleFonction(fonction: FonctionMesure): string {
        return FONCTIONS_MESURE[fonction].split(' (')[0];
    }
    couleurCompletude(part: number): string {
        return part >= 0.95 ? 'var(--succes)' : part >= 0.7 ? 'var(--alerte)' : 'var(--erreur)';
    }

    /** Le chemin d'un élément, retrouvé à partir de sa table et de sa route. */
    cheminDe(tableId: string, route = ''): Chemin {
        const chemins = this.cheminsParTable().get(tableId) || [];
        return cheminParCle(chemins, route) || chemins[0] || [];
    }
    /** Suffixe « via … » affiché quand l'élément n'emprunte pas le premier chemin de sa table. */
    private suffixeVia(tableId: string, route = ''): string {
        const chemins = this.cheminsParTable().get(tableId) || [];
        if (chemins.length < 2) return '';
        if (route === ROUTE_INDIFFERENTE) return " (via l'un ou l'autre lien)";
        return ` (via ${this.libelle(this.cheminDe(tableId, route))})`;
    }
    libelleColonne(colonne: ColonneExtraction): string {
        const via = this.suffixeVia(colonne.tableId, colonne.route);
        if (colonne.genre === 'calcul') return 'formule' + via;
        if (colonne.genre === 'synthese') return `${this.nomDe(colonne.synthese!.tableId)} — ${colonne.synthese!.mode}` + via;
        if (colonne.genre === 'hierarchie') return `${this.nomDe(colonne.tableId)} — hiérarchie` + via;
        return `${this.nomDe(colonne.tableId)}.${colonne.nomColonne}` + via;
    }
    libelleFiltre(filtre: FiltreExtraction): string {
        const operateur = this.vocabulaire()?.operateurs[filtre.op] || filtre.op;
        const valeur = this.sansValeur(filtre.op) ? '' : ` « ${filtre.valeur || ''} »`;
        return `${this.nomDe(filtre.tableId)}.${filtre.nomColonne}${this.suffixeVia(filtre.tableId, filtre.route)} ${operateur}${valeur}`;
    }
    libelleCriteres(criteres: FiltreExtraction[]): string {
        return criteres.map(critere => this.libelleFiltre(critere)).join(' ET ');
    }
    libelleCibleMesure(mesure: MesureExtraction): string {
        if (mesure.fn === 'count' && !mesure.nomColonne) return 'toutes les lignes';
        return `${this.nomDe(mesure.tableId)}.${mesure.nomColonne}${this.suffixeVia(mesure.tableId, mesure.route)}`;
    }

    // ---- table de départ et liens par défaut ----
    choisirBase(tableId: string): void {
        this.baseId.set(tableId);
        this.objetCharge.set('');
        this.ajoutOuvert.set(true);
        this.modeAjout.set('colonne');
        this.colonnes.set([]);
        this.filtres.set([]);
        this.fichiers.set([]);
        this.mesures.set([]);
        this.criteresEnAttente.set([]);
        this.dedoublonnage.set({ actif: false, cles: [], garder: 'premiere' });
        this.apercu.set(null);
        this.total.set(null);
        this.bilan.set(null);
        this.bilanJointures.set(null);
        this.sqlPersonnaliseActif.set(false);
        for (const selecteur of [this.ajoutTableId, this.filtreTableId, this.critereTableId, this.mesureTableId]) selecteur.set(tableId);
        for (const selecteur of [this.ajoutRoute, this.filtreRoute, this.critereRoute, this.mesureRoute]) selecteur.set('');
        const premiere = this.colonnesDe(tableId)[0] || '';
        for (const selecteur of [this.ajoutColonne, this.filtreColonne, this.critereColonne, this.mesureColonne]) selecteur.set(premiere);
    }
    choisirLienParDefaut(tableId: string, route: string): void {
        this.routesParDefaut.update(defauts => ({ ...defauts, [tableId]: route }));
        if (this.ajoutTableId() === tableId) this.ajoutRoute.set(route);
    }

    // ---- colonnes en sortie ----
    ajouterColonne(): void {
        if (!this.ajoutColonne()) return;
        this.colonnes.update(liste => [
            ...liste,
            { tableId: this.ajoutTableId(), route: this.ajoutRoute(), nomColonne: this.ajoutColonne(), alias: '', transformation: 'none' }
        ]);
    }
    ajouterToutesLesColonnes(): void {
        for (const nomColonne of this.colonnesDe(this.ajoutTableId())) this.ajouterUneColonneNommee(nomColonne);
    }
    private ajouterUneColonneNommee(nomColonne: string): void {
        const dejaPresente = this.colonnes().some(
            colonne => colonne.tableId === this.ajoutTableId() && colonne.route === this.ajoutRoute() && colonne.nomColonne === nomColonne
        );
        if (dejaPresente) return;
        this.colonnes.update(liste => [
            ...liste,
            { tableId: this.ajoutTableId(), route: this.ajoutRoute(), nomColonne, alias: '', transformation: 'none' }
        ]);
    }
    basculerChoixMultiple(): void {
        this.choixMultipleOuvert.update(ouvert => !ouvert);
        this.colonnesCochees.set([]);
        this.rechercheColonnes.set('');
    }
    basculerCochee(nomColonne: string): void {
        this.colonnesCochees.update(liste =>
            liste.includes(nomColonne) ? liste.filter(candidat => candidat !== nomColonne) : [...liste, nomColonne]
        );
    }
    ajouterLesCochees(): void {
        for (const nomColonne of this.colonnesCochees()) this.ajouterUneColonneNommee(nomColonne);
        this.notifications.info(`${this.colonnesCochees().length} colonne(s) ajoutée(s).`);
        this.choixMultipleOuvert.set(false);
        this.colonnesCochees.set([]);
    }
    ajouterColonneAvancee(colonne: ColonneExtraction): void {
        this.colonnes.update(liste => [...liste, colonne]);
    }
    modifierColonne(index: number, changement: Partial<ColonneExtraction>): void {
        this.colonnes.update(liste => liste.map((colonne, position) => (position === index ? { ...colonne, ...changement } : colonne)));
    }
    retirerColonne(index: number): void {
        const partante = this.colonnes()[index];
        this.colonnes.update(liste => liste.filter((_, position) => position !== index));
        if (partante) this.oublierCle(partante);
    }

    // ---- dédoublonnage par clé fonctionnelle ----
    /**
     * La clé retenue est le nom en sortie : c'est lui que le serveur retrouve dans le résultat. Sans alias saisi,
     * il faut donc reproduire exactement le nom par défaut du serveur (voir aliasParDefaut, côté API) : le seul
     * nom de la colonne pour la table de départ, « table.colonne » ailleurs, et un nom dédié pour les colonnes
     * avancées.
     */
    private nomEnSortie(colonne: ColonneExtraction): string {
        if (colonne.alias?.trim()) return colonne.alias.trim();
        const nomCourt = (tableId: string) => this.nomDe(tableId).replace(/\.[^.]+$/, '');
        if (colonne.genre === 'calcul') return 'calcul';
        if (colonne.genre === 'synthese') return nomCourt(colonne.synthese?.tableId || colonne.tableId);
        if (colonne.genre === 'hierarchie') return nomCourt(colonne.tableId) + '_hier';
        return colonne.tableId === this.baseId() ? colonne.nomColonne : `${nomCourt(colonne.tableId)}.${colonne.nomColonne}`;
    }
    estCle(colonne: ColonneExtraction): boolean {
        return this.dedoublonnage().cles.includes(this.nomEnSortie(colonne));
    }
    basculerCle(colonne: ColonneExtraction): void {
        const nom = this.nomEnSortie(colonne);
        this.dedoublonnage.update(etat => ({
            ...etat,
            cles: etat.cles.includes(nom) ? etat.cles.filter(candidat => candidat !== nom) : [...etat.cles, nom]
        }));
    }
    private oublierCle(colonne: ColonneExtraction): void {
        const nom = this.nomEnSortie(colonne);
        this.dedoublonnage.update(etat => ({ ...etat, cles: etat.cles.filter(candidat => candidat !== nom) }));
    }
    basculerDedoublonnage(actif: boolean): void {
        this.dedoublonnage.update(etat => ({ ...etat, actif }));
    }
    choisirLigneGardee(garder: 'premiere' | 'derniere'): void {
        this.dedoublonnage.update(etat => ({ ...etat, garder }));
    }

    // ---- filtres ----
    ajouterFiltre(): void {
        if (!this.filtreColonne()) return;
        this.filtres.update(liste => [...liste, this.filtreSaisi(this.filtreOperateur(), this.filtreValeur(), this.filtreValeur2())]);
        this.filtreValeur.set('');
        this.filtreValeur2.set('');
    }
    private filtreSaisi(op: OperateurFiltre, valeur: string, valeur2 = ''): FiltreExtraction {
        return {
            tableId: this.filtreTableId(),
            route: this.filtreRoute(),
            nomColonne: this.filtreColonne(),
            op,
            valeur,
            valeur2,
            ...(op === 'list' ? { liste: [], exclure: false } : {})
        };
    }
    retirerFiltre(index: number): void {
        this.filtres.update(liste => liste.filter((_, position) => position !== index));
    }
    modifierFiltre(index: number, changement: Partial<FiltreExtraction>): void {
        this.filtres.update(liste => liste.map((filtre, position) => (position === index ? { ...filtre, ...changement } : filtre)));
    }

    // ---- V13 : la vue graphique écrit dans la même spécification que l'écran déclaratif ----

    /** Les cases du schéma : une par table atteinte par un chemin précis (la table de départ comprise). */
    readonly casesDuGraphe = computed(() =>
        this.baseId() ? casesDuGraphe(this.baseId(), this.cheminsParTable(), tableId => this.nomDe(tableId)) : []
    );
    /** Passée telle quelle à la vue graphique : elle y lit les colonnes de chaque table. */
    readonly colonnesDUneTable = (tableId: string): string[] => this.colonnesDe(tableId);

    /** Cocher une colonne l'ajoute pour ce chemin précis ; la décocher la retire. */
    basculerColonneDuGraphe(choix: { uneCase: CaseExtraction; colonne: string }): void {
        const index = this.colonnes().findIndex(
            candidate =>
                !candidate.genre &&
                candidate.tableId === choix.uneCase.tableId &&
                candidate.route === choix.uneCase.route &&
                candidate.nomColonne === choix.colonne
        );
        if (index >= 0) return this.retirerColonne(index);
        this.colonnes.update(liste => [
            ...liste,
            {
                tableId: choix.uneCase.tableId,
                route: choix.uneCase.route,
                nomColonne: choix.colonne,
                alias: '',
                transformation: 'none' as const
            }
        ]);
    }

    toutesLesColonnesDuGraphe(uneCase: CaseExtraction): void {
        for (const colonne of this.colonnesDe(uneCase.tableId))
            if (!this.colonneDejaChoisie(uneCase, colonne)) this.basculerColonneDuGraphe({ uneCase, colonne });
    }
    aucuneColonneDuGraphe(uneCase: CaseExtraction): void {
        this.colonnes.update(liste =>
            liste.filter(colonne => colonne.genre || colonne.tableId !== uneCase.tableId || colonne.route !== uneCase.route)
        );
    }
    private colonneDejaChoisie(uneCase: CaseExtraction, colonne: string): boolean {
        return this.colonnes().some(
            candidate =>
                !candidate.genre &&
                candidate.tableId === uneCase.tableId &&
                candidate.route === uneCase.route &&
                candidate.nomColonne === colonne
        );
    }

    /** ⛃ sur une colonne : un filtre vide y est posé, prêt à être renseigné sur la case même. */
    ajouterFiltreDepuisLeGraphe(choix: { uneCase: CaseExtraction; colonne: string }): void {
        this.filtres.update(liste => [
            ...liste,
            { tableId: choix.uneCase.tableId, route: choix.uneCase.route, nomColonne: choix.colonne, op: '=' as const, valeur: '' }
        ]);
    }

    /**
     * « Σ compter » : combien de lignes de cette table sont liées, une valeur par ligne de départ. La synthèse
     * s'ancre sur l'avant-dernière étape du chemin — la table qui porte la clé —, comme l'assistant le fait.
     */
    compterDepuisLeGraphe(uneCase: CaseExtraction): void {
        const chemin = cheminParCle(this.cheminsParTable().get(uneCase.tableId) || [], uneCase.cle);
        const derniere = chemin?.[chemin.length - 1];
        if (!derniere) return this.notifications.erreur(`Le chemin vers « ${uneCase.nomTable} » n'est plus connu.`);
        const ancrage = chemin
            .slice(0, -1)
            .map(etape => etape.relationId)
            .join('>');
        this.ajouterColonneAvancee({
            tableId: derniere.deTableId,
            route: ancrage,
            nomColonne: '',
            genre: 'synthese',
            alias: `${uneCase.nomTable} (nombre)`,
            transformation: 'none',
            synthese: {
                tableId: uneCase.tableId,
                deTableId: derniere.deTableId,
                deRoute: ancrage,
                deColonne: derniere.deColonne,
                versColonne: derniere.versColonne,
                // La clé du lien vaut aussi pour la synthèse : sans elle, on compterait tous les groupes.
                conditionsEnPlus: derniere.conditionsEnPlus.map(condition => ({
                    versColonne: condition.colonneJointe,
                    tableComparee: this.idDeLaTable(condition.tableComparee) || '',
                    routeComparee: '',
                    colonneComparee: condition.colonneComparee
                })),
                mode: 'count',
                nomColonne: '',
                n: 3
            }
        });
        this.notifications.info(`Nombre de « ${uneCase.nomTable} » par ligne de départ ajouté.`);
    }

    /** « ⭐ départ » : on repart de cette table, l'extraction est remise à plat. */
    repartirDepuisLeGraphe(uneCase: CaseExtraction): void {
        this.choisirBase(uneCase.tableId);
        this.notifications.info(`Table de départ : « ${uneCase.nomTable} ».`);
    }
    sansValeur(op: OperateurFiltre): boolean {
        return OPERATEURS_SANS_VALEUR.includes(op);
    }
    /** Propose les valeurs les plus fréquentes de la colonne filtrée, comme la liste déroulante du classique. */
    async proposerValeurs(): Promise<void> {
        if (!this.filtreColonne()) return;
        try {
            this.valeursSuggerees.set(await this.api.valeursColonne(this.filtreTableId(), this.filtreColonne(), this.filtreValeur()));
        } catch {
            this.valeursSuggerees.set([]);
        }
    }
    /** Lit la première colonne d'un fichier CSV / texte : une valeur par ligne (séparateur ; , tab ou |). */
    async chargerListe(filtre: FiltreExtraction, evenement: Event): Promise<void> {
        const champ = evenement.target as HTMLInputElement;
        const fichier = champ.files?.[0];
        if (!fichier) return;
        filtre.liste = valeursDeListe(await fichier.text());
        champ.value = '';
        this.notifications.info(`${filtre.liste.length} valeur(s) lue(s) dans « ${fichier.name} ».`);
    }
    collerListe(filtre: FiltreExtraction): void {
        const texte = prompt(
            'Collez la liste de valeurs (une par ligne, ou séparées par ; , ou tabulation) :',
            (filtre.liste || []).join('\n')
        );
        if (texte === null) return;
        filtre.liste = valeursDeListe(texte);
    }

    // ---- regroupement : mesures et critères ----
    ajouterCritereEnAttente(): void {
        if (!this.critereColonne()) return;
        this.criteresEnAttente.update(liste => [
            ...liste,
            {
                tableId: this.critereTableId(),
                route: this.critereRoute(),
                nomColonne: this.critereColonne(),
                op: this.critereOperateur(),
                valeur: this.critereValeur()
            }
        ]);
        this.critereValeur.set('');
    }
    retirerCritereEnAttente(index: number): void {
        this.criteresEnAttente.update(liste => liste.filter((_, position) => position !== index));
    }
    /** « Nombre de lignes » ne porte sur aucune colonne : les autres fonctions mesurent la colonne choisie. */
    ajouterMesure(): void {
        const sansColonne = this.mesureFonction() === 'count';
        const nom = this.libelleFonction(this.mesureFonction());
        this.mesures.update(liste => [
            ...liste,
            {
                fn: this.mesureFonction(),
                tableId: sansColonne ? '' : this.mesureTableId(),
                route: sansColonne ? '' : this.mesureRoute(),
                nomColonne: sansColonne ? '' : this.mesureColonne(),
                alias: this.nomLibreDeMesure(sansColonne ? nom : `${nom} ${this.mesureColonne()}`),
                criteres: this.criteresEnAttente()
            }
        ]);
        this.criteresEnAttente.set([]);
    }
    /** Deux mesures ne peuvent pas porter le même nom en sortie : on numérote à partir de la deuxième. */
    private nomLibreDeMesure(souhaite: string): string {
        const pris = this.mesures().map(mesure => mesure.alias);
        if (!pris.includes(souhaite)) return souhaite;
        let rang = 2;
        while (pris.includes(`${souhaite} ${rang}`)) rang++;
        return `${souhaite} ${rang}`;
    }
    retirerMesure(index: number): void {
        this.mesures.update(liste => liste.filter((_, position) => position !== index));
    }

    // ---- SQL affiché et SQL personnalisé ----
    async basculerSql(): Promise<void> {
        this.sqlVisible.update(visible => !visible);
        if (!this.sqlVisible()) return;
        if (!this.sqlPersonnaliseActif()) await this.rafraichirSql();
        this.montrerLaSortie();
    }
    private async rafraichirSql(): Promise<void> {
        try {
            this.sqlAffiche.set((await this.api.sqlExtraction(this.specification())).sql);
        } catch (erreur) {
            this.erreur.set((erreur as Error).message);
        }
    }
    basculerSqlPersonnalise(actif: boolean): void {
        this.sqlPersonnaliseActif.set(actif);
        if (!actif) this.rafraichirSql();
    }
    ecrireSql(sql: string): void {
        if (this.sqlPersonnaliseActif()) this.sqlAffiche.set(sql);
    }

    // ---- spécification envoyée au serveur ----
    /** Les chemins effectivement empruntés : ils déterminent les jointures à poser, et elles seules. */
    private cheminsUtilises(): Chemin[] {
        const criteres = this.mesures().flatMap(mesure => mesure.criteres);
        const correspondances = this.fichiers().flatMap(fichier => fichier.correspondances);
        const elements = [...this.colonnes(), ...this.filtres(), ...this.mesures(), ...criteres, ...correspondances];
        const chemins: Chemin[] = [];
        for (const element of elements) {
            if (!element.tableId) continue;
            // « Le lien renseigné, quel qu'il soit » a besoin de toutes les routes : le serveur les met en COALESCE.
            if (element.route === ROUTE_INDIFFERENTE) chemins.push(...(this.cheminsParTable().get(element.tableId) || []));
            else chemins.push(this.cheminDe(element.tableId, element.route));
        }
        // Les tables qu'une synthèse compare doivent être dans l'extraction : sa condition les y cherche.
        for (const colonne of this.colonnes())
            for (const condition of colonne.synthese?.conditionsEnPlus || [])
                if (condition.tableComparee) chemins.push(...this.cheminDeSecours(condition.tableComparee));
        return chemins;
    }
    specification(limite?: number): SpecificationExtraction {
        const limiteRetenue = limite ?? (this.apercuRapide() ? LIGNES_APERCU_RAPIDE : undefined);
        return {
            baseId: this.baseId(),
            jointures: planifierJointures(this.cheminsUtilises(), this.baseId(), this.relations(), nom => this.idDeLaTable(nom)),
            typeJointure: this.typeJointure(),
            colonnes: this.colonnes().map(colonne => this.colonnePourLeServeur(colonne)),
            filtres: this.filtres().filter(filtre => filtre.nomColonne),
            fichiers: this.fichiers().filter(fichier => fichier.correspondances.length),
            regrouper: this.regrouper(),
            mesures: this.regrouper() ? this.mesures() : [],
            dedoublonner: this.dedoublonnerLignes(),
            dedoublonnage: this.dedoublonnage(),
            tri: [],
            ...(limiteRetenue ? { limite: limiteRetenue } : {}),
            ...(this.sqlPersonnaliseActif() ? { sqlPersonnalise: this.sqlAffiche() } : {})
        };
    }
    /** Les champs vides sont omis : le serveur applique alors ses valeurs par défaut. */
    private colonnePourLeServeur(colonne: ColonneExtraction): ColonneExtraction {
        return {
            tableId: colonne.tableId,
            route: colonne.route || '',
            nomColonne: colonne.nomColonne,
            transformation: colonne.transformation,
            ...(colonne.genre && colonne.genre !== 'colonne' ? { genre: colonne.genre } : {}),
            ...(colonne.formule ? { formule: colonne.formule } : {}),
            ...(colonne.synthese ? { synthese: { ...colonne.synthese, n: Number(colonne.synthese.n) || 3 } } : {}),
            ...(colonne.hierarchie
                ? { hierarchie: { ...colonne.hierarchie, profondeur: Number(colonne.hierarchie.profondeur) || 5 } }
                : {}),
            ...(colonne.alias?.trim() ? { alias: colonne.alias.trim() } : {}),
            ...(this.regrouper() && colonne.agregat ? { agregat: colonne.agregat } : {})
        };
    }

    // ---- actions ----
    /** Amène l'utilisateur sous le plan de travail, là où s'affichent l'aperçu, le bilan et le SQL. */
    private montrerLaSortie(): void {
        setTimeout(() => this.zoneSortie()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    }
    async apercevoir(): Promise<void> {
        await this.executer(async () => {
            this.apercu.set(await this.api.apercuExtraction(this.specification(), this.apercuRapide() ? LIGNES_APERCU_RAPIDE : 200));
            if (this.sqlVisible() && !this.sqlPersonnaliseActif()) this.sqlAffiche.set(this.apercu()!.sql);
        });
        await this.prevenirSiCaMultiplie();
        this.montrerLaSortie();
    }
    /**
     * Le contrôle discret qui accompagne l'aperçu : on prévient sans qu'on le demande, parce que personne ne
     * pense à vérifier une multiplication qu'il ne soupçonne pas. Un contrôle qui échoue ne gâche pas l'aperçu.
     */
    private async prevenirSiCaMultiplie(): Promise<void> {
        const specification = this.specification();
        if (!specification.jointures?.length) return this.bilanJointures.set(null);
        try {
            const bilan = await this.api.controlerJointures(specification);
            this.bilanJointures.set(bilan.multiplie ? bilan : null);
        } catch {
            this.bilanJointures.set(null);
        }
    }
    /** Le contrôle demandé explicitement : il affiche son verdict même quand tout va bien, pour rassurer. */
    async controlerLesJointures(): Promise<void> {
        await this.executer(async () => this.bilanJointures.set(await this.api.controlerJointures(this.specification())));
        this.montrerLaSortie();
    }
    async compter(): Promise<void> {
        // Le serveur retire la limite pour compter : le total porte toujours sur l'ensemble du résultat.
        await this.executer(async () => this.total.set((await this.api.compterExtraction(this.specification())).total));
    }
    async bilanQualite(): Promise<void> {
        await this.executer(async () => this.bilan.set(await this.api.bilanExtraction(this.specification())));
        this.montrerLaSortie();
    }
    /** Génère le CSV et, si la case est cochée, enregistre aussi le résultat comme nouvelle source. */
    async exporter(): Promise<void> {
        await this.executer(async () => {
            const nom = this.nomDeSortie();
            const blob = await this.api.exporterExtractionCsv(this.specification(), nom);
            const lien = document.createElement('a');
            lien.href = URL.createObjectURL(blob);
            lien.download = nom + '.csv';
            lien.click();
            URL.revokeObjectURL(lien.href);
            this.notifications.succes('Export CSV téléchargé.');
            if (this.ajouterCommeSource()) await this.materialiser(nom);
        });
    }
    /**
     * Garde le résultat comme jeu temporaire : la requête construite est matérialisée dans une table de la
     * session, utilisable aussitôt dans Comparer, Qualité, Statistiques, Explorer — sans créer de source.
     */
    async garderCommeJeu(): Promise<void> {
        const nom = prompt('Nom du jeu temporaire :', this.nomDeSortie());
        if (!nom) return;
        await this.executer(async () => {
            const { sql } = await this.api.sqlExtraction(this.specification());
            const jeu = await this.api.creerJeu(sql, nom, 'extraction');
            this.notifications.succes(
                `Jeu « ${jeu.nom} » gardé : ${jeu.lignes.toLocaleString('fr-FR')} ligne(s), ${jeu.colonnes.length} colonne(s).`
            );
            this.sources.set(await this.api.sourcesEtJeux());
        });
    }

    private nomDeSortie(): string {
        return this.nomSourceProduite().trim() || this.nomDe(this.baseId()).replace(/\.[^.]+$/, '') + '_extraction';
    }
    private async materialiser(nom: string): Promise<void> {
        const resultat = await this.api.materialiserExtraction(this.specification(), nom);
        this.notifications.succes(
            `Source « ${resultat.nom} » enregistrée : ${resultat.lignes.toLocaleString('fr-FR')} ligne(s), ${resultat.colonnes.length} colonne(s).`
        );
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

    // ---- paramétrages enregistrés ----
    async enregistrerModele(): Promise<void> {
        const nom = prompt("Nom du paramétrage d'extraction :", this.nomDe(this.baseId()).replace(/\.[^.]+$/, ''));
        if (!nom) return;
        await this.ecrireModele(this.modeles().find(modele => modele.nom === nom)?.id || genererIdentifiant('ex_'), nom);
    }
    async renommerModele(): Promise<void> {
        const modele = this.modeles().find(candidat => candidat.id === this.modeleChoisi());
        if (!modele) return;
        const nom = prompt('Nouveau nom du paramétrage :', modele.nom);
        if (!nom || nom === modele.nom) return;
        await this.ecrireModele(modele.id, nom, modele.specification);
    }
    private async ecrireModele(id: string, nom: string, specification = this.specification()): Promise<void> {
        try {
            const modele = await this.api.enregistrerModeleExtraction(id, { nom, description: '', specification });
            this.modeles.update(liste =>
                [...liste.filter(candidat => candidat.id !== modele.id), modele].sort((premier, second) =>
                    premier.nom.localeCompare(second.nom, 'fr')
                )
            );
            this.modeleChoisi.set(modele.id);
            this.notifications.succes(`Paramétrage « ${nom} » enregistré.`);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
    async supprimerModele(): Promise<void> {
        const modele = this.modeles().find(candidat => candidat.id === this.modeleChoisi());
        if (!modele || !confirm(`Supprimer le paramétrage « ${modele.nom} » ?`)) return;
        try {
            await this.api.supprimerModeleExtraction(modele.id);
            this.modeles.update(liste => liste.filter(candidat => candidat.id !== modele.id));
            this.modeleChoisi.set(this.modeles()[0]?.id || '');
            this.notifications.succes(`Paramétrage « ${modele.nom} » supprimé.`);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
    chargerModele(id: string): void {
        const modele = this.modeles().find(candidat => candidat.id === id);
        if (!modele) return;
        const specification = modele.specification;
        this.choisirBase(specification.baseId);
        this.colonnes.set(specification.colonnes.map(colonne => ({ ...colonne, alias: colonne.alias || '' })));
        this.filtres.set(specification.filtres.map(filtre => ({ ...filtre })));
        this.fichiers.set((specification.fichiers || []).map(fichier => ({ ...fichier })));
        this.mesures.set((specification.mesures || []).map(mesure => ({ ...mesure })));
        this.typeJointure.set(specification.typeJointure);
        this.regrouper.set(specification.regrouper);
        this.dedoublonnerLignes.set(specification.dedoublonner);
        this.dedoublonnage.set(specification.dedoublonnage || { actif: false, cles: [], garder: 'premiere' });
        this.notifications.info(`Paramétrage « ${modele.nom} » chargé.`);
    }

    // ---- pilotage par un objet métier ----
    /** Table de départ = source maître de l'objet ; colonnes = attributs alimentés ; filtres = périmètres des facettes. */
    chargerObjetMetier(id: string): void {
        const objet = this.objetsMetier().find(candidat => candidat.id === id);
        if (!objet) return;
        const nomMaitre = (objet.sources.find(source => source.role === 'maitre') || objet.sources[0])?.table;
        const maitre = this.sources().find(source => source.name === nomMaitre);
        if (!maitre) {
            this.notifications.erreur(`L'objet « ${objet.name} » n'a pas de source maître chargée.`);
            return;
        }
        this.choisirBase(maitre.id);
        this.colonnes.set(this.colonnesDeLObjet(objet));
        this.filtres.set(
            filtresDesFacettes(objet, nom => this.sources().find(source => source.name === nom)?.id, this.tablesAtteignables())
        );
        this.objetCharge.set(objet.name);
        this.outil.set('');
        this.notifications.succes(
            `Extraction pré-remplie depuis « ${objet.name} » : ${this.colonnes().length} colonne(s), ${this.filtres().length} filtre(s).`
        );
    }
    /** Chaque attribut de l'objet devient une colonne, si sa table est atteignable depuis la table de départ. */
    private colonnesDeLObjet(objet: ObjetMetier): ColonneExtraction[] {
        const colonnes: ColonneExtraction[] = [];
        for (const attribut of objet.elements) {
            const correspondance = attribut.mappings.find(candidat => this.sources().some(source => source.name === candidat.table));
            if (!correspondance) continue;
            const tableId = this.sources().find(source => source.name === correspondance.table)!.id;
            if (!this.tablesAtteignables().includes(tableId)) continue;
            colonnes.push({
                tableId,
                route: cleChemin(this.cheminDe(tableId, this.routesParDefaut()[tableId] || '')),
                nomColonne: correspondance.col,
                alias: attribut.name,
                transformation: 'none'
            });
        }
        return colonnes;
    }
}
