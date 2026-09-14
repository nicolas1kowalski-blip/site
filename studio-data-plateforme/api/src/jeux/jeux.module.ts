/** Module des jeux temporaires : des tableaux gardés pour la session, jamais des sources. */
import { Module } from '@nestjs/common';
import { JournalModule } from '../journal/journal.module';
import { SourcesModule } from '../sources/sources.module';
import { JeuxController } from './jeux.controller';
import { JeuxService } from './jeux.service';

@Module({
    imports: [JournalModule, SourcesModule],
    controllers: [JeuxController],
    providers: [JeuxService],
    exports: [JeuxService]
})
export class JeuxModule {}
