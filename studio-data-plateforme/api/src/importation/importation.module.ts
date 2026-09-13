/** Module d'importation : fichiers déposés, Excel, fusion, adresses, livraisons ZIP → sources de l'espace. */
import { Module } from '@nestjs/common';
import { JournalModule } from '../journal/journal.module';
import { SourcesModule } from '../sources/sources.module';
import { ImportationController } from './importation.controller';
import { ImportationService } from './importation.service';

@Module({
    imports: [JournalModule, SourcesModule],
    controllers: [ImportationController],
    providers: [ImportationService],
    exports: [ImportationService]
})
export class ImportationModule {}
