/** Module de gouvernance typée (glossaire, dictionnaire) au-dessus du document appState. */
import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { JournalModule } from '../journal/journal.module';
import { GouvernanceController } from './gouvernance.controller';

@Module({
    imports: [DocumentsModule, JournalModule],
    controllers: [GouvernanceController]
})
export class GouvernanceModule {}
