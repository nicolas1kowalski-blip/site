/** Route du cockpit (page d'accueil) : GET /api/cockpit. */
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { EspaceAvecRole, EspaceCourant, RoleEspaceRequis } from '../authentification/contexte-requete';
import { CockpitService } from './cockpit.service';

@ApiTags('Cockpit')
@Controller('api/cockpit')
export class CockpitController {
    constructor(private readonly cockpit: CockpitService) {}

    @Get()
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: "Chiffres clés, points d'attention, dernier audit et volumétrie de l'espace." })
    lire(@EspaceCourant() espace: EspaceAvecRole) {
        return this.cockpit.cockpit(espace);
    }
}
