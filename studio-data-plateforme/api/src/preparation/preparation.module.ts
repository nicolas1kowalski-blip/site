/** Module des préparations (recettes de nettoyage reproductibles). */
import { Module } from '@nestjs/common';
import { GouvernanceModule } from '../gouvernance/gouvernance.module';
import { SourcesModule } from '../sources/sources.module';
import { PreparationController } from './preparation.controller';
import { PreparationService } from './preparation.service';

@Module({
    imports: [GouvernanceModule, SourcesModule],
    controllers: [PreparationController],
    providers: [PreparationService],
    exports: [PreparationService]
})
export class PreparationModule {}
