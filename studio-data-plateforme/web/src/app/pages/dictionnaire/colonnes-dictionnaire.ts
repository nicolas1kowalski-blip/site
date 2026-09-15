/**
 * Les colonnes d'une fiche de dictionnaire — repris de la V13.
 *
 * Une colonne se décrit deux fois dans l'application : ici, sur la table technique, et là-bas, sur
 * l'information de l'objet métier qui s'en sert. La V13 refuse de les laisser diverger : quand la colonne
 * n'a rien, elle affiche en filigrane ce que l'objet métier en dit, et le signale — « défini sur l'objet
 * Client, information Ville ». On ne recopie pas, on hérite, et l'on sait d'où.
 *
 * La définition d'une colonne s'appelle `definition` — c'est le nom que lit aussi l'application classique.
 * Les fiches plus anciennes la rangeaient sous `description` : on continue de la lire, pour ne rien perdre.
 *
 * Fonctions pures : elles ne connaissent que ce qu'on leur donne.
 */
import type { ColonneDeDictionnaire, ObjetMetier } from '../../coeur/modeles';

/** Une valeur héritée de l'objet métier : ce qu'elle vaut, et d'où elle vient. */
export type ValeurHeritee = { valeur: string; objet: string; information: string };

/** La définition écrite sur la colonne, sous l'un ou l'autre des deux noms de champ. */
export function definitionDe(champs: ColonneDeDictionnaire | undefined): string {
    return String(champs?.definition || champs?.description || '');
}

/**
 * Ce que les objets métier disent d'une colonne. On cherche l'information rattachée à cette table et à
 * cette colonne, et l'on prend le premier champ renseigné : c'est la valeur que la V13 propose en
 * filigrane quand la colonne elle-même n'a rien.
 */
export function heriteDeLObjetMetier(
    objets: ObjetMetier[],
    table: string,
    colonne: string,
    champ: 'definition' | 'sensitivity'
): ValeurHeritee | null {
    for (const objet of objets)
        for (const information of objet.elements || []) {
            const rattachee = (information.mappings || []).some(
                correspondance => correspondance.table === table && correspondance.col === colonne
            );
            if (!rattachee) continue;
            const valeur = String((information as unknown as Record<string, unknown>)[champ] || '');
            if (valeur) return { valeur, objet: objet.name, information: information.name };
        }
    return null;
}

/** La phrase qui dit d'où vient une définition héritée. */
export function phraseDeLHeritage(herite: ValeurHeritee): string {
    return `défini sur l'objet ${herite.objet} — ${herite.information}`;
}

/**
 * Ce que l'on écrit dans la case « exemples » à partir des valeurs les plus fréquentes de la colonne. Le
 * classique en garde quelques-unes, séparées par un point-virgule : assez pour reconnaître la donnée, pas
 * assez pour encombrer la ligne.
 */
export const EXEMPLES_RETENUS = 5;

export function exemplesDepuisLesValeurs(valeurs: { valeur: string }[]): string {
    return valeurs
        .map(observee => String(observee.valeur || '').trim())
        .filter(Boolean)
        .slice(0, EXEMPLES_RETENUS)
        .join(' ; ');
}

/**
 * Faut-il remplacer les exemples déjà présents ? Jamais ceux qu'une personne a saisis à la main : ce
 * serait détruire du travail. Ceux qui viennent déjà d'un échantillonnage, en revanche, se rafraîchissent.
 */
export function exemplesRemplacables(champs: ColonneDeDictionnaire | undefined): boolean {
    return !champs?.examples || champs.examplesAuto === true;
}

/** Combien de colonnes de la fiche portent une définition — l'avancement de la fiche, en un chiffre. */
export function colonnesDecrites(entetes: string[], colonnes: Record<string, ColonneDeDictionnaire>): number {
    return entetes.filter(entete => definitionDe(colonnes[entete])).length;
}
