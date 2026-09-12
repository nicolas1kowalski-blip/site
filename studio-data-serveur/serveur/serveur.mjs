#!/usr/bin/env node
// Point d'entrée : lit la configuration, construit l'application et écoute. Arrêt propre sur SIGINT/SIGTERM
// (la base DuckDB est fermée, ce qui écrit le journal de transactions).
import { lireConfiguration } from './configuration.mjs';
import { creerApplication } from './application.mjs';

const configuration = lireConfiguration();
const app = await creerApplication(configuration);

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
        app.log.info('Arrêt demandé (' + signal + ')');
        await app.close();
        process.exit(0);
    });
}

try {
    await app.espaces.obtenir('defaut');
    await app.listen({ host: configuration.hote, port: configuration.port });
    app.log.info(`Studio Data serveur — données : ${configuration.dossierDonnees}`);
} catch (erreur) {
    app.log.error(erreur);
    process.exit(1);
}
