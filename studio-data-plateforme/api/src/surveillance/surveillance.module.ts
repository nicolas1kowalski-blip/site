/** Module de surveillance des sources. */
import { Module } from '@nestjs/common';
import { GouvernanceModule } from '../gouvernance/gouvernance.module';
import { SourcesModule } from '../sources/sources.module';
import { SurveillanceController } from './surveillance.controller';
import { SurveillanceService } from './surveillance.service';

@Module({
    imports: [GouvernanceModule, SourcesModule],
    controllers: [SurveillanceController],
    providers: [SurveillanceService],
    exports: [SurveillanceService]
})
export class SurveillanceModule {}
