/**
 * Documents JSON de l'espace courant : l'équivalent du magasin « meta » de l'application classique
 * (appState, qualityHistory, appStateBackups, qrSnapshots…), stocké en JSONB dans PostgreSQL.
 * Les routes gardent le chemin /api/etat pour que l'application classique fonctionne sans modification.
 */
import { Body, Controller, Delete, Get, HttpCode, Param, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { EspaceAvecRole, EspaceCourant, RoleEspaceRequis, UtilisateurCourant } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { verifierNomSur } from '../commun/erreurs';
import { JournalService } from '../journal/journal.service';
import { DocumentsService } from './documents.service';

@ApiTags('Documents (état de l’application)')
@Controller('api/etat')
export class DocumentsController {
    constructor(
        private readonly documents: DocumentsService,
        private readonly journal: JournalService
    ) {}

    @Get()
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Clés des documents de l’espace courant.' })
    cles(@EspaceCourant() espace: EspaceAvecRole) {
        return this.documents.cles(espace.id);
    }

    @Get(':cle')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Un document ; une clé absente répond { valeur: null, absent: true }, jamais une erreur.' })
    async lire(@EspaceCourant() espace: EspaceAvecRole, @Param('cle') cle: string) {
        const valeur = await this.documents.lire(espace.id, verifierNomSur(cle, 'clé'));
        return valeur === undefined ? { valeur: null, absent: true } : { valeur };
    }

    @Put(':cle')
    @HttpCode(204)
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Remplace un document en bloc.' })
    async ecrire(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('cle') cle: string,
        @Body() corps: { valeur?: unknown }
    ) {
        const cleSure = verifierNomSur(cle, 'clé');
        await this.documents.ecrire(espace.id, cleSure, corps && corps.valeur !== undefined ? corps.valeur : null, utilisateur.id);
        if (cleSure === 'appState')
            await this.journal.consigner({
                espaceId: espace.id,
                utilisateurId: utilisateur.id,
                action: 'configuration.sauvegarde',
                cible: cleSure
            });
    }

    @Delete(':cle')
    @HttpCode(204)
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Supprime un document.' })
    async supprimer(@EspaceCourant() espace: EspaceAvecRole, @Param('cle') cle: string) {
        await this.documents.supprimer(espace.id, verifierNomSur(cle, 'clé'));
    }

    @Delete()
    @HttpCode(204)
    @RoleEspaceRequis('administrateur')
    @ApiOperation({ summary: 'Supprime tous les documents de l’espace (remise à zéro).' })
    async vider(@EspaceCourant() espace: EspaceAvecRole, @UtilisateurCourant() utilisateur: Utilisateur) {
        await this.documents.vider(espace.id);
        await this.journal.consigner({ espaceId: espace.id, utilisateurId: utilisateur.id, action: 'configuration.remise-a-zero' });
    }
}
