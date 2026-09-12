/** Module du journal d'audit : service partagé et route de consultation. */
import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { EspaceAvecRole, EspaceCourant, RoleEspaceRequis } from '../authentification/contexte-requete';
import { JournalService } from './journal.service';

@ApiTags('Journal')
@Controller('api/journal')
export class JournalController {
    constructor(private readonly journal: JournalService) {}

    @Get()
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: "Dernières actions consignées dans l'espace courant." })
    lister(@EspaceCourant() espace: EspaceAvecRole, @Query('limite') limite?: string) {
        return this.journal.lister(espace.id, limite ? Number(limite) : 100);
    }
}

@Module({
    controllers: [JournalController],
    providers: [JournalService],
    exports: [JournalService]
})
export class JournalModule {}
