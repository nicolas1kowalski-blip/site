/** Point d'entrée du serveur : configuration depuis l'environnement, application, écoute. */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { creerApplication } from './application';
import { lireConfiguration } from './configuration/configuration';

async function demarrer(): Promise<void> {
    const configuration = lireConfiguration();
    const app = await creerApplication(configuration);
    await app.listen(configuration.port, configuration.hote);
    new Logger('Studio Data').log(
        `API à l'écoute sur http://${configuration.hote}:${configuration.port} — données : ${configuration.dossierDonnees}`
    );
}

demarrer().catch(erreur => {
    console.error('Démarrage impossible :', erreur);
    process.exit(1);
});
