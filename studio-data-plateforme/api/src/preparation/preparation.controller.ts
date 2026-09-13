/** Routes des préparations : /api/preparation (vocabulaire, recettes, aperçu, exécution, relance par source). */
import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { EspaceAvecRole, EspaceCourant, RoleEspaceRequis, UtilisateurCourant } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { verifierNomSur } from '../commun/erreurs';
import { valider } from '../commun/validation';
import { PreparationService } from './preparation.service';
import { ACTIONS_NETTOYAGE, FORMATS_NORMALISATION, STANDARDISATIONS, TYPES_ETAPE, schemaRecettePreparation } from './recettes-preparation';
import { REFERENTIELS } from './referentiels';

const schemaApercu = z.object({ jusquA: z.number().int().min(0).optional() });
const schemaSource = z.object({ nomSource: z.string().min(1) });

@ApiTags('Préparation')
@Controller('api/preparation')
export class PreparationController {
    constructor(private readonly preparation: PreparationService) {}

    @Get('vocabulaire')
    @RoleEspaceRequis('lecteur')
    vocabulaire() {
        return {
            typesEtape: TYPES_ETAPE,
            actionsNettoyage: ACTIONS_NETTOYAGE,
            formats: FORMATS_NORMALISATION,
            standardisations: STANDARDISATIONS,
            referentiels: Object.fromEntries(
                Object.entries(REFERENTIELS).map(([cle, referentiel]) => [cle, { label: referentiel.label, cols: referentiel.cols }])
            )
        };
    }

    @Get('recettes')
    @RoleEspaceRequis('lecteur')
    lister(@EspaceCourant() espace: EspaceAvecRole) {
        return this.preparation.lister(espace.id);
    }

    @Put('recettes/:id')
    @RoleEspaceRequis('editeur')
    ecrire(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('id') id: string,
        @Body(valider(schemaRecettePreparation)) corps: z.infer<typeof schemaRecettePreparation>
    ) {
        return this.preparation.ecrire(espace, utilisateur, verifierNomSur(id, 'identifiant de préparation'), corps);
    }

    @Delete('recettes/:id')
    @RoleEspaceRequis('editeur')
    async supprimer(@EspaceCourant() espace: EspaceAvecRole, @UtilisateurCourant() utilisateur: Utilisateur, @Param('id') id: string) {
        await this.preparation.supprimer(espace, utilisateur, id);
        return { ok: true };
    }

    @Post('recettes/:id/apercu')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Aperçu (30 lignes) du résultat après une étape donnée, avec le SQL.' })
    apercu(
        @EspaceCourant() espace: EspaceAvecRole,
        @Param('id') id: string,
        @Body(valider(schemaApercu)) corps: z.infer<typeof schemaApercu>
    ) {
        return this.preparation.apercu(espace, id, corps.jusquA);
    }

    @Post('recettes/:id/executer')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Exécute la recette : la table propre devient une source de l’espace.' })
    executer(@EspaceCourant() espace: EspaceAvecRole, @UtilisateurCourant() utilisateur: Utilisateur, @Param('id') id: string) {
        return this.preparation.executer(espace, utilisateur, id);
    }

    @Post('executer-pour-source')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Rejoue les recettes attachées à une source (après sa mise à jour).' })
    executerPourSource(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaSource)) corps: z.infer<typeof schemaSource>
    ) {
        return this.preparation.executerPourSource(espace, utilisateur, corps.nomSource);
    }
}
