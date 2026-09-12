/** Module des sources de données. */
import { Module } from '@nestjs/common';
import { JournalModule } from '../journal/journal.module';
import { SourcesController } from './sources.controller';
import { SourcesService } from './sources.service';

@Module({
    imports: [JournalModule],
    controllers: [SourcesController],
    providers: [SourcesService],
    exports: [SourcesService]
})
export class SourcesModule {}
