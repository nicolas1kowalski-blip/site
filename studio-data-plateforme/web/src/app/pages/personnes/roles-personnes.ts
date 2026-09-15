/**
 * Personnes, rôles et domaines métier — repris de la V13.
 *
 * Trois rôles, et un quatrième qui passe partout :
 *   • le **propriétaire** modifie et valide ce qui touche à son domaine ;
 *   • le **contributeur** propose, et ses propositions attendent la décision d'un propriétaire ;
 *   • le **lecteur** consulte ;
 *   • l'**administrateur** de la gouvernance décide sur tous les domaines.
 *
 * Un rôle porte toujours sur un domaine, ou sur « tous les domaines » quand aucun n'est précisé. Une même
 * personne peut donc être propriétaire des Ventes et simple lectrice de la Finance : c'est ce qui permet
 * de dire, sur chaque écran, qui a le droit de trancher quoi.
 *
 * Un domaine ne se supprime pas à la légère : il est cité par des sources, des objets, des termes, des
 * applications et des rôles. L'écran dit donc ce qu'il sert avant qu'on le retire.
 *
 * Fonctions pures : elles ne connaissent que ce qu'on leur donne.
 */
import type { Personne, RolePersonne } from '../../coeur/modeles';

/** L'allure d'un rôle : son pictogramme, son nom, et les couleurs de sa puce. */
export type AllureDeRole = { pictogramme: string; libelle: string; classes: string };

/** Les quatre rôles, avec les pictogrammes et les couleurs du classique. */
export const ALLURES_DE_ROLE: Record<RolePersonne, AllureDeRole> = {
    owner: { pictogramme: '👑', libelle: 'Propriétaire', classes: 'bg-amber-50 border border-amber-300 text-amber-900' },
    contrib: { pictogramme: '✍️', libelle: 'Contributeur', classes: 'bg-sky-50 border border-sky-300 text-sky-900' },
    reader: { pictogramme: '👁', libelle: 'Lecteur', classes: 'bg-slate-100 border border-slate-300 text-slate-700' },
    admin: { pictogramme: '🛠', libelle: 'Administrateur', classes: 'bg-slate-800 text-white' }
};

/** L'allure d'un rôle ; celle de l'administrateur quand le rôle est inconnu, comme dans le classique. */
export function allureDeRole(role: string): AllureDeRole {
    return ALLURES_DE_ROLE[role as RolePersonne] || ALLURES_DE_ROLE.admin;
}

/** Ce que porte la puce d'un rôle : « 👑 Ventes · Propriétaire ». */
export function libelleDuRole(role: { domain: string; role: RolePersonne }): string {
    const allure = allureDeRole(role.role);
    return `${allure.pictogramme} ${role.domain || 'tous domaines'} · ${allure.libelle}`;
}

/** Ce qu'une personne est, en une phrase : « Propriétaire · Ventes, Lecteur · Finance ». */
export function resumeDesRoles(personne: Personne): string {
    return (personne.roles || []).map(role => `${allureDeRole(role.role).libelle} · ${role.domain || 'tous domaines'}`).join(', ');
}

/** Ce qui cite un domaine métier : c'est ce que l'on perdrait en le supprimant. */
export type UsageDunDomaine = { sources: number; objets: number; termes: number; actifs: number; roles: number };

/** Ce qu'un domaine sert, compté sur le référentiel de l'espace. */
export function usageDunDomaine(
    domaine: string,
    referentiel: {
        sources: { domaine?: string }[];
        objets: { domain?: string }[];
        termes: { domain?: string }[];
        actifs: { domain?: string }[];
        personnes: Personne[];
    }
): UsageDunDomaine {
    const memeDomaine = (valeur: unknown) => String(valeur || '').trim() === domaine;
    return {
        sources: referentiel.sources.filter(source => memeDomaine(source.domaine)).length,
        objets: referentiel.objets.filter(objet => memeDomaine(objet.domain)).length,
        termes: referentiel.termes.filter(terme => memeDomaine(terme.domain)).length,
        actifs: referentiel.actifs.filter(actif => memeDomaine(actif.domain)).length,
        roles: referentiel.personnes.reduce(
            (total, personne) => total + (personne.roles || []).filter(role => memeDomaine(role.domain)).length,
            0
        )
    };
}

/** L'usage d'un domaine en clair ; vide quand rien ne le cite — et il se supprime alors sans conséquence. */
export function phraseDeLUsage(usage: UsageDunDomaine): string {
    const morceaux: string[] = [];
    if (usage.sources) morceaux.push(`${usage.sources} source(s)`);
    if (usage.objets) morceaux.push(`${usage.objets} objet(s)`);
    if (usage.termes) morceaux.push(`${usage.termes} terme(s)`);
    if (usage.actifs) morceaux.push(`${usage.actifs} appli/processus`);
    if (usage.roles) morceaux.push(`${usage.roles} rôle(s)`);
    return morceaux.join(', ');
}

/**
 * Reconnaît la personne qui correspond au compte connecté. On la retrouve par son adresse électronique
 * quand les deux en portent une, sinon par son nom : les personnes de la gouvernance et les comptes de
 * l'application sont deux listes distinctes, et c'est tout ce dont on dispose pour les rapprocher.
 */
export function correspondALIdentite(personne: Personne, identite: { email?: string; nom?: string }): boolean {
    const comparable = (valeur: unknown) =>
        String(valeur || '')
            .trim()
            .toLowerCase();
    const email = comparable(identite.email);
    const sienne = comparable(personne.email);
    if (email && sienne) return sienne === email;
    const nom = comparable(identite.nom);
    return !!nom && comparable(personne.name) === nom;
}

/**
 * Le jeu de rôles d'exemple du classique : quatre personnes, un rôle chacune, sur tous les domaines. Il
 * sert à essayer le circuit « je propose, on valide » sans avoir à saisir son organisation au préalable ;
 * les données de l'espace ne sont pas touchées.
 */
export const PERSONNES_DEXEMPLE: { name: string; email: string; role: RolePersonne }[] = [
    { name: 'Alice Martin', email: 'alice@exemple.fr', role: 'owner' },
    { name: 'Bob Durand', email: 'bob@exemple.fr', role: 'contrib' },
    { name: 'Chloé Petit', email: 'chloe@exemple.fr', role: 'reader' },
    { name: 'Admin gouvernance', email: 'admin@exemple.fr', role: 'admin' }
];

/**
 * Les personnes d'exemple qui manquent encore. On ne recrée jamais celles qui portent déjà le même nom :
 * cliquer deux fois le bouton ne doit pas produire deux Alice.
 */
export function personnesDExempleAAjouter(existantes: Personne[]): { name: string; email: string; role: RolePersonne }[] {
    const nomsConnus = new Set(existantes.map(personne => String(personne.name || '').trim()));
    return PERSONNES_DEXEMPLE.filter(exemple => !nomsConnus.has(exemple.name));
}
