/**
 * Construction de l'application NestJS sur Fastify. Utilisée par main.ts (serveur) et par les tests
 * (application en mémoire, `app.inject`).
 *
 *   • cookies (session) ;
 *   • corps bruts en flux pour les dépôts de fichiers (tout type autre que JSON) ;
 *   • réponses d'erreur homogènes { erreur: message } ;
 *   • documentation OpenAPI sur /api/docs ;
 *   • fronts statiques : Angular à la racine (avec repli sur index.html), application classique sous /classique/.
 */
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { FastifyReply, FastifyRequest } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { AppModule } from './app.module';
import { Configuration } from './configuration/configuration';

/** Toute exception devient { erreur: message } avec le bon code HTTP ; les erreurs internes sont journalisées. */
@Catch()
class FiltreErreurs implements ExceptionFilter {
    private readonly journal = new Logger('HTTP');

    catch(exception: unknown, hote: ArgumentsHost): void {
        const reponse = hote.switchToHttp().getResponse<FastifyReply>();
        if (exception instanceof HttpException) {
            const corps = exception.getResponse();
            const message =
                typeof corps === 'object' && corps && 'erreur' in corps ? (corps as { erreur: string }).erreur : exception.message;
            reponse.status(exception.getStatus()).send({ erreur: message });
            return;
        }
        const statut = (exception as { statusCode?: number }).statusCode;
        if (statut === 413 || statut === 400) {
            reponse.status(statut).send({ erreur: (exception as Error).message });
            return;
        }
        this.journal.error(exception instanceof Error ? exception.stack : String(exception));
        reponse.status(500).send({ erreur: 'Erreur interne : ' + String((exception as Error).message || exception) });
    }
}

export async function creerApplication(configuration: Configuration): Promise<NestFastifyApplication> {
    const adaptateur = new FastifyAdapter({
        logger: configuration.journal !== 'silent' && { level: configuration.journal },
        bodyLimit: 512 * 1024 * 1024
    });
    const app = await NestFactory.create<NestFastifyApplication>(AppModule.avec(configuration), adaptateur, {
        logger: configuration.journal === 'silent' ? false : ['error', 'warn', 'log']
    });
    app.useGlobalFilters(new FiltreErreurs());
    app.enableShutdownHooks();

    const fastify = app.getHttpAdapter().getInstance();
    await fastify.register(fastifyCookie);
    // Corps non JSON (dépôt de fichiers) : le flux brut est transmis tel quel, sans mise en mémoire.
    fastify.addContentTypeParser('*', (_requete: FastifyRequest, charge: unknown, suite: (erreur: null, corps: unknown) => void) =>
        suite(null, charge)
    );

    const documentation = new DocumentBuilder()
        .setTitle('Studio Data — API')
        .setDescription('Gouvernance, sources, SQL (DuckDB), espaces et utilisateurs.')
        .setVersion('2.0')
        .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, documentation));

    await servirFronts(app, configuration);
    return app;
}

/** Fronts statiques : l'application classique sous /classique/, Angular à la racine (le repli SPA est dans front/front.controller.ts). */
async function servirFronts(app: NestFastifyApplication, configuration: Configuration): Promise<void> {
    const fastify = app.getHttpAdapter().getInstance();
    const classiqueDisponible = fs.existsSync(path.join(configuration.dossierWebClassique, 'index.html'));
    const angularDisponible = fs.existsSync(path.join(configuration.dossierWeb, 'index.html'));
    if (classiqueDisponible) {
        await fastify.register(fastifyStatic, {
            root: configuration.dossierWebClassique,
            prefix: '/classique/',
            decorateReply: false,
            index: ['index.html']
        });
    }
    if (angularDisponible) {
        await fastify.register(fastifyStatic, {
            root: configuration.dossierWeb,
            prefix: '/',
            decorateReply: false,
            index: ['index.html'],
            wildcard: false
        });
    }
}
