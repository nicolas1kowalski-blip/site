/**
 * Service des codifications : rangées dans le document appState (champ « codifications », comme le fait
 * l'application classique pour ses recettes et ses rapprochements), exécutées sur le moteur DuckDB de l'espace.
 *
 * Trois choses à faire : rendre le résultat codé (avec l'origine et le score de chaque ligne), rendre les cas à
 * revoir avec leurs meilleurs candidats, et enregistrer une décision — laquelle descend dans la table de
 * correspondance, pour que le même libellé ne soit plus jamais à trancher.
 */
import { Injectable } from '@nestjs/common';
import { EspaceAvecRole } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { erreurIntrouvable, erreurRequete, messageUtilisateur } from '../commun/erreurs';
import { EspacesService } from '../espaces/espaces.service';
import { EtatApplication, GouvernanceService } from '../gouvernance/gouvernance.service';
import { nombre } from '../qualite/profilage';
import { SourcesService } from '../sources/sources.service';
import {
    BilanDeCodification,
    Codification,
    ErreurCodification,
    bilanDeCodification,
    correspondanceApresDecision,
    sqlDeCodification,
    sqlDesCasARevoir
} from './codification';

/** Le résultat rendu à l'écran : les lignes codées, leur bilan, et le SQL qui les a produites. */
export type ResultatCodification = {
    sql: string;
    colonnes: string[];
    lignes: unknown[][];
    bilan: BilanDeCodification;
};
/** Un cas à trancher : la ligne, son libellé, et les propositions de la nomenclature. */
export type CasARevoir = {
    rang: number;
    libelle: string;
    candidats: { code: string; libelleRef: string; chemin: string; score: number }[];
};

/** Combien de lignes on rend à l'écran : de quoi juger sans noyer le navigateur. */
export const LIGNES_MONTREES = 200;

@Injectable()
export class CodificationService {
    constructor(
        private readonly gouvernance: GouvernanceService,
        private readonly sources: SourcesService,
        private readonly espaces: EspacesService
    ) {}

    private codifications(etat: EtatApplication): Codification[] {
        if (!Array.isArray(etat['codifications'])) etat['codifications'] = [];
        return etat['codifications'] as Codification[];
    }

    async lister(espaceId: string): Promise<Codification[]> {
        return this.codifications(await this.gouvernance.etat(espaceId));
    }

    async ecrire(espace: EspaceAvecRole, utilisateur: Utilisateur, id: string, corps: Omit<Codification, 'id'>): Promise<Codification> {
        const etat = await this.gouvernance.etat(espace.id);
        const codifications = this.codifications(etat);
        const position = codifications.findIndex(candidat => candidat.id === id);
        const codification: Codification = { ...(position >= 0 ? codifications[position] : {}), ...corps, id };
        if (position >= 0) codifications[position] = codification;
        else codifications.push(codification);
        await this.gouvernance.enregistrer(espace, utilisateur, etat, 'codification.enregistrement', codification.nom);
        return codification;
    }

    async supprimer(espace: EspaceAvecRole, utilisateur: Utilisateur, id: string): Promise<void> {
        const etat = await this.gouvernance.etat(espace.id);
        const codifications = this.codifications(etat);
        const codification = codifications.find(candidat => candidat.id === id);
        if (!codification) throw erreurIntrouvable('Codification inconnue.');
        etat['codifications'] = codifications.filter(candidat => candidat.id !== id);
        await this.gouvernance.enregistrer(espace, utilisateur, etat, 'codification.suppression', codification.nom);
    }

    /** Le contexte que le module pur attend : le nom en base d'une table, d'après son nom métier. */
    private async contexte(espaceId: string): Promise<{ nomTableDe: (nomSource: string) => string }> {
        const sources = await this.sources.lister(espaceId);
        return {
            nomTableDe: (nomSource: string) => {
                const source = sources.find(candidat => candidat.name === nomSource);
                if (!source) throw new ErreurCodification(`La source « ${nomSource} » n'est pas chargée.`);
                return 't_' + source.id;
            }
        };
    }

    private async codificationDe(espaceId: string, id: string): Promise<Codification> {
        const codification = (await this.lister(espaceId)).find(candidat => candidat.id === id);
        if (!codification) throw erreurIntrouvable('Codification inconnue.');
        return codification;
    }

    /** Traduit les erreurs du module pur en refus lisibles plutôt qu'en erreur serveur. */
    private lisible(erreur: unknown): never {
        if (erreur instanceof ErreurCodification) throw erreurRequete(erreur.message);
        throw erreurRequete(messageUtilisateur(erreur));
    }

    /** Code la liste et rend les premières lignes, avec le bilan porté sur la totalité. */
    async executer(espace: EspaceAvecRole, id: string): Promise<ResultatCodification> {
        const codification = await this.codificationDe(espace.id, id);
        const contexte = await this.contexte(espace.id);
        try {
            const sql = this.sqlAvecDecisions(codification, contexte);
            const { moteur } = await this.espaces.ressources(espace);
            const [resultat, comptes] = await Promise.all([
                moteur.executer(`SELECT * EXCLUDE (__rn) FROM (\n${sql}\n) codee ORDER BY __statut, __rn LIMIT ${LIGNES_MONTREES}`),
                moteur.executer(`SELECT __statut, COUNT(*)::BIGINT AS lignes FROM (\n${sql}\n) codee GROUP BY __statut`)
            ]);
            const bilan = bilanDeCodification(comptes.lignes.map(ligne => ({ statut: String(ligne[0]), lignes: nombre(ligne[1]) })));
            return { sql, colonnes: resultat.colonnes.map(colonne => colonne.nom), lignes: resultat.lignes, bilan };
        } catch (erreur) {
            return this.lisible(erreur);
        }
    }

    /**
     * Le SQL de la codification, augmenté des lignes tranchées à la main. Une décision l'emporte sur tout le
     * reste : c'est un humain qui a regardé.
     */
    private sqlAvecDecisions(codification: Codification, contexte: { nomTableDe: (nomSource: string) => string }): string {
        const sql = sqlDeCodification(codification, contexte);
        const decisions = Object.entries(codification.decisions || {})
            .map(entree => ({ rang: Number(entree[0]) || 0, code: String(entree[1] || '') }))
            .filter(decision => decision.code);
        if (!decisions.length) return sql;
        const valeurs = decisions.map(decision => `(${decision.rang}, '${decision.code.replace(/'/g, "''")}')`).join(', ');
        return `SELECT codee.* REPLACE (
        COALESCE(tranchees.code, codee.__code) AS __code,
        CASE WHEN tranchees.code IS NOT NULL THEN 'decision' ELSE codee.__origine END AS __origine,
        CASE WHEN tranchees.code IS NOT NULL THEN 'office' ELSE codee.__statut END AS __statut)
    FROM (\n${sql}\n) codee
    LEFT JOIN (VALUES ${valeurs}) AS tranchees(rang, code) ON tranchees.rang = codee.__rn`;
    }

    /** Les cas à revoir, chacun avec ses meilleures propositions, rangées de la plus probable à la moins. */
    async casARevoir(espace: EspaceAvecRole, id: string, combien = 50): Promise<CasARevoir[]> {
        const codification = await this.codificationDe(espace.id, id);
        const contexte = await this.contexte(espace.id);
        try {
            const { moteur } = await this.espaces.ressources(espace);
            const resultat = await moteur.executer(sqlDesCasARevoir(codification, contexte, combien));
            const cas = new Map<number, CasARevoir>();
            for (const [rang, libelle, code, libelleRef, chemin, score] of resultat.lignes as unknown[][]) {
                const clef = nombre(rang);
                if (!cas.has(clef)) cas.set(clef, { rang: clef, libelle: String(libelle ?? ''), candidats: [] });
                cas.get(clef)!.candidats.push({
                    code: String(code ?? ''),
                    libelleRef: String(libelleRef ?? ''),
                    chemin: String(chemin ?? ''),
                    score: Number(score) || 0
                });
            }
            return [...cas.values()];
        } catch (erreur) {
            return this.lisible(erreur);
        }
    }

    /**
     * Enregistre une décision de revue : la ligne reçoit son code, et le libellé entre dans la table de
     * correspondance. C'est ce qui fait qu'un cas tranché une fois ne revient jamais — à la livraison
     * suivante, ce libellé-là est codé d'office.
     */
    async decider(
        espace: EspaceAvecRole,
        utilisateur: Utilisateur,
        id: string,
        decision: { rang: number; code: string; libelle: string }
    ): Promise<Codification> {
        const etat = await this.gouvernance.etat(espace.id);
        const codification = this.codifications(etat).find(candidat => candidat.id === id);
        if (!codification) throw erreurIntrouvable('Codification inconnue.');
        codification.decisions = { ...(codification.decisions || {}), [String(decision.rang)]: decision.code };
        codification.correspondances = correspondanceApresDecision(
            codification.correspondances || [],
            decision.libelle,
            decision.code,
            utilisateur.nomAffiche || utilisateur.email || '',
            new Date().toISOString().slice(0, 10)
        );
        await this.gouvernance.enregistrer(espace, utilisateur, etat, 'codification.decision', `${codification.nom} — ${decision.libelle}`);
        return codification;
    }
}
