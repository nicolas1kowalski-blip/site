/**
 * Modèle de données : les liens entre sources (clé étrangère → clé primaire), lus et écrits dans le document
 * appState (champ « relations ») pour rester partagés avec l'application classique, qui les enregistre par
 * NOM de table. L'API ajoute les identifiants de sources (sourceId, targetId) pour les clients typés.
 *
 * Détection par le contenu : pour chaque colonne de même nom entre deux sources, si la colonne est unique
 * d'un côté et que la grande majorité des valeurs de l'autre côté s'y retrouvent, un lien N-1 est proposé.
 */
import { Injectable } from '@nestjs/common';
import { erreurRequete } from '../commun/erreurs';
import { DocumentsService } from '../documents/documents.service';
import { EspacesService, RessourcesEspace } from '../espaces/espaces.service';
import { identifiantSql } from '../espaces/moteur-duckdb';
import { DocumentSource, SourcesService } from '../sources/sources.service';

/** Lien tel qu'il est enregistré par l'application classique (par nom de table). */
export type RelationEnregistree = {
    sourceTable: string;
    sourceCol: string;
    targetTable: string;
    targetCol: string;
    cardinality?: string;
    kind?: string;
    measured?: unknown;
};

/** Lien enrichi pour les clients : identifiants de sources et identifiant stable calculé. */
export type Relation = RelationEnregistree & { id: string; sourceId: string | null; targetId: string | null };

export type PropositionLien = RelationEnregistree & {
    sourceId: string;
    targetId: string;
    /** Part des valeurs de la colonne source retrouvées dans la colonne cible (0 à 1). */
    couverture: number;
    valeursSource: number;
};

type EtatApplication = { relations?: RelationEnregistree[]; [autre: string]: unknown };

/** Identifiant stable d'un lien, dérivé de ses quatre composantes (la classique n'en persiste pas). */
export function identifiantRelation(relation: RelationEnregistree): string {
    return [relation.sourceTable, relation.sourceCol, relation.targetTable, relation.targetCol].join('§');
}

const COUVERTURE_MINIMALE = 0.8;
const PART_UNIQUE_MINIMALE = 0.98;

@Injectable()
export class ModeleService {
    constructor(
        private readonly documents: DocumentsService,
        private readonly sources: SourcesService,
        private readonly espaces: EspacesService
    ) {}

    async relations(espaceId: string): Promise<Relation[]> {
        const [etat, sources] = await Promise.all([this.etat(espaceId), this.sources.lister(espaceId)]);
        const idParNom = new Map(sources.map(source => [source.name, String(source.id)]));
        return etat.relations!.map(relation => ({
            ...relation,
            id: identifiantRelation(relation),
            sourceId: idParNom.get(relation.sourceTable) ?? null,
            targetId: idParNom.get(relation.targetTable) ?? null
        }));
    }

    /** Ajoute un lien s'il n'existe pas déjà (dans un sens ou dans l'autre) ; renvoie vrai s'il a été ajouté. */
    async ajouter(espaceId: string, relation: RelationEnregistree, auteurId: string): Promise<boolean> {
        const sources = await this.sources.lister(espaceId);
        for (const [nomTable, nomColonne] of [
            [relation.sourceTable, relation.sourceCol],
            [relation.targetTable, relation.targetCol]
        ]) {
            const source = sources.find(candidat => candidat.name === nomTable);
            if (!source) throw erreurRequete(`Source inconnue : « ${nomTable} ».`);
            if (!(source.headers || []).includes(nomColonne))
                throw erreurRequete(`La colonne « ${nomColonne} » n'existe pas dans « ${nomTable} ».`);
        }
        const etat = await this.etat(espaceId);
        const existe = etat.relations!.some(
            candidat =>
                (candidat.sourceTable === relation.sourceTable &&
                    candidat.sourceCol === relation.sourceCol &&
                    candidat.targetTable === relation.targetTable &&
                    candidat.targetCol === relation.targetCol) ||
                (candidat.sourceTable === relation.targetTable &&
                    candidat.sourceCol === relation.targetCol &&
                    candidat.targetTable === relation.sourceTable &&
                    candidat.targetCol === relation.sourceCol)
        );
        if (existe) return false;
        etat.relations!.push({
            sourceTable: relation.sourceTable,
            sourceCol: relation.sourceCol,
            targetTable: relation.targetTable,
            targetCol: relation.targetCol,
            cardinality: relation.cardinality || '',
            kind: relation.kind || '',
            measured: relation.measured ?? null
        });
        await this.enregistrer(espaceId, etat, auteurId);
        return true;
    }

    async supprimer(espaceId: string, id: string, auteurId: string): Promise<boolean> {
        const etat = await this.etat(espaceId);
        const avant = etat.relations!.length;
        etat.relations = etat.relations!.filter(relation => identifiantRelation(relation) !== id);
        if (etat.relations.length === avant) return false;
        await this.enregistrer(espaceId, etat, auteurId);
        return true;
    }

    /** Propose des liens d'après le contenu des sources (colonnes de même nom, unicité, couverture). */
    async detecter(espace: { id: string; code: string }): Promise<PropositionLien[]> {
        const [sources, existantes, ressources] = await Promise.all([
            this.sources.lister(espace.id),
            this.relations(espace.id),
            this.espaces.ressources(espace)
        ]);
        const propositions: PropositionLien[] = [];
        const dejaLiees = new Set(existantes.map(relation => relation.id));
        const statistiques = new Map<string, { total: number; distinctes: number; nonVides: number }>();
        const statistiqueDe = async (source: DocumentSource, colonne: string) => {
            const cle = source.id + '§' + colonne;
            if (!statistiques.has(cle)) statistiques.set(cle, await mesurerColonne(ressources, String(source.id), colonne));
            return statistiques.get(cle)!;
        };
        for (const cible of sources) {
            for (const colonne of cible.headers || []) {
                const candidates = sources.filter(autre => autre.id !== cible.id && (autre.headers || []).includes(colonne));
                if (!candidates.length) continue;
                const statistiqueCible = await statistiqueDe(cible, colonne);
                if (!statistiqueCible.nonVides || statistiqueCible.distinctes / statistiqueCible.nonVides < PART_UNIQUE_MINIMALE) continue;
                for (const origine of candidates) {
                    const proposition: RelationEnregistree = {
                        sourceTable: origine.name,
                        sourceCol: colonne,
                        targetTable: cible.name,
                        targetCol: colonne
                    };
                    if (dejaLiees.has(identifiantRelation(proposition))) continue;
                    const statistiqueOrigine = await statistiqueDe(origine, colonne);
                    if (!statistiqueOrigine.nonVides) continue;
                    // Une colonne unique des deux côtés est plutôt un identifiant commun qu'une clé étrangère : on garde
                    // uniquement le sens où l'origine a des répétitions, ou le premier sens rencontré sinon.
                    const couverture = await mesurerCouverture(ressources, String(origine.id), String(cible.id), colonne);
                    if (couverture < COUVERTURE_MINIMALE) continue;
                    propositions.push({
                        ...proposition,
                        sourceId: String(origine.id),
                        targetId: String(cible.id),
                        cardinality: 'N-1',
                        couverture,
                        valeursSource: statistiqueOrigine.nonVides
                    });
                }
            }
        }
        // Deux propositions symétriques (colonne unique des deux côtés) : on ne garde que la première.
        const vues = new Set<string>();
        return propositions.filter(proposition => {
            const cleSymetrique = [proposition.targetTable, proposition.targetCol, proposition.sourceTable, proposition.sourceCol].join(
                '§'
            );
            if (vues.has(cleSymetrique)) return false;
            vues.add(identifiantRelation(proposition));
            return true;
        });
    }

    private async etat(espaceId: string): Promise<EtatApplication> {
        const etat = ((await this.documents.lire<EtatApplication>(espaceId, 'appState')) || {}) as EtatApplication;
        if (!Array.isArray(etat.relations)) etat.relations = [];
        return etat;
    }

    private async enregistrer(espaceId: string, etat: EtatApplication, auteurId: string): Promise<void> {
        etat.savedAt = new Date().toISOString();
        await this.documents.ecrire(espaceId, 'appState', etat, auteurId);
    }
}

/** Clé de comparaison utilisée partout dans Studio Data : texte, sans espaces autour, majuscules, vide = NULL. */
export function cleNormalisee(expression: string): string {
    return `NULLIF(UPPER(TRIM(CAST(${expression} AS VARCHAR))), '')`;
}

async function mesurerColonne(ressources: RessourcesEspace, sourceId: string, colonne: string) {
    const cle = cleNormalisee(identifiantSql(colonne));
    const { lignes } = await ressources.moteur.executer(
        `SELECT COUNT(*)::BIGINT, COUNT(DISTINCT ${cle})::BIGINT, COUNT(${cle})::BIGINT FROM ${identifiantSql('t_' + sourceId)}`
    );
    return { total: Number(lignes[0][0]), distinctes: Number(lignes[0][1]), nonVides: Number(lignes[0][2]) };
}

async function mesurerCouverture(ressources: RessourcesEspace, origineId: string, cibleId: string, colonne: string): Promise<number> {
    const cle = cleNormalisee(identifiantSql(colonne));
    const { lignes } = await ressources.moteur.executer(
        `SELECT COUNT(*)::BIGINT, COUNT(*) FILTER (WHERE ${cle} IN (SELECT ${cle} FROM ${identifiantSql('t_' + cibleId)}))::BIGINT
         FROM ${identifiantSql('t_' + origineId)} WHERE ${cle} IS NOT NULL`
    );
    const total = Number(lignes[0][0]);
    return total ? Number(lignes[0][1]) / total : 0;
}
