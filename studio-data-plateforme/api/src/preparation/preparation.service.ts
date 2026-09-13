/**
 * Service des préparations : recettes rangées dans le document appState (champ « recipes », comme
 * l'application classique), exécution en table DuckDB enregistrée comme source, aperçu étape par étape,
 * relance automatique des recettes d'une source mise à jour.
 */
import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { EspaceAvecRole } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { erreurIntrouvable, erreurRequete, messageUtilisateur } from '../commun/erreurs';
import { EspacesService } from '../espaces/espaces.service';
import { MoteurDuckDB, identifiantSql } from '../espaces/moteur-duckdb';
import { EtatApplication, GouvernanceService } from '../gouvernance/gouvernance.service';
import { nombre } from '../qualite/profilage';
import { DocumentSource, SourcesService } from '../sources/sources.service';
import { RecettePreparation, etapesEnrichissement, sqlRecettePreparation, sqlTauxAppariement } from './recettes-preparation';

export type ResultatExecution = { recette: RecettePreparation; sourceId: string; lignes: number; colonnes: string[] };
export type Apercu = { sql: string; colonnes: string[]; lignes: unknown[][]; total: number };

@Injectable()
export class PreparationService {
    constructor(
        private readonly gouvernance: GouvernanceService,
        private readonly sources: SourcesService,
        private readonly espaces: EspacesService
    ) {}

    private recettes(etat: EtatApplication): RecettePreparation[] {
        if (!Array.isArray(etat['recipes'])) etat['recipes'] = [];
        return etat['recipes'] as RecettePreparation[];
    }

    async lister(espaceId: string): Promise<RecettePreparation[]> {
        return this.recettes(await this.gouvernance.etat(espaceId));
    }

    async ecrire(
        espace: EspaceAvecRole,
        utilisateur: Utilisateur,
        id: string,
        corps: Omit<RecettePreparation, 'id'>
    ): Promise<RecettePreparation> {
        const etat = await this.gouvernance.etat(espace.id);
        const recettes = this.recettes(etat);
        const position = recettes.findIndex(candidat => candidat.id === id);
        const recette: RecettePreparation = { ...(position >= 0 ? recettes[position] : {}), ...corps, id };
        if (position >= 0) recettes[position] = recette;
        else recettes.push(recette);
        await this.gouvernance.enregistrer(espace, utilisateur, etat, 'preparation.enregistrement', recette.name);
        return recette;
    }

    async supprimer(espace: EspaceAvecRole, utilisateur: Utilisateur, id: string): Promise<void> {
        const etat = await this.gouvernance.etat(espace.id);
        const recettes = this.recettes(etat);
        const recette = recettes.find(candidat => candidat.id === id);
        if (!recette) throw erreurIntrouvable('Préparation inconnue.');
        etat['recipes'] = recettes.filter(candidat => candidat.id !== id);
        await this.gouvernance.enregistrer(espace, utilisateur, etat, 'preparation.suppression', recette.name);
    }

    /** La source d'entrée d'une recette, ou une erreur lisible. */
    private sourceDe(recette: RecettePreparation, sources: DocumentSource[]): DocumentSource {
        if (!recette.src) throw erreurRequete('Choisissez la source à préparer.');
        const source = sources.find(candidat => candidat.name === recette.src);
        if (!source) throw erreurRequete(`La source « ${recette.src} » n'est pas chargée.`);
        return source;
    }

    /** Aperçu des lignes après l'étape d'indice `jusquA` (toutes si omis), avec le SQL correspondant. */
    async apercu(espace: EspaceAvecRole, id: string, jusquA?: number): Promise<Apercu> {
        const [recettes, sources] = await Promise.all([this.lister(espace.id), this.sources.lister(espace.id)]);
        const recette = recettes.find(candidat => candidat.id === id);
        if (!recette) throw erreurIntrouvable('Préparation inconnue.');
        const source = this.sourceDe(recette, sources);
        const sql = sqlRecettePreparation(recette, 't_' + source.id, jusquA);
        const { moteur } = await this.espaces.ressources(espace);
        const [resultat, total] = await Promise.all([
            moteur.executer(`SELECT * FROM (\n${sql}\n) apercu LIMIT 30`),
            moteur.executer(`SELECT COUNT(*)::BIGINT FROM (\n${sql}\n) apercu`)
        ]);
        return { sql, colonnes: resultat.colonnes.map(colonne => colonne.nom), lignes: resultat.lignes, total: nombre(total.lignes[0][0]) };
    }

    /** Exécute la recette : la table produite remplace la précédente et devient (ou reste) une source. */
    async executer(espace: EspaceAvecRole, utilisateur: Utilisateur, id: string): Promise<ResultatExecution> {
        const etat = await this.gouvernance.etat(espace.id);
        const recette = this.recettes(etat).find(candidat => candidat.id === id);
        if (!recette) throw erreurIntrouvable('Préparation inconnue.');
        const sources = await this.sources.lister(espace.id);
        const source = this.sourceDe(recette, sources);
        const nomSortie = String(recette.out || '').trim();
        if (!nomSortie) throw erreurRequete('Donnez un nom à la table produite.');
        const homonyme = sources.find(candidat => candidat.name === nomSortie);
        if (homonyme && homonyme.id !== recette.targetId && homonyme.id !== source.id && homonyme.type !== 'extraction')
            throw erreurRequete(`Le nom « ${nomSortie} » est déjà utilisé par une autre source.`);
        if (homonyme && homonyme.id === source.id) throw erreurRequete('La table produite ne peut pas porter le nom de la source.');
        const { moteur } = await this.espaces.ressources(espace);
        const idSortie =
            (recette.targetId && sources.some(candidat => candidat.id === recette.targetId) ? recette.targetId : homonyme?.id) ||
            'tb_' + randomBytes(6).toString('hex');
        const tableSortie = 't_' + idSortie;
        await moteur.abandonner(tableSortie);
        await moteur.executer(
            `CREATE TABLE ${identifiantSql(tableSortie)} AS SELECT row_number() OVER () AS __rn, * FROM (\n${sqlRecettePreparation(recette, 't_' + source.id)}\n) preparation`
        );
        const [structure, total] = await Promise.all([
            moteur.executer(`SELECT * EXCLUDE (__rn) FROM ${identifiantSql(tableSortie)} LIMIT 0`),
            moteur.executer(`SELECT COUNT(*)::BIGINT FROM ${identifiantSql(tableSortie)}`)
        ]);
        const colonnes = structure.colonnes.map(colonne => colonne.nom);
        await this.mesurerAppariements(moteur, tableSortie, recette);
        recette.targetId = idSortie;
        recette.lastRows = nombre(total.lignes[0][0]);
        recette.lastAt = Date.now();
        await this.sources.ecrire(espace.id, idSortie, {
            id: idSortie,
            name: nomSortie,
            type: 'extraction',
            storage: 'table',
            size: 0,
            headers: colonnes,
            origine: 'preparation',
            preparation: { recetteId: recette.id, source: recette.src }
        });
        await this.gouvernance.enregistrer(espace, utilisateur, etat, 'preparation.execution', `${recette.name} → ${nomSortie}`);
        return { recette, sourceId: idSortie, lignes: recette.lastRows, colonnes };
    }

    /** Taux d'appariement de chaque enrichissement, mémorisé sur l'étape (lastMatch, en %). */
    private async mesurerAppariements(moteur: MoteurDuckDB, tableSortie: string, recette: RecettePreparation): Promise<void> {
        for (const etape of etapesEnrichissement(recette)) {
            const sql = sqlTauxAppariement(tableSortie, etape);
            if (!sql) continue;
            try {
                const [renseignees, appariees] = (await moteur.executer(sql)).lignes[0].map(nombre);
                etape.lastMatch = renseignees ? Math.round((100 * appariees) / renseignees) : 100;
            } catch {
                etape.lastMatch = null;
            }
        }
    }

    /** Rejoue les recettes attachées à une source (après sa mise à jour) ; les échecs sont signalés, pas bloquants. */
    async executerPourSource(
        espace: EspaceAvecRole,
        utilisateur: Utilisateur,
        nomSource: string
    ): Promise<{ executees: string[]; erreurs: { preparation: string; erreur: string }[] }> {
        const executees: string[] = [];
        const erreurs: { preparation: string; erreur: string }[] = [];
        for (const recette of (await this.lister(espace.id)).filter(candidat => candidat.src === nomSource && candidat.steps.length)) {
            try {
                await this.executer(espace, utilisateur, recette.id);
                executees.push(recette.name);
            } catch (erreur) {
                erreurs.push({ preparation: recette.name, erreur: messageUtilisateur(erreur) });
            }
        }
        return { executees, erreurs };
    }
}
