/** Module des documents JSON (état de l'application classique et gouvernance). */
import { Module } from '@nestjs/common';
import { JournalModule } from '../journal/journal.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
    imports: [JournalModule],
    controllers: [DocumentsController],
    providers: [DocumentsService],
    exports: [DocumentsService]
})
export class DocumentsModule {}
