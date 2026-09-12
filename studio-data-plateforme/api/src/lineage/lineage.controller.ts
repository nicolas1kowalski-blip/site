/** Routes du lineage : carte des flux (lecture, synchronisation, nœuds, liens, options, réconciliation), parcours d'un attribut, lineage d'une table. */
import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { EspaceAvecRole, EspaceCourant, RoleEspaceRequis, UtilisateurCourant } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { erreurRequete, verifierNomSur } from '../commun/erreurs';
import { valider } from '../commun/validation';
import { NATURES_ALIMENTATION, RELATIONS_LIEN, ROLES_NOEUD } from './flux';
import { LineageService } from './lineage.service';
import { TRANSFORMATIONS_AGREGAT, TRANSFORMATIONS_SCALAIRES } from './reconciliation';

const schemaNoeud = z
    .object({
        name: z.string().trim().min(1, 'nom requis'),
        kind: z.enum(['table', 'app', 'object']).optional(),
        tableName: z.string().optional(),
        origine: z.string().optional(),
        domain: z.string().optional()
    })
    .passthrough();
const schemaPaire = z.object({
    id: z.string().min(1),
    src: z.string().default(''),
    tgt: z.string().default(''),
    xform: z.object({ kind: z.string(), fn: z.string().optional(), op: z.string().optional(), param: z.string().optional() }).optional()
});
const schemaLien = z
    .object({
        source: z.string().min(1),
        target: z.string().min(1),
        rel: z.string().optional(),
        srcKey: z.string().optional(),
        tgtKey: z.string().optional(),
        attrPairs: z.array(schemaPaire).optional(),
        slaHours: z.number().nullable().optional(),
        transformation: z.string().optional(),
        nature: z.enum(['recopie', 'complement', 'correction']).optional(),
        scope: z.string().optional()
    })
    .passthrough();
const schemaOptions = z.object({
    threshold: z.number().min(0).max(100).optional(),
    showObjects: z.boolean().optional(),
    hideSources: z.boolean().optional(),
    grain: z.enum(['bo', 'table']).optional()
});

@ApiTags('Lineage')
@Controller('api/lineage')
export class LineageController {
    constructor(private readonly lineage: LineageService) {}

    @Get('vocabulaire')
    @RoleEspaceRequis('lecteur')
    vocabulaire() {
        return {
            relations: RELATIONS_LIEN,
            roles: ROLES_NOEUD,
            natures: NATURES_ALIMENTATION,
            agregats: TRANSFORMATIONS_AGREGAT,
            scalaires: TRANSFORMATIONS_SCALAIRES
        };
    }

    @Get('flux')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Carte des flux : nœuds (rôle, fraîcheur), liens (type, santé), contrôles de cohérence.' })
    carte(@EspaceCourant() espace: EspaceAvecRole) {
        return this.lineage.carte(espace.id);
    }

    @Post('flux/synchroniser')
    @RoleEspaceRequis('editeur')
    @ApiOperation({
        summary: 'Dérive la carte des tables conçues, applications, dictionnaire et objets métier ; préserve les ajouts manuels.'
    })
    synchroniser(@EspaceCourant() espace: EspaceAvecRole, @UtilisateurCourant() utilisateur: Utilisateur) {
        return this.lineage.synchroniser(espace, utilisateur);
    }

    @Put('flux/options')
    @RoleEspaceRequis('editeur')
    options(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaOptions)) corps: z.infer<typeof schemaOptions>
    ) {
        return this.lineage.definirOptions(espace, utilisateur, corps);
    }

    @Put('flux/noeuds/:id')
    @RoleEspaceRequis('editeur')
    ecrireNoeud(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('id') id: string,
        @Body(valider(schemaNoeud)) corps: z.infer<typeof schemaNoeud>
    ) {
        return this.lineage.ecrireNoeud(espace, utilisateur, verifierNomSur(id, 'identifiant de nœud'), corps);
    }

    @Delete('flux/noeuds/:id')
    @RoleEspaceRequis('editeur')
    async supprimerNoeud(@EspaceCourant() espace: EspaceAvecRole, @UtilisateurCourant() utilisateur: Utilisateur, @Param('id') id: string) {
        await this.lineage.supprimerNoeud(espace, utilisateur, id);
        return { ok: true };
    }

    @Put('flux/liens/:id')
    @RoleEspaceRequis('editeur')
    ecrireLien(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('id') id: string,
        @Body(valider(schemaLien)) corps: z.infer<typeof schemaLien>
    ) {
        return this.lineage.ecrireLien(espace, utilisateur, verifierNomSur(id, 'identifiant de lien'), corps);
    }

    @Delete('flux/liens/:id')
    @RoleEspaceRequis('editeur')
    async supprimerLien(@EspaceCourant() espace: EspaceAvecRole, @UtilisateurCourant() utilisateur: Utilisateur, @Param('id') id: string) {
        await this.lineage.supprimerLien(espace, utilisateur, id);
        return { ok: true };
    }

    @Post('flux/liens/:id/reconcilier')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Compare, clé par clé, les attributs contrôlés entre la source et la cible du lien (DuckDB).' })
    reconcilier(@EspaceCourant() espace: EspaceAvecRole, @UtilisateurCourant() utilisateur: Utilisateur, @Param('id') id: string) {
        return this.lineage.reconcilier(espace, utilisateur, id);
    }

    @Get('attribut')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Parcours d’un attribut : applications sources → colonnes → attribut → consommateurs.' })
    parcoursAttribut(@EspaceCourant() espace: EspaceAvecRole, @Query('boId') boId?: string, @Query('elId') elId?: string) {
        if (!boId || !elId) throw erreurRequete('Paramètres boId et elId requis.');
        return this.lineage.parcoursAttribut(espace.id, boId, elId);
    }

    @Get('table/:nom')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Amont et aval d’une table dans la carte des flux.' })
    lineageTable(@EspaceCourant() espace: EspaceAvecRole, @Param('nom') nom: string) {
        return this.lineage.lineageTable(espace.id, nom);
    }
}
