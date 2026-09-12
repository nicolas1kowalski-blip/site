/**
 * Graphique SVG simple, sans bibliothèque : barres, courbe ou camembert à partir de couples (libellé, valeur).
 * Suffit aux tuiles des tableaux de bord ; les couleurs suivent la palette de l'application.
 */
import { Component, computed, input } from '@angular/core';

export type PointGraphique = { d: string; v: number };
export type GenreGraphique = 'bar' | 'line' | 'pie';

const PALETTE = [
    '#4f46e5',
    '#10b981',
    '#f59e0b',
    '#8b5cf6',
    '#ec4899',
    '#0ea5e9',
    '#f43f5e',
    '#14b8a6',
    '#f97316',
    '#64748b',
    '#84cc16',
    '#a855f7'
];
const LARGEUR = 420;
const HAUTEUR = 220;
const MARGE = { haut: 10, bas: 46, gauche: 44, droite: 10 };

type Barre = { x: number; y: number; largeur: number; hauteur: number; couleur: string; libelle: string; valeur: number };
type Secteur = { chemin: string; couleur: string; libelle: string; valeur: number; part: number };

@Component({
    selector: 'app-graphique-svg',
    template: `
        <svg class="graphique" [attr.viewBox]="'0 0 ' + largeur + ' ' + hauteur" preserveAspectRatio="xMidYMid meet">
            @if (genre() === 'pie') {
                <g [attr.transform]="'translate(' + hauteur / 2 + ' ' + hauteur / 2 + ')'">
                    @for (secteur of secteurs(); track secteur.libelle) {
                        <path [attr.d]="secteur.chemin" [attr.fill]="secteur.couleur" stroke="var(--surface)" stroke-width="1">
                            <title>{{ secteur.libelle }} : {{ formater(secteur.valeur) }} ({{ (secteur.part * 100).toFixed(1) }} %)</title>
                        </path>
                    }
                </g>
                @for (secteur of secteurs(); track secteur.libelle; let index = $index) {
                    <g [attr.transform]="'translate(' + (hauteur + 16) + ' ' + (14 + index * 16) + ')'">
                        <rect width="10" height="10" [attr.fill]="secteur.couleur" rx="2" />
                        <text x="14" y="9" class="legende">{{ tronquer(secteur.libelle, 24) }} · {{ formater(secteur.valeur) }}</text>
                    </g>
                }
            } @else {
                <line
                    [attr.x1]="marge.gauche"
                    [attr.y1]="hauteur - marge.bas"
                    [attr.x2]="largeur - marge.droite"
                    [attr.y2]="hauteur - marge.bas"
                    stroke="var(--bordure)"
                />
                @for (graduation of graduations(); track graduation.valeur) {
                    <text [attr.x]="marge.gauche - 4" [attr.y]="graduation.y + 3" text-anchor="end" class="legende">
                        {{ formater(graduation.valeur) }}
                    </text>
                    <line
                        [attr.x1]="marge.gauche"
                        [attr.y1]="graduation.y"
                        [attr.x2]="largeur - marge.droite"
                        [attr.y2]="graduation.y"
                        stroke="var(--bordure)"
                        stroke-dasharray="2 3"
                    />
                }
                @if (genre() === 'bar') {
                    @for (barre of barres(); track barre.libelle) {
                        <rect
                            [attr.x]="barre.x"
                            [attr.y]="barre.y"
                            [attr.width]="barre.largeur"
                            [attr.height]="barre.hauteur"
                            [attr.fill]="barre.couleur"
                            rx="2"
                        >
                            <title>{{ barre.libelle }} : {{ formater(barre.valeur) }}</title>
                        </rect>
                    }
                } @else {
                    <polyline [attr.points]="ligne()" fill="none" stroke="#0284c7" stroke-width="2" />
                    @for (barre of barres(); track barre.libelle) {
                        <circle [attr.cx]="barre.x + barre.largeur / 2" [attr.cy]="barre.y" r="3" fill="#0284c7">
                            <title>{{ barre.libelle }} : {{ formater(barre.valeur) }}</title>
                        </circle>
                    }
                }
                @for (barre of barres(); track barre.libelle) {
                    <text
                        [attr.x]="barre.x + barre.largeur / 2"
                        [attr.y]="hauteur - marge.bas + 12"
                        text-anchor="end"
                        class="legende"
                        [attr.transform]="'rotate(-35 ' + (barre.x + barre.largeur / 2) + ' ' + (hauteur - marge.bas + 12) + ')'"
                    >
                        {{ tronquer(barre.libelle, 14) }}
                    </text>
                }
            }
        </svg>
    `,
    styles: `
        :host {
            display: block;
        }
        .graphique {
            width: 100%;
            height: auto;
        }
        .legende {
            font-size: 9px;
            fill: var(--texte-2);
        }
    `
})
export class GraphiqueSvgComponent {
    readonly points = input<PointGraphique[]>([]);
    readonly genre = input<GenreGraphique>('bar');
    readonly largeur = LARGEUR;
    readonly hauteur = HAUTEUR;
    readonly marge = MARGE;

    private readonly maximum = computed(() => Math.max(0, ...this.points().map(point => point.v)) || 1);

    readonly barres = computed<Barre[]>(() => {
        const points = this.points();
        const zoneLargeur = LARGEUR - MARGE.gauche - MARGE.droite;
        const zoneHauteur = HAUTEUR - MARGE.haut - MARGE.bas;
        const pas = points.length ? zoneLargeur / points.length : zoneLargeur;
        return points.map((point, index) => {
            const hauteurBarre = Math.max(0, (point.v / this.maximum()) * zoneHauteur);
            return {
                x: MARGE.gauche + index * pas + pas * 0.15,
                y: HAUTEUR - MARGE.bas - hauteurBarre,
                largeur: pas * 0.7,
                hauteur: hauteurBarre,
                couleur: PALETTE[index % PALETTE.length],
                libelle: point.d,
                valeur: point.v
            };
        });
    });

    readonly ligne = computed(() =>
        this.barres()
            .map(barre => `${barre.x + barre.largeur / 2},${barre.y}`)
            .join(' ')
    );

    readonly graduations = computed(() => {
        const zoneHauteur = HAUTEUR - MARGE.haut - MARGE.bas;
        return [0, 0.5, 1].map(part => ({ valeur: part * this.maximum(), y: HAUTEUR - MARGE.bas - part * zoneHauteur }));
    });

    readonly secteurs = computed<Secteur[]>(() => {
        const points = this.points();
        const total = points.reduce((somme, point) => somme + Math.max(0, point.v), 0) || 1;
        const rayon = HAUTEUR / 2 - 6;
        let angle = -Math.PI / 2;
        return points.map((point, index) => {
            const part = Math.max(0, point.v) / total;
            const fin = angle + part * 2 * Math.PI;
            const grandArc = part > 0.5 ? 1 : 0;
            const chemin =
                part >= 0.999
                    ? `M 0 ${-rayon} A ${rayon} ${rayon} 0 1 1 0 ${rayon} A ${rayon} ${rayon} 0 1 1 0 ${-rayon} Z`
                    : `M 0 0 L ${rayon * Math.cos(angle)} ${rayon * Math.sin(angle)} A ${rayon} ${rayon} 0 ${grandArc} 1 ${rayon * Math.cos(fin)} ${rayon * Math.sin(fin)} Z`;
            angle = fin;
            return { chemin, couleur: PALETTE[index % PALETTE.length], libelle: point.d, valeur: point.v, part };
        });
    });

    formater(valeur: number): string {
        return Number.isInteger(valeur) ? valeur.toLocaleString('fr-FR') : valeur.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    }

    tronquer(texte: string, longueur: number): string {
        return texte.length > longueur ? texte.slice(0, longueur - 1) + '…' : texte;
    }
}
