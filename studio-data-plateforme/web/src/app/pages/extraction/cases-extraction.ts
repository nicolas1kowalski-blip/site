/**
 * Les cases de la vue graphique de l'extraction — reprises de la V13 de l'application classique.
 *
 * L'écran déclaratif dit « ajoutez la colonne ville de la table clients, atteinte par tel lien ». La vue
 * graphique dit la même chose autrement : **une case par table atteinte par un chemin précis**, et l'on coche
 * la colonne directement sur la bonne case — le chemin se renseigne tout seul.
 *
 * C'est là tout l'intérêt : une table reliée de deux façons (le souscripteur et le bénéficiaire sont tous
 * deux des personnes) apparaît **deux fois**, une case par chemin. Sur l'écran déclaratif, il faut choisir le
 * lien dans un menu ; ici, on regarde le schéma et l'on coche au bon endroit.
 *
 * Les cases sont rangées par profondeur : la table de départ à gauche, puis ce qu'elle atteint en un lien,
 * puis en deux. Fonctions pures : rien ici ne connaît le DOM.
 */

/** Une case du graphe : une table, atteinte par un chemin donné. */
export type CaseExtraction = {
    /** Clé de la case : la clé du chemin (vide pour la table de départ). */
    cle: string;
    tableId: string;
    nomTable: string;
    /** Profondeur : 0 pour la table de départ, 1 pour ce qu'elle atteint directement… */
    profondeur: number;
    /** La case dont celle-ci descend ; vide pour la table de départ. */
    cleParent: string;
    /** Le chemin complet, tel qu'il s'écrit dans la colonne « route » d'une colonne choisie. */
    route: string;
    /** Par où l'on est passé, en clair : « via commandes.id_client → clients.id_client ». */
    via: string;
    /** Le dernier lien parcouru, pour l'étiquette de la flèche qui arrive sur la case. */
    libelleLien: string;
};

/** Place d'une case dans le dessin, et sa hauteur (calculée d'après ce qu'elle contient). */
export type PlaceDUneCase = { x: number; y: number; hauteur: number };

/** Largeur d'une case et écarts, repris du classique (NW, colGap). */
export const LARGEUR_CASE = 236;
export const ECART_COLONNES_CASES = 96;
const ECART_VERTICAL = 20;
const MARGE_HAUT = 34;
const MARGE_GAUCHE = 12;

/**
 * Ce que le filtre d'affichage laisse voir d'une case. Il ne change jamais ce qui est choisi : une colonne
 * déjà cochée reste cochée, même masquée.
 */
export type FiltreDAffichage = { recherche?: string; choisiesSeulement?: boolean; masquerLesVides?: boolean };

/** Les colonnes visibles d'une case, selon le filtre et ce qui est déjà choisi. */
export function colonnesVisibles(
    colonnes: string[],
    filtre: FiltreDAffichage,
    estChoisie: (colonne: string) => boolean,
    nomTable = ''
): string[] {
    const recherche = (filtre.recherche || '').trim().toLowerCase();
    // Une recherche qui désigne la table montre toutes ses colonnes : on cherchait la table, pas une colonne.
    const tableCherchee = !!recherche && nomTable.toLowerCase().includes(recherche);
    return colonnes.filter(colonne => {
        if (filtre.choisiesSeulement && !estChoisie(colonne)) return false;
        if (recherche && !tableCherchee && !colonne.toLowerCase().includes(recherche)) return false;
        return true;
    });
}

/**
 * Les cases qui restent à l'écran une fois le filtre appliqué. Une case gardée garde ses parents : sans eux,
 * le chemin ne se lirait plus de bout en bout. La table de départ ne disparaît jamais.
 */
export function casesVisibles(cases: CaseExtraction[], aQuelqueChoseAMontrer: (uneCase: CaseExtraction) => boolean): CaseExtraction[] {
    const gardees = new Set<string>();
    const parCle = new Map(cases.map(uneCase => [uneCase.cle, uneCase]));
    for (const uneCase of cases) {
        if (!uneCase.cleParent && uneCase.profondeur === 0) gardees.add(uneCase.cle);
        if (!aQuelqueChoseAMontrer(uneCase)) continue;
        let courante: CaseExtraction | undefined = uneCase;
        while (courante) {
            gardees.add(courante.cle);
            courante = courante.cleParent ? parCle.get(courante.cleParent) : undefined;
            if (courante && gardees.has(courante.cle)) break;
        }
    }
    return cases.filter(uneCase => gardees.has(uneCase.cle));
}

/**
 * Range les cases en colonnes de profondeur, de gauche à droite. La hauteur de chaque case est donnée par
 * l'écran (elle dépend du nombre de colonnes montrées) ; ce calcul ne fait que les empiler sans se croiser.
 */
export function rangerLesCases(cases: CaseExtraction[], hauteurDe: (uneCase: CaseExtraction) => number): Record<string, PlaceDUneCase> {
    const places: Record<string, PlaceDUneCase> = {};
    const suivantY = new Map<number, number>();
    for (const uneCase of cases) {
        const ordonnee = suivantY.get(uneCase.profondeur) ?? MARGE_HAUT;
        const hauteur = hauteurDe(uneCase);
        places[uneCase.cle] = {
            x: MARGE_GAUCHE + uneCase.profondeur * (LARGEUR_CASE + ECART_COLONNES_CASES),
            y: ordonnee,
            hauteur
        };
        suivantY.set(uneCase.profondeur, ordonnee + hauteur + ECART_VERTICAL);
    }
    return places;
}

/** La flèche qui relie une case à son parent : une courbe d'un bord à l'autre, et le milieu pour l'étiquette. */
export function flecheEntreCases(depart: PlaceDUneCase, arrivee: PlaceDUneCase): { chemin: string; milieuX: number; milieuY: number } {
    const xDepart = depart.x + LARGEUR_CASE;
    const yDepart = depart.y + 16;
    const xArrivee = arrivee.x;
    const yArrivee = arrivee.y + 16;
    const milieuX = (xDepart + xArrivee) / 2;
    return {
        chemin: `M ${xDepart} ${yDepart} C ${milieuX} ${yDepart} ${milieuX} ${yArrivee} ${xArrivee} ${yArrivee}`,
        milieuX,
        milieuY: (yDepart + yArrivee) / 2
    };
}
