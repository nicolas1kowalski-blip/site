/**
 * Module NestJS de la base référentielle : ouvre la connexion au démarrage, applique les migrations et
 * fournit `BASE_DE_DONNEES` à tous les autres modules. La connexion est fermée à l'arrêt de l'application.
 */
import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { CONFIGURATION, Configuration } from '../configuration/configuration';
import { BASE_DE_DONNEES, ConnexionBase, ouvrirBaseDeDonnees } from './connexion';
import { appliquerMigrations } from './migrations';

const CONNEXION_BASE = Symbol('CONNEXION_BASE');

@Global()
@Module({
    providers: [
        {
            provide: CONNEXION_BASE,
            inject: [CONFIGURATION],
            useFactory: async (configuration: Configuration): Promise<ConnexionBase> => {
                const connexion = await ouvrirBaseDeDonnees(configuration.postgresUrl, configuration.dossierDonnees);
                await appliquerMigrations(connexion.base);
                return connexion;
            }
        },
        {
            provide: BASE_DE_DONNEES,
            inject: [CONNEXION_BASE],
            useFactory: (connexion: ConnexionBase) => connexion.base
        }
    ],
    exports: [BASE_DE_DONNEES, CONNEXION_BASE]
})
export class BaseDeDonneesModule implements OnApplicationShutdown {
    constructor(@Inject(CONNEXION_BASE) private readonly connexion: ConnexionBase) {}

    async onApplicationShutdown(): Promise<void> {
        await this.connexion.fermer();
    }
}

export { CONNEXION_BASE };
