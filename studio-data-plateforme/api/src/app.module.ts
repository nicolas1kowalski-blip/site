/**
 * Module racine : configuration, base référentielle, authentification (garde global), puis les modules métier.
 * L'ordre des imports n'a pas d'importance fonctionnelle ; il suit la dépendance logique pour la lecture.
 */
import { DynamicModule, Module } from '@nestjs/common';
import { AuthentificationModule } from './authentification/authentification.module';
import { BaseDeDonneesModule } from './base-de-donnees/base-de-donnees.module';
import { CatalogueModule } from './catalogue/catalogue.module';
import { CONFIGURATION, Configuration } from './configuration/configuration';
import { DocumentsModule } from './documents/documents.module';
import { EspacesModule } from './espaces/espaces.module';
import { ExploitationModule } from './exploitation/exploitation.module';
import { ExtractionModule } from './extraction/extraction.module';
import { FichiersController } from './fichiers/fichiers.controller';
import { FrontController } from './front/front.controller';
import { GouvernanceModule } from './gouvernance/gouvernance.module';
import { ImportationModule } from './importation/importation.module';
import { JournalModule } from './journal/journal.module';
import { LineageModule } from './lineage/lineage.module';
import { ModeleModule } from './modele/modele.module';
import { DemonstrationModule } from './demonstration/demonstration.module';
import { QualiteModule } from './qualite/qualite.module';
import { SanteController } from './sante/sante.controller';
import { SauvegardeModule } from './sauvegarde/sauvegarde.module';
import { CockpitModule } from './cockpit/cockpit.module';
import { PreparationModule } from './preparation/preparation.module';
import { SourcesModule } from './sources/sources.module';
import { SurveillanceModule } from './surveillance/surveillance.module';
import { TablesConcuesModule } from './tables-concues/tables-concues.module';
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
                ImportationModule,
                GouvernanceModule,
                ModeleModule,
                ExtractionModule,
                QualiteModule,
                TablesConcuesModule,
                LineageModule,
                ExploitationModule,
                CatalogueModule,
                SurveillanceModule,
                SauvegardeModule,
                CockpitModule,
                PreparationModule,
                DemonstrationModule
            ],
            controllers: [SanteController, SqlController, FichiersController, FrontController],
            providers: [{ provide: CONFIGURATION, useValue: configuration }],
            exports: [CONFIGURATION]
        };
    }
}
