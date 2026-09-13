/**
 * Routes du mode démonstration : savoir où en est l'installation, installer (ou réinstaller) l'espace de
 * démonstration, et le vider. Réservé aux administrateurs globaux : l'installation crée un espace de travail et
 * y écrit des données.
 */
import { Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AdministrateurGlobalRequis, UtilisateurCourant } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { erreurIntrouvable } from '../commun/erreurs';
import { valider } from '../commun/validation';
import { EspacesService } from '../espaces/espaces.service';
import { DemonstrationService } from './demonstration.service';

const CODE_PAR_DEFAUT = 'demo';
const schemaInstallation = z.object({
    code: z
        .string()
        .trim()
        .regex(/^[a-z0-9-]{2,40}$/, 'code d’espace : lettres minuscules, chiffres et tirets')
        .default(CODE_PAR_DEFAUT),
    nom: z.string().trim().min(1).max(120).default('Démonstration'),
    /** Réinstaller par-dessus : l'espace est vidé avant d'être rechargé. */
    remplacer: z.boolean().default(false)
});

@ApiTags('Démonstration')
@Controller('api/demonstration')
export class DemonstrationController {
    constructor(
        private readonly demonstration: DemonstrationService,
        private readonly espaces: EspacesService
    ) {}

    @Get('etat')
    @AdministrateurGlobalRequis()
    @ApiOperation({ summary: 'Fichiers du jeu disponibles et état de l’espace de démonstration.' })
    etat(@Query('code') code?: string) {
        return this.demonstration.etat(code || CODE_PAR_DEFAUT);
    }

    @Post('installer')
    @AdministrateurGlobalRequis()
    @ApiOperation({
        summary:
            'Installe le jeu de démonstration dans un espace dédié : sources, modèle, dictionnaire, règles, tableaux de bord, premier audit.'
    })
    installer(
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaInstallation)) corps: z.infer<typeof schemaInstallation>
    ) {
        return this.demonstration.installer(utilisateur, corps);
    }

    @Delete('contenu')
    @AdministrateurGlobalRequis()
    @ApiOperation({ summary: 'Vide l’espace de démonstration (sources, règles, audits, gouvernance) sans le supprimer.' })
    async vider(@Query('code') code?: string) {
        const espace = (await this.espaces.lister()).find(candidat => candidat.code === (code || CODE_PAR_DEFAUT));
        if (!espace) throw erreurIntrouvable('Aucun espace de démonstration à vider.');
        return { sourcesSupprimees: await this.demonstration.vider({ ...espace, role: 'administrateur' }) };
    }
}
