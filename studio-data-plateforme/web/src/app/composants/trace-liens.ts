/**
 * Tracé des liens d'un graphe — reprise de la V12.11 de l'application classique.
 *
 * Trois idées, qui règlent le défaut le plus visible des graphes : des liens qui se confondent.
 *
 *   1. Un point d'attache par lien. Les liens d'une même case ne partent plus tous de son centre : ils sont
 *      répartis sur son côté, dans l'ordre vertical de leurs destinations. Deux liens vers la même case
 *      arrivent donc sur deux points distincts.
 *   2. Un couloir par lien. Entre deux colonnes, chaque lien a sa propre verticale : les traits ne se
 *      superposent plus, même quand ils relient les mêmes hauteurs.
 *   3. Des angles droits aux coins arrondis, qui se lisent mieux qu'un faisceau de courbes — le tracé en
 *      courbes reste disponible, au choix.
 *
 * Fonctions pures : elles ne reçoivent que des places et rendent des chemins SVG.
 */

/** Où se trouve une case du graphe. */
export type Place = { x: number; y: number; largeur: number; hauteur: number };
/** Un lien à tracer, désigné par les identifiants de ses deux extrémités. */
export type LienATracer = { source: string; target: string };
/** Le chemin SVG d'un lien et le point où poser son étiquette. */
export type TraceLien = { chemin: string; milieuX: number; milieuY: number };

/** Rayon des coins arrondis du tracé à angles droits. */
const RAYON_COIN = 8;
/** Marge minimale entre le bord d'une case et le premier point d'attache. */
const MARGE_ATTACHE = 8;

/**
 * Répartit les points d'attache sur le côté des cases. Pour chaque case, les liens qui en partent sont
 * ordonnés par la hauteur de leur destination, et ceux qui y arrivent par la hauteur de leur origine :
 * les traits ne se croisent donc pas inutilement juste avant d'atteindre la case.
 *
 * Renvoie, pour chaque lien (dans l'ordre reçu), l'ordonnée de son départ et celle de son arrivée.
 */
export function pointsDAttache(liens: LienATracer[], places: Record<string, Place>): { yDepart: number; yArrivee: number }[] {
    const sortants = new Map<string, number[]>();
    const entrants = new Map<string, number[]>();
    liens.forEach((lien, index) => {
        if (!places[lien.source] || !places[lien.target]) return;
        sortants.set(lien.source, [...(sortants.get(lien.source) || []), index]);
        entrants.set(lien.target, [...(entrants.get(lien.target) || []), index]);
    });
    const attaches = liens.map(() => ({ yDepart: 0, yArrivee: 0 }));
    for (const [id, indices] of sortants) {
        const ordonnes = [...indices].sort((premier, second) => places[liens[premier].target].y - places[liens[second].target].y);
        ordonnes.forEach((index, rang) => (attaches[index].yDepart = ordonneeDAttache(places[id], rang, ordonnes.length)));
    }
    for (const [id, indices] of entrants) {
        const ordonnes = [...indices].sort((premier, second) => places[liens[premier].source].y - places[liens[second].source].y);
        ordonnes.forEach((index, rang) => (attaches[index].yArrivee = ordonneeDAttache(places[id], rang, ordonnes.length)));
    }
    return attaches;
}

/** L'ordonnée du n-ième point d'attache sur le côté d'une case : régulièrement espacés, jamais sur le bord. */
export function ordonneeDAttache(place: Place, rang: number, total: number): number {
    if (total <= 1) return place.y;
    const utile = Math.max(0, place.hauteur - 2 * MARGE_ATTACHE);
    const haut = place.y - utile / 2;
    return haut + (utile * rang) / (total - 1);
}

/**
 * L'abscisse du couloir d'un lien : entre les deux colonnes, chaque lien reçoit sa propre verticale.
 * Les couloirs sont répartis dans l'espace disponible, sans jamais coller aux cases.
 */
export function abscisseDuCouloir(xDepart: number, xArrivee: number, rang: number, total: number): number {
    const ecart = xArrivee - xDepart;
    if (total <= 1) return xDepart + ecart / 2;
    // On garde un quart de l'écart de chaque côté : les couloirs occupent la moitié centrale.
    const debut = xDepart + ecart * 0.25;
    return debut + (ecart * 0.5 * rang) / (total - 1);
}

/** Un coin arrondi entre deux segments perpendiculaires, dans le sens du parcours. */
function coin(xCoin: number, yCoin: number, versX: number, versY: number, rayon: number): string {
    const suivantX = xCoin + Math.sign(versX - xCoin) * rayon;
    const suivantY = yCoin + Math.sign(versY - yCoin) * rayon;
    return `Q ${xCoin} ${yCoin}, ${suivantX} ${suivantY}`;
}

/**
 * Tracé à angles droits : on sort de la case à l'horizontale, on emprunte le couloir à la verticale, puis on
 * entre dans la case d'arrivée à l'horizontale. Les deux coins sont arrondis.
 */
export function cheminAAnglesDroits(
    debut: { x: number; y: number },
    fin: { x: number; y: number },
    couloirX: number,
    rayon = RAYON_COIN
): TraceLien {
    const hauteurUtile = Math.abs(fin.y - debut.y);
    // Sur une hauteur trop faible, l'arrondi mangerait le trait : on relie alors tout droit.
    if (hauteurUtile < 2 * rayon) {
        return {
            chemin: `M ${debut.x} ${debut.y} L ${couloirX} ${debut.y} L ${couloirX} ${fin.y} L ${fin.x} ${fin.y}`,
            milieuX: couloirX,
            milieuY: (debut.y + fin.y) / 2
        };
    }
    const avantCoinHaut = couloirX - Math.sign(couloirX - debut.x) * rayon;
    const apresCoinBas = fin.y - Math.sign(fin.y - debut.y) * rayon;
    const chemin =
        `M ${debut.x} ${debut.y} L ${avantCoinHaut} ${debut.y} ` +
        coin(couloirX, debut.y, couloirX, fin.y, rayon) +
        ` L ${couloirX} ${apresCoinBas} ` +
        coin(couloirX, fin.y, fin.x, fin.y, rayon) +
        ` L ${fin.x} ${fin.y}`;
    return { chemin, milieuX: couloirX, milieuY: (debut.y + fin.y) / 2 };
}

/** Tracé en courbe (l'ancien dessin), conservé au choix : deux poignées horizontales. */
export function cheminCourbe(debut: { x: number; y: number }, fin: { x: number; y: number }): TraceLien {
    const courbure = Math.max(40, Math.abs(fin.x - debut.x) * 0.45) * Math.sign(fin.x - debut.x || 1);
    return {
        chemin: `M ${debut.x} ${debut.y} C ${debut.x + courbure} ${debut.y}, ${fin.x - courbure} ${fin.y}, ${fin.x} ${fin.y}`,
        milieuX: (debut.x + fin.x) / 2,
        milieuY: (debut.y + fin.y) / 2
    };
}

/** Vrai quand les deux cases sont sur des colonnes distinctes : le tracé horizontal a alors du sens. */
export function surDesColonnesDistinctes(depart: Place, arrivee: Place): boolean {
    return Math.abs(arrivee.x - depart.x) > (depart.largeur + arrivee.largeur) / 2 + 24;
}
