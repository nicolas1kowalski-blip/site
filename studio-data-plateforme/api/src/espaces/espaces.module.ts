/** Module des espaces de travail : service partagé (ressources DuckDB + fichiers) et routes d'administration. */
import { Global, Module } from '@nestjs/common';
import { JournalModule } from '../journal/journal.module';
import { EspacesController } from './espaces.controller';
import { EspacesService } from './espaces.service';

@Global()
@Module({
    imports: [JournalModule],
    controllers: [EspacesController],
    providers: [EspacesService],
    exports: [EspacesService]
})
export class EspacesModule {}
