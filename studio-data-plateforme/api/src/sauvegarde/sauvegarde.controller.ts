/** Routes de sauvegarde et partage : export (plateforme ou classique), import, dossier de gouvernance HTML. */
import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import { EspaceAvecRole, EspaceCourant, RoleEspaceRequis, UtilisateurCourant } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { erreurRequete } from '../commun/erreurs';
import { SauvegardeService } from './sauvegarde.service';

const nomDeFichier = (base: string, extension: string) =>
    `${base.replace(/[^a-zA-Z0-9_-]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.${extension}`;

@ApiTags('Sauvegarde')
@Controller('api/sauvegarde')
export class SauvegardeController {
    constructor(private readonly sauvegarde: SauvegardeService) {}

    @Get('export')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Export JSON de l’espace (format = plateforme | classique) ; telecharger=1 pour un fichier.' })
    async exporter(
        @EspaceCourant() espace: EspaceAvecRole,
        @Res() reponse: FastifyReply,
        @Query('format') format?: string,
        @Query('telecharger') telecharger?: string
    ) {
        const contenu = format === 'classique' ? await this.sauvegarde.exporterClassique(espace) : await this.sauvegarde.exporter(espace);
        if (telecharger)
            reponse.header(
                'content-disposition',
                `attachment; filename="${nomDeFichier('StudioData_' + espace.code + (format === 'classique' ? '_classique' : ''), 'json')}"`
            );
        reponse.header('content-type', 'application/json; charset=utf-8').send(JSON.stringify(contenu, null, 2));
    }

    @Post('import')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Importe un export de la plateforme ou un fichier de configuration de l’application classique.' })
    importer(@EspaceCourant() espace: EspaceAvecRole, @UtilisateurCourant() utilisateur: Utilisateur, @Body() corps: unknown) {
        if (!corps || typeof corps !== 'object') throw erreurRequete('Fichier JSON attendu.');
        return this.sauvegarde.importer(espace, utilisateur, corps as Record<string, unknown>);
    }

    @Get('dossier')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Dossier de gouvernance HTML (telecharger=1 pour un fichier).' })
    async dossier(@EspaceCourant() espace: EspaceAvecRole, @Res() reponse: FastifyReply, @Query('telecharger') telecharger?: string) {
        const html = await this.sauvegarde.dossier(espace);
        if (telecharger)
            reponse.header('content-disposition', `attachment; filename="${nomDeFichier('Dossier_gouvernance_' + espace.code, 'html')}"`);
        reponse.header('content-type', 'text/html; charset=utf-8').send(html);
    }
}
