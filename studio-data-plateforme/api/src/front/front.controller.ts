/**
 * Repli de l'application Angular : toute adresse GET qui n'est ni une route d'API ni un fichier statique
 * existant reçoit index.html, pour que les écrans (/sources, /glossaire…) s'ouvrent aussi par adresse directe.
 * Sans front construit, la réponse explique quoi faire.
 */
import { Controller, Get, Inject, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { FastifyReply, FastifyRequest } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { Public } from '../authentification/contexte-requete';
import { CONFIGURATION, Configuration } from '../configuration/configuration';

@ApiExcludeController()
@Controller()
export class FrontController {
    constructor(@Inject(CONFIGURATION) private readonly configuration: Configuration) {}

    @Public()
    @Get('*')
    repli(@Req() requete: FastifyRequest, @Res() reponse: FastifyReply): void {
        if (requete.url.startsWith('/api/')) {
            reponse.code(404).send({ erreur: 'Route inconnue : GET ' + requete.url });
            return;
        }
        const index = path.join(this.configuration.dossierWeb, 'index.html');
        if (!fs.existsSync(index)) {
            reponse
                .code(404)
                .send({ erreur: 'Front non construit : lancez « npm run construire » à la racine du projet (web/ et web-classique/).' });
            return;
        }
        reponse.type('text/html').header('cache-control', 'no-cache').send(fs.createReadStream(index));
    }
}
