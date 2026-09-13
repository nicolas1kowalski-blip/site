/**
 * Service de surveillance des sources : instantanés et dérive, contrat de données, données figées et suivi des
 * changements, réconciliation amont / aval. L'état vit dans governance.srcWatch (format classique) ; les données
 * figées sont une table DuckDB « wsnap_<id de source> ».
 */
import { Injectable } from '@nestjs/common';
import { EspaceAvecRole } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { erreurRequete } from '../commun/erreurs';
import { EspacesService } from '../espaces/espaces.service';
import { MoteurDuckDB, identifiantSql, litteralSql } from '../espaces/moteur-duckdb';
import { EtatApplication, GouvernanceService } from '../gouvernance/gouvernance.service';
import { fraicheurTable } from '../lineage/flux';
import { nombre } from '../qualite/profilage';
import { DocumentSource, SourcesService } from '../sources/sources.service';
import {
    ColonneSchema,
    Contrat,
    Derive,
    SurveillanceSource,
    VerificationContrat,
    comparerContrat,
    derive,
    sqlDelta,
    sqlReconciliationSources,
    sqlVidesColonne,
    typeSimple
} from './surveillance';

export type EtatSource = {
    nom: string;
    id: string;
    fraicheur: ReturnType<typeof fraicheurTable>;
    dernierInstantane: SurveillanceSource['snaps'][number] | null;
    nombreInstantanes: number;
    derive: Derive | null;
    contrat: Contrat | null;
    donneesFigees: SurveillanceSource['dataSnap'] | null;
};
export type ResultatDelta = {
    table: string;
    cle: string;
    at: number;
    snapTs: number;
    added: number;
    removed: number;
    changed: number;
    same: number;
    colonnesComparees: number;
};
export type ResultatReconciliation = {
    at: number;
    a: string;
    b: string;
    ta: number;
    tb: number;
    onlyA: number;
    onlyB: number;
    common: number;
};

@Injectable()
export class SurveillanceService {
    constructor(
        private readonly gouvernance: GouvernanceService,
        private readonly sources: SourcesService,
        private readonly espaces: EspacesService
    ) {}

    private surveillanceDe(etat: EtatApplication, nomTable: string): SurveillanceSource {
        const modele = ((etat.governance['srcWatch'] as Record<string, SurveillanceSource>) ||= {});
        const entree = (modele[nomTable] ||= { snaps: [], contract: null });
        if (!Array.isArray(entree.snaps)) entree.snaps = [];
        return entree;
    }

    /** État de chaque source : fraîcheur, dernier instantané, dérive, contrat, données figées. */
    async etat(espaceId: string): Promise<EtatSource[]> {
        const [etat, sources] = await Promise.all([this.gouvernance.etat(espaceId), this.sources.lister(espaceId)]);
        return sources.map(source => {
            const surveillance = this.surveillanceDe(etat, source.name);
            const horodatage = Number(source.srcModified) || Date.parse(String(source.enregistreLe || ''));
            return {
                nom: source.name,
                id: source.id!,
                fraicheur: fraicheurTable(
                    Number.isFinite(horodatage) && horodatage > 0 ? horodatage : null,
                    etat.governance.dictionary[source.name]?.['updateFrequency'] as string | undefined
                ),
                dernierInstantane: surveillance.snaps[surveillance.snaps.length - 1] || null,
                nombreInstantanes: surveillance.snaps.length,
                derive: derive(surveillance.snaps),
                contrat: surveillance.contract,
                donneesFigees: surveillance.dataSnap || null
            };
        });
    }

    private async schemaReel(moteur: MoteurDuckDB, nomTable: string): Promise<ColonneSchema[]> {
        const resultat = await moteur.executer(
            `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = ${litteralSql(nomTable)} ORDER BY ordinal_position`
        );
        return resultat.lignes
            .filter(([nom]) => nom !== '__rn')
            .map(([nom, type]) => ({ name: String(nom), type: typeSimple(String(type)) }));
    }

    private async sourceDe(espaceId: string, nom: string): Promise<DocumentSource> {
        const source = (await this.sources.lister(espaceId)).find(candidat => candidat.name === nom);
        if (!source) throw erreurRequete(`Source inconnue : ${nom}.`);
        return source;
    }

    /** Instantané : volumétrie et schéma (40 conservés au plus) ; renvoie la dérive avec le précédent. */
    async prendreInstantane(
        espace: EspaceAvecRole,
        utilisateur: Utilisateur,
        nom: string
    ): Promise<{ instantane: SurveillanceSource['snaps'][number]; derive: Derive | null }> {
        const source = await this.sourceDe(espace.id, nom);
        const { moteur } = await this.espaces.ressources(espace);
        const rows = nombre((await moteur.executer(`SELECT COUNT(*)::BIGINT FROM ${identifiantSql('t_' + source.id)}`)).lignes[0][0]);
        const instantane = { ts: Date.now(), rows, schema: await this.schemaReel(moteur, 't_' + source.id) };
        const etat = await this.gouvernance.etat(espace.id);
        const surveillance = this.surveillanceDe(etat, nom);
        surveillance.snaps.push(instantane);
        if (surveillance.snaps.length > 40) surveillance.snaps = surveillance.snaps.slice(-40);
        await this.gouvernance.enregistrer(espace, utilisateur, etat, 'surveillance.instantane', nom);
        return { instantane, derive: derive(surveillance.snaps) };
    }

    /** Contrat généré depuis la structure actuelle (aucune colonne obligatoire au départ). */
    async genererContrat(espace: EspaceAvecRole, utilisateur: Utilisateur, nom: string): Promise<Contrat> {
        const source = await this.sourceDe(espace.id, nom);
        const { moteur } = await this.espaces.ressources(espace);
        const contrat: Contrat = {
            cols: (await this.schemaReel(moteur, 't_' + source.id)).map(colonne => ({ ...colonne, required: false })),
            at: Date.now()
        };
        const etat = await this.gouvernance.etat(espace.id);
        this.surveillanceDe(etat, nom).contract = contrat;
        await this.gouvernance.enregistrer(espace, utilisateur, etat, 'surveillance.contrat', nom);
        return contrat;
    }

    async enregistrerContrat(espace: EspaceAvecRole, utilisateur: Utilisateur, nom: string, contrat: Contrat): Promise<Contrat> {
        const etat = await this.gouvernance.etat(espace.id);
        this.surveillanceDe(etat, nom).contract = contrat;
        await this.gouvernance.enregistrer(espace, utilisateur, etat, 'surveillance.contrat', nom);
        return contrat;
    }

    /** Vérifie le contrat : colonnes manquantes, en plus, retypées, obligatoires vides. */
    async verifierContrat(espace: EspaceAvecRole, nom: string): Promise<VerificationContrat> {
        const source = await this.sourceDe(espace.id, nom);
        const etat = await this.gouvernance.etat(espace.id);
        const contrat = this.surveillanceDe(etat, nom).contract;
        if (!contrat) throw erreurRequete("Générez d'abord le contrat de cette source.");
        const { moteur } = await this.espaces.ressources(espace);
        const schemaReel = await this.schemaReel(moteur, 't_' + source.id);
        const ecarts = comparerContrat(contrat, schemaReel);
        const emptyRequired: VerificationContrat['emptyRequired'] = [];
        for (const colonne of contrat.cols.filter(
            candidat => candidat.required && schemaReel.some(reelle => reelle.name === candidat.name)
        )) {
            const vides = nombre((await moteur.executer(sqlVidesColonne('t_' + source.id, colonne.name))).lignes[0][0]);
            if (vides > 0) emptyRequired.push({ col: colonne.name, vides });
        }
        return { ...ecarts, emptyRequired, conforme: !ecarts.missing.length && !ecarts.retyped.length && !emptyRequired.length };
    }

    /** Fige une copie des données (table wsnap_<id>) pour comparer après rechargement. */
    async figerDonnees(espace: EspaceAvecRole, utilisateur: Utilisateur, nom: string): Promise<{ ts: number; rows: number }> {
        const source = await this.sourceDe(espace.id, nom);
        const { moteur } = await this.espaces.ressources(espace);
        await moteur.executer(
            `CREATE OR REPLACE TABLE ${identifiantSql('wsnap_' + source.id)} AS SELECT * EXCLUDE (__rn) FROM ${identifiantSql('t_' + source.id)}`
        );
        const rows = nombre((await moteur.executer(`SELECT COUNT(*)::BIGINT FROM ${identifiantSql('wsnap_' + source.id)}`)).lignes[0][0]);
        const etat = await this.gouvernance.etat(espace.id);
        const donneesFigees = { ts: Date.now(), rows };
        this.surveillanceDe(etat, nom).dataSnap = donneesFigees;
        await this.gouvernance.enregistrer(espace, utilisateur, etat, 'surveillance.figer', nom);
        return donneesFigees;
    }

    /** Lignes ajoutées, supprimées, modifiées, identiques entre la source et ses données figées, par clé. */
    async calculerDelta(espace: EspaceAvecRole, nom: string, cle: string): Promise<ResultatDelta> {
        const source = await this.sourceDe(espace.id, nom);
        const etat = await this.gouvernance.etat(espace.id);
        const donneesFigees = this.surveillanceDe(etat, nom).dataSnap;
        if (!donneesFigees) throw erreurRequete("Figez d'abord un instantané des données.");
        if (!(source.headers || []).includes(cle)) throw erreurRequete(`Colonne clé inconnue : ${cle}.`);
        const { moteur } = await this.espaces.ressources(espace);
        const colonnesFigees = (await this.schemaReel(moteur, 'wsnap_' + source.id)).map(colonne => colonne.name);
        const communes = (source.headers || []).filter(colonne => colonnesFigees.includes(colonne) && colonne !== cle);
        const [added, removed, changed, same] = (
            await moteur.executer(sqlDelta('t_' + source.id, 'wsnap_' + source.id, cle, communes))
        ).lignes[0].map(nombre);
        return {
            table: nom,
            cle,
            at: Date.now(),
            snapTs: donneesFigees.ts,
            added,
            removed,
            changed,
            same,
            colonnesComparees: communes.length
        };
    }

    /** Volumétrie et clés orphelines entre deux sources. */
    async reconcilier(espace: EspaceAvecRole, nomA: string, cleA: string, nomB: string, cleB: string): Promise<ResultatReconciliation> {
        const [sourceA, sourceB] = await Promise.all([this.sourceDe(espace.id, nomA), this.sourceDe(espace.id, nomB)]);
        if (!(sourceA.headers || []).includes(cleA) || !(sourceB.headers || []).includes(cleB))
            throw erreurRequete('Choisissez une colonne clé présente dans chaque source.');
        const { moteur } = await this.espaces.ressources(espace);
        const [ta, tb, onlyA, onlyB, common] = (
            await moteur.executer(sqlReconciliationSources('t_' + sourceA.id, cleA, 't_' + sourceB.id, cleB))
        ).lignes[0].map(nombre);
        return { at: Date.now(), a: nomA, b: nomB, ta, tb, onlyA, onlyB, common };
    }
}
