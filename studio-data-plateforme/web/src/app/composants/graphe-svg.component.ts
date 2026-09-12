/**
 * Graphe SVG : dessine des nœuds reliés par des flèches, disposés en couches de gauche à droite
 * (même méthode que le moteur de l'application classique) :
 *   1. profondeur de chaque nœud par parcours en largeur depuis les nœuds sans entrant ;
 *   2. ordre barycentrique dans chaque colonne (quatre passes) pour limiter les croisements ;
 *   3. une colonne trop haute est repliée en sous-colonnes ; chaque colonne est centrée verticalement.
 * Déplacement (glisser le fond), zoom (molette), sélection d'un nœud ou d'un lien (clic) → événements.
 */
import { Component, ElementRef, computed, input, output, signal, viewChild } from '@angular/core';

export type NoeudDessine = { id: string; titre: string; detail?: string; couleur?: string; bordure?: string; selectionne?: boolean };
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

const ECART_COLONNES = 110;
const ECART_LIGNES = 30;
const LIGNES_MAXIMUM = 12;

/** Taille d'un nœud d'après la longueur de son titre et de son détail (bornée). */
function tailleNoeud(noeud: NoeudDessine): [number, number] {
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

/** Chemin d'une flèche : courbe horizontale entre deux colonnes, segment sinon. */
function cheminLien(depart: Place, arrivee: Place): { chemin: string; milieuX: number; milieuY: number } {
    if (arrivee.x - depart.x > (depart.largeur + arrivee.largeur) / 2 + 24) {
        const debut = { x: depart.x + depart.largeur / 2, y: depart.y };
        const fin = { x: arrivee.x - arrivee.largeur / 2, y: arrivee.y };
        const courbure = Math.max(40, (fin.x - debut.x) * 0.45);
        return {
            chemin: `M ${debut.x} ${debut.y} C ${debut.x + courbure} ${debut.y}, ${fin.x - courbure} ${fin.y}, ${fin.x} ${fin.y}`,
            milieuX: (debut.x + fin.x) / 2,
            milieuY: (debut.y + fin.y) / 2
        };
    }
    if (depart.x - arrivee.x > (depart.largeur + arrivee.largeur) / 2 + 24) {
        const debut = { x: depart.x - depart.largeur / 2, y: depart.y };
        const fin = { x: arrivee.x + arrivee.largeur / 2, y: arrivee.y };
        const courbure = Math.max(40, (debut.x - fin.x) * 0.45);
        return {
            chemin: `M ${debut.x} ${debut.y} C ${debut.x - courbure} ${debut.y}, ${fin.x + courbure} ${fin.y}, ${fin.x} ${fin.y}`,
            milieuX: (debut.x + fin.x) / 2,
            milieuY: (debut.y + fin.y) / 2
        };
    }
    const debut = { x: depart.x, y: depart.y + (arrivee.y > depart.y ? depart.hauteur / 2 : -depart.hauteur / 2) };
    const fin = { x: arrivee.x, y: arrivee.y + (arrivee.y > depart.y ? -arrivee.hauteur / 2 : arrivee.hauteur / 2) };
    return { chemin: `M ${debut.x} ${debut.y} L ${fin.x} ${fin.y}`, milieuX: (debut.x + fin.x) / 2, milieuY: (debut.y + fin.y) / 2 };
}

@Component({
    selector: 'app-graphe-svg',
    template: `
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
                @for (lien of liensPlaces(); track $index) {
                    <g class="lien" (click)="lienChoisi.emit(lien.lien); $event.stopPropagation()">
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
                        (click)="noeudChoisi.emit(noeud.noeud); $event.stopPropagation()"
                    >
                        <rect
                            [attr.x]="noeud.place.x - noeud.place.largeur / 2"
                            [attr.y]="noeud.place.y - noeud.place.hauteur / 2"
                            [attr.width]="noeud.place.largeur"
                            [attr.height]="noeud.place.hauteur"
                            rx="8"
                            [attr.fill]="noeud.noeud.couleur || 'var(--surface)'"
                            [attr.stroke]="noeud.noeud.bordure || 'var(--bordure)'"
                            [attr.stroke-width]="noeud.noeud.selectionne ? 3 : 1.5"
                        />
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
                    </g>
                }
            </g>
        </svg>
    `,
    styles: `
        :host {
            display: block;
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
        .lien {
            cursor: pointer;
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
    readonly noeudChoisi = output<NoeudDessine>();
    readonly lienChoisi = output<LienDessine>();
    private readonly zone = viewChild.required<ElementRef<SVGSVGElement>>('zone');

    readonly echelle = signal(1);
    readonly translationX = signal(30);
    readonly translationY = signal(30);
    private deplacement: { x: number; y: number; translationX: number; translationY: number } | null = null;

    readonly places = computed(() => disposer(this.noeuds(), this.liens()));
    readonly noeudsPlaces = computed(() => this.noeuds().map(noeud => ({ noeud, place: this.places()[noeud.id] })));
    readonly liensPlaces = computed<LienPlace[]>(() => {
        const places = this.places();
        // Quand trois liens ou plus portent le même libellé vers le même nœud, une seule étiquette est affichée.
        const compteur: Record<string, number> = {};
        for (const lien of this.liens())
            if (lien.libelle) compteur[lien.libelle + '¦' + lien.target] = (compteur[lien.libelle + '¦' + lien.target] || 0) + 1;
        const affiches = new Set<string>();
        return this.liens()
            .filter(lien => places[lien.source] && places[lien.target])
            .map(lien => {
                const trace = cheminLien(places[lien.source], places[lien.target]);
                let libelle = lien.libelle || '';
                const cle = libelle + '¦' + lien.target;
                if (libelle && compteur[cle] >= 3) {
                    libelle = affiches.has(cle) ? '' : `${libelle} ×${compteur[cle]}`;
                    affiches.add(cle);
                }
                return { lien, ...trace, libelle };
            });
    });

    zoomer(evenement: WheelEvent): void {
        evenement.preventDefault();
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

    commencerDeplacement(evenement: PointerEvent): void {
        this.deplacement = {
            x: evenement.clientX,
            y: evenement.clientY,
            translationX: this.translationX(),
            translationY: this.translationY()
        };
    }

    deplacer(evenement: PointerEvent): void {
        if (!this.deplacement) return;
        this.translationX.set(this.deplacement.translationX + evenement.clientX - this.deplacement.x);
        this.translationY.set(this.deplacement.translationY + evenement.clientY - this.deplacement.y);
    }

    finirDeplacement(): void {
        this.deplacement = null;
    }

    /** Ramène le graphe entier dans la zone visible. */
    ajuster(): void {
        const places = Object.values(this.places());
        if (!places.length) return;
        const largeurGraphe = Math.max(...places.map(place => place.x + place.largeur / 2)) + 20;
        const hauteurGraphe = Math.max(...places.map(place => place.y + place.hauteur / 2)) + 20;
        const rectangle = this.zone().nativeElement.getBoundingClientRect();
        const echelle = Math.min(1, rectangle.width / largeurGraphe, rectangle.height / hauteurGraphe);
        this.echelle.set(echelle);
        this.translationX.set(Math.max(10, (rectangle.width - largeurGraphe * echelle) / 2));
        this.translationY.set(Math.max(10, (rectangle.height - hauteurGraphe * echelle) / 2));
    }
}
