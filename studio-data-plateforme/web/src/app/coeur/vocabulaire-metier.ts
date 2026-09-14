/**
 * Vocabulaire métier de la gouvernance — repris de la V13 de l'application classique.
 *
 * Le mot d'ordre de la V13 : on décrit sa donnée comme on l'expliquerait à un nouveau collègue. Les écrans
 * de gouvernance parlent donc d'« information » et non d'attribut, de « variante » et non de facette, de
 * « parcours de la donnée » et non de lineage, de « colonne du fichier » et non de mapping. Le mot technique
 * n'est pas perdu : il reste au survol, pour ceux qui le cherchent.
 *
 * Ce module rassemble deux choses :
 *   • le lexique — le mot métier, le mot technique qu'il remplace, et ce que la chose veut dire ;
 *   • la phrase d'aide de chaque écran : ce qu'on y fait, et pourquoi.
 *
 * Les libellés eux-mêmes sont écrits directement dans les écrans (rien n'est traduit à l'exécution) : ce
 * module sert aux infobulles, à l'aide « ? » et aux bandeaux d'aide.
 */

/** Un mot du métier : sa définition en langage courant, et le terme technique qu'il remplace. */
export type MotMetier = { mot: string; definition: string; technique?: string };

export const MOTS_METIER: MotMetier[] = [
    {
        mot: 'information',
        technique: 'attribut',
        definition: "Un renseignement élémentaire sur un objet (par exemple la date de naissance d'un client)."
    },
    {
        mot: 'variante',
        technique: 'facette',
        definition: "Une forme particulière d'un objet, avec ses propres informations (Client particulier / Client entreprise)."
    },
    {
        mot: 'parcours de la donnée',
        technique: 'lineage',
        definition: "D'où vient la donnée et où elle va : application qui la crée, fichiers, objets, restitutions, destinataires."
    },
    {
        mot: 'colonne du fichier',
        technique: 'mapping',
        definition: "La colonne d'un fichier chargé qui porte réellement la valeur d'une information."
    },
    {
        mot: 'confidentialité',
        technique: 'sensibilité',
        definition: 'À quel point la donnée doit être protégée : publique, interne, sensible, ou personnelle au sens du RGPD.'
    },
    {
        mot: 'responsable',
        technique: 'propriétaire (owner)',
        definition: "La personne qui répond de la qualité et de la définition d'une donnée, et qui valide les modifications."
    },
    {
        mot: 'restitution',
        definition: 'Ce qui sort des données : rapport, tableau de bord, fichier réglementaire, extraction livrée.'
    },
    {
        mot: 'objet métier',
        definition: "Une chose que l'on gère et dont on parle tous les jours : un Client, un Contrat, un Produit."
    },
    {
        mot: 'domaine métier',
        definition: "Le périmètre d'activité auquel une donnée se rattache : Finance, Ressources humaines, Commercial…"
    }
];

/** L'infobulle d'un mot métier : sa définition, et le terme technique quand il en remplace un. */
export function infobulleDe(mot: string): string {
    const trouve = MOTS_METIER.find(candidat => candidat.mot === mot.toLowerCase());
    if (!trouve) return '';
    return trouve.technique ? `${trouve.definition} Terme technique : ${trouve.technique}.` : trouve.definition;
}

/** La phrase d'aide d'un écran : un pictogramme, ce qu'on y fait, et pourquoi. */
export type AideEcran = { pictogramme: string; quoi: string; pourquoi: string };

/**
 * « Ici, vous… » : une phrase en tête de chaque écran de gouvernance. Elle se referme d'un clic et ne
 * revient plus (le choix est mémorisé par écran, comme dans le classique).
 */
export const AIDES_ECRAN: Record<string, AideEcran> = {
    '/': {
        pictogramme: '🏠',
        quoi: "Ici, vous voyez où en est la description de vos données et ce qu'il reste à faire.",
        pourquoi: "Posez une question, ou partez d'un fichier : l'application propose, vous validez."
    },
    '/objets-metier': {
        pictogramme: '🏛️',
        quoi: 'Ici, vous dites à quoi ressemble une chose que vous gérez (un Client, un Contrat…) et qui en est responsable.',
        pourquoi: "Pour chaque information, trois questions : c'est quoi, d'où ça vient, qui s'en sert."
    },
    '/import-gouvernance': {
        pictogramme: '⬆️',
        quoi: 'Ici, vous remplissez la gouvernance depuis un fichier, au lieu de la saisir écran par écran.',
        pourquoi: 'Partez du modèle pré-rempli : vos clés y sont déjà, vous ne complétez que les cases vides.'
    },
    '/dictionnaire': {
        pictogramme: '📚',
        quoi: 'Ici, chaque colonne de vos fichiers reçoit un nom compréhensible et une définition.',
        pourquoi: 'Le dictionnaire est ce que lira un collègue qui découvre la donnée.'
    },
    '/glossaire': {
        pictogramme: '📖',
        quoi: "Ici, vous fixez les mots du métier et ce qu'ils veulent dire, une bonne fois pour toutes.",
        pourquoi: 'Un mot du glossaire se pose ensuite comme une étiquette sur les informations concernées.'
    },
    '/actifs': {
        pictogramme: '🖥',
        quoi: "Ici, vous listez les applications qui produisent la donnée, les processus qui l'utilisent et les restitutions qui en sortent.",
        pourquoi: "C'est ce qui permet de répondre à « d'où ça vient » et « qui s'en sert »."
    },
    '/lineage': {
        pictogramme: '🕸️',
        quoi: "Ici, vous suivez la donnée de bout en bout : de l'application qui la crée jusqu'au rapport qui la montre.",
        pourquoi: 'Cliquez un élément pour isoler sa chaîne.'
    },
    '/catalogue': {
        pictogramme: '🧭',
        quoi: 'Ici, vous cherchez une donnée comme dans un annuaire : par mot, par domaine, par responsable.',
        pourquoi: 'Chaque résultat mène à sa fiche.'
    },
    '/modele': {
        pictogramme: '🧬',
        quoi: 'Ici, vous voyez comment vos fichiers se relient entre eux.',
        pourquoi: 'Un lien = une clé commune entre deux fichiers.'
    },
    '/personnes': {
        pictogramme: '👥',
        quoi: 'Ici, vous dites qui est responsable de quel domaine, et qui peut proposer des modifications.',
        pourquoi: 'Un responsable valide, un contributeur propose.'
    },
    '/propositions': {
        pictogramme: '✅',
        quoi: 'Ici, vous validez ou refusez les corrections proposées par vos collègues.',
        pourquoi: "Rien n'est écrasé avant votre décision."
    },
    '/sensibilite': {
        pictogramme: '🔐',
        quoi: 'Ici, vous repérez les données personnelles et sensibles pour les protéger.',
        pourquoi: 'Une information marquée « personnelle » est signalée partout où elle apparaît.'
    },
    '/listes-de-valeurs': {
        pictogramme: '🎚️',
        quoi: 'Ici, vous décrivez les codes et leur signification (par exemple « A = Actif »).',
        pourquoi: 'Utile pour que tout le monde lise les mêmes valeurs de la même façon.'
    },
    '/perimetres': {
        pictogramme: '🧩',
        quoi: 'Ici, vous regroupez des fichiers par sujet ou par équipe.',
        pourquoi: 'Un périmètre sert ensuite de filtre dans les autres écrans.'
    }
};

/** L'aide d'un écran, ou rien quand cet écran n'en a pas. */
export function aideDe(chemin: string): AideEcran | null {
    return AIDES_ECRAN[chemin] || null;
}
