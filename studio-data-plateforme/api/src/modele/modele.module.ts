/** Module du modèle de données (liens entre sources). */
import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { JournalModule } from '../journal/journal.module';
import { SourcesModule } from '../sources/sources.module';
import { ModeleController } from './modele.controller';
import { ModeleService } from './modele.service';

@Module({
    imports: [DocumentsModule, JournalModule, SourcesModule],
    controllers: [ModeleController],
    providers: [ModeleService],
    exports: [ModeleService]
})
export class ModeleModule {}
