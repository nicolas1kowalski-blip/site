/** Routes qualité : profilage, doublons, règles (CRUD et exécution), audits enregistrés, vocabulaire. */
import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { EspaceAvecRole, EspaceCourant, RoleEspaceRequis, UtilisateurCourant } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { valider } from '../commun/validation';
import { JournalService } from '../journal/journal.service';
import { QualiteService } from './qualite.service';
import { CRITICITES, TYPES_REGLE, schemaRegle } from './regles';

const schemaSource = z.object({ sourceId: z.string().min(1, 'source requise') });
const schemaDoublons = z.object({ sourceId: z.string().min(1), cle: z.array(z.string().min(1)).min(1, 'au moins une colonne') });
const schemaExecution = z.object({ sourceId: z.string().optional() });

@ApiTags('Qualité')
@Controller('api/qualite')
export class QualiteController {
    constructor(
        private readonly qualite: QualiteService,
        private readonly journal: JournalService
    ) {}

    @Get('vocabulaire')
    @RoleEspaceRequis('lecteur')
    vocabulaire() {
        return { typesRegle: TYPES_REGLE, criticites: CRITICITES };
    }

    @Post('profil')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Profile une source colonne par colonne et enregistre l’audit.' })
    async profiler(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaSource)) corps: z.infer<typeof schemaSource>
    ) {
        const profil = await this.qualite.profiler(espace, corps.sourceId, utilisateur.id);
        await this.journal.consigner({
            espaceId: espace.id,
            utilisateurId: utilisateur.id,
            action: 'qualite.profilage',
            cible: profil.sourceNom,
            details: { lignes: profil.lignes }
        });
        return profil;
    }

    @Post('doublons')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Cherche les doublons d’une source sur une clé (une ou plusieurs colonnes).' })
    async doublons(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaDoublons)) corps: z.infer<typeof schemaDoublons>
    ) {
        const resultat = await this.qualite.doublons(espace, corps.sourceId, corps.cle, utilisateur.id);
        await this.journal.consigner({
            espaceId: espace.id,
            utilisateurId: utilisateur.id,
            action: 'qualite.doublons',
            cible: corps.sourceId,
            details: { cle: corps.cle, groupes: resultat.groupes }
        });
        return resultat;
    }

    @Get('regles')
    @RoleEspaceRequis('lecteur')
    regles(@EspaceCourant() espace: EspaceAvecRole, @Query('sourceId') sourceId?: string) {
        return this.qualite.regles(espace.id, sourceId || undefined);
    }

    @Post('regles')
    @RoleEspaceRequis('editeur')
    async creerRegle(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaRegle)) corps: z.infer<typeof schemaRegle>
    ) {
        const regle = await this.qualite.creerRegle(espace, corps);
        await this.journal.consigner({
            espaceId: espace.id,
            utilisateurId: utilisateur.id,
            action: 'qualite.regle.creation',
            cible: regle.nom
        });
        return regle;
    }

    @Put('regles/:id')
    @RoleEspaceRequis('editeur')
    async modifierRegle(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('id') id: string,
        @Body(valider(schemaRegle)) corps: z.infer<typeof schemaRegle>
    ) {
        const regle = await this.qualite.modifierRegle(espace, id, corps);
        await this.journal.consigner({
            espaceId: espace.id,
            utilisateurId: utilisateur.id,
            action: 'qualite.regle.modification',
            cible: regle.nom
        });
        return regle;
    }

    @Delete('regles/:id')
    @RoleEspaceRequis('editeur')
    async supprimerRegle(@EspaceCourant() espace: EspaceAvecRole, @UtilisateurCourant() utilisateur: Utilisateur, @Param('id') id: string) {
        await this.qualite.supprimerRegle(espace.id, id);
        await this.journal.consigner({
            espaceId: espace.id,
            utilisateurId: utilisateur.id,
            action: 'qualite.regle.suppression',
            cible: id
        });
        return { ok: true };
    }

    @Post('regles/executer')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Exécute les règles actives (d’une source ou de tout l’espace) et renvoie le score.' })
    async executer(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaExecution)) corps: z.infer<typeof schemaExecution>
    ) {
        const execution = await this.qualite.executerRegles(espace, corps.sourceId, utilisateur.id);
        await this.journal.consigner({
            espaceId: espace.id,
            utilisateurId: utilisateur.id,
            action: 'qualite.regles.execution',
            cible: corps.sourceId || 'espace',
            details: { score: execution.score, regles: execution.regles.length }
        });
        return execution;
    }

    @Get('audits')
    @RoleEspaceRequis('lecteur')
    audits(@EspaceCourant() espace: EspaceAvecRole, @Query('sourceId') sourceId?: string, @Query('limite') limite?: string) {
        return this.qualite.audits(espace.id, sourceId || undefined, limite ? Number(limite) : 100);
    }

    @Get('audits/:id')
    @RoleEspaceRequis('lecteur')
    audit(@EspaceCourant() espace: EspaceAvecRole, @Param('id') id: string) {
        return this.qualite.audit(espace.id, id);
    }
}
