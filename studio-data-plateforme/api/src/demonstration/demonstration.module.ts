/** Mode démonstration : installation en un clic du jeu de données et de toute sa gouvernance. */
import { Module } from '@nestjs/common';
import { GouvernanceModule } from '../gouvernance/gouvernance.module';
import { ImportationModule } from '../importation/importation.module';
import { JournalModule } from '../journal/journal.module';
import { QualiteModule } from '../qualite/qualite.module';
import { SourcesModule } from '../sources/sources.module';
import { DemonstrationController } from './demonstration.controller';
import { DemonstrationService } from './demonstration.service';

@Module({
    imports: [JournalModule, SourcesModule, ImportationModule, GouvernanceModule, QualiteModule],
    controllers: [DemonstrationController],
    providers: [DemonstrationService],
    exports: [DemonstrationService]
})
export class DemonstrationModule {}
