/**
 * Graphe SVG : dessine des nœuds reliés par des flèches, disposés en couches de gauche à droite
 * (même méthode que le moteur de l'application classique) :
 *   1. profondeur de chaque nœud par parcours en largeur depuis les nœuds sans entrant ;
 *   2. ordre barycentrique dans chaque colonne (quatre passes) pour limiter les croisements ;
 *   3. une colonne trop haute est repliée en sous-colonnes ; chaque colonne est centrée verticalement.
 * Déplacement (glisser le fond), zoom (molette), sélection d'un nœud ou d'un lien (clic) → événements.
 * Barre d'outils (comme dans l'application classique) : zoom avant / arrière, recentrer, plein écran, export en image.
 */
import { Component, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { exporterSvgEnImage } from '../coeur/export-image';
import { NotificationsService } from '../coeur/notifications.service';
import { PreferencesService } from '../coeur/preferences.service';
import {
    HAUTEUR_ENTETE,
    HAUTEUR_LIGNE,
    MARGE_ZONE,
    PLACE_DU_NOM,
    ZoneDeDomaine,
    couleurDuDomaine,
    rangerParDomaine,
    tailleDuBloc,
    texteCoupe
} from './blocs-graphe';
import { abscisseDuCouloir, cheminAAnglesDroits, cheminCourbe, pointsDAttache, surDesColonnesDistinctes } from './trace-liens';

export type NoeudDessine = {
    id: string;
    titre: string;
    detail?: string;
    couleur?: string;
    bordure?: string;
    selectionne?: boolean;
    /** V13 : les lignes du bloc — une par colonne, avec son marqueur. Sans elles, le nœud reste une case. */
    lignes?: string[];
    /** Domaine du nœud : il décide de la couleur de l'en-tête et de la zone qui l'entoure. */
    domaine?: string;
    /** Couleurs du bloc, calculées par l'écran depuis le domaine (blocs-graphe.ts). */
    fondEnTete?: string;
    couleurTitre?: string;
};
export type LienDessine = {
    id?: string;
    source: string;
    target: string;
    libelle?: string;
    couleur?: string;
    pointille?: boolean;
    epaisseur?: number;
};

type Place = { x: number; y: number; largeur: number; hauteur: number };
type LienPlace = { lien: LienDessine; chemin: string; milieuX: number; milieuY: number; libelle: string };

/** En deçà, on a cliqué ; au-delà, on a déplacé. Sans ce seuil, un clic un peu tremblant déplacerait tout. */
const SEUIL_DE_DEPLACEMENT = 3;
const ECART_COLONNES = 110;
const ECART_LIGNES = 30;
const LIGNES_MAXIMUM = 12;

/** Tracé retenu pour les liens : à angles droits (défaut, V12.11) ou en courbes (dessin d'origine). */
export type TraceDesLiens = 'angles' | 'courbes';

/** Taille d'un nœud : un bloc (V13) se mesure à ses lignes, une case à son titre et à son détail. */
function tailleNoeud(noeud: NoeudDessine): [number, number] {
    if (noeud.lignes) return tailleDuBloc(noeud.titre, noeud.lignes);
    const longueur = Math.max(noeud.titre.length * 7.5, (noeud.detail || '').length * 6) + 20;
    return [Math.min(260, Math.max(120, longueur)), noeud.detail ? 46 : 30];
}

/** Profondeur (colonne) de chaque nœud : parcours en largeur depuis les nœuds sans lien entrant. */
function profondeurs(identifiants: string[], liens: LienDessine[]): Record<string, number> {
    const ensemble = new Set(identifiants);
    const successeurs: Record<string, string[]> = {};
    const entrants: Record<string, number> = {};
    for (const id of identifiants) {
        successeurs[id] = [];
        entrants[id] = 0;
    }
    for (const lien of liens)
        if (lien.source !== lien.target && ensemble.has(lien.source) && ensemble.has(lien.target)) {
            successeurs[lien.source].push(lien.target);
            entrants[lien.target]++;
        }
    const profondeur: Record<string, number> = {};
    const racines = identifiants.filter(id => !entrants[id]);
    const file = racines.length ? [...racines] : identifiants.slice(0, 1);
    for (const id of file) profondeur[id] = 0;
    while (file.length) {
        const courant = file.shift()!;
        const suivante = profondeur[courant] + 1;
        if (suivante >= identifiants.length) continue;
        for (const voisin of successeurs[courant])
            if (profondeur[voisin] === undefined || profondeur[voisin] < suivante) {
                profondeur[voisin] = suivante;
                file.push(voisin);
            }
    }
    for (const id of identifiants) if (profondeur[id] === undefined) profondeur[id] = 0;
    return profondeur;
}

/** Colonnes ordonnées par barycentre des voisins (quatre passes alternées avant / arrière). */
function ordonnerColonnes(colonnes: string[][], liens: LienDessine[]): string[][] {
    const predecesseurs: Record<string, string[]> = {};
    const successeurs: Record<string, string[]> = {};
    for (const lien of liens) {
        if (lien.source === lien.target) continue;
        (successeurs[lien.source] = successeurs[lien.source] || []).push(lien.target);
        (predecesseurs[lien.target] = predecesseurs[lien.target] || []).push(lien.source);
    }
    const position: Record<string, number> = {};
    const reindexer = () => colonnes.forEach(colonne => colonne.forEach((id, index) => (position[id] = index)));
    reindexer();
    for (let passe = 0; passe < 4; passe++) {
        const avant = passe % 2 === 0;
        for (const colonne of avant ? colonnes : [...colonnes].reverse()) {
            const barycentre = (id: string) => {
                const voisins = (avant ? predecesseurs : successeurs)[id] || [];
                return voisins.length
                    ? voisins.reduce((somme, voisin) => somme + (position[voisin] || 0), 0) / voisins.length
                    : position[id];
            };
            colonne.sort((premier, second) => barycentre(premier) - barycentre(second));
        }
        reindexer();
    }
    return colonnes;
}

/** Positions des nœuds : colonnes repliées en sous-colonnes si trop hautes, centrées verticalement. */
function disposer(noeuds: NoeudDessine[], liens: LienDessine[]): Record<string, Place> {
    const identifiants = noeuds.map(noeud => noeud.id);
    const tailles: Record<string, [number, number]> = {};
    for (const noeud of noeuds) tailles[noeud.id] = tailleNoeud(noeud);
    const profondeur = profondeurs(identifiants, liens);
    const parProfondeur: Record<number, string[]> = {};
    for (const id of identifiants) (parProfondeur[profondeur[id]] = parProfondeur[profondeur[id]] || []).push(id);
    const colonnes = ordonnerColonnes(
        Object.keys(parProfondeur)
            .map(Number)
            .sort((premier, second) => premier - second)
            .map(niveau => parProfondeur[niveau]),
        liens
    );
    const paquets = colonnes.map(colonne => {
        const nombreSousColonnes = Math.max(1, Math.ceil(colonne.length / LIGNES_MAXIMUM));
        const parSousColonne = Math.ceil(colonne.length / nombreSousColonnes);
        const sousColonnes: string[][] = [];
        for (let index = 0; index < nombreSousColonnes; index++)
            sousColonnes.push(colonne.slice(index * parSousColonne, (index + 1) * parSousColonne));
        const hauteurs = sousColonnes.map(sousColonne =>
            sousColonne.reduce((hauteur, id) => hauteur + tailles[id][1] + ECART_LIGNES, -ECART_LIGNES)
        );
        return { sousColonnes, hauteurs, hauteur: Math.max(...hauteurs) };
    });
    const hauteurTotale = Math.max(...paquets.map(paquet => paquet.hauteur));
    const places: Record<string, Place> = {};
    let abscisse = 0;
    for (const paquet of paquets) {
        let droite = abscisse;
        paquet.sousColonnes.forEach((sousColonne, index) => {
            const largeur = Math.max(...sousColonne.map(id => tailles[id][0]));
            let ordonnee = (hauteurTotale - paquet.hauteurs[index]) / 2;
            for (const id of sousColonne) {
                const [largeurNoeud, hauteurNoeud] = tailles[id];
                places[id] = { x: abscisse + largeur / 2, y: ordonnee + hauteurNoeud / 2, largeur: largeurNoeud, hauteur: hauteurNoeud };
                ordonnee += hauteurNoeud + ECART_LIGNES;
            }
            const derniere = index === paquet.sousColonnes.length - 1;
            abscisse += largeur + (derniere ? 0 : 24);
            droite = derniere ? abscisse : droite;
        });
        abscisse = droite + ECART_COLONNES;
    }
    return places;
}

@Component({
    selector: 'app-graphe-svg',
    template: `
        <div #conteneur class="conteneur">
            @if (outils()) {
                <div class="outils">
                    <button type="button" class="bouton petit" (click)="zoomerDe(1.25)" title="Zoom avant">+</button>
                    <button type="button" class="bouton petit" (click)="zoomerDe(0.8)" title="Zoom arrière">−</button>
                    <button type="button" class="bouton petit" (click)="ajuster()" title="Recentrer et réorganiser">⤢</button>
                    <button
                        type="button"
                        class="bouton petit"
                        name="ranger"
                        (click)="ranger()"
                        title="Ranger : oublier les blocs déplacés à la main et refaire la disposition"
                    >
                        ⌸
                    </button>
                    <button type="button" class="bouton petit" (click)="pleinEcran()" title="Plein écran (Échap pour sortir)">⛶</button>
                    <button
                        type="button"
                        class="bouton petit"
                        name="basculerTrace"
                        (click)="basculerTrace()"
                        [title]="trace() === 'angles' ? 'Passer aux liens courbes' : 'Passer aux liens à angles droits'"
                    >
                        {{ trace() === 'angles' ? '⌐' : '〜' }}
                    </button>
                    <button type="button" class="bouton petit" (click)="exporterImage()" title="Exporter l'image (PNG)">📷</button>
                </div>
            }
            <svg
                #zone
                class="graphe"
                [attr.height]="hauteur()"
                (wheel)="zoomer($event)"
                (pointerdown)="commencerDeplacement($event)"
                (pointermove)="deplacer($event)"
                (pointerup)="finirDeplacement()"
                (pointerleave)="finirDeplacement()"
            >
                <defs>
                    <marker id="fleche" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--texte-2)" />
                    </marker>
                </defs>
                <g [attr.transform]="'translate(' + translationX() + ' ' + translationY() + ') scale(' + echelle() + ')'">
                    <!-- V13 : chaque domaine a son cadre, dessiné derrière ses blocs et portant son nom. -->
                    @for (zone of zones(); track zone.domaine) {
                        <g class="zone" (pointerdown)="prendreUnDomaine($event, zone.domaine)">
                            <rect
                                [attr.x]="zone.x"
                                [attr.y]="zone.y"
                                [attr.width]="zone.largeur"
                                [attr.height]="zone.hauteur"
                                rx="12"
                                [attr.fill]="zone.trait"
                                fill-opacity="0.05"
                                [attr.stroke]="zone.trait"
                                stroke-dasharray="6 4"
                                stroke-width="1.5"
                            />
                            <text [attr.x]="zone.x + 8" [attr.y]="zone.y + 13" [attr.fill]="zone.trait" class="nom-zone">
                                🗂 {{ zone.domaine }}
                                <title>Glisser pour déplacer tout le domaine</title>
                            </text>
                        </g>
                    }
                    @for (lien of liensPlaces(); track $index) {
                        <g
                            class="lien"
                            [class.en-avant]="estEnAvant(lien.lien)"
                            [class.efface]="quelqueChoseEstSurvole() && !estEnAvant(lien.lien)"
                            (mouseenter)="lienSurvole.set(lien.lien)"
                            (mouseleave)="lienSurvole.set(null)"
                            (click)="lienChoisi.emit(lien.lien); $event.stopPropagation()"
                        >
                            <path
                                [attr.d]="lien.chemin"
                                fill="none"
                                [attr.stroke]="lien.lien.couleur || 'var(--texte-2)'"
                                [attr.stroke-width]="lien.lien.epaisseur || 1.5"
                                [attr.stroke-dasharray]="lien.lien.pointille ? '4 3' : null"
                                marker-end="url(#fleche)"
                            />
                            <path [attr.d]="lien.chemin" fill="none" stroke="transparent" stroke-width="12" />
                            @if (lien.libelle) {
                                <text [attr.x]="lien.milieuX" [attr.y]="lien.milieuY - 4" class="libelle-lien" text-anchor="middle">
                                    {{ lien.libelle }}
                                </text>
                            }
                        </g>
                    }
                    @for (noeud of noeudsPlaces(); track noeud.noeud.id) {
                        <g
                            class="noeud"
                            [class.selectionne]="noeud.noeud.selectionne"
                            (mouseenter)="noeudSurvole.set(noeud.noeud.id)"
                            (mouseleave)="noeudSurvole.set('')"
                            (pointerdown)="prendreUnNoeud($event, noeud.noeud.id)"
                            (click)="choisirNoeud(noeud.noeud); $event.stopPropagation()"
                        >
                            <rect
                                [attr.x]="noeud.place.x - noeud.place.largeur / 2"
                                [attr.y]="noeud.place.y - noeud.place.hauteur / 2"
                                [attr.width]="noeud.place.largeur"
                                [attr.height]="noeud.place.hauteur"
                                rx="8"
                                [attr.fill]="noeud.noeud.lignes ? '#fff' : noeud.noeud.couleur || 'var(--surface)'"
                                [attr.stroke]="noeud.noeud.bordure || 'var(--bordure)'"
                                [attr.stroke-width]="noeud.noeud.selectionne ? 3 : 1.5"
                            />
                            @if (noeud.noeud.lignes; as lignes) {
                                <!-- V13 : un bloc — en-tête coloré par domaine, puis une ligne par colonne. -->
                                <path
                                    [attr.d]="
                                        'M ' +
                                        (noeud.place.x - noeud.place.largeur / 2) +
                                        ' ' +
                                        (noeud.place.y - noeud.place.hauteur / 2 + hauteurEnTete) +
                                        ' h ' +
                                        noeud.place.largeur
                                    "
                                    [attr.stroke]="noeud.noeud.bordure || 'var(--bordure)'"
                                    stroke-opacity="0.5"
                                    fill="none"
                                />
                                <rect
                                    [attr.x]="noeud.place.x - noeud.place.largeur / 2"
                                    [attr.y]="noeud.place.y - noeud.place.hauteur / 2"
                                    [attr.width]="noeud.place.largeur"
                                    [attr.height]="hauteurEnTete"
                                    rx="8"
                                    [attr.fill]="noeud.noeud.fondEnTete || 'var(--surface-2)'"
                                />
                                <rect
                                    [attr.x]="noeud.place.x - noeud.place.largeur / 2"
                                    [attr.y]="noeud.place.y - noeud.place.hauteur / 2 + hauteurEnTete - 8"
                                    [attr.width]="noeud.place.largeur"
                                    height="8"
                                    [attr.fill]="noeud.noeud.fondEnTete || 'var(--surface-2)'"
                                />
                                <text
                                    [attr.x]="noeud.place.x - noeud.place.largeur / 2 + 10"
                                    [attr.y]="noeud.place.y - noeud.place.hauteur / 2 + hauteurEnTete / 2 + 4"
                                    [attr.fill]="noeud.noeud.couleurTitre || 'var(--texte)'"
                                    class="titre-bloc"
                                >
                                    {{ couper(noeud.noeud.titre, noeud.place.largeur) }}
                                </text>
                                @for (ligne of lignes; track $index; let rang = $index) {
                                    <text
                                        [attr.x]="noeud.place.x - noeud.place.largeur / 2 + 10"
                                        [attr.y]="noeud.place.y - noeud.place.hauteur / 2 + hauteurEnTete + 12 + rang * hauteurLigne"
                                        class="ligne-bloc"
                                        [class.reste]="ligne.startsWith('…')"
                                    >
                                        {{ couper(ligne, noeud.place.largeur) }}
                                    </text>
                                }
                            } @else {
                                <text
                                    [attr.x]="noeud.place.x"
                                    [attr.y]="noeud.place.y + (noeud.noeud.detail ? -3 : 5)"
                                    text-anchor="middle"
                                    class="titre"
                                >
                                    {{ noeud.noeud.titre }}
                                </text>
                                @if (noeud.noeud.detail) {
                                    <text [attr.x]="noeud.place.x" [attr.y]="noeud.place.y + 14" text-anchor="middle" class="detail">
                                        {{ noeud.noeud.detail }}
                                    </text>
                                }
                            }
                        </g>
                    }
                    <!-- Le lien mis en avant est redessiné par-dessus les cases : en SVG, c'est l'ordre qui fait le dessus. -->
                    @for (lien of liensEnAvant(); track $index) {
                        <path
                            class="lien-en-avant"
                            [attr.d]="lien.chemin"
                            fill="none"
                            [attr.stroke]="lien.lien.couleur || 'var(--accent)'"
                            stroke-width="3"
                            [attr.stroke-dasharray]="lien.lien.pointille ? '4 3' : null"
                            marker-end="url(#fleche)"
                        />
                    }
                </g>
            </svg>
        </div>
    `,
    styles: `
        :host {
            display: block;
        }
        .conteneur {
            position: relative;
        }
        .outils {
            position: absolute;
            top: 8px;
            right: 8px;
            display: flex;
            gap: 4px;
            z-index: 2;
        }
        .conteneur:fullscreen {
            background: var(--fond);
            padding: 12px;
        }
        .conteneur:fullscreen .graphe {
            height: calc(100vh - 24px);
        }
        .graphe {
            width: 100%;
            background: var(--surface-2);
            border: 1px solid var(--bordure);
            border-radius: var(--rayon);
            cursor: grab;
            touch-action: none;
            user-select: none;
        }
        .noeud {
            cursor: pointer;
        }
        .noeud .titre {
            font-size: 12px;
            font-weight: 700;
            fill: var(--texte);
        }
        .noeud .detail {
            font-size: 10px;
            fill: var(--texte-2);
        }
        /* V13 : le bloc — son titre dans l'en-tête, ses colonnes dessous. */
        .noeud,
        .zone {
            cursor: grab;
        }
        .noeud .titre-bloc {
            font-size: 12px;
            font-weight: 700;
        }
        .noeud .ligne-bloc {
            font-size: 10px;
            fill: #475569;
        }
        .noeud .ligne-bloc.reste {
            fill: #94a3b8;
        }
        .zone .nom-zone {
            font-size: 12px;
            font-weight: 700;
        }
        .lien {
            cursor: pointer;
        }
        /* Au survol, le lien concerné passe devant les cases et s'épaissit ; les autres s'effacent. */
        .lien.en-avant {
            filter: drop-shadow(0 0 2px var(--surface));
        }
        .lien.en-avant path {
            stroke-width: 3;
        }
        .lien-en-avant {
            pointer-events: none;
        }
        .lien.efface {
            opacity: 0.25;
        }
        .lien.en-avant .libelle-lien {
            font-weight: 700;
        }
        .libelle-lien {
            font-size: 10px;
            fill: var(--texte-2);
            paint-order: stroke;
            stroke: var(--surface-2);
            stroke-width: 3px;
        }
    `
})
export class GrapheSvgComponent {
    readonly noeuds = input<NoeudDessine[]>([]);
    readonly liens = input<LienDessine[]>([]);
    readonly hauteur = input(520);
    /** Barre d'outils (zoom, recentrer, plein écran, image) ; nom de fichier de l'image exportée. */
    readonly outils = input(true);
    readonly nomImage = input('graphe');
    readonly noeudChoisi = output<NoeudDessine>();
    readonly lienChoisi = output<LienDessine>();
    private readonly zone = viewChild.required<ElementRef<SVGSVGElement>>('zone');
    private readonly conteneur = viewChild.required<ElementRef<HTMLDivElement>>('conteneur');
    private readonly notifications = inject(NotificationsService);

    /** Ce qui est survolé : le lien lui-même, ou une case dont on veut voir tous les liens. */
    readonly lienSurvole = signal<LienDessine | null>(null);
    readonly noeudSurvole = signal('');
    readonly quelqueChoseEstSurvole = computed(() => !!this.lienSurvole() || !!this.noeudSurvole());

    /** Les liens à redessiner par-dessus les cases : ceux qui sont mis en avant. */
    readonly liensEnAvant = computed(() => this.liensPlaces().filter(place => this.estEnAvant(place.lien)));

    /** Un lien est mis en avant quand on le survole, ou quand on survole une case à laquelle il touche. */
    estEnAvant(lien: LienDessine): boolean {
        if (this.lienSurvole() === lien) return true;
        const noeud = this.noeudSurvole();
        return !!noeud && (lien.source === noeud || lien.target === noeud);
    }

    /** Dessin des liens, mémorisé : à angles droits (V12.11) ou en courbes. */
    readonly trace = signal<TraceDesLiens>('angles');
    private readonly preferences = inject(PreferencesService);
    readonly echelle = signal(1);
    readonly translationX = signal(30);
    readonly translationY = signal(30);
    private deplacement: { x: number; y: number; translationX: number; translationY: number } | null = null;
    /** Ce que l'on tient en ce moment : un bloc, ou le cadre d'un domaine (et tout ce qu'il contient). */
    private saisi: {
        quoi: 'noeud' | 'domaine';
        cible: string;
        depuis: { x: number; y: number };
        bouge: number;
        concernes?: string[];
    } | null = null;
    /** Vrai juste après un déplacement : le clic qui suit ne doit pas être pris pour une sélection. */
    private vientDeBouger = false;
    /** Positions choisies à la main : elles l'emportent sur le rangement automatique, et sont retenues. */
    private readonly deplacees = signal<Record<string, { x: number; y: number }>>({});

    /**
     * Rangement des nœuds : en couches de gauche à droite (le sens des flèches prime), ou domaine par
     * domaine comme la V13 le fait sur le modèle de données (les familles priment).
     */
    readonly disposition = input<'couches' | 'domaines'>('couches');

    readonly places = computed(() => {
        const rangees = this.placesRangees();
        const deplacees = this.deplacees();
        if (!Object.keys(deplacees).length) return rangees;
        // Une position choisie à la main l'emporte, mais garde la taille calculée du bloc.
        const places: Record<string, Place> = {};
        for (const [identifiant, place] of Object.entries(rangees))
            places[identifiant] = deplacees[identifiant] ? { ...place, ...deplacees[identifiant] } : place;
        return places;
    });

    /** Le rangement automatique, avant tout déplacement à la main. */
    private readonly placesRangees = computed(() => {
        if (this.disposition() !== 'domaines') return disposer(this.noeuds(), this.liens());
        const rangement = rangerParDomaine(
            this.noeuds().map(noeud => {
                const [largeur, hauteur] = tailleNoeud(noeud);
                return { id: noeud.id, largeur, hauteur, domaine: noeud.domaine || '' };
            })
        );
        const places: Record<string, Place> = {};
        for (const noeud of this.noeuds()) {
            const [largeur, hauteur] = tailleNoeud(noeud);
            const place = rangement.places[noeud.id];
            places[noeud.id] = { x: place.x, y: place.y, largeur, hauteur };
        }
        return places;
    });

    /**
     * Les cadres de domaine, dessinés derrière les blocs (vides hors du rangement par domaine). Ils sont
     * calculés sur les positions **effectives** : un bloc déplacé emmène le cadre de son domaine avec lui.
     */
    readonly zones = computed<(ZoneDeDomaine & { trait: string })[]>(() => {
        if (this.disposition() !== 'domaines') return [];
        const domaines = this.noeuds().map(noeud => noeud.domaine || '');
        const places = this.places();
        const cadres = new Map<string, ZoneDeDomaine>();
        for (const noeud of this.noeuds()) {
            const place = places[noeud.id];
            if (!place) continue;
            const domaine = noeud.domaine || '(sans domaine)';
            const cadre = cadres.get(domaine);
            const gauche = place.x - place.largeur / 2 - MARGE_ZONE;
            const haut = place.y - place.hauteur / 2 - MARGE_ZONE - PLACE_DU_NOM;
            const droite = place.x + place.largeur / 2 + MARGE_ZONE;
            const bas = place.y + place.hauteur / 2 + MARGE_ZONE;
            if (!cadre) {
                cadres.set(domaine, { domaine, x: gauche, y: haut, largeur: droite - gauche, hauteur: bas - haut });
                continue;
            }
            const nouveauGauche = Math.min(cadre.x, gauche);
            const nouveauHaut = Math.min(cadre.y, haut);
            cadre.largeur = Math.max(cadre.x + cadre.largeur, droite) - nouveauGauche;
            cadre.hauteur = Math.max(cadre.y + cadre.hauteur, bas) - nouveauHaut;
            cadre.x = nouveauGauche;
            cadre.y = nouveauHaut;
        }
        return [...cadres.values()].map(zone => ({ ...zone, trait: couleurDuDomaine(domaines, zone.domaine).trait }));
    });

    /** Hauteurs du bloc, pour le gabarit : en-tête et ligne. */
    readonly hauteurEnTete = HAUTEUR_ENTETE;
    readonly hauteurLigne = HAUTEUR_LIGNE;
    /** Un texte plus large que son bloc est coupé, comme dans le classique. */
    couper(texte: string, largeur: number): string {
        return texteCoupe(texte, largeur);
    }
    readonly noeudsPlaces = computed(() => this.noeuds().map(noeud => ({ noeud, place: this.places()[noeud.id] })));
    readonly liensPlaces = computed<LienPlace[]>(() => {
        const places = this.places();
        const traçables = this.liens().filter(lien => places[lien.source] && places[lien.target]);
        const attaches = pointsDAttache(traçables, places);
        const etiquette = this.etiqueteur(traçables);
        // Les liens qui relient le même couple de colonnes se partagent les couloirs entre ces colonnes.
        const rangDansLeCouple = new Map<string, number>();
        const totalParCouple = new Map<string, number>();
        traçables.forEach(lien => {
            const cle = this.coupleDeColonnes(places[lien.source], places[lien.target]);
            totalParCouple.set(cle, (totalParCouple.get(cle) || 0) + 1);
        });
        return traçables.map((lien, index) => {
            const cle = this.coupleDeColonnes(places[lien.source], places[lien.target]);
            const rang = rangDansLeCouple.get(cle) || 0;
            rangDansLeCouple.set(cle, rang + 1);
            const trace = this.tracerUnLien(places[lien.source], places[lien.target], attaches[index], rang, totalParCouple.get(cle) || 1);
            return { lien, ...trace, libelle: etiquette(lien) };
        });
    });

    /** Deux cases appartiennent au même « couple de colonnes » quand leurs abscisses sont les mêmes. */
    private coupleDeColonnes(depart: Place, arrivee: Place): string {
        return `${Math.round(depart.x)}→${Math.round(arrivee.x)}`;
    }

    /** Le tracé d'un lien, selon le dessin retenu : angles droits avec couloir, ou courbe. */
    private tracerUnLien(depart: Place, arrivee: Place, attache: { yDepart: number; yArrivee: number }, rang: number, total: number) {
        const versLaDroite = arrivee.x >= depart.x;
        const debut = { x: depart.x + (versLaDroite ? depart.largeur / 2 : -depart.largeur / 2), y: attache.yDepart };
        const fin = { x: arrivee.x + (versLaDroite ? -arrivee.largeur / 2 : arrivee.largeur / 2), y: attache.yArrivee };
        if (!surDesColonnesDistinctes(depart, arrivee)) {
            // Cases voisines : un segment direct de bord à bord reste le plus lisible.
            const versLeBas = arrivee.y > depart.y;
            const haut = { x: depart.x, y: depart.y + (versLeBas ? depart.hauteur / 2 : -depart.hauteur / 2) };
            const bas = { x: arrivee.x, y: arrivee.y + (versLeBas ? -arrivee.hauteur / 2 : arrivee.hauteur / 2) };
            return {
                chemin: `M ${haut.x} ${haut.y} L ${bas.x} ${bas.y}`,
                milieuX: (haut.x + bas.x) / 2,
                milieuY: (haut.y + bas.y) / 2
            };
        }
        if (this.trace() === 'courbes') return cheminCourbe(debut, fin);
        return cheminAAnglesDroits(debut, fin, abscisseDuCouloir(debut.x, fin.x, rang, total));
    }

    /**
     * Quand trois liens ou plus portent le même libellé vers le même nœud, une seule étiquette est affichée,
     * suivie du nombre : le graphe reste lisible sans perdre l'information.
     */
    private etiqueteur(liens: LienDessine[]): (lien: LienDessine) => string {
        const compteur: Record<string, number> = {};
        for (const lien of liens)
            if (lien.libelle) compteur[lien.libelle + '¦' + lien.target] = (compteur[lien.libelle + '¦' + lien.target] || 0) + 1;
        const affiches = new Set<string>();
        return lien => {
            const libelle = lien.libelle || '';
            const cle = libelle + '¦' + lien.target;
            if (!libelle || compteur[cle] < 3) return libelle;
            if (affiches.has(cle)) return '';
            affiches.add(cle);
            return `${libelle} ×${compteur[cle]}`;
        };
    }

    /** Vrai tant que la personne n'a ni déplacé ni zoomé : on peut alors recadrer sans la contrarier. */
    private cadrageLibre = true;
    /** La clé dont les positions retenues ont déjà été relues : on ne les relit pas à chaque image. */
    private cleDesPlacesLue = '';

    constructor() {
        if (this.preferences.lire('graphe.trace', 'angles') === 'courbes') this.trace.set('courbes');
        // Cadrage automatique à la première image, et à chaque changement de contenu tant que personne n'a
        // navigué à la main — c'est ce que fait le classique (svgFitAll / needFit). Sans cela, un graphe
        // rangé par domaine peut s'ouvrir hors de l'écran.
        effect(() => {
            // Les positions retenues ne peuvent être relues qu'ici : le nom du graphe, qui leur sert de clé,
            // est une entrée du composant et n'existe pas encore au moment de sa construction.
            const cle = this.clePlaces();
            if (cle !== this.cleDesPlacesLue) {
                this.cleDesPlacesLue = cle;
                this.relireLesPlaces();
            }
            const places = this.places();
            if (!this.cadrageLibre || !Object.keys(places).length) return;
            // Le cadrage a besoin des dimensions réelles du SVG : on attend la fin du rendu.
            setTimeout(() => this.ajuster(), 0);
        });
    }

    /** Change le dessin des liens et s'en souvient : c'est un goût, pas un réglage à refaire chaque fois. */
    basculerTrace(): void {
        this.trace.update(courant => (courant === 'angles' ? 'courbes' : 'angles'));
        this.preferences.ecrire('graphe.trace', this.trace());
    }

    zoomer(evenement: WheelEvent): void {
        evenement.preventDefault();
        this.cadrageLibre = false;
        const facteur = evenement.deltaY < 0 ? 1.1 : 1 / 1.1;
        const nouvelle = Math.min(3, Math.max(0.3, this.echelle() * facteur));
        const rectangle = this.zone().nativeElement.getBoundingClientRect();
        const sourisX = evenement.clientX - rectangle.left;
        const sourisY = evenement.clientY - rectangle.top;
        // Le point sous la souris reste fixe pendant le zoom.
        this.translationX.set(sourisX - ((sourisX - this.translationX()) * nouvelle) / this.echelle());
        this.translationY.set(sourisY - ((sourisY - this.translationY()) * nouvelle) / this.echelle());
        this.echelle.set(nouvelle);
    }

    /** Zoom par les boutons : le centre de la zone reste fixe. */
    zoomerDe(facteur: number): void {
        const nouvelle = Math.min(3, Math.max(0.3, this.echelle() * facteur));
        const rectangle = this.zone().nativeElement.getBoundingClientRect();
        const centreX = rectangle.width / 2;
        const centreY = rectangle.height / 2;
        this.translationX.set(centreX - ((centreX - this.translationX()) * nouvelle) / this.echelle());
        this.translationY.set(centreY - ((centreY - this.translationY()) * nouvelle) / this.echelle());
        this.echelle.set(nouvelle);
    }

    pleinEcran(): void {
        const conteneur = this.conteneur().nativeElement;
        if (document.fullscreenElement) void document.exitFullscreen();
        else void conteneur.requestFullscreen().then(() => setTimeout(() => this.ajuster(), 100));
    }

    async exporterImage(): Promise<void> {
        try {
            await exporterSvgEnImage(this.zone().nativeElement, `${this.nomImage()}.png`);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    commencerDeplacement(evenement: PointerEvent): void {
        this.cadrageLibre = false;
        this.deplacement = {
            x: evenement.clientX,
            y: evenement.clientY,
            translationX: this.translationX(),
            translationY: this.translationY()
        };
    }

    /**
     * Prendre un bloc et le poser ailleurs (V13). La position choisie l'emporte alors sur le rangement
     * automatique, et elle est retenue : on ne refait pas son schéma à chaque visite.
     */
    prendreUnNoeud(evenement: PointerEvent, identifiant: string): void {
        evenement.stopPropagation();
        evenement.preventDefault();
        this.cadrageLibre = false;
        this.saisi = { quoi: 'noeud', cible: identifiant, depuis: this.pointDuGraphe(evenement), bouge: 0 };
    }

    /** Prendre un domaine par son cadre : tous ses blocs suivent, leurs écarts inchangés. */
    prendreUnDomaine(evenement: PointerEvent, domaine: string): void {
        evenement.stopPropagation();
        evenement.preventDefault();
        this.cadrageLibre = false;
        const concernes = this.noeuds()
            .filter(noeud => (noeud.domaine || '(sans domaine)') === domaine)
            .map(noeud => noeud.id);
        this.saisi = { quoi: 'domaine', cible: domaine, depuis: this.pointDuGraphe(evenement), bouge: 0, concernes };
    }

    deplacer(evenement: PointerEvent): void {
        if (this.saisi) {
            const point = this.pointDuGraphe(evenement);
            const ecartX = point.x - this.saisi.depuis.x;
            const ecartY = point.y - this.saisi.depuis.y;
            this.saisi.depuis = point;
            this.saisi.bouge += Math.abs(ecartX) + Math.abs(ecartY);
            const concernes = this.saisi.quoi === 'noeud' ? [this.saisi.cible] : this.saisi.concernes || [];
            const places = this.places();
            this.deplacees.update(deplacees => {
                const suite = { ...deplacees };
                for (const identifiant of concernes) {
                    const place = suite[identifiant] || places[identifiant];
                    if (place) suite[identifiant] = { x: place.x + ecartX, y: place.y + ecartY };
                }
                return suite;
            });
            return;
        }
        if (!this.deplacement) return;
        this.translationX.set(this.deplacement.translationX + evenement.clientX - this.deplacement.x);
        this.translationY.set(this.deplacement.translationY + evenement.clientY - this.deplacement.y);
    }

    finirDeplacement(): void {
        if (this.saisi) {
            if (this.saisi.bouge > SEUIL_DE_DEPLACEMENT) this.retenirLesPlaces();
            // Un déplacement ne doit pas être compris comme un clic sur le bloc.
            this.vientDeBouger = this.saisi.bouge > SEUIL_DE_DEPLACEMENT;
            this.saisi = null;
        }
        this.deplacement = null;
    }

    /** Le point du dessin sous la souris, une fois le déplacement et le zoom défaits. */
    private pointDuGraphe(evenement: PointerEvent): { x: number; y: number } {
        const rectangle = this.zone().nativeElement.getBoundingClientRect();
        return {
            x: (evenement.clientX - rectangle.left - this.translationX()) / this.echelle(),
            y: (evenement.clientY - rectangle.top - this.translationY()) / this.echelle()
        };
    }

    /** Un clic qui suit un déplacement ne choisit pas le bloc : on venait de le poser, pas de le désigner. */
    choisirNoeud(noeud: NoeudDessine): void {
        if (this.vientDeBouger) {
            this.vientDeBouger = false;
            return;
        }
        this.noeudChoisi.emit(noeud);
    }

    /** Range de nouveau : les positions choisies à la main sont oubliées, le rangement reprend la main. */
    ranger(): void {
        this.deplacees.set({});
        this.preferences.oublier(this.clePlaces());
        this.cadrageLibre = true;
        setTimeout(() => this.ajuster(), 0);
    }

    private clePlaces(): string {
        return `graphe.places.${this.nomImage()}`;
    }

    /** Retient les positions choisies, pour que le schéma se retrouve tel qu'on l'a laissé. */
    private retenirLesPlaces(): void {
        this.preferences.ecrire(this.clePlaces(), JSON.stringify(this.deplacees()));
    }

    /** Relit les positions retenues ; une mémoire abîmée est ignorée plutôt que de casser l'écran. */
    private relireLesPlaces(): void {
        const retenu = this.preferences.lire(this.clePlaces());
        if (!retenu) return;
        try {
            const lues = JSON.parse(retenu) as Record<string, { x: number; y: number }>;
            if (lues && typeof lues === 'object') this.deplacees.set(lues);
        } catch {
            this.preferences.oublier(this.clePlaces());
        }
    }

    /** Ramène le graphe entier dans la zone visible. */
    /**
     * Cadre tout le dessin dans la fenêtre, comme le « Ranger » du classique (svgFitAll) : on mesure ce
     * qu'occupe réellement le graphe — un rangement par domaine ne commence pas forcément en haut à gauche —
     * puis on choisit l'échelle qui le fait tenir, sans descendre sous un douzième ni dépasser 1,4.
     */
    ajuster(): void {
        const places = Object.values(this.places());
        if (!places.length) return;
        const gauche = Math.min(...places.map(place => place.x - place.largeur / 2));
        const haut = Math.min(...places.map(place => place.y - place.hauteur / 2));
        const droite = Math.max(...places.map(place => place.x + place.largeur / 2));
        const bas = Math.max(...places.map(place => place.y + place.hauteur / 2));
        const largeurGraphe = droite - gauche;
        const hauteurGraphe = bas - haut;
        if (largeurGraphe <= 0 || hauteurGraphe <= 0) return;
        const rectangle = this.zone().nativeElement.getBoundingClientRect();
        const marge = 50;
        const echelle = Math.max(
            0.12,
            Math.min(1.4, (rectangle.width - 2 * marge) / largeurGraphe, (rectangle.height - 2 * marge) / hauteurGraphe)
        );
        this.echelle.set(echelle);
        this.translationX.set((rectangle.width - largeurGraphe * echelle) / 2 - gauche * echelle);
        this.translationY.set((rectangle.height - hauteurGraphe * echelle) / 2 - haut * echelle);
    }
}
