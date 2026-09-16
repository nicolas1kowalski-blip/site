/** Routes des codifications : /api/codification (vocabulaire, codifications, exécution, revue, décision). */
import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { EspaceAvecRole, EspaceCourant, RoleEspaceRequis, UtilisateurCourant } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { verifierNomSur } from '../commun/erreurs';
import { valider } from '../commun/validation';
import { CANDIDATS_MONTRES, METHODES_DE_RESSEMBLANCE, ORIGINES, STATUTS, TYPES_DE_REGLE, schemaCodification } from './codification';
import { CodificationService } from './codification.service';

const schemaDevination = z.object({ source: z.string().min(1), nomenclature: z.string().min(1) });
const schemaRevue = z.object({ combien: z.number().int().min(1).max(500).default(50) });
const schemaDecision = z.object({
    rang: z.number().int().min(0),
    /** Vide = « aucun code ne convient » : la ligne reste à coder et la correspondance est effacée. */
    code: z.string().default(''),
    libelle: z.string().min(1)
});

@ApiTags('Codification')
@Controller('api/codification')
export class CodificationController {
    constructor(private readonly codification: CodificationService) {}

    @Get('vocabulaire')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Les mots de la codification : types de règle, méthodes de ressemblance, origines et statuts.' })
    vocabulaire() {
        return {
            typesDeRegle: TYPES_DE_REGLE,
            methodes: METHODES_DE_RESSEMBLANCE,
            origines: ORIGINES,
            statuts: STATUTS,
            candidatsMontres: CANDIDATS_MONTRES
        };
    }

    @Get()
    @RoleEspaceRequis('lecteur')
    lister(@EspaceCourant() espace: EspaceAvecRole) {
        return this.codification.lister(espace.id);
    }

    @Post('exemple')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Installe un exemple prêt à l’emploi : deux petites tables et une codification déjà réglée.' })
    exemple(@EspaceCourant() espace: EspaceAvecRole, @UtilisateurCourant() utilisateur: Utilisateur) {
        return this.codification.installerLExemple(espace, utilisateur);
    }

    @Get('synonymes-exemple')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Les variantes que l’exemple propose de déclarer, une fois le premier résultat vu.' })
    synonymesDeLExemple() {
        return this.codification.synonymesDeLExemple();
    }

    @Post('deviner')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Propose toute la configuration d’après les deux tables, et dit pourquoi chaque choix.' })
    deviner(@EspaceCourant() espace: EspaceAvecRole, @Body(valider(schemaDevination)) corps: z.infer<typeof schemaDevination>) {
        return this.codification.deviner(espace, corps.source, corps.nomenclature);
    }

    @Put(':id')
    @RoleEspaceRequis('editeur')
    ecrire(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('id') id: string,
        @Body(valider(schemaCodification.omit({ id: true }))) corps: Omit<z.infer<typeof schemaCodification>, 'id'>
    ) {
        return this.codification.ecrire(espace, utilisateur, verifierNomSur(id, 'identifiant de codification'), corps);
    }

    @Delete(':id')
    @RoleEspaceRequis('editeur')
    async supprimer(@EspaceCourant() espace: EspaceAvecRole, @UtilisateurCourant() utilisateur: Utilisateur, @Param('id') id: string) {
        await this.codification.supprimer(espace, utilisateur, id);
        return { ok: true };
    }

    @Post(':id/executer')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Code chaque ligne de la liste et rend le bilan : codées d’office, à revoir, non trouvées.' })
    executer(@EspaceCourant() espace: EspaceAvecRole, @Param('id') id: string) {
        return this.codification.executer(espace, id);
    }

    @Post(':id/revue')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Les cas à revoir, chacun avec les meilleures propositions de la nomenclature.' })
    revue(
        @EspaceCourant() espace: EspaceAvecRole,
        @Param('id') id: string,
        @Body(valider(schemaRevue)) corps: z.infer<typeof schemaRevue>
    ) {
        return this.codification.casARevoir(espace, id, corps.combien);
    }

    @Post(':id/decider')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Tranche un cas : la ligne reçoit son code, et le libellé entre dans la table de correspondance.' })
    decider(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('id') id: string,
        @Body(valider(schemaDecision)) corps: z.infer<typeof schemaDecision>
    ) {
        return this.codification.decider(espace, utilisateur, id, corps);
    }
}
