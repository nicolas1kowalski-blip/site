/**
 * Export d'un dessin SVG de l'application (graphe, graphique) en image PNG, sans bibliothèque : le SVG est cloné,
 * ses styles calculés (couleurs de thème, polices) sont copiés en attributs pour que l'image soit autonome, puis il
 * est peint sur un canevas à double résolution et téléchargé. Même principe que l'export image de l'application
 * classique.
 */
import { telechargerBlob } from './telechargement';

/** Propriétés de style à figer : ce que les variables CSS du thème décident à l'écran. */
const PROPRIETES_FIGEES = [
    'fill',
    'stroke',
    'stroke-width',
    'stroke-dasharray',
    'font-size',
    'font-weight',
    'font-family',
    'paint-order',
    'opacity'
];
const MARGE = 30;
const RESOLUTION = 2;

/** Copie les styles calculés de chaque élément du SVG d'origine sur son jumeau cloné. */
function figerLesStyles(original: SVGSVGElement, clone: SVGSVGElement): void {
    const elementsOrigine = [original, ...Array.from(original.querySelectorAll('*'))];
    const elementsClone = [clone, ...Array.from(clone.querySelectorAll('*'))];
    elementsOrigine.forEach((element, index) => {
        const styles = getComputedStyle(element);
        const jumeau = elementsClone[index];
        if (!jumeau) return;
        for (const propriete of PROPRIETES_FIGEES) {
            const valeur = styles.getPropertyValue(propriete);
            if (valeur && valeur !== 'none' && valeur !== 'normal') jumeau.setAttribute(propriete, valeur);
        }
    });
}

/** Cadre de l'image : d'après le contenu du groupe transformé (graphe) ou la boîte de vue (graphique). */
function cadrer(original: SVGSVGElement, clone: SVGSVGElement): { largeur: number; hauteur: number } {
    const groupe = original.querySelector(':scope > g[transform]') as SVGGElement | null;
    if (groupe) {
        const boite = groupe.getBBox();
        const groupeClone = clone.querySelector(':scope > g[transform]') as SVGGElement;
        groupeClone.setAttribute('transform', `translate(${MARGE - boite.x} ${MARGE - boite.y})`);
        const largeur = Math.ceil(boite.width + 2 * MARGE);
        const hauteur = Math.ceil(boite.height + 2 * MARGE);
        clone.removeAttribute('viewBox');
        return { largeur, hauteur };
    }
    const boiteDeVue = original.viewBox.baseVal;
    return { largeur: Math.ceil(boiteDeVue.width || original.clientWidth), hauteur: Math.ceil(boiteDeVue.height || original.clientHeight) };
}

/** Télécharge le SVG en PNG (fond opaque, double résolution). Rejette si le navigateur ne peut pas peindre le SVG. */
export function exporterSvgEnImage(original: SVGSVGElement, nomFichier: string): Promise<void> {
    const clone = original.cloneNode(true) as SVGSVGElement;
    figerLesStyles(original, clone);
    const { largeur, hauteur } = cadrer(original, clone);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(largeur));
    clone.setAttribute('height', String(hauteur));
    clone.removeAttribute('class');
    const fond = getComputedStyle(original).backgroundColor;
    const source = new XMLSerializer().serializeToString(clone);
    return new Promise((resoudre, rejeter) => {
        const image = new Image();
        image.onload = () => {
            const canevas = document.createElement('canvas');
            canevas.width = largeur * RESOLUTION;
            canevas.height = hauteur * RESOLUTION;
            const contexte = canevas.getContext('2d');
            if (!contexte) return rejeter(new Error('Canevas indisponible.'));
            contexte.fillStyle = fond && fond !== 'rgba(0, 0, 0, 0)' ? fond : '#ffffff';
            contexte.fillRect(0, 0, canevas.width, canevas.height);
            contexte.scale(RESOLUTION, RESOLUTION);
            contexte.drawImage(image, 0, 0);
            canevas.toBlob(blob => {
                if (!blob) return rejeter(new Error("L'image n'a pas pu être produite."));
                telechargerBlob(nomFichier, blob);
                resoudre();
            }, 'image/png');
        };
        image.onerror = () => rejeter(new Error("Le navigateur n'a pas pu peindre le dessin."));
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source);
    });
}
