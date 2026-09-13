/** Routes de surveillance des sources : état, instantané, contrat (générer, enregistrer, vérifier), figer, delta, réconciliation. */
import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { EspaceAvecRole, EspaceCourant, RoleEspaceRequis, UtilisateurCourant } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { valider } from '../commun/validation';
import { SurveillanceService } from './surveillance.service';

const schemaContrat = z.object({
    cols: z.array(z.object({ name: z.string().min(1), type: z.string().min(1), required: z.boolean().default(false) })),
    at: z.number().default(() => Date.now())
});
const schemaDelta = z.object({ cle: z.string().min(1, 'colonne clé requise') });
const schemaReconciliation = z.object({ a: z.string().min(1), cleA: z.string().min(1), b: z.string().min(1), cleB: z.string().min(1) });

@ApiTags('Surveillance')
@Controller('api/surveillance')
export class SurveillanceController {
    constructor(private readonly surveillance: SurveillanceService) {}

    @Get()
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'État de chaque source : fraîcheur, dernier instantané, dérive, contrat, données figées.' })
    etat(@EspaceCourant() espace: EspaceAvecRole) {
        return this.surveillance.etat(espace.id);
    }

    @Post(':nom/instantane')
    @RoleEspaceRequis('editeur')
    instantane(@EspaceCourant() espace: EspaceAvecRole, @UtilisateurCourant() utilisateur: Utilisateur, @Param('nom') nom: string) {
        return this.surveillance.prendreInstantane(espace, utilisateur, nom);
    }

    @Post(':nom/contrat/generer')
    @RoleEspaceRequis('editeur')
    genererContrat(@EspaceCourant() espace: EspaceAvecRole, @UtilisateurCourant() utilisateur: Utilisateur, @Param('nom') nom: string) {
        return this.surveillance.genererContrat(espace, utilisateur, nom);
    }

    @Put(':nom/contrat')
    @RoleEspaceRequis('editeur')
    enregistrerContrat(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('nom') nom: string,
        @Body(valider(schemaContrat)) corps: z.infer<typeof schemaContrat>
    ) {
        return this.surveillance.enregistrerContrat(espace, utilisateur, nom, corps);
    }

    @Post(':nom/contrat/verifier')
    @RoleEspaceRequis('lecteur')
    verifierContrat(@EspaceCourant() espace: EspaceAvecRole, @Param('nom') nom: string) {
        return this.surveillance.verifierContrat(espace, nom);
    }

    @Post(':nom/figer')
    @RoleEspaceRequis('editeur')
    figer(@EspaceCourant() espace: EspaceAvecRole, @UtilisateurCourant() utilisateur: Utilisateur, @Param('nom') nom: string) {
        return this.surveillance.figerDonnees(espace, utilisateur, nom);
    }

    @Post(':nom/delta')
    @RoleEspaceRequis('lecteur')
    delta(
        @EspaceCourant() espace: EspaceAvecRole,
        @Param('nom') nom: string,
        @Body(valider(schemaDelta)) corps: z.infer<typeof schemaDelta>
    ) {
        return this.surveillance.calculerDelta(espace, nom, corps.cle);
    }

    @Post('reconcilier')
    @RoleEspaceRequis('lecteur')
    reconcilier(@EspaceCourant() espace: EspaceAvecRole, @Body(valider(schemaReconciliation)) corps: z.infer<typeof schemaReconciliation>) {
        return this.surveillance.reconcilier(espace, corps.a, corps.cleA, corps.b, corps.cleB);
    }
}
