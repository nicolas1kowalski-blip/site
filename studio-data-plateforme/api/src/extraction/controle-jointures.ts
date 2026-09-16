/**
 * Prévenir quand une jointure multiplie les lignes.
 *
 * Le piège est classique et silencieux : on joint deux tables sur une colonne qui ne suffit pas à
 * identifier la correspondance, et le résultat gonfle. Un élément rangé dans quatre groupes revient quatre
 * fois ; on ne s'en aperçoit qu'en comptant le résultat, souvent trop tard, parfois jamais — un total faux
 * a l'air d'un total.
 *
 * Ce module compte les lignes après chaque jointure, dans l'ordre où elles sont posées, et compare. Quand le
 * compte augmente, il le dit et nomme la cause probable : il manque une colonne à la clé du lien.
 *
 * Fonctions pures : elles fabriquent du SQL et interprètent des nombres, elles n'exécutent rien.
 */
import { cleNormalisee } from '../modele/modele.service';
import { identifiantSql } from '../espaces/moteur-duckdb';

/** Une jointure à contrôler, réduite à ce qu'il faut pour la reconstruire. */
export type JointureAControler = {
    /** Clé de route de la jointure ; c'est elle qui l'identifie dans l'extraction. */
    cle: string;
    /** Alias de la table d'où part la jointure : 't0' pour la table de départ, sinon l'alias d'une autre. */
    aliasDepart: string;
    nomTable: string;
    alias: string;
    deColonne: string;
    versColonne: string;
    /**
     * Les conditions en plus de la clé, déjà résolues en alias : la colonne de la table ajoutée, et la colonne
     * d'une table déjà jointe (pas forcément celle d'où part la jointure — celle qui porte le groupe peut se
     * trouver plus loin dans le modèle).
     */
    conditionsEnPlus: { versColonne: string; aliasCompare: string; colonneComparee: string }[];
};

/** Le rapport d'une jointure : ce qu'elle a fait au nombre de lignes. */
export type EtapeDuControle = { cle: string; nomTable: string; lignesAvant: number; lignesApres: number };

/**
 * Le SQL qui compte les lignes avec les `combien` premières jointures. Toujours en LEFT JOIN : on mesure ce
 * que la jointure ajoute, pas ce qu'un INNER retirerait — sans quoi une perte de lignes masquerait un gain.
 */
export function sqlDuComptage(nomTableDeBase: string, jointures: JointureAControler[], combien: number): string {
    const gardees = jointures.slice(0, combien);
    // Une condition ne peut viser qu'un alias déjà posé : au-delà, la table n'existe pas encore dans la requête.
    const aliasPoses = new Set(['t0', ...gardees.map(jointure => jointure.alias)]);
    const clauses = gardees.map(jointure => {
        const conditions = [
            `${cleNormalisee(`${jointure.alias}.${identifiantSql(jointure.versColonne)}`)} = ${cleNormalisee(`${jointure.aliasDepart}.${identifiantSql(jointure.deColonne)}`)}`
        ];
        for (const condition of jointure.conditionsEnPlus)
            if (aliasPoses.has(condition.aliasCompare))
                conditions.push(
                    `${cleNormalisee(`${jointure.alias}.${identifiantSql(condition.versColonne)}`)} = ${cleNormalisee(`${condition.aliasCompare}.${identifiantSql(condition.colonneComparee)}`)}`
                );
        return `LEFT JOIN ${identifiantSql(jointure.nomTable)} AS ${jointure.alias} ON ${conditions.join(' AND ')}`;
    });
    return `SELECT COUNT(*) AS lignes FROM ${identifiantSql(nomTableDeBase)} AS t0${clauses.length ? '\n' + clauses.join('\n') : ''}`;
}

/** En deçà de ce rapport, l'écart tient au hasard des données et ne mérite pas d'alerte. */
export const SEUIL_DE_MULTIPLICATION = 1.01;

/** Ce que la jointure a fait, et ce qu'il faut en penser. */
export type VerdictDeJointure = {
    cle: string;
    nomTable: string;
    lignesAvant: number;
    lignesApres: number;
    /** Combien de fois les lignes ont été multipliées : 1 = aucune, 4 = chaque ligne revient quatre fois. */
    facteur: number;
    multiplie: boolean;
    phrase: string;
};

/**
 * Le verdict d'une jointure. Le facteur est arrondi au centième : « 4 » se lit, « 4,0000001 » non. Une
 * jointure qui ne trouve rien laisse le compte inchangé — c'est un autre problème, que la mesure du lien
 * signale déjà (les orphelins) ; ici on ne parle que de multiplication.
 */
export function verdictDeLaJointure(etape: EtapeDuControle): VerdictDeJointure {
    const facteur = etape.lignesAvant ? Math.round((100 * etape.lignesApres) / etape.lignesAvant) / 100 : 1;
    const multiplie = facteur > SEUIL_DE_MULTIPLICATION;
    const facteurLisible = facteur.toLocaleString('fr-FR');
    return {
        cle: etape.cle,
        nomTable: etape.nomTable,
        lignesAvant: etape.lignesAvant,
        lignesApres: etape.lignesApres,
        facteur,
        multiplie,
        phrase: multiplie
            ? `« ${etape.nomTable} » multiplie les lignes : ${etape.lignesAvant.toLocaleString('fr-FR')} → ${etape.lignesApres.toLocaleString('fr-FR')} (×${facteurLisible}). Il manque sans doute une colonne à la clé de ce lien.`
            : `« ${etape.nomTable} » n'ajoute aucune ligne : ${etape.lignesAvant.toLocaleString('fr-FR')} ligne(s) avant comme après.`
    };
}

/** Le bilan de toutes les jointures d'une extraction, et ce qu'il faut en retenir en une phrase. */
export type BilanDesJointures = { jointures: VerdictDeJointure[]; multiplie: boolean; phrase: string };

export function bilanDesJointures(etapes: EtapeDuControle[]): BilanDesJointures {
    const jointures = etapes.map(verdictDeLaJointure);
    const fautives = jointures.filter(verdict => verdict.multiplie);
    if (!jointures.length) return { jointures, multiplie: false, phrase: 'Aucune table liée : rien ne peut multiplier les lignes.' };
    if (!fautives.length)
        return { jointures, multiplie: false, phrase: 'Aucune jointure ne multiplie les lignes : le résultat compte ce qu’il annonce.' };
    const total = jointures[jointures.length - 1].lignesApres;
    const depart = jointures[0].lignesAvant;
    return {
        jointures,
        multiplie: true,
        phrase: `${fautives.length} jointure(s) multiplient les lignes : ${depart.toLocaleString('fr-FR')} au départ, ${total.toLocaleString('fr-FR')} en sortie. Complétez la clé de ces liens dans le Modèle de données.`
    };
}
