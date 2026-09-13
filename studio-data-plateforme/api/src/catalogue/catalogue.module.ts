/** Module du catalogue de données recherchable. */
import { Module } from '@nestjs/common';
import { GouvernanceModule } from '../gouvernance/gouvernance.module';
import { QualiteModule } from '../qualite/qualite.module';
import { SourcesModule } from '../sources/sources.module';
import { CatalogueController } from './catalogue.controller';
import { CatalogueService } from './catalogue.service';

@Module({
    imports: [GouvernanceModule, SourcesModule, QualiteModule],
    controllers: [CatalogueController],
    providers: [CatalogueService],
    exports: [CatalogueService]
})
export class CatalogueModule {}
