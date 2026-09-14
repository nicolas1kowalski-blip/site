/**
 * « 🔎 Parcours » : depuis quelle fiche, vers quel parcours — repris de la V13 de l'application classique.
 *
 * Le parcours de la donnée ne se consulte pas par le menu seulement. Dans la V13, on y va **depuis ce que
 * l'on regarde** : une table du catalogue, une colonne, un objet métier, une de ses informations, une
 * application. Le bouton mène au même écran, mais déjà ouvert sur le bon onglet et le bon élément.
 *
 * Ce module dit une seule chose : quelle adresse pour quelle fiche. Fonction pure, donc vérifiable telle
 * quelle — et une seule règle à corriger le jour où l'écran change d'adresse.
 */

/** Ce dont la règle a besoin : ce que la fiche décrit, et de quoi le retrouver. */
export type FicheAParcourir = {
    /** Type du catalogue : table, view, column, bo, attr, asset… */
    type: string;
    /** Identifiant du catalogue : « bo_client », « bo_client.be_client_id », « 12.ville »… */
    id: string;
    titre: string;
    /** Pour une colonne, le nom de sa table, que le catalogue range dans les mots-clés. */
    motsCles?: string[];
};

/** L'écran du parcours de la donnée. */
const ECRAN = '/lineage';

/**
 * L'adresse du parcours pour une fiche, ou une chaîne vide quand la fiche n'a pas de parcours à montrer
 * (une règle de qualité, une liste de valeurs : ce sont des jugements sur la donnée, pas des étapes de son
 * voyage).
 */
export function lienDuParcours(fiche: FicheAParcourir): string {
    if (fiche.type === 'table' || fiche.type === 'view') return `${ECRAN}?table=${encodeURIComponent(fiche.titre)}`;
    if (fiche.type === 'column') {
        const table = (fiche.motsCles || [])[0] || '';
        if (!table) return '';
        return `${ECRAN}?table=${encodeURIComponent(table)}&colonne=${encodeURIComponent(fiche.titre)}`;
    }
    if (fiche.type === 'bo') return `${ECRAN}?objet=${encodeURIComponent(fiche.id)}`;
    if (fiche.type === 'attr') {
        // L'identifiant d'une information est « <objet>.<information> » : la première partie est l'objet.
        const separation = fiche.id.indexOf('.');
        if (separation < 1) return '';
        return `${ECRAN}?objet=${encodeURIComponent(fiche.id.slice(0, separation))}&information=${encodeURIComponent(fiche.id.slice(separation + 1))}`;
    }
    if (fiche.type === 'asset' || fiche.type === 'report') return `${ECRAN}?application=${encodeURIComponent(fiche.id)}`;
    return '';
}

/** Ce que le bouton annonce, selon ce que l'on regarde : on dit d'avance ce que l'on va voir. */
export function libelleDuParcours(type: string): string {
    if (type === 'column' || type === 'attr') return '🔎 Parcours de cette donnée';
    if (type === 'bo') return '🔎 Parcours de cet objet';
    if (type === 'asset' || type === 'report') return '🔎 Ce que cette application touche';
    return '🔎 Parcours de la donnée';
}
