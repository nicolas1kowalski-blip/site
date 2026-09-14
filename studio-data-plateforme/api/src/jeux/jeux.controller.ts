/**
 * Routes des jeux temporaires : lister, créer depuis une extraction ou une requête, renommer, exporter,
 * promouvoir en source, supprimer. Un jeu se crée et se supprime avec le rôle éditeur, comme une source.
 */
import { Body, Controller, Delete, Get, Param, Post, Put, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { EspaceAvecRole, EspaceCourant, RoleEspaceRequis, UtilisateurCourant } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { verifierNomSur } from '../commun/erreurs';
import { valider } from '../commun/validation';
import { EspacesService } from '../espaces/espaces.service';
import { identifiantSql } from '../espaces/moteur-duckdb';
import { JournalService } from '../journal/journal.service';
import { ORIGINES_JEU, JeuxService, OrigineJeu } from './jeux.service';

/** Seules les requêtes de lecture peuvent alimenter un jeu. */
const LECTURE_SEULE = /^\s*(SELECT|WITH)\b/i;

const schemaCreation = z.object({
    sql: z
        .string()
        .trim()
        .min(1, 'requête requise')
        .refine(sql => LECTURE_SEULE.test(sql), 'requête de lecture attendue'),
    nom: z.string().trim().min(1, 'nom requis').max(120),
    origine: z.enum(Object.keys(ORIGINES_JEU) as [OrigineJeu, ...OrigineJeu[]]).default('requete')
});
const schemaNom = z.object({ nom: z.string().trim().min(1, 'nom requis').max(120) });

/** Un fichier déposé gardé comme jeu, sans devenir une source : le « 📄 Fichier extérieur… » des écrans. */
const schemaFichier = z.object({
    nomServeur: z.string().trim().min(1, 'fichier requis').max(300),
    nom: z.string().trim().min(1, 'nom requis').max(120),
    feuille: z.string().trim().max(200).default(''),
    delim: z.string().max(4).default('')
});

@ApiTags('Jeux temporaires')
@Controller('api/jeux')
export class JeuxController {
    constructor(
        private readonly jeux: JeuxService,
        private readonly espaces: EspacesService,
        private readonly journal: JournalService
    ) {}

    @Get('vocabulaire')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Les origines possibles d’un jeu temporaire, avec leur libellé.' })
    vocabulaire() {
        return { origines: ORIGINES_JEU };
    }

    @Get()
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Les jeux temporaires de l’espace, du plus récent au plus ancien.' })
    lister(@EspaceCourant() espace: EspaceAvecRole) {
        return this.jeux.lister(espace.id);
    }

    @Post()
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Garde le résultat d’une requête de lecture comme jeu temporaire.' })
    async creer(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaCreation)) corps: z.infer<typeof schemaCreation>
    ) {
        const jeu = await this.jeux.creerDepuisRequete(espace, corps.sql, corps.nom, corps.origine);
        await this.journal.consigner({ espaceId: espace.id, utilisateurId: utilisateur.id, action: 'jeu.creation', cible: jeu.nom });
        return jeu;
    }

    @Post('fichier')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Garde un fichier déposé (CSV, texte, Excel, Parquet, JSON) comme jeu temporaire.' })
    async creerDepuisFichier(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaFichier)) corps: z.infer<typeof schemaFichier>
    ) {
        const nomServeur = verifierNomSur(corps.nomServeur, 'nom de fichier');
        const jeu = await this.jeux.creerDepuisFichier(espace, nomServeur, corps.nom, corps.feuille, {
            ...(corps.delim ? { delim: corps.delim } : {})
        });
        await this.journal.consigner({ espaceId: espace.id, utilisateurId: utilisateur.id, action: 'jeu.creation', cible: jeu.nom });
        return jeu;
    }

    @Put(':id/nom')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Renomme un jeu temporaire.' })
    renommer(@EspaceCourant() espace: EspaceAvecRole, @Param('id') id: string, @Body(valider(schemaNom)) corps: z.infer<typeof schemaNom>) {
        return this.jeux.renommer(espace.id, id, corps.nom);
    }

    @Post(':id/promouvoir')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Transforme un jeu temporaire en source de l’espace, visible partout.' })
    async promouvoir(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('id') id: string,
        @Body(valider(schemaNom.partial())) corps: { nom?: string }
    ) {
        const source = await this.jeux.promouvoir(espace.id, id, corps.nom || '');
        await this.journal.consigner({ espaceId: espace.id, utilisateurId: utilisateur.id, action: 'jeu.promotion', cible: source.name });
        return source;
    }

    @Post(':id/export.csv')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Export CSV d’un jeu temporaire (séparateur ;, UTF-8 avec BOM pour Excel).' })
    async exporter(@EspaceCourant() espace: EspaceAvecRole, @Param('id') id: string, @Res() reponse: FastifyReply) {
        const jeu = (await this.jeux.lister(espace.id)).find(candidat => candidat.id === id);
        const { moteur } = await this.espaces.ressources(espace);
        const generateur = moteur.flux(`SELECT * EXCLUDE (__rn) FROM ${identifiantSql('t_' + id)}`);
        const premiere = await generateur.next();
        const nomFichier = (jeu?.nom || 'jeu').replace(/[^\w.-]+/g, '_') + '.csv';
        const ligneCsv = (valeurs: unknown[]) =>
            valeurs.map(valeur => '"' + String(valeur ?? '').replace(/"/g, '""') + '"').join(';') + '\r\n';
        async function* lignes() {
            yield '﻿';
            if (!premiere.done && premiere.value.colonnes) yield ligneCsv(premiere.value.colonnes.map(colonne => colonne.nom));
            for await (const paquet of generateur) for (const ligne of paquet.lignes) yield ligneCsv(ligne);
        }
        reponse
            .type('text/csv; charset=utf-8')
            .header('content-disposition', `attachment; filename="${nomFichier}"`)
            .send(Readable.from(lignes()));
    }

    @Delete(':id')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Supprime un jeu temporaire et sa table.' })
    async supprimer(@EspaceCourant() espace: EspaceAvecRole, @Param('id') id: string) {
        await this.jeux.supprimer(espace, id);
        return { ok: true };
    }

    @Delete()
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Supprime tous les jeux temporaires de l’espace.' })
    async viderTout(@EspaceCourant() espace: EspaceAvecRole) {
        return { supprimes: await this.jeux.viderTout(espace) };
    }
}
