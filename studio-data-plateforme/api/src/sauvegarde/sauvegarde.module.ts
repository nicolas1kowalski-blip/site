/** Module de sauvegarde et partage : export, import, dossier de gouvernance. */
import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { GouvernanceModule } from '../gouvernance/gouvernance.module';
import { QualiteModule } from '../qualite/qualite.module';
import { SourcesModule } from '../sources/sources.module';
import { TablesConcuesModule } from '../tables-concues/tables-concues.module';
import { SauvegardeController } from './sauvegarde.controller';
import { SauvegardeService } from './sauvegarde.service';

@Module({
    imports: [DocumentsModule, SourcesModule, GouvernanceModule, QualiteModule, TablesConcuesModule],
    controllers: [SauvegardeController],
    providers: [SauvegardeService]
})
export class SauvegardeModule {}
