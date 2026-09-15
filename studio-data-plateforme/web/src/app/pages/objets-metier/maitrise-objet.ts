/**
 * La maîtrise contextuelle d'un objet métier — reprise de la V13.
 *
 * Un objet n'a pas toujours une seule source maître. Selon le contexte — le type de contrat, le pays, la
 * filiale — la donnée peut être maîtrisée par un système différent, avec un propriétaire différent. La V13
 * laisse donc choisir une **information de contexte**, puis écrire des règles : « si type = PARTICULIER,
 * le maître est crm.csv et le propriétaire est Alice ».
 *
 * Deux principes tenus du classique :
 *   • **il y a toujours un défaut** — une valeur sans règle retombe sur la source maître générale et le
 *     propriétaire global. Rien n'est jamais sans maître ;
 *   • **on vérifie sur les données** — les valeurs réellement présentes sont confrontées aux règles
 *     écrites, et celles que personne ne couvre sont montrées. C'est là que se voient les oublis.
 *
 * Fonctions pures : elles ne connaissent que l'objet et des valeurs observées, jamais l'écran.
 */
import type { AttributObjetMetier, ObjetMetier } from '../../coeur/modeles';

/** Une règle de maîtrise : pour cette valeur de contexte, ce maître et ce propriétaire. */
export type RegleDeMaitrise = { id: string; value: string; masterTable: string; owner: string };

/** Ce que l'objet déclare de sa maîtrise : l'information de contexte, et les règles. */
export type MaitriseContextuelle = { elementId: string; rules: RegleDeMaitrise[] };

/** La maîtrise d'un objet, toujours exploitable ; elle est posée sur l'objet au premier accès. */
export function maitriseDe(objet: ObjetMetier): MaitriseContextuelle {
    const brute = (objet['contextRules'] || {}) as Partial<MaitriseContextuelle>;
    const maitrise: MaitriseContextuelle = { elementId: brute.elementId || '', rules: brute.rules || [] };
    objet['contextRules'] = maitrise;
    return maitrise;
}

/** L'information choisie comme contexte, si elle appartient toujours à l'objet. */
export function informationDeContexte(objet: ObjetMetier): AttributObjetMetier | null {
    const maitrise = maitriseDe(objet);
    return (objet.elements || []).find(information => information.id === maitrise.elementId) || null;
}

/** Une règle neuve : la première source de l'objet comme maître, à corriger ensuite. */
export function regleNeuve(objet: ObjetMetier, identifiant: (prefixe: string) => string): RegleDeMaitrise {
    const maitre = objet.sources.find(source => source.role === 'maitre') || objet.sources[0];
    return { id: identifiant('cr_'), value: '', masterTable: maitre?.table || '', owner: '' };
}

/** Les tables proposées comme maître : celles de l'objet, sinon toutes celles de l'espace. */
export function tablesProposees(objet: ObjetMetier, toutesLesTables: string[]): string[] {
    const siennes = objet.sources.map(source => source.table);
    return siennes.length ? siennes : toutesLesTables;
}

/**
 * Changer d'information de contexte efface les règles : elles parlaient des valeurs de l'ancienne, et les
 * garder ferait croire à une maîtrise décrite alors qu'elle ne veut plus rien dire.
 */
export function choisirLeContexte(objet: ObjetMetier, elementId: string): void {
    const maitrise = maitriseDe(objet);
    if (maitrise.elementId === elementId) return;
    maitrise.elementId = elementId;
    maitrise.rules = [];
}

/** Une valeur de contexte, comparable : sans espaces de bord et sans casse. */
function valeurComparable(valeur: string): string {
    return String(valeur || '')
        .trim()
        .toUpperCase();
}

/** Une valeur observée dans les données, et le nombre de lignes qui la portent. */
export type ValeurObservee = { valeur: string; compte: number };

/** Une valeur observée, et la règle qui la couvre — ou rien. */
export type CouvertureDUneValeur = ValeurObservee & { couverte: boolean };

/**
 * Confronte les valeurs réellement présentes aux règles écrites. Ce que l'on cherche, ce sont les valeurs
 * que personne n'a prévues : elles retomberont sur le maître général, ce qui est peut-être voulu — mais
 * doit être vu.
 */
export function couvertureDuContexte(valeurs: ValeurObservee[], regles: RegleDeMaitrise[]): CouvertureDUneValeur[] {
    const prevues = new Set(regles.map(regle => valeurComparable(regle.value)).filter(Boolean));
    return valeurs.map(observee => ({ ...observee, couverte: prevues.has(valeurComparable(observee.valeur)) }));
}

/** Combien de valeurs observées une règle couvre, sur le total : c'est la phrase de tête du contrôle. */
export function phraseDeCouverture(couverture: CouvertureDUneValeur[]): string {
    const couvertes = couverture.filter(valeur => valeur.couverte).length;
    return `${couvertes}/${couverture.length} valeur(s) de contexte couverte(s) par une règle`;
}

/** Ce que l'on dit sous le contrôle, selon qu'il reste ou non des valeurs sans règle. */
export function conclusionDeCouverture(couverture: CouvertureDUneValeur[]): string {
    const sansRegle = couverture.filter(valeur => !valeur.couverte).length;
    if (!sansRegle) return 'Toutes les valeurs observées sont couvertes.';
    return (
        'Les valeurs ⚠️ n’ont pas de règle : la source maître générale et le propriétaire global s’appliquent ' +
        'par défaut — vérifiez que c’est voulu.'
    );
}

/** Ce qui manque pour aller lire les valeurs, dit avant d'appeler plutôt qu'après. */
export function cequiManquePourVerifier(objet: ObjetMetier): string {
    const contexte = informationDeContexte(objet);
    if (!contexte) return 'Choisissez d’abord l’information de contexte.';
    if (!(contexte.mappings || []).length)
        return `« ${contexte.name} » n’est rattachée à aucune colonne de fichier : on ne peut pas lire ses valeurs.`;
    return '';
}

/** Qui maîtrise l'objet pour une valeur de contexte donnée — la règle qui s'applique, ou le défaut. */
export function maitrisePour(objet: ObjetMetier, valeur: string): { masterTable: string; owner: string; parDefaut: boolean } {
    const regle = maitriseDe(objet).rules.find(candidate => valeurComparable(candidate.value) === valeurComparable(valeur));
    if (regle && (regle.masterTable || regle.owner)) return { masterTable: regle.masterTable, owner: regle.owner, parDefaut: false };
    const maitre = objet.sources.find(source => source.role === 'maitre');
    return { masterTable: maitre?.table || '', owner: objet.globalOwner || '', parDefaut: true };
}
