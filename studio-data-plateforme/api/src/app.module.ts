/**
 * Module racine : configuration, base référentielle, authentification (garde global), puis les modules métier.
 * L'ordre des imports n'a pas d'importance fonctionnelle ; il suit la dépendance logique pour la lecture.
 */
import { DynamicModule, Module } from '@nestjs/common';
import { AuthentificationModule } from './authentification/authentification.module';
import { BaseDeDonneesModule } from './base-de-donnees/base-de-donnees.module';
import { CONFIGURATION, Configuration } from './configuration/configuration';
import { DocumentsModule } from './documents/documents.module';
import { EspacesModule } from './espaces/espaces.module';
import { ExtractionModule } from './extraction/extraction.module';
import { FichiersController } from './fichiers/fichiers.controller';
import { FrontController } from './front/front.controller';
import { GouvernanceModule } from './gouvernance/gouvernance.module';
import { JournalModule } from './journal/journal.module';
import { ModeleModule } from './modele/modele.module';
import { SanteController } from './sante/sante.controller';
import { SourcesModule } from './sources/sources.module';
import { SqlController } from './sql/sql.controller';
import { UtilisateursModule } from './utilisateurs/utilisateurs.module';

@Module({})
export class AppModule {
    /** La configuration est passée explicitement : les tests en fournissent une (dossier temporaire, PGlite). */
    static avec(configuration: Configuration): DynamicModule {
        return {
            module: AppModule,
            global: true,
            imports: [
                BaseDeDonneesModule,
                JournalModule,
                AuthentificationModule,
                EspacesModule,
                UtilisateursModule,
                DocumentsModule,
                SourcesModule,
                GouvernanceModule,
                ModeleModule,
                ExtractionModule
            ],
            controllers: [SanteController, SqlController, FichiersController, FrontController],
            providers: [{ provide: CONFIGURATION, useValue: configuration }],
            exports: [CONFIGURATION]
        };
    }
}
