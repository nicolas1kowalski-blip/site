/**
 * Modèle de données : les liens entre sources (clé étrangère → clé primaire), lus et écrits dans le document
 * appState (champ « relations ») pour rester partagés avec l'application classique, qui les enregistre par
 * NOM de table. L'API ajoute les identifiants de sources (sourceId, targetId) pour les clients typés.
 *
 * Détection par le contenu : pour chaque colonne de même nom entre deux sources, si la colonne est unique
 * d'un côté et que la grande majorité des valeurs de l'autre côté s'y retrouvent, un lien N-1 est proposé.
 */
import { Injectable } from '@nestjs/common';
import { erreurIntrouvable, erreurRequete } from '../commun/erreurs';
import { DocumentsService } from '../documents/documents.service';
import { EspacesService, RessourcesEspace } from '../espaces/espaces.service';
import { identifiantSql } from '../espaces/moteur-duckdb';
import { DocumentSource, SourcesService } from '../sources/sources.service';
import {
    MesureRelation,
    RegleLien,
    ResultatRegleLien,
    mesureDepuisLigne,
    sqlLignesEnDefautRegleLien,
    sqlMesureRelation,
    sqlTestRegleLien
} from './regles-liens';

/** Une paire de colonnes qui s'ajoute à la clé d'un lien : c'est ce qui rend la clé composite. */
export type PaireDeColonnes = { sourceCol: string; targetCol: string };

/** Lien tel qu'il est enregistré par l'application classique (par nom de table). */
export type RelationEnregistree = {
    sourceTable: string;
    sourceCol: string;
    targetTable: string;
    targetCol: string;
    /**
     * Colonnes qui s'ajoutent à la clé du lien, quand une seule ne suffit pas à l'identifier. Un élément qui
     * appartient à plusieurs groupes se retrouve une fois par groupe : joint sur le seul élément, il multiplie
     * les lignes. La clé (groupe, élément) rétablit la vérité. Absent ou vide = clé simple, comme avant.
     */
    extraCols?: PaireDeColonnes[];
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

type EtatApplication = {
    relations?: RelationEnregistree[];
    governance?: { rules?: RegleLien[]; [autre: string]: unknown };
    [autre: string]: unknown;
};

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

    /** Modifie la cardinalité déclarée, la nature (composition, agrégation, référence) ou la clé d'un lien. */
    async modifier(
        espaceId: string,
        id: string,
        changements: { cardinality?: string; kind?: string; extraCols?: PaireDeColonnes[] },
        auteurId: string
    ): Promise<Relation[]> {
        const etat = await this.etat(espaceId);
        const relation = etat.relations!.find(candidat => identifiantRelation(candidat) === id);
        if (!relation) throw erreurIntrouvable('Lien inconnu.');
        if (changements.cardinality !== undefined) relation.cardinality = changements.cardinality;
        if (changements.kind !== undefined) relation.kind = changements.kind;
        if (changements.extraCols !== undefined) {
            const sources = await this.sources.lister(espaceId);
            for (const paire of changements.extraCols)
                for (const [nomTable, nomColonne] of [
                    [relation.sourceTable, paire.sourceCol],
                    [relation.targetTable, paire.targetCol]
                ]) {
                    const source = sources.find(candidat => candidat.name === nomTable);
                    if (!source || !(source.headers || []).includes(nomColonne))
                        throw erreurRequete(`La colonne « ${nomColonne} » n'existe pas dans « ${nomTable} ».`);
                }
            relation.extraCols = changements.extraCols;
        }
        await this.enregistrer(espaceId, etat, auteurId);
        return this.relations(espaceId);
    }

    /** Mesure un lien sur les données : cardinalité constatée, orphelins de chaque côté ; mémorisée sur le lien. */
    async mesurer(espace: { id: string; code: string }, id: string, auteurId: string): Promise<MesureRelation> {
        const etat = await this.etat(espace.id);
        const relation = etat.relations!.find(candidat => identifiantRelation(candidat) === id);
        if (!relation) throw erreurIntrouvable('Lien inconnu.');
        const nomTableDe = await this.resolveurDeTables(espace.id);
        const ressources = await this.espaces.ressources(espace);
        const resultat = await ressources.moteur.executer(
            sqlMesureRelation(nomTableDe(relation.sourceTable), relation.sourceCol, nomTableDe(relation.targetTable), relation.targetCol)
        );
        const mesure = mesureDepuisLigne(resultat.lignes[0]);
        relation.measured = mesure;
        if (!relation.cardinality) relation.cardinality = mesure.suggested;
        await this.enregistrer(espace.id, etat, auteurId);
        return mesure;
    }

    // ---- règles métier sur les liens (governance.rules) ----
    async reglesLiens(espaceId: string): Promise<RegleLien[]> {
        return this.listeRegles(await this.etat(espaceId));
    }

    async ecrireRegleLien(espaceId: string, regle: RegleLien, auteurId: string): Promise<RegleLien[]> {
        const etat = await this.etat(espaceId);
        const regles = this.listeRegles(etat);
        const position = regles.findIndex(candidat => candidat.id === regle.id);
        if (position >= 0) regles[position] = regle;
        else regles.push(regle);
        await this.enregistrer(espaceId, etat, auteurId);
        return regles;
    }

    async supprimerRegleLien(espaceId: string, id: string, auteurId: string): Promise<RegleLien[]> {
        const etat = await this.etat(espaceId);
        const regles = this.listeRegles(etat).filter(candidat => candidat.id !== id);
        etat.governance!.rules = regles;
        await this.enregistrer(espaceId, etat, auteurId);
        return regles;
    }

    /** Contrôle une règle sur les données : parents en défaut et exemples. */
    async testerRegleLien(espace: { id: string; code: string }, id: string): Promise<ResultatRegleLien> {
        const regle = (await this.reglesLiens(espace.id)).find(candidat => candidat.id === id);
        if (!regle) throw erreurIntrouvable('Règle inconnue.');
        const nomTableDe = await this.resolveurDeTables(espace.id);
        const ressources = await this.espaces.ressources(espace);
        const resultat = await ressources.moteur.executer(
            sqlTestRegleLien(regle, nomTableDe(regle.parentTable), nomTableDe(regle.childTable))
        );
        const [total, violations, exemples] = resultat.lignes[0];
        return {
            total: Number(total),
            violations: Number(violations || 0),
            exemples: (Array.isArray(exemples) ? (exemples as string[]) : []).filter(Boolean).slice(0, 5)
        };
    }

    /** Lignes du parent qui ne respectent pas une règle (page de 50). */
    async lignesRegleLien(
        espace: { id: string; code: string },
        id: string,
        offset: number
    ): Promise<{ colonnes: string[]; lignes: unknown[][]; total: number; offset: number }> {
        const regle = (await this.reglesLiens(espace.id)).find(candidat => candidat.id === id);
        if (!regle) throw erreurIntrouvable('Règle inconnue.');
        const nomTableDe = await this.resolveurDeTables(espace.id);
        const ressources = await this.espaces.ressources(espace);
        const requete = sqlLignesEnDefautRegleLien(regle, nomTableDe(regle.parentTable), nomTableDe(regle.childTable));
        const [page, total] = await Promise.all([
            ressources.moteur.executer(`SELECT * FROM (${requete}) AS defauts LIMIT 50 OFFSET ${Math.max(0, Math.floor(offset))}`),
            ressources.moteur.executer(`SELECT COUNT(*)::BIGINT FROM (${requete}) AS defauts`)
        ]);
        return { colonnes: page.colonnes.map(colonne => colonne.nom), lignes: page.lignes, total: Number(total.lignes[0][0]), offset };
    }

    private listeRegles(etat: EtatApplication): RegleLien[] {
        etat.governance ||= {};
        if (!Array.isArray(etat.governance.rules)) etat.governance.rules = [];
        return etat.governance.rules;
    }

    /** Nom de table DuckDB d'une source désignée par son nom ; erreur explicite si elle n'est pas chargée. */
    private async resolveurDeTables(espaceId: string): Promise<(nomSource: string) => string> {
        const sources = await this.sources.lister(espaceId);
        return nomSource => {
            const source = sources.find(candidat => candidat.name === nomSource);
            if (!source) throw erreurRequete(`Table « ${nomSource} » non chargée.`);
            return 't_' + source.id;
        };
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
