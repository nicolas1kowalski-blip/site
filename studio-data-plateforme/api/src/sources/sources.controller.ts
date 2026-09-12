/**
 * Sources (tables de données) de l'espace courant.
 *
 * Les métadonnées vivent dans PostgreSQL (table sources) ; les données dans DuckDB (table t_<id>) et dans le
 * dépôt de fichiers (src_<id>, pq_<id>.parquet). Le chemin /api/tables est conservé pour l'application
 * classique ; l'interface Angular utilise les mêmes routes.
 */
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import fsp from 'node:fs/promises';
import { EspaceAvecRole, EspaceCourant, RoleEspaceRequis, UtilisateurCourant } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { erreurRequete, verifierNomSur } from '../commun/erreurs';
import { EspacesService } from '../espaces/espaces.service';
import { identifiantSql, litteralSql } from '../espaces/moteur-duckdb';
import { JournalService } from '../journal/journal.service';
import { DocumentSource, SourcesService } from './sources.service';

export const nomTableDuckDB = (id: string) => 't_' + id;

@ApiTags('Sources')
@Controller('api/tables')
export class SourcesController {
    constructor(
        private readonly sources: SourcesService,
        private readonly espaces: EspacesService,
        private readonly journal: JournalService
    ) {}

    @Get()
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Métadonnées de toutes les sources de l’espace courant.' })
    lister(@EspaceCourant() espace: EspaceAvecRole) {
        return this.sources.lister(espace.id);
    }

    @Get(':id')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Métadonnées d’une source.' })
    lire(@EspaceCourant() espace: EspaceAvecRole, @Param('id') id: string) {
        return this.sources.lire(espace.id, verifierNomSur(id, 'identifiant de source'));
    }

    @Put(':id')
    @HttpCode(204)
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Enregistre les métadonnées d’une source (le contenu est déjà dans DuckDB).' })
    async ecrire(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('id') id: string,
        @Body() corps: DocumentSource
    ) {
        const idSur = verifierNomSur(id, 'identifiant de source');
        if (!corps || typeof corps.name !== 'string') throw erreurRequete('Métadonnées de source invalides (name attendu).');
        const nouvelle = await this.sources.ecrire(espace.id, idSur, corps);
        if (nouvelle)
            await this.journal.consigner({
                espaceId: espace.id,
                utilisateurId: utilisateur.id,
                action: 'source.ajout',
                cible: corps.name,
                details: { type: corps.type }
            });
    }

    @Delete(':id')
    @HttpCode(204)
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Supprime une source : métadonnées, table DuckDB et fichiers.' })
    async supprimer(@EspaceCourant() espace: EspaceAvecRole, @UtilisateurCourant() utilisateur: Utilisateur, @Param('id') id: string) {
        const idSur = verifierNomSur(id, 'identifiant de source');
        const existante = await this.sources.lire(espace.id, idSur).catch(() => null);
        await this.supprimerTout(espace, idSur);
        await this.journal.consigner({
            espaceId: espace.id,
            utilisateurId: utilisateur.id,
            action: 'source.suppression',
            cible: existante ? existante.name : idSur
        });
    }

    @Delete()
    @HttpCode(204)
    @RoleEspaceRequis('administrateur')
    @ApiOperation({ summary: 'Remise à zéro : toutes les sources, tables DuckDB et fichiers de l’espace.' })
    async vider(@EspaceCourant() espace: EspaceAvecRole, @UtilisateurCourant() utilisateur: Utilisateur) {
        const { moteur, fichiers } = await this.espaces.ressources(espace);
        for (const document of await this.sources.lister(espace.id)) await this.supprimerTout(espace, String(document.id));
        for (const table of await moteur.tables()) if (table.nom.startsWith('t_')) await moteur.abandonner(table.nom);
        for (const fichier of await fichiers.lister()) await fichiers.supprimer(fichier.nom);
        await this.journal.consigner({ espaceId: espace.id, utilisateurId: utilisateur.id, action: 'sources.remise-a-zero' });
    }

    @Post(':id/optimiser')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Réécrit la table en Parquet ZSTD sur le serveur et la remplace par une vue.' })
    async optimiser(@EspaceCourant() espace: EspaceAvecRole, @UtilisateurCourant() utilisateur: Utilisateur, @Param('id') id: string) {
        const idSur = verifierNomSur(id, 'identifiant de source');
        const { moteur, fichiers } = await this.espaces.ressources(espace);
        const nomTable = identifiantSql(nomTableDuckDB(idSur));
        const nomParquet = 'pq_' + idSur + '.parquet';
        const cheminParquet = fichiers.chemin(nomParquet);
        const cheminTemporaire = cheminParquet + '.partiel.parquet';
        await moteur.executer(`COPY (SELECT * FROM ${nomTable}) TO ${litteralSql(cheminTemporaire)} (FORMAT PARQUET, COMPRESSION ZSTD)`);
        await moteur.abandonner(nomTableDuckDB(idSur));
        await fsp.rename(cheminTemporaire, cheminParquet);
        await moteur.executer(`CREATE VIEW ${nomTable} AS SELECT * FROM read_parquet(${litteralSql(nomParquet)})`);
        const description = await fichiers.decrire(nomParquet);
        await this.sources.marquerOptimisee(espace.id, idSur, description.taille);
        await this.journal.consigner({
            espaceId: espace.id,
            utilisateurId: utilisateur.id,
            action: 'source.optimisation',
            cible: idSur,
            details: { octets: description.taille }
        });
        return { fichier: nomParquet, taille: description.taille };
    }

    @Post(':id/parquet')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Export Parquet de la table (octets), produit sur le serveur puis effacé.' })
    async exporterParquet(@EspaceCourant() espace: EspaceAvecRole, @Param('id') id: string, @Res() reponse: FastifyReply) {
        const idSur = verifierNomSur(id, 'identifiant de source');
        const { moteur, fichiers } = await this.espaces.ressources(espace);
        const nomExport = 'exp_' + idSur + '_' + Date.now() + '.parquet';
        const cheminExport = fichiers.chemin(nomExport);
        await moteur.executer(
            `COPY (SELECT * EXCLUDE (__rn) FROM ${identifiantSql(nomTableDuckDB(idSur))}) TO ${litteralSql(cheminExport)} (FORMAT PARQUET, COMPRESSION ZSTD)`
        );
        try {
            const contenu = await fsp.readFile(cheminExport);
            reponse.type('application/octet-stream').header('content-length', contenu.length).send(contenu);
        } finally {
            await fsp.rm(cheminExport, { force: true });
        }
    }

    private async supprimerTout(espace: EspaceAvecRole, id: string): Promise<void> {
        const { moteur, fichiers } = await this.espaces.ressources(espace);
        await moteur.abandonner(nomTableDuckDB(id));
        await this.sources.supprimer(espace.id, id);
        await fichiers.supprimerParPrefixe('src_' + id);
        await fichiers.supprimerParPrefixe('pq_' + id + '.');
        await fichiers.supprimerParPrefixe('exp_' + id + '.');
    }
}
