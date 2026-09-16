/**
 * Service des codifications : rangées dans le document appState (champ « codifications », comme le fait
 * l'application classique pour ses recettes et ses rapprochements), exécutées sur le moteur DuckDB de l'espace.
 *
 * Trois choses à faire : rendre le résultat codé (avec l'origine et le score de chaque ligne), rendre les cas à
 * revoir avec leurs meilleurs candidats, et enregistrer une décision — laquelle descend dans la table de
 * correspondance, pour que le même libellé ne soit plus jamais à trancher.
 */
import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { EspaceAvecRole } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { erreurIntrouvable, erreurRequete, messageUtilisateur } from '../commun/erreurs';
import { EspacesService } from '../espaces/espaces.service';
import { identifiantSql, litteralSql } from '../espaces/moteur-duckdb';
import { EtatApplication, GouvernanceService } from '../gouvernance/gouvernance.service';
import { nombre } from '../qualite/profilage';
import { SourcesService } from '../sources/sources.service';
import { ColonneObservee, PropositionDeCodification, devinerLaCodification } from './deviner-codification';
import { CE_QUE_LEXEMPLE_MONTRE, LISTE_DEXEMPLE, NOMENCLATURE_DEXEMPLE, SYNONYMES_DEXEMPLE, TableDExemple } from './exemple-codification';
import {
    BilanDeCodification,
    Codification,
    ContexteCodification,
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

    /** Où le résultat d'une codification est posé : une table par codification, refaite à chaque exécution. */
    private static tableCodee(id: string): string {
        return 'codee_' + id.replace(/[^a-zA-Z0-9_]/g, '_');
    }

    /** Le contexte que le module pur attend : le nom en base d'une table, d'après son nom métier. */
    private async contexte(espaceId: string, identifiant = ''): Promise<ContexteCodification> {
        const sources = await this.sources.lister(espaceId);
        return {
            nomTableDe: (nomSource: string) => {
                const source = sources.find(candidat => candidat.name === nomSource);
                if (!source) throw new ErreurCodification(`La source « ${nomSource} » n'est pas chargée.`);
                return 't_' + source.id;
            },
            nomTableCodee: CodificationService.tableCodee(identifiant)
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

    /** Combien de valeurs on regarde par colonne pour se faire une idée : assez pour juger, pas pour ramer. */
    private static readonly VALEURS_OBSERVEES = 300;

    /**
     * Ce qu'il faut savoir d'une table pour deviner son rôle : par colonne, le nombre de valeurs différentes,
     * de lignes renseignées, la longueur moyenne, et quelques valeurs.
     */
    private async observer(espace: EspaceAvecRole, nomSource: string): Promise<ColonneObservee[]> {
        const sources = await this.sources.lister(espace.id);
        const source = sources.find(candidat => candidat.name === nomSource);
        if (!source) throw erreurRequete(`La source « ${nomSource} » n'est pas chargée.`);
        const colonnes = (source.headers || []).filter(colonne => colonne !== '__rn');
        if (!colonnes.length) return [];
        const { moteur } = await this.espaces.ressources(espace);
        const table = `"t_${source.id}"`;
        const mesures = colonnes
            .map(
                (colonne, rang) =>
                    `COUNT(DISTINCT NULLIF(TRIM(CAST("${colonne.replace(/"/g, '""')}" AS VARCHAR)), ''))::BIGINT AS d${rang},
                     COUNT(NULLIF(TRIM(CAST("${colonne.replace(/"/g, '""')}" AS VARCHAR)), ''))::BIGINT AS r${rang},
                     COALESCE(AVG(length(TRIM(CAST("${colonne.replace(/"/g, '""')}" AS VARCHAR)))), 0) AS l${rang}`
            )
            .join(', ');
        const [comptes, echantillon] = await Promise.all([
            moteur.executer(`SELECT ${mesures} FROM ${table}`),
            moteur.executer(`SELECT * FROM ${table} LIMIT ${CodificationService.VALEURS_OBSERVEES}`)
        ]);
        const ligneDesComptes = comptes.lignes[0] || [];
        const rangDe = (nom: string) => echantillon.colonnes.findIndex(colonne => colonne.nom === nom);
        return colonnes.map((colonne, rang) => ({
            nom: colonne,
            distinctes: nombre(ligneDesComptes[3 * rang]),
            renseignees: nombre(ligneDesComptes[3 * rang + 1]),
            longueurMoyenne: Number(ligneDesComptes[3 * rang + 2]) || 0,
            exemples: echantillon.lignes.map(ligne => String(ligne[rangDe(colonne)] ?? '')).filter(valeur => valeur.trim())
        }));
    }

    /**
     * Propose toute la configuration à partir des deux tables : quelle colonne porte le libellé, laquelle le
     * code, quels sont les niveaux de l'arbre, quelle famille restreindre — et pourquoi.
     */
    async deviner(espace: EspaceAvecRole, source: string, nomenclature: string): Promise<PropositionDeCodification> {
        const [liste, arbre] = await Promise.all([this.observer(espace, source), this.observer(espace, nomenclature)]);
        return devinerLaCodification(liste, arbre);
    }

    /**
     * Installe une table de l'exemple : une table DuckDB et la source qui la déclare. Si elle est déjà là, on
     * la refait — l'exemple doit toujours repartir du même état, quoi qu'on y ait fait.
     */
    private async installerUneTable(espace: EspaceAvecRole, table: TableDExemple): Promise<void> {
        const sources = await this.sources.lister(espace.id);
        const existante = sources.find(candidat => candidat.name === table.nom);
        const identifiant = existante?.id || 'tb_' + randomBytes(6).toString('hex');
        const { moteur } = await this.espaces.ressources(espace);
        const nomTable = 't_' + identifiant;
        const valeurs = table.lignes.map(ligne => `(${ligne.map(valeur => `'${valeur.replace(/'/g, "''")}'`).join(', ')})`).join(', ');
        await moteur.abandonner(nomTable);
        await moteur.executer(
            `CREATE TABLE ${identifiantSql(nomTable)} AS SELECT row_number() OVER () AS __rn, * FROM (VALUES ${valeurs}) v(${table.colonnes.map(identifiantSql).join(', ')})`
        );
        await this.sources.ecrire(espace.id, identifiant, {
            id: identifiant,
            name: table.nom,
            type: 'csv',
            headers: table.colonnes,
            status: 'ready'
        } as never);
    }

    /**
     * Installe l'exemple : les deux tables, et une codification déjà réglée sur elles. On peut la lancer
     * aussitôt et voir ce qui se passe — c'est la documentation, mais sur des données que l'on manipule.
     */
    async installerLExemple(espace: EspaceAvecRole, utilisateur: Utilisateur): Promise<{ codification: Codification; montre: string[] }> {
        await this.installerUneTable(espace, LISTE_DEXEMPLE);
        await this.installerUneTable(espace, NOMENCLATURE_DEXEMPLE);
        const proposition = await this.deviner(espace, LISTE_DEXEMPLE.nom, NOMENCLATURE_DEXEMPLE.nom);
        const codification = await this.ecrire(espace, utilisateur, 'cd_exemple', {
            nom: 'Exemple — codes équipements',
            source: LISTE_DEXEMPLE.nom,
            nomenclature: NOMENCLATURE_DEXEMPLE.nom,
            colonneLibelle: proposition.colonneLibelle,
            colonneCodeExistant: proposition.colonneCodeExistant,
            colonneCode: proposition.colonneCode,
            colonneLibelleRef: proposition.colonneLibelleRef,
            niveaux: proposition.niveaux,
            restreindreSource: proposition.restreindreSource,
            restreindreNomenclature: proposition.restreindreNomenclature,
            // Les variantes sont proposées mais pas posées : l'exemple doit d'abord montrer ce qui leur manque.
            comparaisons: [],
            synonymes: [],
            regles: [],
            correspondances: [],
            seuilAuto: 0.99,
            seuilRevoir: 0.45,
            methode: 'mots',
            decisions: {}
        });
        return { codification, montre: CE_QUE_LEXEMPLE_MONTRE };
    }

    /** Les variantes que l'exemple propose de déclarer, une fois le premier résultat vu. */
    synonymesDeLExemple() {
        return SYNONYMES_DEXEMPLE;
    }

    /** Code la liste et rend les premières lignes, avec le bilan porté sur la totalité. */
    async executer(espace: EspaceAvecRole, id: string): Promise<ResultatCodification> {
        const codification = await this.codificationDe(espace.id, id);
        const contexte = await this.contexte(espace.id, id);
        try {
            const sql = this.sqlAvecDecisions(codification, contexte);
            const { moteur } = await this.espaces.ressources(espace);
            // Codée UNE fois, posée dans une table : les lignes, les comptes et la revue la relisent au lieu
            // de refaire le calcul à chaque question — c'est trois exécutions économisées sur quatre.
            await moteur.abandonner(contexte.nomTableCodee);
            await moteur.executer(`CREATE TABLE ${identifiantSql(contexte.nomTableCodee)} AS\n${sql}`);
            const [resultat, comptes] = await Promise.all([
                moteur.executer(
                    `SELECT * EXCLUDE (__rn) FROM ${identifiantSql(contexte.nomTableCodee)} ORDER BY __statut, __rn LIMIT ${LIGNES_MONTREES}`
                ),
                moteur.executer(
                    `SELECT __statut, COUNT(*)::BIGINT AS lignes FROM ${identifiantSql(contexte.nomTableCodee)} GROUP BY __statut`
                )
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
    private sqlAvecDecisions(codification: Codification, contexte: ContexteCodification): string {
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
        const contexte = await this.contexte(espace.id, id);
        try {
            const { moteur } = await this.espaces.ressources(espace);
            // La revue relit la table posée par « executer » ; si l'on ne l'a pas encore codée, on le fait.
            const posee = await moteur.executer(
                `SELECT COUNT(*)::BIGINT FROM duckdb_tables() WHERE table_name = ${litteralSql(contexte.nomTableCodee)}`
            );
            if (!nombre(posee.lignes[0][0])) await this.executer(espace, id);
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
