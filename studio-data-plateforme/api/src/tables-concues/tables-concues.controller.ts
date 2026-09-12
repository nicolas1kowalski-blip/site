/** Routes des tables conçues : vocabulaire, liste, SQL et aperçu d'une recette, construction, reconstruction, écarts, contributions. */
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { EspaceAvecRole, EspaceCourant, RoleEspaceRequis, UtilisateurCourant } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { verifierNomSur } from '../commun/erreurs';
import { valider } from '../commun/validation';
import { JournalService } from '../journal/journal.service';
import { FORMATS_ATTRIBUT, MODES_VALIDITE, OPERATEURS_FILTRE_SOURCE, Recette, schemaRecette } from './constructeur-table-concue';
import { TablesConcuesService } from './tables-concues.service';

const schemaApercu = z.object({ recette: schemaRecette, limite: z.number().int().positive().max(1000).default(50) });
const schemaDependantes = z.object({ nomSource: z.string().min(1, 'nom de source requis') });

@ApiTags('Tables conçues')
@Controller('api/tables-concues')
export class TablesConcuesController {
    constructor(
        private readonly tablesConcues: TablesConcuesService,
        private readonly journal: JournalService
    ) {}

    @Get('vocabulaire')
    @RoleEspaceRequis('lecteur')
    vocabulaire() {
        return { formats: FORMATS_ATTRIBUT, operateursFiltre: OPERATEURS_FILTRE_SOURCE, modesValidite: MODES_VALIDITE };
    }

    @Get()
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Tables conçues de l’espace, avec leur recette et les résultats de la dernière construction.' })
    lister(@EspaceCourant() espace: EspaceAvecRole) {
        return this.tablesConcues.lister(espace.id);
    }

    @Post('sql')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Requête SQL produite par une recette (sans construire).' })
    async sql(@EspaceCourant() espace: EspaceAvecRole, @Body(valider(schemaRecette)) recette: Recette) {
        return { sql: await this.tablesConcues.sql(espace, recette) };
    }

    @Post('apercu')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Premières lignes du résultat d’une recette.' })
    apercu(@EspaceCourant() espace: EspaceAvecRole, @Body(valider(schemaApercu)) corps: z.infer<typeof schemaApercu>) {
        return this.tablesConcues.apercu(espace, corps.recette, corps.limite);
    }

    @Post('construire')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Construit (ou reconstruit, si targetId est renseigné) la table conçue décrite par la recette.' })
    async construire(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaRecette)) recette: Recette
    ) {
        const table = await this.tablesConcues.construire(espace, recette, utilisateur.id);
        await this.journal.consigner({
            espaceId: espace.id,
            utilisateurId: utilisateur.id,
            action: 'table-concue.construction',
            cible: table.name,
            details: { lignes: table.design.lastRows, sources: recette.sources.map(source => source.src) }
        });
        return table;
    }

    @Post('reconstruire-dependantes')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Reconstruit les tables conçues qui dépendent d’une source (après sa mise à jour).' })
    reconstruireDependantes(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaDependantes)) corps: z.infer<typeof schemaDependantes>
    ) {
        return this.tablesConcues.reconstruireDependantes(espace, corps.nomSource, utilisateur.id);
    }

    @Post(':id/reconstruire')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Ré-exécute la recette enregistrée sur l’état actuel des sources.' })
    async reconstruire(@EspaceCourant() espace: EspaceAvecRole, @UtilisateurCourant() utilisateur: Utilisateur, @Param('id') id: string) {
        const table = await this.tablesConcues.reconstruire(espace, verifierNomSur(id, 'identifiant de table'), utilisateur.id);
        await this.journal.consigner({
            espaceId: espace.id,
            utilisateurId: utilisateur.id,
            action: 'table-concue.reconstruction',
            cible: table.name,
            details: { lignes: table.design.lastRows }
        });
        return table;
    }

    @Get(':id/ecarts')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Écarts entre sources : clés partagées dont les attributs diffèrent.' })
    ecarts(@EspaceCourant() espace: EspaceAvecRole, @Param('id') id: string, @Query('limite') limite?: string) {
        return this.tablesConcues.ecarts(espace, verifierNomSur(id, 'identifiant de table'), limite ? Number(limite) : undefined);
    }

    @Get(':id/contributions')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Contribution de chaque source : lignes, part, complétude.' })
    contributions(@EspaceCourant() espace: EspaceAvecRole, @Param('id') id: string) {
        return this.tablesConcues.contributions(espace, verifierNomSur(id, 'identifiant de table'));
    }
}
