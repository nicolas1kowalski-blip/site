/**
 * Replier un graphe trop chargé — repris de la V12.8 de l'application classique.
 *
 * Un objet lu par douze applications donne douze cases identiques : on ne voit plus rien. Quand un côté
 * compte trop d'éléments du même type, on les remplace par une seule case « 12 applications en aval », qui
 * s'ouvre d'un clic. Les liens des éléments regroupés sont fusionnés en un seul, qui porte leur nombre.
 *
 * Le repli ne change jamais les données : c'est une façon de regarder. Rouvrir un groupe rend exactement le
 * graphe d'origine.
 *
 * Fonctions pures : aucun accès au DOM.
 */

/** Ce dont le repli a besoin dans un nœud ; les écrans en mettent davantage, on n'y touche pas. */
export type NoeudRepliable = { id: string; titre: string; detail?: string; genre: string };
export type LienRepliable = { source: string; target: string; libelle?: string };
export type GrapheRepliable<Noeud extends NoeudRepliable, Lien extends LienRepliable> = { noeuds: Noeud[]; liens: Lien[] };

/** Au-delà de ce nombre d'éléments du même type et du même côté, on regroupe. */
export const SEUIL_DE_REPLI = 4;

/** Les libellés au pluriel, pour que la case regroupée se lise en français. */
const PLURIELS: Record<string, string> = {
    app: 'applications',
    table: 'fichiers',
    colonne: 'colonnes',
    attribut: 'informations',
    objet: 'objets'
};

/** Un groupe replié : son identifiant, ce qu'il contient, et de quel côté du centre il se trouve. */
export type GroupeReplie = { id: string; genre: string; sens: 'amont' | 'aval'; membres: string[] };

/** L'identifiant d'un groupe, reconnaissable pour savoir qu'on peut l'ouvrir. */
export function identifiantDeGroupe(genre: string, sens: 'amont' | 'aval'): string {
    return `groupe:${sens}:${genre}`;
}

/** Vrai quand ce nœud est une case regroupée, et non un élément réel. */
export function estUnGroupe(identifiant: string): boolean {
    return identifiant.startsWith('groupe:');
}

/**
 * Les groupes que le graphe mérite : par côté (ce qui entre dans le centre, ce qui en sort) et par genre,
 * dès que le nombre dépasse le seuil. Un élément relié des deux côtés n'est jamais regroupé : il porte
 * l'histoire du graphe.
 */
export function groupesDe<Noeud extends NoeudRepliable, Lien extends LienRepliable>(
    graphe: GrapheRepliable<Noeud, Lien>,
    centre: string,
    seuil = SEUIL_DE_REPLI
): GroupeReplie[] {
    const amont = new Set(graphe.liens.filter(lien => lien.target === centre).map(lien => lien.source));
    const aval = new Set(graphe.liens.filter(lien => lien.source === centre).map(lien => lien.target));
    const groupes: GroupeReplie[] = [];
    for (const sens of ['amont', 'aval'] as const) {
        const cotes = sens === 'amont' ? amont : aval;
        const parGenre = new Map<string, string[]>();
        for (const noeud of graphe.noeuds) {
            if (noeud.id === centre || !cotes.has(noeud.id)) continue;
            // Un élément qui entre ET qui sort raconte quelque chose : il reste visible.
            if (amont.has(noeud.id) && aval.has(noeud.id)) continue;
            parGenre.set(noeud.genre, [...(parGenre.get(noeud.genre) || []), noeud.id]);
        }
        for (const [genre, membres] of parGenre)
            if (membres.length > seuil) groupes.push({ id: identifiantDeGroupe(genre, sens), genre, sens, membres });
    }
    return groupes;
}

/** Ce qu'affiche une case regroupée : « 5 applications en aval ». */
export function titreDuGroupe(groupe: GroupeReplie): string {
    const pluriel = PLURIELS[groupe.genre] || 'éléments';
    return `${groupe.membres.length} ${pluriel} en ${groupe.sens}`;
}

/**
 * Le graphe tel qu'on le montre : les groupes fermés remplacés par une case unique, leurs liens fusionnés.
 * `ouverts` contient les identifiants des groupes que l'utilisateur a dépliés.
 */
export function grapheReplie<Noeud extends NoeudRepliable, Lien extends LienRepliable>(
    graphe: GrapheRepliable<Noeud, Lien>,
    centre: string,
    ouverts: Set<string>,
    seuil = SEUIL_DE_REPLI
): { noeuds: NoeudRepliable[]; liens: LienRepliable[]; groupes: GroupeReplie[] } {
    const groupes = groupesDe(graphe, centre, seuil);
    const fermes = groupes.filter(groupe => !ouverts.has(groupe.id));
    if (!fermes.length) return { noeuds: graphe.noeuds, liens: graphe.liens, groupes };
    const remplacant = new Map<string, GroupeReplie>();
    for (const groupe of fermes) for (const membre of groupe.membres) remplacant.set(membre, groupe);
    const noeuds: NoeudRepliable[] = graphe.noeuds.filter(noeud => !remplacant.has(noeud.id));
    for (const groupe of fermes)
        noeuds.push({ id: groupe.id, titre: titreDuGroupe(groupe), detail: 'cliquer pour ouvrir', genre: groupe.genre });
    const liens = new Map<string, LienRepliable & { nombre: number }>();
    for (const lien of graphe.liens) {
        const source = remplacant.get(lien.source)?.id || lien.source;
        const target = remplacant.get(lien.target)?.id || lien.target;
        const cle = `${source}>${target}`;
        const existant = liens.get(cle);
        if (existant) existant.nombre += 1;
        else liens.set(cle, { source, target, libelle: lien.libelle, nombre: 1 });
    }
    return {
        noeuds,
        liens: [...liens.values()].map(lien => ({
            source: lien.source,
            target: lien.target,
            libelle: lien.nombre > 1 ? `${lien.nombre} liens` : lien.libelle
        })),
        groupes
    };
}
