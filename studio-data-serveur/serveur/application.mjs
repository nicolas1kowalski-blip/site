// Assemblage de l'application Fastify : authentification, espaces de travail, routes API, front statique.
// creerApplication() est utilisée telle quelle par serveur.mjs et par les tests (app.inject / app.listen).
import fs from 'node:fs';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { Espaces } from './espaces.mjs';
import { ErreurApplicative } from './erreurs.mjs';
import { authentification } from './auth/authentification.mjs';
import { routesSante } from './routes/sante.mjs';
import { routesSql } from './routes/sql.mjs';
import { routesFichiers } from './routes/fichiers.mjs';
import { routesEtat } from './routes/etat.mjs';
import { routesTables } from './routes/tables.mjs';

/** @param {import('./configuration.mjs').Configuration} configuration */
export async function creerApplication(configuration) {
    const app = Fastify({ logger: configuration.journal === 'silent' ? false : { level: configuration.journal } });
    const espaces = new Espaces(configuration);
    app.decorate('espaces', espaces);
    app.decorate('configuration', configuration);

    // Corps non JSON (dépôt de fichiers) : le flux brut est transmis tel quel aux routes, sans mise en mémoire.
    app.addContentTypeParser('*', (request, charge, suite) => suite(null, charge));
    app.decorateRequest('corpsBrut', function corpsBrut() {
        return this.body && typeof this.body.pipe === 'function' ? this.body : this.raw;
    });
    // L'espace de travail de la requête découle de l'utilisateur authentifié.
    app.decorateRequest('espace', function espace() {
        return espaces.obtenir((this.utilisateur && this.utilisateur.espace) || 'defaut');
    });

    app.setErrorHandler((erreur, request, reply) => {
        if (erreur instanceof ErreurApplicative) {
            reply.code(erreur.statut).send({ erreur: erreur.message });
            return;
        }
        if (erreur.validation || erreur.statusCode === 400 || erreur.statusCode === 413) {
            reply.code(erreur.statusCode || 400).send({ erreur: erreur.message });
            return;
        }
        request.log.error(erreur);
        reply.code(500).send({ erreur: 'Erreur interne : ' + String(erreur.message || erreur) });
    });

    await app.register(authentification, { mode: configuration.authentification.mode });
    await app.register(routesSante);
    await app.register(routesSql);
    await app.register(routesFichiers);
    await app.register(routesEtat);
    await app.register(routesTables);

    if (fs.existsSync(configuration.dossierClient)) {
        await app.register(fastifyStatic, {
            root: configuration.dossierClient,
            index: ['index.html'],
            cacheControl: true,
            maxAge: '1h',
            setHeaders(reponse, cheminFichier) {
                if (cheminFichier.endsWith('index.html')) reponse.setHeader('cache-control', 'no-cache');
            }
        });
    } else {
        app.get('/', async () => ({
            message:
                'Front non construit : lancez « npm run construire » puis redémarrez (dossier attendu : ' +
                configuration.dossierClient +
                ').'
        }));
    }

    app.addHook('onClose', async () => {
        await espaces.fermerTout();
    });
    return app;
}
