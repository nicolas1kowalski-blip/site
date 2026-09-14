/**
 * Rattacher une colonne de fichier à une information, en la faisant glisser — repris de la V11.
 *
 * Dire d'où vient une information, c'est désigner la colonne du fichier qui porte la valeur. Le faire par
 * menus déroulants est fastidieux ; la V11 pose à côté de la liste un bandeau des colonnes des sources de
 * l'objet, que l'on attrape et que l'on lâche sur l'information. Les colonnes déjà rattachées y restent
 * visibles, mais grisées : on voit d'un coup d'œil ce qui n'a pas encore trouvé sa place.
 *
 * Fonctions pures : elles ne connaissent ni le DOM ni le glisser-déposer, seulement les colonnes et les
 * informations. L'écran s'occupe des événements ; les règles sont ici.
 */
import type { AttributObjetMetier, ObjetMetier, Source } from '../../coeur/modeles';

/** Une colonne offerte au rattachement : sa table, son nom, et si elle est déjà employée. */
export type ColonneOfferte = { table: string; colonne: string; dejaRattachee: boolean };

/** Comment une colonne s'écrit dans une correspondance et dans une étiquette : « clients.csv · ville ». */
export function libelleDeColonne(table: string, colonne: string): string {
    return `${table} · ${colonne}`;
}

/**
 * Les colonnes des sources de l'objet, dans l'ordre des sources puis des colonnes. Une source déclarée mais
 * absente de l'espace est ignorée : on ne propose pas de rattacher une colonne qui n'existe pas.
 */
export function colonnesDeLObjet(objet: ObjetMetier, sources: Source[]): ColonneOfferte[] {
    const rattachees = new Set<string>();
    for (const information of objet.elements || [])
        for (const correspondance of information.mappings || []) rattachees.add(libelleDeColonne(correspondance.table, correspondance.col));
    const offertes: ColonneOfferte[] = [];
    for (const declaree of objet.sources || []) {
        const source = sources.find(candidate => candidate.name === declaree.table);
        if (!source) continue;
        for (const colonne of source.headers || [])
            offertes.push({ table: source.name, colonne, dejaRattachee: rattachees.has(libelleDeColonne(source.name, colonne)) });
    }
    return offertes;
}

/**
 * L'information après le rattachement d'une colonne. Rattacher deux fois la même colonne ne fait rien :
 * une information peut venir de plusieurs colonnes, mais pas deux fois de la même.
 */
export function informationAvecColonne(
    information: AttributObjetMetier,
    table: string,
    colonne: string
): { information: AttributObjetMetier; ajoutee: boolean } {
    const correspondances = information.mappings || [];
    if (correspondances.some(existante => existante.table === table && existante.col === colonne)) return { information, ajoutee: false };
    return { information: { ...information, mappings: [...correspondances, { table, col: colonne }] }, ajoutee: true };
}

/** Ce que l'on transporte pendant le glissement : la table et la colonne, en un seul texte. */
export function colonneTransportee(table: string, colonne: string): string {
    return JSON.stringify({ table, colonne });
}

/** Relit ce qui a été lâché sur une information ; rend null quand ce n'est pas une colonne de l'application. */
export function colonneLachee(texte: string): { table: string; colonne: string } | null {
    try {
        const lue = JSON.parse(texte) as { table?: unknown; colonne?: unknown };
        if (typeof lue.table !== 'string' || typeof lue.colonne !== 'string' || !lue.table || !lue.colonne) return null;
        return { table: lue.table, colonne: lue.colonne };
    } catch {
        return null;
    }
}
