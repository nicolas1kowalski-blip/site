/**
 * L'audit global d'un objet métier — repris de la V13.
 *
 * Une fiche peut être remplie et l'objet mal gouverné : un propriétaire nommé mais aucune source maître,
 * deux maîtres qui se contredisent, une fiche de dictionnaire jamais validée, personne qui déclare s'en
 * servir. La V13 pose donc une check-list, la même pour tous les objets, et en tire un score : c'est ce qui
 * permet de comparer deux objets et de savoir lequel reprendre en premier.
 *
 * L'audit regarde ensuite le **périmètre** de l'objet — sa table maître, ses autres sources, les tables de
 * ses variantes — et non le seul fichier maître : un objet couvre plusieurs tables, chacune avec son
 * volume et ses règles.
 *
 * Fonctions pures : elles ne connaissent que ce qu'on leur donne, et ne vont rien chercher.
 */
import type { ObjetMetier } from '../../coeur/modeles';

/** Un point de la check-list : ce que l'on vérifie, et si c'est le cas. */
export type ControleDeGouvernance = { libelle: string; ok: boolean };

/** Ce dont la check-list a besoin, et que l'objet ne porte pas lui-même. */
export type ContexteDeLAudit = {
    /** Le statut de la fiche de dictionnaire de la table maître. */
    statutDuDictionnaire: string;
    /** Vrai si un périmètre métier revendique cet objet ou sa table maître. */
    dansUnPerimetre: boolean;
    /** Vrai si une application ou un processus déclare se servir de l'objet ou de l'une de ses informations. */
    utiliseParUnActif: boolean;
};

/** La table maître de l'objet : la source marquée maître, sinon la première rattachée. */
export function tableMaitreDe(objet: ObjetMetier): string {
    const maitre = objet.sources.find(source => source.role === 'maitre') || objet.sources[0];
    return maitre?.table || '';
}

/** Vrai quand l'objet déclare une maîtrise qui dépend du contexte. */
export function aUneMaitriseContextuelle(objet: ObjetMetier): boolean {
    return (((objet['contextRules'] as { rules?: unknown[] }) || {}).rules || []).length > 0;
}

/**
 * La check-list de la V13, dans son ordre. Deux points méritent d'être lus ensemble : « source maître
 * désignée » et « pas de conflit de maîtres ». Le premier veut qu'il y en ait une, le second qu'il n'y en
 * ait pas deux — et la maîtrise contextuelle satisfait les deux, puisqu'elle dit précisément qui maîtrise
 * quoi selon le cas.
 */
export function controlerLObjet(objet: ObjetMetier, contexte: ContexteDeLAudit): ControleDeGouvernance[] {
    const maitres = objet.sources.filter(source => source.role === 'maitre');
    const contextuelle = aUneMaitriseContextuelle(objet);
    return [
        { libelle: 'Propriétaire global nommé', ok: !!(objet.globalOwner || '').trim() },
        { libelle: 'Définition renseignée', ok: !!(objet.definition || '').trim() },
        { libelle: 'Source maître désignée (ou maîtrise contextuelle)', ok: maitres.length === 1 || contextuelle },
        { libelle: 'Pas de conflit de maîtres', ok: maitres.length <= 1 || contextuelle },
        { libelle: 'Au moins une information décrite', ok: (objet.elements || []).length > 0 },
        { libelle: 'Fiche dictionnaire de la source maître validée', ok: contexte.statutDuDictionnaire === 'Validé' },
        { libelle: 'Rattaché à un périmètre métier', ok: contexte.dansUnPerimetre },
        { libelle: 'Utilisé par au moins une application ou un processus', ok: contexte.utiliseParUnActif }
    ];
}

/** Le score de gouvernance : la part des contrôles satisfaits, arrondie. */
export function scoreDeGouvernance(controles: ControleDeGouvernance[]): number {
    if (!controles.length) return 0;
    return Math.round((100 * controles.filter(controle => controle.ok).length) / controles.length);
}

/** La couleur du score, comme dans la V13 : vert au-delà de 80, orange au-delà de 50, rouge en deçà. */
export function couleurDuScore(score: number): string {
    if (score >= 80) return 'text-emerald-600';
    if (score >= 50) return 'text-amber-600';
    return 'text-red-600';
}

/**
 * Le périmètre de l'objet : sa table maître, ses autres sources, et les tables de ses variantes. C'est sur
 * lui que portent la volumétrie et les règles — un objet ne se réduit pas à son fichier maître.
 */
export function perimetreDeLObjet(objet: ObjetMetier): string[] {
    const tables = new Set<string>();
    const maitre = tableMaitreDe(objet);
    if (maitre) tables.add(maitre);
    for (const source of objet.sources) tables.add(source.table);
    for (const variante of objet.structure || []) if (variante.table) tables.add(variante.table);
    return [...tables];
}

/** Le volume de chaque table du périmètre, et le total — les tables inconnues sont laissées de côté. */
export function volumetrieDuPerimetre(
    perimetre: string[],
    volumetrie: { nom: string; lignes: number }[]
): { tables: { nom: string; lignes: number }[]; total: number } {
    const tables = perimetre
        .map(nom => volumetrie.find(mesure => mesure.nom === nom))
        .filter((mesure): mesure is { nom: string; lignes: number } => !!mesure);
    return { tables, total: tables.reduce((somme, mesure) => somme + mesure.lignes, 0) };
}

/** Une règle de qualité, réduite à ce que l'audit en montre. */
export type RegleDuPerimetre = { id: string; nom: string; genre: string; cible: string; active: boolean; dernierTaux: number | null };

/**
 * Les règles de qualité qui portent sur l'objet ou sur l'une des tables de son périmètre. Les règles
 * désactivées sont écartées : on ne juge pas un objet sur un contrôle que personne ne fait tourner.
 */
export function reglesDuPerimetre(regles: RegleDuPerimetre[], objetId: string, perimetre: string[]): RegleDuPerimetre[] {
    const tables = new Set(perimetre);
    return regles.filter(regle => regle.active && (regle.cible === objetId || tables.has(regle.cible)));
}

/**
 * Les variantes déclarées « exactement une » : ce sont celles qu'il vaut la peine de vérifier sur les
 * données, puisqu'une occurrence en trop ou en moins est une faute, et non une variation normale.
 */
export function variantesExactementUne(objet: ObjetMetier): { id: string; name: string; table: string }[] {
    return (objet.structure || [])
        .filter(variante => variante.cardinality === '1–1')
        .map(variante => ({ id: variante.id, name: variante.name, table: variante.table }));
}

/** Ce que l'audit dit en une phrase, une fois la check-list passée. */
export function phraseDuScore(objet: ObjetMetier, controles: ControleDeGouvernance[]): string {
    const reussis = controles.filter(controle => controle.ok).length;
    return `Score de gouvernance de « ${objet.name} » (${reussis}/${controles.length})`;
}
