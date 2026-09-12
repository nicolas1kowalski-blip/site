/** Module d'administration des utilisateurs. */
import { Module } from '@nestjs/common';
import { JournalModule } from '../journal/journal.module';
import { UtilisateursController } from './utilisateurs.controller';

@Module({
    imports: [JournalModule],
    controllers: [UtilisateursController]
})
export class UtilisateursModule {}
