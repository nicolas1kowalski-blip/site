/**
 * Exécution SQL sur le moteur DuckDB de l'espace courant.
 *
 *   POST /api/sql       → résultat complet { colonnes, lignes }  (conn.query de l'application classique)
 *   POST /api/sql/flux  → NDJSON : première ligne { colonnes }, puis { lignes } par paquet (conn.send)
 *
 * Un lecteur ne peut exécuter que des requêtes de lecture (SELECT, WITH, DESCRIBE, SHOW, EXPLAIN) ;
 * un éditeur peut tout faire, y compris créer et supprimer des tables.
 */
import { Body, Controller, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { EspaceAvecRole, EspaceCourant, RoleEspaceRequis, roleSuffisant } from '../authentification/contexte-requete';
import { erreurInterdit } from '../commun/erreurs';
import { valider } from '../commun/validation';
import { EspacesService } from '../espaces/espaces.service';

const schemaRequete = z.object({ sql: z.string().min(1, 'requête SQL requise') });
const LECTURE_SEULE = /^\s*(SELECT|WITH|DESCRIBE|SHOW|EXPLAIN|SUMMARIZE|PRAGMA\s+(table_info|show_tables)|SET|RESET|FROM)\b/i;

function verifierDroitSql(espace: EspaceAvecRole, sql: string): void {
    if (roleSuffisant(espace.role, 'editeur')) return;
    if (!LECTURE_SEULE.test(sql)) throw erreurInterdit('En lecture seule, seules les requêtes SELECT sont autorisées.');
}

@ApiTags('SQL')
@Controller('api/sql')
export class SqlController {
    constructor(private readonly espaces: EspacesService) {}

    @Post()
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Exécute une requête et renvoie le résultat complet.' })
    async executer(@EspaceCourant() espace: EspaceAvecRole, @Body(valider(schemaRequete)) corps: z.infer<typeof schemaRequete>) {
        verifierDroitSql(espace, corps.sql);
        const { moteur } = await this.espaces.ressources(espace);
        return moteur.executer(corps.sql);
    }

    @Post('flux')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Exécute une requête et renvoie les lignes en flux NDJSON.' })
    async flux(
        @EspaceCourant() espace: EspaceAvecRole,
        @Body(valider(schemaRequete)) corps: z.infer<typeof schemaRequete>,
        @Res() reponse: FastifyReply
    ) {
        verifierDroitSql(espace, corps.sql);
        const { moteur } = await this.espaces.ressources(espace);
        const generateur = moteur.flux(corps.sql);
        // La première étape est attendue ici : une erreur SQL devient une vraie réponse 400 (avant tout envoi).
        const premiere = await generateur.next();
        async function* lignesNdjson() {
            if (!premiere.done) yield JSON.stringify(premiere.value) + '\n';
            for await (const paquet of generateur) yield JSON.stringify(paquet) + '\n';
        }
        reponse.type('application/x-ndjson').send(Readable.from(lignesNdjson()));
    }
}
