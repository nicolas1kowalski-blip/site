/**
 * Service des tables conçues : exécute une recette sur le moteur DuckDB de l'espace, matérialise le résultat en
 * table t_<id>, enregistre la table comme une source de type « designed » (avec sa recette dans les
 * métadonnées, comme l'application classique) et produit les contrôles : non-conformités de format, orphelins
 * de clés étrangères, rapport d'écarts entre sources, contribution par source.
 */
import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { EspaceAvecRole } from '../authentification/contexte-requete';
import { erreurIntrouvable, erreurRequete } from '../commun/erreurs';
import { EspacesService } from '../espaces/espaces.service';
import { MoteurDuckDB, identifiantSql } from '../espaces/moteur-duckdb';
import { ModeleService } from '../modele/modele.service';
import { nombre } from '../qualite/profilage';
import { DocumentSource, SourcesService } from '../sources/sources.service';
import {
    COLONNE_NUMERO_LIGNE,
    COLONNE_ORIGINE,
    ContexteRecette,
    ErreurRecette,
    Recette,
    clesEtrangeresValides,
    construireSqlTableConcue,
    sqlContributions,
    sqlEcarts,
    sqlNonConformes,
    sqlOrphelins
} from './constructeur-table-concue';

/** Source de type « designed » : ses métadonnées portent la recette. */
export type TableConcue = DocumentSource & { design: Recette };

export type Ecart = { cle: string; attribut: string; source: string; valeur: string };
export type RapportEcarts = { cle: string[]; nombreCles: number; ecarts: Ecart[]; tronque: boolean };
export type Contribution = { source: string; lignes: number; part: number; completude: number };
export type ResultatCleEtrangere = { attr: string; table: string; col: string; orphans: number | null };

const LIMITE_ECARTS_PAR_DEFAUT = 1500;

@Injectable()
export class TablesConcuesService {
    constructor(
        private readonly espaces: EspacesService,
        private readonly sources: SourcesService,
        private readonly modele: ModeleService
    ) {}

    /** Tables conçues de l'espace (sources de type « designed »). */
    async lister(espaceId: string): Promise<TableConcue[]> {
        const sources = await this.sources.lister(espaceId);
        return sources.filter(source => source.type === 'designed' && source.design) as TableConcue[];
    }

    async lire(espaceId: string, id: string): Promise<TableConcue> {
        const source = await this.sources.lire(espaceId, id);
        if (source.type !== 'designed' || !source.design) throw erreurIntrouvable('Table conçue inconnue : ' + id);
        return source as TableConcue;
    }

    /** Requête SQL d'une recette (aperçu), sans rien matérialiser. */
    async sql(espace: EspaceAvecRole, recette: Recette): Promise<string> {
        const contexte = await this.contexte(espace.id);
        try {
            return construireSqlTableConcue(recette, contexte);
        } catch (erreur) {
            if (erreur instanceof ErreurRecette) throw erreurRequete(erreur.message);
            throw erreur;
        }
    }

    /** Premières lignes du résultat d'une recette, pour vérifier avant de construire. */
    async apercu(espace: EspaceAvecRole, recette: Recette, limite: number) {
        const sql = await this.sql(espace, recette);
        const { moteur } = await this.espaces.ressources(espace);
        return moteur.executer(`SELECT * FROM (\n${sql}\n) apercu LIMIT ${Math.max(1, Math.min(1000, Math.floor(limite)))}`);
    }

    /**
     * Construit (ou reconstruit) la table : la recette est exécutée sur l'état actuel des sources, le résultat
     * remplace la table t_<id>, puis les contrôles sont calculés et la source « designed » est enregistrée.
     */
    async construire(espace: EspaceAvecRole, recette: Recette, auteurId: string): Promise<TableConcue> {
        const sources = await this.sources.lister(espace.id);
        const existante = recette.targetId
            ? sources.find(source => source.id === recette.targetId && source.type === 'designed')
            : undefined;
        const id = existante?.id || 'tb_' + randomBytes(6).toString('hex');
        const homonyme = sources.find(source => source.name === recette.name && source.id !== id);
        if (homonyme) throw erreurRequete(`Le nom « ${recette.name} » est déjà utilisé par une autre source ou table.`);
        const sql = await this.sql(espace, recette);
        const { moteur } = await this.espaces.ressources(espace);
        const nomTable = 't_' + id;
        await moteur.abandonner(nomTable);
        await moteur.executer(
            `CREATE TABLE ${identifiantSql(nomTable)} AS SELECT row_number() OVER () AS ${COLONNE_NUMERO_LIGNE}, * FROM (\n${sql}\n) f`
        );
        const colonnes = (await moteur.executer(`SELECT * FROM ${identifiantSql(nomTable)} LIMIT 0`)).colonnes
            .map(colonne => colonne.nom)
            .filter(colonne => colonne !== COLONNE_NUMERO_LIGNE);
        const lignes = nombre((await moteur.executer(`SELECT COUNT(*)::BIGINT FROM ${identifiantSql(nomTable)}`)).lignes[0][0]);
        const recetteEnregistree: Recette = {
            ...recette,
            targetId: id,
            lastRows: lignes,
            lastBuild: new Date().toISOString(),
            lastConform: await this.compterNonConformes(moteur, nomTable, recette),
            lastFk: await this.controlerClesEtrangeres(moteur, nomTable, recette, sources)
        };
        const document: TableConcue = {
            ...(existante || {}),
            id,
            name: recette.name,
            type: 'designed',
            storage: 'table',
            size: 0,
            headers: colonnes,
            design: recetteEnregistree
        };
        await this.sources.ecrire(espace.id, id, document);
        await this.declarerLiensClesEtrangeres(espace.id, document, auteurId);
        return document;
    }

    /** Ré-exécute la recette enregistrée d'une table conçue. */
    async reconstruire(espace: EspaceAvecRole, id: string, auteurId: string): Promise<TableConcue> {
        const table = await this.lire(espace.id, id);
        return this.construire(espace, { ...table.design, name: table.name, targetId: id }, auteurId);
    }

    /** Reconstruit toutes les tables conçues qui dépendent d'une source (contributrice, d'enrichissement ou de lien). */
    async reconstruireDependantes(
        espace: EspaceAvecRole,
        nomSource: string,
        auteurId: string
    ): Promise<{ reconstruites: string[]; erreurs: { table: string; erreur: string }[] }> {
        const reconstruites: string[] = [];
        const erreurs: { table: string; erreur: string }[] = [];
        for (const table of await this.lister(espace.id)) {
            const recette = table.design;
            const depend =
                (recette.sources || []).some(source => source.src === nomSource) ||
                (recette.joins || []).some(jointure => jointure.src === nomSource || jointure.viaSrc === nomSource);
            if (!depend) continue;
            try {
                await this.reconstruire(espace, table.id!, auteurId);
                reconstruites.push(table.name);
            } catch (erreur) {
                erreurs.push({ table: table.name, erreur: String((erreur as Error).message || erreur) });
            }
        }
        return { reconstruites, erreurs };
    }

    /** Rapport d'écarts : clés partagées entre sources dont les attributs diffèrent (clé requise). */
    async ecarts(espace: EspaceAvecRole, id: string, limite = LIMITE_ECARTS_PAR_DEFAUT): Promise<RapportEcarts> {
        const table = await this.lire(espace.id, id);
        const recette = table.design;
        if (!(recette.key || []).length) throw erreurRequete("Définissez d'abord une clé sur la table pour comparer les sources.");
        const attributs = (table.headers || []).filter(
            colonne => colonne !== COLONNE_ORIGINE && colonne !== COLONNE_NUMERO_LIGNE && !recette.key.includes(colonne)
        );
        if (!attributs.length) return { cle: recette.key, nombreCles: 0, ecarts: [], tronque: false };
        const { moteur } = await this.espaces.ressources(espace);
        const requetes = sqlEcarts('t_' + id, recette, attributs);
        const nombreCles = nombre((await moteur.executer(requetes.nombreCles)).lignes[0][0]);
        const ecarts: Ecart[] = [];
        if (nombreCles) {
            // Attribut par attribut : chaque requête ne manipule qu'une colonne (jeu de travail minimal).
            for (const attribut of attributs) {
                if (ecarts.length >= limite) break;
                const resultat = await moteur.executer(requetes.ecartsDe(attribut, limite - ecarts.length));
                for (const [cle, source, valeur] of resultat.lignes)
                    ecarts.push({ cle: String(cle), attribut, source: String(source), valeur: valeur == null ? '' : String(valeur) });
            }
            ecarts.sort(
                (premier, second) =>
                    premier.cle.localeCompare(second.cle) ||
                    premier.attribut.localeCompare(second.attribut) ||
                    premier.source.localeCompare(second.source)
            );
        }
        return { cle: recette.key, nombreCles, ecarts, tronque: ecarts.length >= limite };
    }

    /** Contribution de chaque source contributrice : lignes, part et complétude. */
    async contributions(espace: EspaceAvecRole, id: string): Promise<Contribution[]> {
        const table = await this.lire(espace.id, id);
        const { moteur } = await this.espaces.ressources(espace);
        const resultat = await moteur.executer(sqlContributions('t_' + id, table.headers || []));
        const total = resultat.lignes.reduce((somme, ligne) => somme + nombre(ligne[1]), 0) || 1;
        return resultat.lignes.map(([source, lignes, completude]) => ({
            source: String(source),
            lignes: nombre(lignes),
            part: nombre(lignes) / total,
            completude: nombre(completude)
        }));
    }

    /** Contexte de construction : résolution des sources par leur nom lisible. */
    private async contexte(espaceId: string): Promise<ContexteRecette> {
        const sources = await this.sources.lister(espaceId);
        const parNom = new Map(sources.map(source => [source.name, source]));
        return {
            nomTableDe: nomSource => {
                const source = parNom.get(nomSource);
                if (!source) throw erreurRequete(`La source « ${nomSource} » n'existe pas dans l'espace.`);
                return 't_' + source.id;
            },
            colonnesDe: nomSource => parNom.get(nomSource)?.headers || []
        };
    }

    /** Valeurs restées inconvertibles malgré le format déclaré, par attribut (absent si aucune). */
    private async compterNonConformes(moteur: MoteurDuckDB, nomTable: string, recette: Recette): Promise<Record<string, number>> {
        const requete = sqlNonConformes(nomTable, recette);
        const nonConformes: Record<string, number> = {};
        if (!requete) return nonConformes;
        const ligne = (await moteur.executer(requete.sql)).lignes[0];
        requete.attributs.forEach((attribut, position) => {
            const compte = nombre(ligne[position]);
            if (compte > 0) nonConformes[attribut] = compte;
        });
        return nonConformes;
    }

    /** Clés étrangères déclarées : lien du modèle de données créé automatiquement + comptage des orphelins. */
    private async controlerClesEtrangeres(
        moteur: MoteurDuckDB,
        nomTable: string,
        recette: Recette,
        sources: DocumentSource[]
    ): Promise<ResultatCleEtrangere[]> {
        const resultats: ResultatCleEtrangere[] = [];
        for (const cle of clesEtrangeresValides(recette)) {
            const cible = sources.find(source => source.name === cle.table);
            if (!cible || !(cible.headers || []).includes(cle.col)) {
                resultats.push({ ...cle, orphans: null });
                continue;
            }
            const orphelins = nombre((await moteur.executer(sqlOrphelins(nomTable, cle.attr, 't_' + cible.id, cle.col))).lignes[0][0]);
            resultats.push({ ...cle, orphans: orphelins });
        }
        return resultats;
    }

    /** Après enregistrement de la table, déclare dans le modèle de données les liens des clés étrangères. */
    private async declarerLiensClesEtrangeres(espaceId: string, table: TableConcue, auteurId: string): Promise<void> {
        for (const cle of clesEtrangeresValides(table.design)) {
            try {
                await this.modele.ajouter(
                    espaceId,
                    {
                        sourceTable: table.name,
                        sourceCol: cle.attr,
                        targetTable: cle.table,
                        targetCol: cle.col,
                        cardinality: '',
                        kind: 'fk'
                    },
                    auteurId
                );
            } catch {
                // Une cible disparue n'empêche pas la construction : l'orphelin est déjà signalé (orphans: null).
            }
        }
    }
}
