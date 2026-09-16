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
import type { ConditionDeLien, JointureExtraction, Relation } from '../../coeur/modeles';
import type { CaseExtraction } from './cases-extraction';

/** Une étape de chemin : un lien parcouru dans un sens donné. */
export type EtapeChemin = {
    relationId: string;
    deTableId: string;
    deColonne: string;
    versTableId: string;
    versColonne: string;
    /**
     * Les conditions qui s'ajoutent, quand la clé du lien est composite. Chacune contraint une colonne de la
     * table atteinte par cette étape, en la comparant à une colonne d'une autre table du modèle — pas
     * forcément celle d'où l'on part : la table qui porte le groupe peut se trouver plus loin.
     */
    conditionsEnPlus: ConditionEnPlus[];
};
/** Une condition en plus, une fois rapportée au sens de parcours de l'étape. */
export type ConditionEnPlus = {
    /** Colonne de la table atteinte par cette étape. */
    colonneJointe: string;
    /** Table (par son nom, comme dans les liens) dont la valeur doit correspondre, et sa colonne. */
    tableComparee: string;
    colonneComparee: string;
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

/**
 * Les conditions en plus d'un lien, rapportées à la table que l'étape vient d'atteindre. Une condition ne
 * s'applique que si l'un de ses deux côtés porte sur cette table : c'est elle que la condition contraint.
 * L'autre côté désigne la table à comparer, quelle qu'elle soit.
 */
export function conditionsPourLaTable(conditions: ConditionDeLien[], nomTableJointe: string): ConditionEnPlus[] {
    const retenues: ConditionEnPlus[] = [];
    for (const condition of conditions) {
        if (condition.versTable === nomTableJointe)
            retenues.push({
                colonneJointe: condition.versColonne,
                tableComparee: condition.deTable,
                colonneComparee: condition.deColonne
            });
        else if (condition.deTable === nomTableJointe)
            retenues.push({
                colonneJointe: condition.deColonne,
                tableComparee: condition.versTable,
                colonneComparee: condition.versColonne
            });
    }
    return retenues;
}

/** Les deux sens de parcours d'un lien ; un lien dont une extrémité n'est pas chargée est ignoré. */
function etapesDuLien(relation: Relation): EtapeChemin[] {
    if (!relation.sourceId || !relation.targetId) return [];
    const clePlus = relation.extraCols || [];
    return [
        {
            relationId: relation.id,
            deTableId: relation.sourceId,
            deColonne: relation.sourceCol,
            versTableId: relation.targetId,
            versColonne: relation.targetCol,
            conditionsEnPlus: conditionsPourLaTable(clePlus, relation.targetTable)
        },
        {
            relationId: relation.id,
            deTableId: relation.targetId,
            deColonne: relation.targetCol,
            versTableId: relation.sourceId,
            versColonne: relation.sourceCol,
            conditionsEnPlus: conditionsPourLaTable(clePlus, relation.sourceTable)
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
 *
 * Quand la clé d'un lien compare une table qui n'est pas encore là, cette table est ramenée d'office, par son
 * plus court chemin, et sa jointure est posée avant celle qui en dépend : la condition ne vaut que si la table
 * comparée existe déjà dans la requête. C'est le cas de la liste d'éléments qui ne connaît pas le groupe
 * elle-même — c'est une autre table, à un ou plusieurs liens de distance, qui le porte.
 */
export function planifierJointures(
    cheminsUtilises: Chemin[],
    baseId: string,
    relations: Relation[] = [],
    idDeLaTable: (nomTable: string) => string | undefined = () => undefined
): JointureExtraction[] {
    const jointures: JointureExtraction[] = [];
    const routesPosees = new Set<string>(['']);
    // Première route posée sur chaque table : c'est par elle que les conditions en plus la désigneront.
    const routeParTable = new Map<string, string>([[baseId, baseId]]);
    const poser = (chemin: Chemin) => {
        for (let longueur = 1; longueur <= chemin.length; longueur++) {
            const prefixe = chemin.slice(0, longueur);
            const cle = cleChemin(prefixe);
            if (routesPosees.has(cle)) continue;
            // Marquée avant d'aller chercher les tables comparées : un détour ne repasse pas par ici.
            routesPosees.add(cle);
            const etape = prefixe[longueur - 1];
            const conditions = conditionsResolues(etape, { relations, baseId, routeParTable, idDeLaTable, poser });
            jointures.push({
                cle,
                depuis: cleChemin(prefixe.slice(0, longueur - 1)) || baseId,
                deTableId: etape.deTableId,
                deColonne: etape.deColonne,
                versTableId: etape.versTableId,
                versColonne: etape.versColonne,
                conditionsEnPlus: conditions
            });
            if (!routeParTable.has(etape.versTableId)) routeParTable.set(etape.versTableId, cle);
        }
    };
    for (const chemin of cheminsUtilises) poser(chemin);
    return jointures;
}

/** Ce dont la résolution d'une condition a besoin : le modèle, les routes déjà posées, et de quoi en poser. */
type EntourageDuPlan = {
    relations: Relation[];
    baseId: string;
    routeParTable: Map<string, string>;
    idDeLaTable: (nomTable: string) => string | undefined;
    poser: (chemin: Chemin) => void;
};

/**
 * Les conditions en plus d'une étape, chacune rattachée à la route de la table qu'elle compare — table ramenée
 * d'office si elle manque. Une condition dont la table reste inatteignable est abandonnée : mieux vaut une
 * jointure incomplète, que le contrôle des tables liées signalera, qu'une requête impossible.
 */
function conditionsResolues(etape: EtapeChemin, entourage: EntourageDuPlan): NonNullable<JointureExtraction['conditionsEnPlus']> {
    const resolues: NonNullable<JointureExtraction['conditionsEnPlus']> = [];
    for (const condition of etape.conditionsEnPlus) {
        const tableComparee = entourage.idDeLaTable(condition.tableComparee);
        if (!tableComparee) continue;
        if (!entourage.routeParTable.has(tableComparee)) {
            const detour = cheminsVers(entourage.baseId, tableComparee, entourage.relations)[0];
            if (detour) entourage.poser(detour);
        }
        const routeComparee = entourage.routeParTable.get(tableComparee);
        if (routeComparee === undefined) continue;
        resolues.push({
            versColonne: condition.colonneJointe,
            tableComparee,
            routeComparee,
            colonneComparee: condition.colonneComparee
        });
    }
    return resolues;
}

/** Route à inscrire dans une colonne ou un filtre : la clé du chemin, ou la table de départ si le chemin est vide. */
export function routeDuChemin(chemin: Chemin, baseId: string): string {
    return cleChemin(chemin) || baseId;
}

/** Retrouve un chemin à partir de sa clé, parmi ceux qui mènent à la table visée. */
export function cheminParCle(chemins: Chemin[], cle: string): Chemin | undefined {
    return chemins.find(candidat => cleChemin(candidat) === cle);
}

/**
 * Toutes les cases, à partir des chemins menant à chaque table. Une case par chemin ; la table de départ en
 * a une, sans chemin. Les cases sont rendues de la moins profonde à la plus profonde.
 */
export function casesDuGraphe(
    baseId: string,
    cheminsParTable: Map<string, Chemin[]>,
    nomDe: (tableId: string) => string
): CaseExtraction[] {
    const cases: CaseExtraction[] = [
        { cle: '', tableId: baseId, nomTable: nomDe(baseId), profondeur: 0, cleParent: '', route: baseId, via: '', libelleLien: '' }
    ];
    for (const [tableId, chemins] of cheminsParTable)
        for (const chemin of chemins) {
            if (!chemin.length) continue;
            const derniere = chemin[chemin.length - 1];
            cases.push({
                cle: cleChemin(chemin),
                tableId,
                nomTable: nomDe(tableId),
                profondeur: chemin.length,
                cleParent: cleChemin(chemin.slice(0, -1)),
                route: cleChemin(chemin),
                via: libelleChemin(chemin, nomDe),
                libelleLien: `${nomDe(derniere.deTableId)}.${derniere.deColonne} → ${nomDe(derniere.versTableId)}.${derniere.versColonne}`
            });
        }
    return cases.sort((premiere, seconde) => premiere.profondeur - seconde.profondeur || premiere.nomTable.localeCompare(seconde.nomTable));
}
