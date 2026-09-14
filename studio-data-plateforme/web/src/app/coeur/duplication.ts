/**
 * Dupliquer un objet métier, un terme ou une application — repris de la V11 de l'application classique.
 *
 * Beaucoup de fiches se ressemblent : deux objets d'un même domaine, deux restitutions d'un même processus.
 * Les recopier à la main est long et fait perdre des informations en route. « Dupliquer » repart d'une fiche
 * existante et n'en garde que ce qui se transpose.
 *
 * Ce qui ne se transpose jamais :
 *   • **les identifiants** — la copie est une nouvelle fiche, informations comprises ;
 *   • **le nom** — suffixé « (copie) », pour que l'on pense à le changer ;
 *   • **le statut** — une copie repart en brouillon : elle n'a été validée par personne ;
 *   • **l'historique des décisions** — il appartient à l'original ;
 *   • **les sources d'une application** — une table n'a qu'un producteur : la copie ne peut pas le revendiquer ;
 *   • **les rattachements d'un terme** — ce qui pointait vers le terme d'origine continue de pointer vers lui.
 *
 * Fonctions pures : la fabrique d'identifiants est passée en paramètre, ce qui les rend prévisibles à l'essai.
 */
import type { Actif, ObjetMetier, TermeGlossaire } from './modeles';

/** Ce que l'on ajoute au nom d'une fiche copiée, pour que personne ne confonde l'original et la copie. */
export const SUFFIXE_COPIE = ' (copie)';
/** Une copie n'a été relue par personne : elle repart au début du circuit. */
export const STATUT_DE_DEPART = 'Brouillon';

/**
 * Fabrique d'identifiants : toujours passée en paramètre, jamais prise ici. C'est ce qui garde ces
 * fonctions prévisibles à l'essai — et ce qui les laisse totalement indépendantes du reste de l'application.
 */
export type FabriqueIdentifiant = (prefixe: string) => string;

/**
 * La copie d'un objet métier : ses informations sont recopiées (définitions, colonnes, usages, origines),
 * chacune avec un identifiant neuf. L'historique reste à l'original.
 */
export function copieDUnObjet(objet: ObjetMetier, identifiant: FabriqueIdentifiant): ObjetMetier {
    const copie: ObjetMetier = JSON.parse(JSON.stringify(objet));
    delete copie['history'];
    copie.id = identifiant('bo');
    copie.name = objet.name + SUFFIXE_COPIE;
    copie.status = STATUT_DE_DEPART;
    copie.elements = (copie.elements || []).map(information => ({ ...information, id: identifiant('be_') }));
    return copie;
}

/**
 * La copie d'un terme du glossaire. Les rattachements (objets, informations, applications) ne suivent pas :
 * ils désignent le terme d'origine, et c'est bien lui qu'ils veulent dire.
 */
export function copieDUnTerme(terme: TermeGlossaire, identifiant: FabriqueIdentifiant): TermeGlossaire {
    return { ...terme, id: identifiant('gl_'), term: terme.term + SUFFIXE_COPIE };
}

/**
 * La copie d'une application, d'un processus ou d'une restitution. Ses sources ne suivent pas : une table
 * n'a qu'un producteur, et il reste l'original.
 */
export function copieDUnActif(actif: Actif, identifiant: FabriqueIdentifiant): Actif {
    const copie: Actif = JSON.parse(JSON.stringify(actif));
    delete copie['history'];
    copie.id = identifiant('as_');
    copie.name = actif.name + SUFFIXE_COPIE;
    copie.sources = [];
    return copie;
}

/** Ce que l'on dit après une duplication : la copie est là, il reste à la renommer. */
export function messageDeCopie(nom: string, reserve = ''): string {
    return `Copie créée : « ${nom} ». Renommez-la.${reserve ? ' ' + reserve : ''}`;
}
