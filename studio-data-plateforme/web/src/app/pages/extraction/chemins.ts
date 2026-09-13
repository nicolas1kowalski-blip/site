/**
 * Chemins de jointure entre la table de départ d'une extraction et les autres tables du modèle de données.
 *
 * Deux tables ne sont pas toujours reliées d'une seule façon : une table des personnes peut être atteinte
 * par le lien « souscripteur » comme par le lien « bénéficiaire ». Ce module énumère tous les chemins possibles
 * (jusqu'à un nombre d'étapes donné), leur donne une clé stable et un libellé lisible, et sait transformer les
 * chemins réellement utilisés en jointures — chaque chemin recevant sa propre route, pour que la même table
 * puisse être ramenée plusieurs fois côte à côte.
 *
 * Fonctions pures : elles ne connaissent que les liens et les noms de tables, jamais l'écran.
 */
import type { JointureExtraction, Relation } from '../../coeur/modeles';

/** Une étape de chemin : un lien parcouru dans un sens donné. */
export type EtapeChemin = {
    relationId: string;
    deTableId: string;
    deColonne: string;
    versTableId: string;
    versColonne: string;
};
export type Chemin = EtapeChemin[];

/** Au-delà de trois étapes, un chemin n'est plus compréhensible et les jointures deviennent coûteuses. */
export const ETAPES_MAXIMUM = 3;

/**
 * Route particulière : « le lien renseigné, quel qu'il soit ». Quand une table est atteignable de plusieurs
 * façons et qu'une seule est renseignée par ligne — un contrat rattaché soit à une personne physique, soit à
 * une personne morale — imposer un choix n'aurait pas de sens : toutes les routes sont jointes et la première
 * valeur non vide l'emporte. C'est ce que l'écran propose et présélectionne.
 */
export const ROUTE_INDIFFERENTE = 'any';

/** Clé stable d'un chemin : les liens parcourus, dans l'ordre. Le chemin vide (la table de départ) donne ''. */
export function cleChemin(chemin: Chemin): string {
    return chemin.map(etape => etape.relationId).join('>');
}

/** Les deux sens de parcours d'un lien ; un lien dont une extrémité n'est pas chargée est ignoré. */
function etapesDuLien(relation: Relation): EtapeChemin[] {
    if (!relation.sourceId || !relation.targetId) return [];
    return [
        {
            relationId: relation.id,
            deTableId: relation.sourceId,
            deColonne: relation.sourceCol,
            versTableId: relation.targetId,
            versColonne: relation.targetCol
        },
        {
            relationId: relation.id,
            deTableId: relation.targetId,
            deColonne: relation.targetCol,
            versTableId: relation.sourceId,
            versColonne: relation.sourceCol
        }
    ];
}

/**
 * Tous les chemins de la table de départ vers la table visée, du plus court au plus long. Un chemin ne repasse
 * jamais par une table déjà traversée : on évite ainsi les allers-retours par le même lien.
 */
export function cheminsVers(baseId: string, cibleId: string, relations: Relation[], etapesMaximum = ETAPES_MAXIMUM): Chemin[] {
    if (baseId === cibleId) return [[]];
    const etapes = relations.flatMap(etapesDuLien);
    const trouves: Chemin[] = [];
    const explorer = (tableCourante: string, visitees: string[], chemin: Chemin) => {
        if (chemin.length >= etapesMaximum) return;
        for (const etape of etapes) {
            if (etape.deTableId !== tableCourante || visitees.includes(etape.versTableId)) continue;
            const suite = [...chemin, etape];
            if (etape.versTableId === cibleId) trouves.push(suite);
            else explorer(etape.versTableId, [...visitees, etape.versTableId], suite);
        }
    };
    explorer(baseId, [baseId], []);
    return trouves.sort((premier, second) => premier.length - second.length);
}

/** Toutes les tables que l'on peut atteindre depuis la table de départ, la table de départ comprise. */
export function tablesAccessibles(baseId: string, relations: Relation[], etapesMaximum = ETAPES_MAXIMUM): string[] {
    const etapes = relations.flatMap(etapesDuLien);
    const atteintes = new Set([baseId]);
    let frontiere = [baseId];
    for (let saut = 0; saut < etapesMaximum && frontiere.length; saut++) {
        const suivante: string[] = [];
        for (const etape of etapes)
            if (frontiere.includes(etape.deTableId) && !atteintes.has(etape.versTableId)) {
                atteintes.add(etape.versTableId);
                suivante.push(etape.versTableId);
            }
        frontiere = suivante;
    }
    return [...atteintes];
}

/** Libellé d'un chemin : « commandes.id_client → clients.id_client », étape par étape. */
export function libelleChemin(chemin: Chemin, nomDe: (tableId: string) => string): string {
    if (!chemin.length) return 'table de départ';
    return chemin
        .map(etape => `${nomDe(etape.deTableId)}.${etape.deColonne} → ${nomDe(etape.versTableId)}.${etape.versColonne}`)
        .join(' puis ');
}

/**
 * Traduit les chemins réellement utilisés en jointures, dans un ordre où chacune part d'une route déjà posée.
 * Les préfixes communs sont partagés : deux colonnes qui passent par le même début de chemin ne provoquent
 * qu'une seule jointure pour cette portion. La route d'un chemin est sa clé ; la table de départ a la sienne.
 */
export function planifierJointures(cheminsUtilises: Chemin[], baseId: string): JointureExtraction[] {
    const jointures: JointureExtraction[] = [];
    const routesPosees = new Set<string>(['']);
    for (const chemin of cheminsUtilises)
        for (let longueur = 1; longueur <= chemin.length; longueur++) {
            const prefixe = chemin.slice(0, longueur);
            const cle = cleChemin(prefixe);
            if (routesPosees.has(cle)) continue;
            routesPosees.add(cle);
            const etape = prefixe[longueur - 1];
            const depuis = cleChemin(prefixe.slice(0, longueur - 1));
            jointures.push({
                cle,
                depuis: depuis || baseId,
                deTableId: etape.deTableId,
                deColonne: etape.deColonne,
                versTableId: etape.versTableId,
                versColonne: etape.versColonne
            });
        }
    return jointures;
}

/** Route à inscrire dans une colonne ou un filtre : la clé du chemin, ou la table de départ si le chemin est vide. */
export function routeDuChemin(chemin: Chemin, baseId: string): string {
    return cleChemin(chemin) || baseId;
}

/** Retrouve un chemin à partir de sa clé, parmi ceux qui mènent à la table visée. */
export function cheminParCle(chemins: Chemin[], cle: string): Chemin | undefined {
    return chemins.find(candidat => cleChemin(candidat) === cle);
}
