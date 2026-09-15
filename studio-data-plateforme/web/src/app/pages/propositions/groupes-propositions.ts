/**
 * Valider les propositions par paquets, et savoir qui a le droit de décider — repris de la V13.
 *
 * Les propositions n'arrivent pas une par une : quelqu'un relit une fiche entière et corrige cinq
 * définitions d'un coup. Les valider une par une, c'est cinq fois le même geste pour la même décision.
 * La V13 les regroupe donc par ce qu'elles visent — cette table, cet objet métier, ce terme, cette
 * application — et permet de trancher pour tout le groupe.
 *
 * Qui décide : le responsable du domaine, pas n'importe quel éditeur. Une définition du domaine Ventes
 * se valide par quelqu'un des Ventes ; un administrateur passe partout. C'est la seule façon pour que la
 * validation veuille dire quelque chose.
 *
 * Fonctions pures : elles ne connaissent que les propositions et les personnes, jamais l'écran.
 */
import type { Personne, Proposition } from '../../coeur/modeles';

/** Ce que vise une proposition, et sous quel nom on le montre. */
export type GroupeDePropositions = { cle: string; libelle: string; propositions: Proposition[] };

/** Le pictogramme de chaque genre de cible, comme dans le classique. */
const PICTOGRAMMES: Record<string, string> = { table: '▦', objet: '🏛️', terme: '📖', application: '🖥', domaine: '◫' };

/**
 * Ce que vise une proposition, en une clé stable. Une proposition qui porte sur une information est
 * rattachée à son objet : c'est la fiche de l'objet que l'on relit, pas l'information isolée.
 */
export function cleDuGroupe(proposition: Proposition): string {
    const cible = proposition.target || {};
    if (proposition.kind === 'dict' || proposition.kind === 'dictcol') return `table:${cible['tn'] || cible['table'] || ''}`;
    if (proposition.kind === 'term') return `terme:${cible['termId'] || ''}`;
    if (proposition.kind === 'asset') return `application:${cible['assetId'] || ''}`;
    if (cible['boId']) return `objet:${cible['boId']}`;
    return `domaine:${proposition.domain || ''}`;
}

/**
 * Le nom d'un groupe, tel qu'on le lit : le nom réel de la cible quand on le connaît, sinon ce que la
 * proposition en dit elle-même — jamais un identifiant interne, que personne ne saurait reconnaître.
 */
export function libelleDuGroupe(cle: string, nomsConnus: Record<string, string>): string {
    const separation = cle.indexOf(':');
    const genre = cle.slice(0, separation);
    const identifiant = cle.slice(separation + 1);
    const pictogramme = PICTOGRAMMES[genre] || '•';
    if (genre === 'domaine') return `${pictogramme} ${identifiant || 'Sans domaine'}`;
    return `${pictogramme} ${nomsConnus[identifiant] || identifiant || 'Sans nom'}`;
}

/** Regroupe les propositions en attente par ce qu'elles visent, dans leur ordre d'arrivée. */
export function regrouperLesPropositions(propositions: Proposition[], nomsConnus: Record<string, string>): GroupeDePropositions[] {
    const groupes: GroupeDePropositions[] = [];
    const parCle = new Map<string, GroupeDePropositions>();
    for (const proposition of propositions) {
        const cle = cleDuGroupe(proposition);
        let groupe = parCle.get(cle);
        if (!groupe) {
            groupe = { cle, libelle: libelleDuGroupe(cle, nomsConnus), propositions: [] };
            parCle.set(cle, groupe);
            groupes.push(groupe);
        }
        groupe.propositions.push(proposition);
    }
    return groupes;
}

// ---- qui peut décider ----

/** Ce qu'une personne peut trancher : les domaines dont elle répond, et le passe-partout de l'administrateur. */
export type PouvoirDeDecider = { domaines: string[]; partout: boolean };

/** Les rôles qui donnent le droit de trancher sur un domaine. */
const ROLES_QUI_DECIDENT = ['owner', 'admin'];

/**
 * Ce que peut trancher la personne connectée. On lui passe la règle qui reconnaît « moi » parmi les
 * personnes de la gouvernance (`correspondALIdentite`, dans l'écran des personnes) : ce module n'a pas à
 * savoir comment les comptes et les personnes se rapprochent, seulement à en tirer les domaines.
 * Un administrateur de l'espace décide partout — sans quoi une gouvernance mal peuplée se bloquerait.
 */
export function pouvoirDeDecider(
    personnes: Personne[],
    identite: { email?: string; nom?: string },
    administrateur: boolean,
    estMoi: (personne: Personne, identite: { email?: string; nom?: string }) => boolean
): PouvoirDeDecider {
    const domaines = personnes
        .filter(personne => estMoi(personne, identite))
        .flatMap(personne => (personne.roles || []).filter(role => ROLES_QUI_DECIDENT.includes(role.role)).map(role => role.domain));
    return { domaines: [...new Set(domaines)], partout: administrateur };
}

/** Peut-on trancher cette proposition ? Partout, ou sur le domaine dont on répond. */
export function peutDecider(proposition: Proposition, pouvoir: PouvoirDeDecider): boolean {
    if (pouvoir.partout) return true;
    return pouvoir.domaines.includes(proposition.domain || '');
}

/** Les propositions d'un groupe que l'on a le droit de trancher : ce sont celles que « tout valider » prendra. */
export function decidablesDuGroupe(groupe: GroupeDePropositions, pouvoir: PouvoirDeDecider): Proposition[] {
    return groupe.propositions.filter(proposition => peutDecider(proposition, pouvoir));
}

/**
 * Ce que l'on dit sur le bouton « tout valider » d'un groupe, et pourquoi il est parfois inactif. Le
 * silence serait pire : sans explication, un bouton grisé passe pour une panne.
 */
export function etatDuToutValider(
    groupe: GroupeDePropositions,
    pouvoir: PouvoirDeDecider
): { possible: boolean; libelle: string; raison: string } {
    const decidables = decidablesDuGroupe(groupe, pouvoir);
    if (!decidables.length)
        return {
            possible: false,
            libelle: '✔ Tout valider',
            raison: 'La validation revient au responsable du domaine concerné.'
        };
    const restantes = groupe.propositions.length - decidables.length;
    return {
        possible: true,
        libelle: `✔ Tout valider (${decidables.length})`,
        raison: restantes ? `${restantes} proposition(s) de ce groupe relèvent d'un autre responsable.` : ''
    };
}

// ---- les deux vues de l'écran « à valider » ----

/** Les deux façons de regarder les propositions : celles à trancher, et celles que l'on a soi-même faites. */
export const VUES_DES_PROPOSITIONS = [
    { cle: 'aValider', libelle: '✅ À valider' },
    { cle: 'parMoi', libelle: '✍️ Proposées par moi' }
] as const;
export type VueDesPropositions = (typeof VUES_DES_PROPOSITIONS)[number]['cle'];

/**
 * Les propositions que la vue demandée montre.
 *   • « à valider » : tout ce qui attend, réduit à ses propres domaines quand on le demande — c'est le
 *     réglage par défaut du classique, parce qu'une liste où l'on ne peut rien trancher décourage ;
 *   • « proposées par moi » : ce que l'on a soi-même proposé et qui attend encore une décision.
 */
export function propositionsDeLaVue(
    enAttente: Proposition[],
    vue: VueDesPropositions,
    pouvoir: PouvoirDeDecider,
    monIdentifiant: string,
    mesDomainesSeulement: boolean
): Proposition[] {
    if (vue === 'parMoi') return enAttente.filter(proposition => !!monIdentifiant && proposition.by === monIdentifiant);
    if (!mesDomainesSeulement) return enAttente;
    return enAttente.filter(proposition => peutDecider(proposition, pouvoir));
}

/** Des groupes rangés sous leur domaine métier, dans l'ordre où les domaines apparaissent. */
export type DomaineDePropositions = { domaine: string; groupes: GroupeDePropositions[] };

/**
 * Range les groupes sous leur domaine. C'est ainsi que le classique présente l'écran : on relit d'abord
 * les Ventes, puis la Finance — et non une liste où les domaines s'entremêlent.
 */
export function grouperParDomaine(groupes: GroupeDePropositions[]): DomaineDePropositions[] {
    const parDomaine: DomaineDePropositions[] = [];
    const connus = new Map<string, DomaineDePropositions>();
    for (const groupe of groupes) {
        const domaine = groupe.propositions[0]?.domain || 'Sans domaine';
        let rangee = connus.get(domaine);
        if (!rangee) {
            rangee = { domaine, groupes: [] };
            connus.set(domaine, rangee);
            parDomaine.push(rangee);
        }
        rangee.groupes.push(groupe);
    }
    return parDomaine;
}

/**
 * Où aller pour voir une proposition en contexte : la fiche qu'elle vise, ouverte sur l'écran qui la
 * porte. Lire « définition : vide → un client est… » ne suffit pas pour décider ; il faut voir la fiche.
 */
export function lienVersLaCible(cle: string): string {
    const separation = cle.indexOf(':');
    const genre = cle.slice(0, separation);
    const identifiant = cle.slice(separation + 1);
    if (genre === 'objet') return `/objets-metier?objet=${encodeURIComponent(identifiant)}`;
    if (genre === 'table') return `/dictionnaire?source=${encodeURIComponent(identifiant)}`;
    if (genre === 'terme') return '/glossaire';
    if (genre === 'application') return '/actifs';
    return '';
}

/** Le nombre de décisions passées que l'on déroule : au-delà, c'est l'écran Historique qui sert. */
export const DECISIONS_MONTREES = 50;

/** Ce qu'une valeur proposée donne à lire ; « vide » plutôt que rien, pour que la flèche garde un sens. */
export function valeurLisible(valeur: unknown): string {
    if (valeur == null || valeur === '') return 'vide';
    if (Array.isArray(valeur)) return valeur.length ? valeur.join(', ') : 'vide';
    if (typeof valeur === 'object') return JSON.stringify(valeur);
    return String(valeur);
}
