/** Module d'extraction (spécification → SQL → aperçu, comptage, export, modèles enregistrés). */
import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { JournalModule } from '../journal/journal.module';
import { SourcesModule } from '../sources/sources.module';
import { ExtractionController } from './extraction.controller';

@Module({
    imports: [DocumentsModule, JournalModule, SourcesModule],
    controllers: [ExtractionController]
})
export class ExtractionModule {}
