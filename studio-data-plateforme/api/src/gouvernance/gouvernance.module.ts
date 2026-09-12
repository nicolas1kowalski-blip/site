/**
 * Module de gouvernance typée au-dessus du document appState : glossaire, dictionnaire, objets métier, actifs,
 * périmètres, personnes et domaines, listes de valeurs, sensibilité, propositions à valider.
 */
import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { JournalModule } from '../journal/journal.module';
import { SourcesModule } from '../sources/sources.module';
import { GouvernanceController } from './gouvernance.controller';
import { GouvernanceService } from './gouvernance.service';
import { ListesValeursController } from './listes-valeurs.controller';
import { PropositionsController } from './propositions.controller';
import { ReferentielsController } from './referentiels.controller';
import { SensibiliteController } from './sensibilite.controller';

@Module({
    imports: [DocumentsModule, JournalModule, SourcesModule],
    controllers: [GouvernanceController, ReferentielsController, ListesValeursController, SensibiliteController, PropositionsController],
    providers: [GouvernanceService],
    exports: [GouvernanceService]
})
export class GouvernanceModule {}
