/** Module du cockpit (accueil). */
import { Module } from '@nestjs/common';
import { GouvernanceModule } from '../gouvernance/gouvernance.module';
import { ModeleModule } from '../modele/modele.module';
import { QualiteModule } from '../qualite/qualite.module';
import { SourcesModule } from '../sources/sources.module';
import { CockpitController } from './cockpit.controller';
import { CockpitService } from './cockpit.service';

@Module({
    imports: [SourcesModule, ModeleModule, GouvernanceModule, QualiteModule],
    controllers: [CockpitController],
    providers: [CockpitService]
})
export class CockpitModule {}
