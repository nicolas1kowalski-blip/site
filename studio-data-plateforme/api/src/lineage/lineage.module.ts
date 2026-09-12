/** Module de lineage : carte des flux, réconciliation, parcours d'un attribut, lineage d'une table. */
import { Module } from '@nestjs/common';
import { GouvernanceModule } from '../gouvernance/gouvernance.module';
import { SourcesModule } from '../sources/sources.module';
import { LineageController } from './lineage.controller';
import { LineageService } from './lineage.service';

@Module({
    imports: [GouvernanceModule, SourcesModule],
    controllers: [LineageController],
    providers: [LineageService],
    exports: [LineageService]
})
export class LineageModule {}
