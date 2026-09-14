/**
 * L'assistant de création d'un objet métier, en trois étapes — repris de la V11.
 *
 * Le formulaire complet d'un objet fait peur : vingt champs, dont dix-huit qu'on ne sait pas encore remplir.
 * L'assistant ne pose que trois questions, dans l'ordre où on sait y répondre :
 *
 *   1. **Nom et domaine** — comment le métier appelle la chose, et à quel périmètre elle appartient ;
 *   2. **Source et informations** — de quel fichier on part, et quelles colonnes deviennent des informations
 *      (ou, sans fichier, la liste des informations écrite à la main, une par ligne) ;
 *   3. **Responsable** — qui répond de cet objet, et où en est la fiche.
 *
 * Tout le reste se remplira plus tard, dans la fiche. Rien n'est créé avant la dernière étape.
 *
 * Fonctions pures : elles ne connaissent que la saisie, jamais l'écran.
 */
import type { ObjetMetier } from '../../coeur/modeles';

/** Les trois étapes, dans l'ordre ; le titre est celui affiché en haut de l'assistant. */
export const ETAPES_ASSISTANT = ['Nom et domaine', 'Source et informations', 'Responsable'];

/** Ce que l'on a saisi, étape après étape. */
export type SaisieAssistant = {
    nom: string;
    domaine: string;
    definition: string;
    /** Le fichier de départ, ou une chaîne vide pour saisir les informations à la main. */
    table: string;
    /** Les colonnes retenues du fichier de départ. */
    colonnes: string[];
    /** Les informations écrites à la main, une par ligne, quand il n'y a pas de fichier. */
    libres: string;
    responsable: string;
    statut: string;
};

/** Une saisie neuve : tout est vide, et la fiche partira en brouillon. */
export function saisieVide(): SaisieAssistant {
    return { nom: '', domaine: '', definition: '', table: '', colonnes: [], libres: '', responsable: '', statut: 'Brouillon' };
}

/** Les noms d'informations que la saisie décrit, dans l'ordre où ils apparaîtront dans la fiche. */
export function informationsDeLaSaisie(saisie: SaisieAssistant): { nom: string; table: string; colonne: string }[] {
    if (saisie.table) return saisie.colonnes.map(colonne => ({ nom: colonne, table: saisie.table, colonne }));
    return saisie.libres
        .split('\n')
        .map(ligne => ligne.trim())
        .filter(Boolean)
        .map(nom => ({ nom, table: '', colonne: '' }));
}

/** Ce qui empêche de passer à l'étape suivante, dit en clair ; chaîne vide quand on peut avancer. */
export function refusDeLEtape(saisie: SaisieAssistant, etape: number): string {
    if (etape === 0 && !saisie.nom.trim()) return "Donnez un nom à l'objet.";
    if (etape === 1 && !informationsDeLaSaisie(saisie).length) return 'Choisissez au moins une information, ou écrivez-en une.';
    return '';
}

/** Le récapitulatif de la dernière étape : ce que l'on s'apprête à créer, en une phrase. */
export function recapitulatifDeLaSaisie(saisie: SaisieAssistant): string {
    const informations = informationsDeLaSaisie(saisie);
    const provenance = saisie.table ? `depuis ${saisie.table}` : 'écrites à la main';
    return `${saisie.nom.trim() || '(sans nom)'}${saisie.domaine ? ' · ' + saisie.domaine : ''} — ${informations.length} information(s) ${provenance}.`;
}

/** L'objet métier tel qu'il sera enregistré. Le reste de la fiche se remplira plus tard. */
export function objetDeLaSaisie(saisie: SaisieAssistant, identifiant: (prefixe: string) => string): ObjetMetier {
    return {
        id: identifiant('bo'),
        name: saisie.nom.trim(),
        definition: saisie.definition.trim(),
        domain: saisie.domaine.trim(),
        globalOwner: saisie.responsable.trim(),
        contributors: [],
        status: saisie.statut,
        elements: informationsDeLaSaisie(saisie).map(information => ({
            id: identifiant('be_'),
            name: information.nom,
            definition: '',
            owner: '',
            mappings: information.colonne ? [{ table: information.table, col: information.colonne }] : [],
            usedBy: []
        })),
        sources: saisie.table ? [{ table: saisie.table, role: 'maitre' as const }] : [],
        producedBy: [],
        consumedBy: [],
        references: []
    };
}
