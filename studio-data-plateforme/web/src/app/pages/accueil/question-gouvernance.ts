/**
 * « Posez votre question » — repris de la V13 de l'application classique.
 *
 * On ne demande pas à un métier d'apprendre où cliquer : on lui demande sa question, en français.
 *   « qui est responsable de l'adresse client ? »  → le responsable, et son domaine ;
 *   « où va la prime ? »                           → ce qui s'en sert, en une phrase ;
 *   « d'où vient l'adresse ? »                     → l'application et le fichier d'origine ;
 *   « qu'est-ce qu'un sinistre ? »                 → la définition.
 *
 * Deux choses seulement à calculer : **de quoi on parle** (l'objet, l'information, le mot du glossaire ou
 * l'application dont le nom apparaît dans la question) et **ce qu'on veut savoir** (l'intention). Le reste
 * est déjà décrit dans la gouvernance ; il n'y a rien à deviner.
 *
 * Ce module rassemble aussi « Mes tâches » : ce qu'il reste à décrire, dans le domaine choisi.
 *
 * Fonctions pures : aucun accès au réseau ni au DOM.
 */
import type { Actif, ObjetMetier, TermeGlossaire } from '../../coeur/modeles';

/** Ce que la question cherche à savoir. */
export type Intention = 'definition' | 'responsable' | 'amont' | 'aval' | 'tout';

/** Une chose dont la gouvernance parle, et qu'une question peut désigner. */
export type EntiteGouvernance = {
    genre: 'objet' | 'information' | 'mot' | 'application';
    /** Ce qu'on montre : « Client », « Client › Adresse ». */
    nom: string;
    /** Le nom réduit sur lequel on compare, plus le nom de l'objet pour une information. */
    cle: string;
    cleLongue?: string;
    definition: string;
    responsable: string;
    domaine: string;
    objet?: ObjetMetier;
    information?: { id: string; name: string };
    mot?: TermeGlossaire;
    application?: Actif;
};

/** Le texte réduit à ce qui compte pour comparer : sans accents, sans ponctuation, en minuscules. */
export function normaliser(texte: string): string {
    return String(texte || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/** Ce que la question demande, déduit de la façon dont elle est tournée. */
export function intentionDe(question: string): Intention {
    const texte = normaliser(question);
    if (/responsable|proprietaire|qui gere|qui valide|owner|a qui/.test(texte)) return 'responsable';
    if (/ou va|qui utilise|qui s en sert|sert a|quel rapport|quelle restitution|consomm|usage/.test(texte)) return 'aval';
    if (/d ou vient|origine|source|provient|qui produit|alimente|vient de/.test(texte)) return 'amont';
    if (/qu est ce|c est quoi|definition|signifie|veut dire|que veut/.test(texte)) return 'definition';
    return 'tout';
}

/** Tout ce dont la gouvernance parle, à plat : objets, informations, mots du métier, applications. */
export function entitesGouvernance(objets: ObjetMetier[], mots: TermeGlossaire[], applications: Actif[]): EntiteGouvernance[] {
    const entites: EntiteGouvernance[] = [];
    for (const objet of objets) {
        entites.push({
            genre: 'objet',
            nom: objet.name,
            cle: normaliser(objet.name),
            definition: objet.definition || '',
            responsable: objet.globalOwner || '',
            domaine: objet.domain || '',
            objet
        });
        for (const information of objet.elements || [])
            entites.push({
                genre: 'information',
                nom: `${objet.name} › ${information.name}`,
                cle: normaliser(information.name),
                cleLongue: normaliser(`${information.name} ${objet.name}`),
                definition: information.definition || '',
                responsable: (information.owner || '').trim() || objet.globalOwner || '',
                domaine: objet.domain || '',
                objet,
                information
            });
    }
    for (const mot of mots)
        entites.push({
            genre: 'mot',
            nom: mot.term,
            cle: normaliser(mot.term),
            definition: mot.definition || '',
            responsable: '',
            domaine: mot.domain || '',
            mot
        });
    for (const application of applications)
        entites.push({
            genre: 'application',
            nom: application.name,
            cle: normaliser(application.name),
            definition: application.description || '',
            responsable: application.owner || '',
            domaine: application.domain || '',
            application
        });
    return entites;
}

/**
 * Les entités que la question désigne, la plus probable en tête. Un nom entier trouvé dans la question vaut
 * mieux que quelques mots communs ; citer l'objet en plus de l'information (« adresse du client ») départage
 * deux informations de même nom.
 */
export function chercherEntites(question: string, entites: EntiteGouvernance[]): EntiteGouvernance[] {
    const texte = ` ${normaliser(question)} `;
    return entites
        .map(entite => ({ entite, score: scoreDe(texte, entite) }))
        .filter(trouvee => trouvee.score > 0)
        .sort((premiere, seconde) => seconde.score - premiere.score)
        .map(trouvee => trouvee.entite);
}

/** Ce que vaut une entité pour cette question : 0 quand rien ne la désigne. */
function scoreDe(question: string, entite: EntiteGouvernance): number {
    let score = 0;
    if (entite.cle && question.includes(` ${entite.cle} `)) score = entite.cle.length + (entite.genre === 'information' ? 1 : 0);
    else {
        const mots = entite.cle.split(' ').filter(mot => mot.length > 3);
        const trouves = mots.filter(mot => question.includes(` ${mot} `)).length;
        if (trouves && trouves === mots.length) score = trouves * 3;
        else score = trouves;
    }
    if (score && entite.cleLongue && question.includes(entite.cleLongue)) score += 2;
    return score;
}

/** Une chose qui reste à faire, avec son nombre et où aller pour s'en occuper. */
export type TacheGouvernance = { libelle: string; nombre: number; lien: string };

/**
 * « Mes tâches » : ce qui manque pour que la donnée soit décrite. On ne liste que ce qui existe vraiment —
 * une liste vide est une bonne nouvelle, pas un écran vide.
 */
export function tachesDe(objets: ObjetMetier[], propositionsEnAttente: number, domaine = ''): TacheGouvernance[] {
    const concernes = objets.filter(objet => !domaine || (objet.domain || '') === domaine);
    // Un objet venu du serveur peut n'avoir aucune information : on ne suppose pas le tableau présent.
    const informations = concernes.flatMap(objet => objet.elements || []);
    const taches: TacheGouvernance[] = [];
    const sansResponsable = concernes.filter(objet => !(objet.globalOwner || '').trim()).length;
    if (sansResponsable) taches.push({ libelle: 'objet(s) sans responsable', nombre: sansResponsable, lien: '/objets-metier' });
    const sansDefinition = informations.filter(information => !(information.definition || '').trim()).length;
    if (sansDefinition) taches.push({ libelle: 'information(s) sans définition', nombre: sansDefinition, lien: '/objets-metier' });
    const sansOrigine = informations.filter(information => !(information.mappings || []).length).length;
    if (sansOrigine)
        taches.push({ libelle: "information(s) dont on ne sait pas d'où elles viennent", nombre: sansOrigine, lien: '/objets-metier' });
    const sansUsage = informations.filter(information => !(information.usedBy || []).length).length;
    if (sansUsage) taches.push({ libelle: 'information(s) dont personne ne dit se servir', nombre: sansUsage, lien: '/objets-metier' });
    if (propositionsEnAttente) taches.push({ libelle: 'proposition(s) à valider', nombre: propositionsEnAttente, lien: '/propositions' });
    return taches;
}
