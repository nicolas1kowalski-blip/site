/**
 * Les hiérarchies d'un objet métier — reprises de la V13.
 *
 * Un objet se range souvent en arbre : un local dans un bâtiment, un bâtiment sur un site. La V13 laisse
 * déclarer cet arbre de deux façons, et c'est la table qui décide :
 *
 *   • **le parent est dans la même table** — une colonne de l'enfant porte la clé de son parent ;
 *   • **le parent passe par une table de liaison** — une table à part associe l'enfant au parent. C'est le
 *     cas dès qu'un enfant peut dépendre de plusieurs parents, ou que le lien porte ses propres dates.
 *
 * Une colonne de type permet en plus de nommer les niveaux (SITE, BATIMENT, LOCAL) et de dire, pour chacun,
 * de quels niveaux il a le droit de dépendre. Un niveau sans parent admis est une racine — et c'est bien
 * une règle, pas une absence de règle : un niveau racine qui dépend de quelque chose est en faute.
 *
 * Fonctions pures : elles ne connaissent que les hiérarchies, jamais l'écran ni les données.
 */

/** Un niveau de l'arbre, et les niveaux dont il a le droit de dépendre. */
export type NiveauHierarchie = { name: string; parents: string[] };

/** Une hiérarchie déclarée sur un objet métier. */
export type Hierarchie = {
    id: string;
    name: string;
    mode: 'self' | 'link';
    childCol?: string;
    parentKeyCol?: string;
    linkTable?: string;
    linkChildCol?: string;
    linkParentCol?: string;
    typeCol?: string;
    maxDepth?: string;
    levels?: NiveauHierarchie[];
};

/** Ce que l'audit rapporte, tel que l'API le rend. */
export type AuditHierarchie = {
    total: number;
    racines: number;
    orphelins: number;
    bouclesSurSoi: number;
    violationsDeNiveau: number;
    typesInconnus: number;
    profondeurMaximale: number | null;
    auDelaDeLaProfondeur: number | null;
};

/**
 * Les hiérarchies d'un objet, toujours sous une forme exploitable. Un niveau écrit en simple texte — ce que
 * faisait un ancien format — redevient un niveau sans parent admis, donc une racine.
 */
export function hierarchiesDe(objet: { hierarchies?: unknown }): Hierarchie[] {
    const brutes = Array.isArray(objet.hierarchies) ? (objet.hierarchies as Hierarchie[]) : [];
    for (const hierarchie of brutes)
        hierarchie.levels = (hierarchie.levels || []).map(niveau =>
            typeof niveau === 'string' ? { name: niveau, parents: [] } : { name: niveau.name, parents: niveau.parents || [] }
        );
    return brutes;
}

/** Une hiérarchie neuve : le parent dans la même table, ce qui est le cas le plus courant. */
export function hierarchieNeuve(identifiant: (prefixe: string) => string, rang: number): Hierarchie {
    return {
        id: identifiant('bh_'),
        name: `Hiérarchie ${rang + 1}`,
        mode: 'self',
        childCol: '',
        parentKeyCol: '',
        linkTable: '',
        linkChildCol: '',
        linkParentCol: '',
        typeCol: '',
        maxDepth: '',
        levels: []
    };
}

/** Ajoute un niveau, sans doublon : deux niveaux du même nom rendraient les parents admis ambigus. */
export function ajouterUnNiveau(hierarchie: Hierarchie, nom: string): boolean {
    const propre = String(nom || '').trim();
    const niveaux = (hierarchie.levels ||= []);
    if (!propre || niveaux.some(niveau => niveau.name.toLowerCase() === propre.toLowerCase())) return false;
    niveaux.push({ name: propre, parents: [] });
    return true;
}

/** Retire un niveau, et le retire aussi des parents admis des autres : un parent disparu n'est plus admis. */
export function retirerUnNiveau(hierarchie: Hierarchie, nom: string): void {
    const niveaux = hierarchie.levels || [];
    hierarchie.levels = niveaux
        .filter(niveau => niveau.name !== nom)
        .map(niveau => ({ ...niveau, parents: (niveau.parents || []).filter(parent => parent !== nom) }));
}

/** Coche ou décoche un parent admis pour un niveau. */
export function basculerUnParentAdmis(hierarchie: Hierarchie, niveauVise: string, parent: string): void {
    const niveau = (hierarchie.levels || []).find(candidat => candidat.name === niveauVise);
    if (!niveau) return;
    const parents = (niveau.parents ||= []);
    const position = parents.indexOf(parent);
    if (position >= 0) parents.splice(position, 1);
    else parents.push(parent);
}

/** Les niveaux qu'un niveau donné peut avoir pour parents : tous les autres, jamais lui-même. */
export function parentsPossibles(hierarchie: Hierarchie, niveauVise: string): NiveauHierarchie[] {
    return (hierarchie.levels || []).filter(niveau => niveau.name !== niveauVise);
}

/** Vrai quand ce niveau est une racine : il n'admet aucun parent. */
export function estUneRacine(niveau: NiveauHierarchie): boolean {
    return !(niveau.parents || []).length;
}

/** Ce qui manque pour auditer — même règle que côté serveur, pour le dire avant d'appeler. */
export function cequiManquePourAuditer(hierarchie: Hierarchie): string {
    if (hierarchie.mode === 'link') {
        if (!hierarchie.linkTable) return 'Choisissez la table de liaison.';
        if (!hierarchie.linkChildCol || !hierarchie.linkParentCol) return 'Indiquez les colonnes enfant et parent de la liaison.';
        if (!hierarchie.parentKeyCol) return 'Indiquez la colonne clé de la table maître.';
        return '';
    }
    if (!hierarchie.childCol || !hierarchie.parentKeyCol) return 'Indiquez la colonne qui pointe vers le parent, et la colonne clé.';
    return '';
}

/** Ce que la hiérarchie dit d'elle-même, en une ligne, sous son nom. */
export function resumeDeLaHierarchie(hierarchie: Hierarchie): string {
    const lien =
        hierarchie.mode === 'link'
            ? `via ${hierarchie.linkTable || 'une table de liaison'}`
            : `${hierarchie.childCol || '—'} → ${hierarchie.parentKeyCol || '—'}`;
    const niveaux = (hierarchie.levels || []).length;
    const profondeur = hierarchie.maxDepth ? ` · profondeur ≤ ${hierarchie.maxDepth}` : '';
    return `${lien}${niveaux ? ` · ${niveaux} niveau(x)` : ''}${profondeur}`;
}

/** Les tuiles de l'audit, dans l'ordre de la V13 : ce qui est normal d'abord, ce qui cloche ensuite. */
export function tuilesDeLAudit(audit: AuditHierarchie): { libelle: string; valeur: number; mauvais: boolean }[] {
    const tuiles = [
        { libelle: 'lignes', valeur: audit.total, mauvais: false },
        { libelle: 'racines', valeur: audit.racines, mauvais: false },
        { libelle: 'orphelins', valeur: audit.orphelins, mauvais: true },
        { libelle: 'parent d’elles-mêmes', valeur: audit.bouclesSurSoi, mauvais: true },
        { libelle: 'parents non admis', valeur: audit.violationsDeNiveau, mauvais: true },
        { libelle: 'types non déclarés', valeur: audit.typesInconnus, mauvais: true }
    ];
    if (audit.profondeurMaximale !== null) {
        tuiles.push({ libelle: 'profondeur atteinte', valeur: audit.profondeurMaximale, mauvais: false });
        tuiles.push({ libelle: 'au-delà de la limite', valeur: audit.auDelaDeLaProfondeur || 0, mauvais: true });
    }
    return tuiles;
}

/** Vrai quand l'audit n'a rien trouvé à redire. */
export function arbreConforme(audit: AuditHierarchie): boolean {
    return !tuilesDeLAudit(audit).some(tuile => tuile.mauvais && tuile.valeur > 0);
}
