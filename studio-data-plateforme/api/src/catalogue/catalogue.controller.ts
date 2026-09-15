/** Route du catalogue : recherche à facettes sur l'index de l'espace. */
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { EspaceAvecRole, EspaceCourant, RoleEspaceRequis } from '../authentification/contexte-requete';
import { TRIS_CATALOGUE, TriCatalogue } from './catalogue';
import { CatalogueService } from './catalogue.service';

const enListe = (valeur: string | string[] | undefined) =>
    Array.isArray(valeur) ? valeur : valeur ? valeur.split(',').filter(Boolean) : [];
/** Le tri demandé, ramené à l'un des quatre connus : un tri inventé retombe sur la pertinence. */
const enTri = (valeur: string | undefined): TriCatalogue =>
    (TRIS_CATALOGUE.find(candidat => candidat.cle === valeur)?.cle as TriCatalogue) || 'pertinence';

@ApiTags('Catalogue')
@Controller('api/catalogue')
export class CatalogueController {
    constructor(private readonly catalogue: CatalogueService) {}

    @Get()
    @RoleEspaceRequis('lecteur')
    @ApiOperation({
        summary:
            'Recherche dans le catalogue (q, type, domaine, sensibilite, proprietaire, couche = metier | tout, tri = pertinence | qualite | fraicheur | alpha).'
    })
    async rechercher(
        @EspaceCourant() espace: EspaceAvecRole,
        @Query('q') q?: string,
        @Query('type') type?: string | string[],
        @Query('domaine') domaine?: string | string[],
        @Query('sensibilite') sensibilite?: string | string[],
        @Query('proprietaire') proprietaire?: string | string[],
        @Query('couche') couche?: string,
        @Query('tri') tri?: string
    ) {
        return this.catalogue.rechercher(espace.id, {
            q,
            type: enListe(type),
            domaine: enListe(domaine),
            sensibilite: enListe(sensibilite),
            proprietaire: enListe(proprietaire),
            couche: couche === 'tout' ? 'tout' : 'metier',
            tri: enTri(tri)
        });
    }
}
