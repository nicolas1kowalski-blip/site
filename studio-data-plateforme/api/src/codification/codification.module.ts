/** Module des codifications (rattacher un code de référentiel à chaque ligne d'une liste reçue). */
import { Module } from '@nestjs/common';
import { GouvernanceModule } from '../gouvernance/gouvernance.module';
import { SourcesModule } from '../sources/sources.module';
import { CodificationController } from './codification.controller';
import { CodificationService } from './codification.service';

@Module({
    imports: [GouvernanceModule, SourcesModule],
    controllers: [CodificationController],
    providers: [CodificationService],
    exports: [CodificationService]
})
export class CodificationModule {}
