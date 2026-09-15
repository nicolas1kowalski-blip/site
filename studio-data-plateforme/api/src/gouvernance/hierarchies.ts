/**
 * Les hiérarchies d'un objet métier, et l'audit de l'arbre sur les données — repris de la V13.
 *
 * Un objet se range souvent en arbre : un local dans un bâtiment, un bâtiment sur un site. La V13 laisse
 * déclarer cet arbre — la colonne qui porte le parent, celle qui porte la clé, et les niveaux avec leurs
 * parents admis — puis le confronte aux données réelles. Déclarer sans vérifier ne servirait à rien : ce
 * qui compte, c'est de savoir combien de lignes ne respectent pas l'arbre que l'on a décrit.
 *
 * Deux façons de porter le lien de parenté, comme dans le classique :
 *   • **dans la même table** : une colonne de l'enfant désigne la clé du parent ;
 *   • **par une table de liaison** : une table à part associe la clé de l'enfant à celle du parent.
 *
 * Ce fichier ne fabrique que du SQL : il n'ouvre aucune connexion et ne lit aucune donnée.
 */
import { identifiantSql, litteralSql } from '../espaces/moteur-duckdb';

/** Un niveau de l'arbre, et les niveaux dont il a le droit de dépendre. Sans parent admis, il est racine. */
export type NiveauHierarchie = { name: string; parents: string[] };

/** Une hiérarchie déclarée sur un objet métier. */
export type Hierarchie = {
    id: string;
    name: string;
    /** « self » : le parent est dans la même table ; « link » : il passe par une table de liaison. */
    mode: 'self' | 'link';
    childCol?: string;
    parentKeyCol?: string;
    linkTable?: string;
    linkChildCol?: string;
    linkParentCol?: string;
    typeCol?: string;
    maxDepth?: string;
    levels?: NiveauHierarchie[];
};

/** Ce que l'audit rapporte : ce qui va, et surtout ce qui ne va pas. */
export type AuditHierarchie = {
    total: number;
    racines: number;
    orphelins: number;
    bouclesSurSoi: number;
    violationsDeNiveau: number;
    typesInconnus: number;
    profondeurMaximale: number | null;
    auDelaDeLaProfondeur: number | null;
};

/**
 * Une valeur de clé, comparable : sans espaces de bord, en capitales, et le vide traité comme absent.
 * Sans cette normalisation, « PARIS » et « paris  » seraient deux parents différents.
 */
function cleComparable(alias: string, colonne: string): string {
    return `NULLIF(UPPER(TRIM(CAST(${alias}.${identifiantSql(colonne)} AS VARCHAR))), '')`;
}

/** Le type d'une ligne, comparable de la même façon. */
function typeComparable(alias: string, colonne: string): string {
    return `UPPER(TRIM(CAST(${alias}.${identifiantSql(colonne)} AS VARCHAR)))`;
}

/** Ce qui manque pour auditer, dit en clair — un audit sur une déclaration incomplète ne voudrait rien dire. */
export function cequiManquePourAuditer(hierarchie: Hierarchie): string {
    if (hierarchie.mode === 'link') {
        if (!hierarchie.linkTable) return 'Choisissez la table de liaison.';
        if (!hierarchie.linkChildCol || !hierarchie.linkParentCol) return 'Indiquez les colonnes enfant et parent de la liaison.';
        if (!hierarchie.parentKeyCol) return 'Indiquez la colonne clé de la table maître.';
        return '';
    }
    if (!hierarchie.childCol || !hierarchie.parentKeyCol) return 'Indiquez la colonne qui pointe vers le parent, et la colonne clé.';
    return '';
}

/** La jointure enfant → parent, et l'expression qui dit vers quel parent l'enfant pointe. */
function jointureDeLArbre(hierarchie: Hierarchie, tableMaitre: string, tableDeLiaison: string): { depuis: string; parentVise: string } {
    const maitre = identifiantSql(tableMaitre);
    if (hierarchie.mode === 'link') {
        const liaison = identifiantSql(tableDeLiaison);
        return {
            depuis: `FROM ${maitre} enfant
                LEFT JOIN ${liaison} lien ON ${cleComparable('lien', hierarchie.linkChildCol as string)} = ${cleComparable('enfant', hierarchie.parentKeyCol as string)}
                LEFT JOIN ${maitre} parent ON ${cleComparable('parent', hierarchie.parentKeyCol as string)} = ${cleComparable('lien', hierarchie.linkParentCol as string)}`,
            parentVise: cleComparable('lien', hierarchie.linkParentCol as string)
        };
    }
    return {
        depuis: `FROM ${maitre} enfant LEFT JOIN ${maitre} parent ON ${cleComparable('parent', hierarchie.parentKeyCol as string)} = ${cleComparable('enfant', hierarchie.childCol as string)}`,
        parentVise: cleComparable('enfant', hierarchie.childCol as string)
    };
}

/**
 * Quand un enfant a-t-il un parent qui n'est pas admis ? Pour chaque niveau déclaré : soit son parent porte
 * un type hors de sa liste, soit il n'admet aucun parent et en a pourtant un — un niveau racine qui dépend
 * de quelque chose est une violation, et c'est ce que la V13 signale.
 */
export function conditionDeViolationDeNiveau(hierarchie: Hierarchie): string {
    const niveaux = hierarchie.levels || [];
    if (!hierarchie.typeCol || !niveaux.length) return 'FALSE';
    const typeEnfant = typeComparable('enfant', hierarchie.typeCol);
    const typeParent = typeComparable('parent', hierarchie.typeCol);
    const parentPresent = `${cleComparable('parent', hierarchie.parentKeyCol as string)} IS NOT NULL`;
    return niveaux
        .map(niveau => {
            const admis = (niveau.parents || []).map(parent => litteralSql(parent.toUpperCase()));
            const cetEnfant = `${typeEnfant} = ${litteralSql(niveau.name.toUpperCase())}`;
            if (!admis.length) return `(${cetEnfant} AND ${parentPresent})`;
            return `(${cetEnfant} AND ${parentPresent} AND (${typeParent} IS NULL OR ${typeParent} NOT IN (${admis.join(', ')})))`;
        })
        .join(' OR ');
}

/** Un type présent dans les données mais qu'aucun niveau ne déclare : la déclaration est en retard sur le réel. */
export function conditionDeTypeInconnu(hierarchie: Hierarchie): string {
    const niveaux = hierarchie.levels || [];
    if (!hierarchie.typeCol || !niveaux.length) return 'FALSE';
    const type = typeComparable('enfant', hierarchie.typeCol);
    const connus = niveaux.map(niveau => litteralSql(niveau.name.toUpperCase()));
    return `(${type} IS NOT NULL AND ${type} NOT IN (${connus.join(', ')}))`;
}

/** Le décompte de l'arbre : combien de lignes, de racines, d'orphelins, de boucles et de violations. */
export function sqlAuditDeLArbre(hierarchie: Hierarchie, tableMaitre: string, tableDeLiaison = ''): string {
    const { depuis, parentVise } = jointureDeLArbre(hierarchie, tableMaitre, tableDeLiaison);
    const cleDuParent = cleComparable('parent', hierarchie.parentKeyCol as string);
    const cleDeLEnfant = cleComparable('enfant', hierarchie.parentKeyCol as string);
    return `SELECT COUNT(*)::BIGINT AS total,
        SUM(CASE WHEN ${parentVise} IS NULL THEN 1 ELSE 0 END)::BIGINT AS racines,
        SUM(CASE WHEN ${parentVise} IS NOT NULL AND ${cleDuParent} IS NULL THEN 1 ELSE 0 END)::BIGINT AS orphelins,
        SUM(CASE WHEN ${parentVise} = ${cleDeLEnfant} THEN 1 ELSE 0 END)::BIGINT AS bouclesSurSoi,
        SUM(CASE WHEN ${conditionDeViolationDeNiveau(hierarchie)} THEN 1 ELSE 0 END)::BIGINT AS violationsDeNiveau,
        SUM(CASE WHEN ${conditionDeTypeInconnu(hierarchie)} THEN 1 ELSE 0 END)::BIGINT AS typesInconnus
        ${depuis}`;
}

/** Au-delà de la profondeur annoncée, on cesse de descendre : un arbre bouclé ne doit pas faire tourner sans fin. */
export const MARGE_DE_PROFONDEUR = 3;

/**
 * La profondeur réelle de l'arbre, et combien de lignes dépassent la profondeur annoncée. On part des
 * racines et l'on descend, en s'arrêtant un peu au-delà de la limite déclarée : cette borne est ce qui
 * protège d'un arbre qui se referme sur lui-même.
 */
export function sqlProfondeurDeLArbre(hierarchie: Hierarchie, tableMaitre: string, profondeurAnnoncee: number): string {
    const maitre = identifiantSql(tableMaitre);
    const borne = profondeurAnnoncee + MARGE_DE_PROFONDEUR;
    const cle = cleComparable('enfant', hierarchie.parentKeyCol as string);
    const versLeParent = cleComparable('enfant', hierarchie.childCol as string);
    return `WITH RECURSIVE descente AS (
            SELECT ${cle} AS cle, 1 AS profondeur FROM ${maitre} enfant WHERE ${versLeParent} IS NULL
            UNION ALL
            SELECT ${cle}, parcours.profondeur + 1 FROM ${maitre} enfant
                JOIN descente parcours ON ${versLeParent} = parcours.cle WHERE parcours.profondeur <= ${borne}
        )
        SELECT COALESCE(MAX(profondeur), 0)::BIGINT AS profondeurMaximale,
            SUM(CASE WHEN profondeur > ${profondeurAnnoncee} THEN 1 ELSE 0 END)::BIGINT AS auDela FROM descente`;
}

/** La profondeur ne se mesure que sur un arbre porté par la table elle-même, et si une limite est annoncée. */
export function profondeurMesurable(hierarchie: Hierarchie): number {
    const annoncee = Number.parseInt(String(hierarchie.maxDepth || ''), 10);
    if (hierarchie.mode === 'link' || !Number.isFinite(annoncee) || annoncee < 1) return 0;
    return annoncee;
}

/** Ce que l'audit dit une fois lu : rien d'alarmant, ou le compte de ce qui cloche. */
export function phraseDeLAudit(audit: AuditHierarchie): string {
    const soucis: string[] = [];
    if (audit.orphelins) soucis.push(`${audit.orphelins} orphelin(s)`);
    if (audit.bouclesSurSoi) soucis.push(`${audit.bouclesSurSoi} ligne(s) parent d'elles-mêmes`);
    if (audit.violationsDeNiveau) soucis.push(`${audit.violationsDeNiveau} parent(s) non admis`);
    if (audit.typesInconnus) soucis.push(`${audit.typesInconnus} type(s) non déclaré(s)`);
    if (audit.auDelaDeLaProfondeur) soucis.push(`${audit.auDelaDeLaProfondeur} ligne(s) au-delà de la profondeur annoncée`);
    if (!soucis.length) return `Arbre conforme : ${audit.total} ligne(s), ${audit.racines} racine(s).`;
    return `${audit.total} ligne(s) — ${soucis.join(' · ')}.`;
}
