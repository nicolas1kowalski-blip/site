/**
 * Les chaînes complètes d'un parcours — reprises de la V12.10 de l'application classique.
 *
 * Un graphe remonté jusqu'au début est juste, mais il ne se lit pas d'un coup d'œil. Le panneau « Depuis le
 * début » dit la même chose en une ligne par chaîne : « Système tiers ⇢ Gestion des tiers ⇢ Personne ⇢
 * Contrat ». On lit d'abord, on regarde ensuite.
 *
 * Une chaîne part d'un élément que rien n'alimente — le début connu — et descend jusqu'à l'élément dont on
 * regarde le parcours. Les cycles sont coupés : un élément déjà dans la chaîne n'y est pas remis.
 *
 * Fonctions pures : aucun accès au DOM.
 */

/** Ce dont le calcul a besoin dans un nœud ; les écrans en mettent davantage. */
export type NoeudParcours = { id: string; titre: string; debut?: boolean; niveau?: number };
export type LienParcours = { source: string; target: string };
export type GrapheParcours = { noeuds: NoeudParcours[]; liens: LienParcours[] };

/** Au-delà, on ne détaille plus : la liste deviendrait aussi illisible que le graphe. */
export const CHAINES_MONTREES = 12;
/** Une chaîne plus longue que cela vient d'un référentiel en boucle, pas d'une vraie histoire. */
const LONGUEUR_MAXIMUM = 12;

/** Les nœuds qui n'ont pas d'alimentation dans ce graphe : les points de départ connus. */
export function pointsDeDepart(graphe: GrapheParcours): NoeudParcours[] {
    const alimentes = new Set(graphe.liens.map(lien => lien.target));
    return graphe.noeuds.filter(noeud => !alimentes.has(noeud.id) && graphe.liens.some(lien => lien.source === noeud.id));
}

/**
 * Toutes les chaînes qui mènent au centre, la plus longue d'abord — c'est celle qui raconte le plus.
 * Chaque chaîne est une suite d'identifiants, du début connu jusqu'au centre.
 */
export function chainesVers(graphe: GrapheParcours, centre: string, maximum = 24): string[][] {
    const chaines: string[][] = [];
    const vues = new Set<string>();
    const remonter = (identifiant: string, chaine: string[]) => {
        if (chaines.length >= maximum || chaine.length > LONGUEUR_MAXIMUM) return;
        const amont = graphe.liens.filter(lien => lien.target === identifiant && !chaine.includes(lien.source));
        if (!amont.length) {
            if (chaine.length < 2) return;
            const cle = chaine.join('>');
            if (vues.has(cle)) return;
            vues.add(cle);
            chaines.push([...chaine]);
            return;
        }
        for (const lien of amont) remonter(lien.source, [lien.source, ...chaine]);
    };
    remonter(centre, [centre]);
    return chaines.sort((premiere, seconde) => seconde.length - premiere.length);
}

/** Une chaîne écrite en clair : « Système tiers ⇢ Gestion des tiers ⇢ Personne ». */
export function chaineLisible(graphe: GrapheParcours, chaine: string[]): string {
    return chaine.map(identifiant => graphe.noeuds.find(noeud => noeud.id === identifiant)?.titre || identifiant).join(' ⇢ ');
}

/** Ce que dit le résumé du panneau : combien de chaînes, et d'où elles partent. */
export function resumeDesChaines(graphe: GrapheParcours, centre: string): { chaines: number; departs: string[] } {
    const chaines = chainesVers(graphe, centre).filter(chaine => chaine.length > 2);
    const departs = [...new Set(chaines.map(chaine => graphe.noeuds.find(noeud => noeud.id === chaine[0])?.titre || chaine[0]))];
    return { chaines: chaines.length, departs };
}
