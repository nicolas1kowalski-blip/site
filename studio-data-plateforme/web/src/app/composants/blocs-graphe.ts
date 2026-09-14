/**
 * Les blocs du graphe, façon V13 — et le rangement par domaine.
 *
 * Dans l'application classique, une table du modèle de données n'est pas une boîte avec son nom : c'est un
 * **bloc**, en-tête coloré par domaine, puis une ligne par colonne, avec ce qui compte marqué en tête :
 *
 *   🔑 la clé de la table · 🔐 une clé étrangère · 🔗 une colonne qui sert à une jointure · · les autres
 *
 * Les blocs d'un même domaine sont rangés côte à côte dans une **zone** encadrée qui porte le nom du
 * domaine : d'un coup d'œil, on voit de quoi le système est fait avant de lire quoi que ce soit.
 *
 * Tout est calculé ici, sans DOM : le composant SVG se contente de dessiner ce que ces fonctions décident.
 */

/** Les huit couleurs de domaine de l'application classique, dans l'ordre (THEME_PALETTE). */
export const PALETTE_DOMAINES = [
    { entete: '#e0e7ff', titre: '#312e81', trait: '#6366f1' },
    { entete: '#d1fae5', titre: '#065f46', trait: '#059669' },
    { entete: '#fef3c7', titre: '#92400e', trait: '#d97706' },
    { entete: '#fce7f3', titre: '#9d174d', trait: '#db2777' },
    { entete: '#cffafe', titre: '#155e75', trait: '#0891b2' },
    { entete: '#ede9fe', titre: '#5b21b6', trait: '#7c3aed' },
    { entete: '#ecfccb', titre: '#3f6212', trait: '#65a30d' },
    { entete: '#ffedd5', titre: '#9a3412', trait: '#ea580c' }
];

/** Ce que l'on montre à un domaine sans nom : le gris de l'application, pas une couleur de plus. */
export const SANS_DOMAINE = { entete: '#f1f5f9', titre: '#334155', trait: '#94a3b8' };

/** La couleur d'un domaine : la même d'un écran à l'autre, puisqu'elle suit l'ordre alphabétique. */
export function couleurDuDomaine(domaines: string[], domaine: string): (typeof PALETTE_DOMAINES)[number] {
    const rang = [...new Set(domaines.filter(Boolean))].sort().indexOf(domaine);
    if (rang < 0) return SANS_DOMAINE;
    return PALETTE_DOMAINES[rang % PALETTE_DOMAINES.length];
}

/** Ce qui distingue une colonne des autres : la clé, une clé étrangère, une colonne de jointure. */
export type RolesDeColonne = { cles?: string[]; clesEtrangeres?: string[]; jointures?: string[] };

/** Au-delà, le bloc deviendrait une liste : on dit combien de colonnes restent, et on s'arrête. */
export const LIGNES_BLOC_COMPACT = 7;
export const LIGNES_BLOC_SCHEMA = 40;

/**
 * Les lignes d'un bloc : une par colonne, précédée de son marqueur. Les colonnes qui portent quelque chose
 * (clé, clé étrangère, jointure) passent devant — c'est ce que l'on cherche en premier.
 */
export function lignesDuBloc(colonnes: string[], roles: RolesDeColonne = {}, maximum = LIGNES_BLOC_COMPACT): string[] {
    const cles = new Set(roles.cles || []);
    const etrangeres = new Set(roles.clesEtrangeres || []);
    const jointures = new Set(roles.jointures || []);
    const marque = (colonne: string) =>
        cles.has(colonne) ? '🔑 ' : etrangeres.has(colonne) ? '🔐 ' : jointures.has(colonne) ? '🔗 ' : '· ';
    const rang = (colonne: string) => (cles.has(colonne) ? 0 : etrangeres.has(colonne) ? 1 : jointures.has(colonne) ? 2 : 3);
    const ordonnees = [...colonnes].sort((premiere, seconde) => rang(premiere) - rang(seconde));
    const lignes = ordonnees.slice(0, maximum).map(colonne => marque(colonne) + colonne);
    if (ordonnees.length > maximum) lignes.push(`… ${ordonnees.length - maximum} autre(s) colonne(s)`);
    return lignes;
}

/** Hauteur de l'en-tête d'un bloc et d'une de ses lignes, en pixels (mêmes valeurs que le classique). */
export const HAUTEUR_ENTETE = 28;
export const HAUTEUR_LIGNE = 15;

/** La taille d'un bloc : assez large pour son titre et sa plus longue ligne, assez haut pour les contenir. */
export function tailleDuBloc(titre: string, lignes: string[]): [number, number] {
    const plusLongue = Math.max(titre.length + 2, 12, ...lignes.map(ligne => ligne.length));
    const largeur = Math.min(280, Math.max(150, plusLongue * 6.4 + 28));
    const hauteur = HAUTEUR_ENTETE + (lignes.length ? lignes.length * HAUTEUR_LIGNE + 12 : 10);
    return [largeur, hauteur];
}

/** Un bloc à placer : ce que le rangement par domaine a besoin de savoir. */
export type BlocAPlacer = { id: string; largeur: number; hauteur: number; domaine: string };
export type PlaceDUnBloc = { x: number; y: number };
/** Le cadre d'un domaine : ce qui est dessiné derrière ses blocs, avec son nom. */
export type ZoneDeDomaine = { domaine: string; x: number; y: number; largeur: number; hauteur: number };

/** Écarts du rangement par domaine, repris du classique : entre blocs, et entre domaines. */
const ECART_BLOCS_X = 70;
const ECART_BLOCS_Y = 80;
const ECART_DOMAINES = 160;
/** Marge du cadre autour des blocs, et place réservée au nom du domaine au-dessus. */
export const MARGE_ZONE = 22;
export const PLACE_DU_NOM = 16;

/**
 * Range les blocs domaine par domaine : chaque domaine forme un carré de blocs, les domaines se suivent de
 * gauche à droite puis de haut en bas. C'est le rangement de la V13 — il vaut mieux qu'une disposition en
 * couches dès que les domaines comptent plus que le sens des flèches.
 */
export function rangerParDomaine(blocs: BlocAPlacer[]): { places: Record<string, PlaceDUnBloc>; zones: ZoneDeDomaine[] } {
    const places: Record<string, PlaceDUnBloc> = {};
    const zones: ZoneDeDomaine[] = [];
    if (!blocs.length) return { places, zones };
    const groupes = new Map<string, BlocAPlacer[]>();
    for (const bloc of blocs) {
        const domaine = bloc.domaine || '(sans domaine)';
        if (!groupes.has(domaine)) groupes.set(domaine, []);
        groupes.get(domaine)!.push(bloc);
    }
    const domaines = [...groupes.keys()].sort();
    const paquets = domaines.map(domaine => {
        const groupe = groupes.get(domaine)!;
        const colonnes = Math.max(1, Math.ceil(Math.sqrt(groupe.length)));
        const rangees = Math.ceil(groupe.length / colonnes);
        const largeurMaximum = Math.max(160, ...groupe.map(bloc => bloc.largeur));
        const hauteurMaximum = Math.max(60, ...groupe.map(bloc => bloc.hauteur));
        return {
            domaine,
            blocs: groupe,
            colonnes,
            largeurMaximum,
            hauteurMaximum,
            largeur: colonnes * largeurMaximum + (colonnes - 1) * ECART_BLOCS_X,
            hauteur: rangees * hauteurMaximum + (rangees - 1) * ECART_BLOCS_Y
        };
    });
    const parRangee = Math.max(1, Math.round(Math.sqrt(paquets.length)));
    let xCourant = 0;
    let yCourant = 0;
    let hauteurDeLaRangee = 0;
    paquets.forEach((paquet, rang) => {
        if (rang > 0 && rang % parRangee === 0) {
            xCourant = 0;
            yCourant += hauteurDeLaRangee + ECART_DOMAINES;
            hauteurDeLaRangee = 0;
        }
        paquet.blocs.forEach((bloc, place) => {
            const rangee = Math.floor(place / paquet.colonnes);
            const colonne = place % paquet.colonnes;
            places[bloc.id] = {
                x: xCourant + colonne * (paquet.largeurMaximum + ECART_BLOCS_X) + paquet.largeurMaximum / 2,
                y: yCourant + rangee * (paquet.hauteurMaximum + ECART_BLOCS_Y) + paquet.hauteurMaximum / 2
            };
        });
        zones.push(cadreDuDomaine(paquet.domaine, paquet.blocs, places));
        xCourant += paquet.largeur + ECART_DOMAINES;
        hauteurDeLaRangee = Math.max(hauteurDeLaRangee, paquet.hauteur);
    });
    return { places, zones };
}

/** Le cadre qui entoure les blocs d'un domaine, avec la marge et la place du nom au-dessus. */
function cadreDuDomaine(domaine: string, blocs: BlocAPlacer[], places: Record<string, PlaceDUnBloc>): ZoneDeDomaine {
    let gauche = Infinity;
    let haut = Infinity;
    let droite = -Infinity;
    let bas = -Infinity;
    for (const bloc of blocs) {
        const place = places[bloc.id];
        gauche = Math.min(gauche, place.x - bloc.largeur / 2);
        haut = Math.min(haut, place.y - bloc.hauteur / 2);
        droite = Math.max(droite, place.x + bloc.largeur / 2);
        bas = Math.max(bas, place.y + bloc.hauteur / 2);
    }
    return {
        domaine,
        x: gauche - MARGE_ZONE,
        y: haut - MARGE_ZONE - PLACE_DU_NOM,
        largeur: droite - gauche + 2 * MARGE_ZONE,
        hauteur: bas - haut + 2 * MARGE_ZONE + PLACE_DU_NOM
    };
}

/** Un texte trop long pour la largeur du bloc est coupé, comme dans le classique (svgTrunc). */
export function texteCoupe(texte: string, largeur: number): string {
    const maximum = Math.max(6, Math.floor((largeur - 20) / 6.2));
    return texte.length > maximum ? texte.slice(0, maximum - 1) + '…' : texte;
}
