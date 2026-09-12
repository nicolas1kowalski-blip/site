/** Module des tables conçues : recettes de consolidation matérialisées en tables DuckDB. */
import { Module } from '@nestjs/common';
import { JournalModule } from '../journal/journal.module';
import { ModeleModule } from '../modele/modele.module';
import { SourcesModule } from '../sources/sources.module';
import { TablesConcuesController } from './tables-concues.controller';
import { TablesConcuesService } from './tables-concues.service';

@Module({
    imports: [JournalModule, SourcesModule, ModeleModule],
    controllers: [TablesConcuesController],
    providers: [TablesConcuesService],
    exports: [TablesConcuesService]
})
export class TablesConcuesModule {}
