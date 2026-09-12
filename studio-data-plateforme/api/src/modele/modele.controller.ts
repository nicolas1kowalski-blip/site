/** Routes du modèle de données : liens entre sources, ajout, suppression, détection par le contenu. */
import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { EspaceAvecRole, EspaceCourant, RoleEspaceRequis, UtilisateurCourant } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { erreurIntrouvable } from '../commun/erreurs';
import { valider } from '../commun/validation';
import { JournalService } from '../journal/journal.service';
import { ModeleService } from './modele.service';

const schemaRelation = z.object({
    sourceTable: z.string().min(1, 'table source requise'),
    sourceCol: z.string().min(1, 'colonne source requise'),
    targetTable: z.string().min(1, 'table cible requise'),
    targetCol: z.string().min(1, 'colonne cible requise'),
    cardinality: z.string().optional(),
    kind: z.string().optional()
});

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

    @Post('relations/detecter')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Propose des liens d’après le contenu (colonnes de même nom, unicité, couverture ≥ 80 %).' })
    detecter(@EspaceCourant() espace: EspaceAvecRole) {
        return this.modele.detecter(espace);
    }
}
