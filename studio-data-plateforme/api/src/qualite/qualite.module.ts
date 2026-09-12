/** Module qualité des données : profilage, doublons, règles et score, audits. */
import { Module } from '@nestjs/common';
import { JournalModule } from '../journal/journal.module';
import { SourcesModule } from '../sources/sources.module';
import { QualiteController } from './qualite.controller';
import { QualiteService } from './qualite.service';

@Module({
    imports: [JournalModule, SourcesModule],
    controllers: [QualiteController],
    providers: [QualiteService],
    exports: [QualiteService]
})
export class QualiteModule {}
