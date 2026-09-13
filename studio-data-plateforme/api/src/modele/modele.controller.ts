/** Routes du modèle de données : liens entre sources, ajout, suppression, détection par le contenu. */
import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { EspaceAvecRole, EspaceCourant, RoleEspaceRequis, UtilisateurCourant } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { erreurIntrouvable, verifierNomSur } from '../commun/erreurs';
import { valider } from '../commun/validation';
import { JournalService } from '../journal/journal.service';
import { ModeleService } from './modele.service';
import { OPERATEURS_ATTENDU, OPERATEURS_CONDITION_LIEN, libelleRegleLien, schemaRegleLien } from './regles-liens';

const schemaRelation = z.object({
    sourceTable: z.string().min(1, 'table source requise'),
    sourceCol: z.string().min(1, 'colonne source requise'),
    targetTable: z.string().min(1, 'table cible requise'),
    targetCol: z.string().min(1, 'colonne cible requise'),
    cardinality: z.string().optional(),
    kind: z.string().optional()
});
const schemaModificationRelation = z.object({ cardinality: z.string().optional(), kind: z.string().optional() });

@ApiTags('Modèle de données')
@Controller('api/modele')
export class ModeleController {
    constructor(
        private readonly modele: ModeleService,
        private readonly journal: JournalService
    ) {}

    @Get('relations')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Liens entre sources (par nom, avec identifiants de sources résolus).' })
    relations(@EspaceCourant() espace: EspaceAvecRole) {
        return this.modele.relations(espace.id);
    }

    @Post('relations')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Ajoute un lien (ignoré s’il existe déjà dans un sens ou l’autre).' })
    async ajouter(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaRelation)) corps: z.infer<typeof schemaRelation>
    ) {
        const ajoute = await this.modele.ajouter(espace.id, corps, utilisateur.id);
        if (ajoute)
            await this.journal.consigner({
                espaceId: espace.id,
                utilisateurId: utilisateur.id,
                action: 'modele.lien.ajout',
                cible: `${corps.sourceTable}.${corps.sourceCol} → ${corps.targetTable}.${corps.targetCol}`
            });
        return { ajoute, relations: await this.modele.relations(espace.id) };
    }

    @Delete('relations/:id')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Supprime un lien par son identifiant (sourceTable§sourceCol§targetTable§targetCol).' })
    async supprimer(@EspaceCourant() espace: EspaceAvecRole, @UtilisateurCourant() utilisateur: Utilisateur, @Param('id') id: string) {
        const supprime = await this.modele.supprimer(espace.id, id, utilisateur.id);
        if (!supprime) throw erreurIntrouvable('Lien inconnu.');
        await this.journal.consigner({ espaceId: espace.id, utilisateurId: utilisateur.id, action: 'modele.lien.suppression', cible: id });
        return this.modele.relations(espace.id);
    }

    @Put('relations/:id')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Modifie la cardinalité déclarée ou la nature d’un lien.' })
    modifier(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('id') id: string,
        @Body(valider(schemaModificationRelation)) corps: z.infer<typeof schemaModificationRelation>
    ) {
        return this.modele.modifier(espace.id, id, corps, utilisateur.id);
    }

    @Post('relations/:id/mesurer')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Mesure un lien sur les données : cardinalité constatée, orphelins de chaque côté.' })
    mesurer(@EspaceCourant() espace: EspaceAvecRole, @UtilisateurCourant() utilisateur: Utilisateur, @Param('id') id: string) {
        return this.modele.mesurer(espace, id, utilisateur.id);
    }

    // ---- règles métier sur les liens ----
    @Get('regles/vocabulaire')
    @RoleEspaceRequis('lecteur')
    vocabulaireRegles() {
        return { operateursAttendu: OPERATEURS_ATTENDU, operateursCondition: OPERATEURS_CONDITION_LIEN };
    }

    @Get('regles')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Règles métier sur les liens (cardinalités conditionnelles), avec leur libellé.' })
    async regles(@EspaceCourant() espace: EspaceAvecRole) {
        return (await this.modele.reglesLiens(espace.id)).map(regle => ({ ...regle, libelle: libelleRegleLien(regle) }));
    }

    @Put('regles/:id')
    @RoleEspaceRequis('editeur')
    async ecrireRegle(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('id') id: string,
        @Body(valider(schemaRegleLien)) corps: z.infer<typeof schemaRegleLien>
    ) {
        const regles = await this.modele.ecrireRegleLien(
            espace.id,
            { ...corps, id: verifierNomSur(id, 'identifiant de règle') },
            utilisateur.id
        );
        await this.journal.consigner({
            espaceId: espace.id,
            utilisateurId: utilisateur.id,
            action: 'modele.regle.enregistrement',
            cible: libelleRegleLien({ ...corps, id })
        });
        return regles;
    }

    @Delete('regles/:id')
    @RoleEspaceRequis('editeur')
    async supprimerRegle(@EspaceCourant() espace: EspaceAvecRole, @UtilisateurCourant() utilisateur: Utilisateur, @Param('id') id: string) {
        await this.journal.consigner({ espaceId: espace.id, utilisateurId: utilisateur.id, action: 'modele.regle.suppression', cible: id });
        return this.modele.supprimerRegleLien(espace.id, id, utilisateur.id);
    }

    @Post('regles/:id/tester')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Contrôle une règle sur les données : parents en défaut et exemples.' })
    testerRegle(@EspaceCourant() espace: EspaceAvecRole, @Param('id') id: string) {
        return this.modele.testerRegleLien(espace, id);
    }

    @Get('regles/:id/lignes')
    @RoleEspaceRequis('lecteur')
    lignesRegle(@EspaceCourant() espace: EspaceAvecRole, @Param('id') id: string, @Query('offset') offset?: string) {
        return this.modele.lignesRegleLien(espace, id, offset ? Number(offset) : 0);
    }

    @Post('relations/detecter')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Propose des liens d’après le contenu (colonnes de même nom, unicité, couverture ≥ 80 %).' })
    detecter(@EspaceCourant() espace: EspaceAvecRole) {
        return this.modele.detecter(espace);
    }
}
