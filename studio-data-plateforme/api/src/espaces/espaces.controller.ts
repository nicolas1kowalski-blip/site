/**
 * Routes des espaces de travail : liste des espaces accessibles, création (administrateur global),
 * membres et rôles (administrateur de l'espace ou global).
 */
import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { vueEspace } from '../authentification/authentification.controller';
import { AdministrateurGlobalRequis, EspaceAvecRole, UtilisateurCourant, roleSuffisant } from '../authentification/contexte-requete';
import { SessionsService } from '../authentification/sessions.service';
import { Utilisateur } from '../base-de-donnees/schema';
import { erreurInterdit } from '../commun/erreurs';
import { valider } from '../commun/validation';
import { JournalService } from '../journal/journal.service';
import { EspacesService } from './espaces.service';

const schemaCreation = z.object({ code: z.string().trim(), nom: z.string().trim().min(1, 'nom requis') });
const schemaRenommage = z.object({ nom: z.string().trim().min(1, 'nom requis') });
const schemaMembre = z.object({ role: z.enum(['lecteur', 'editeur', 'administrateur']) });

@ApiTags('Espaces')
@Controller('api/espaces')
export class EspacesController {
    constructor(
        private readonly espaces: EspacesService,
        private readonly sessions: SessionsService,
        private readonly journal: JournalService
    ) {}

    @Get()
    @ApiOperation({ summary: 'Espaces accessibles à l’utilisateur connecté, avec son rôle dans chacun.' })
    async mesEspaces(@UtilisateurCourant() utilisateur: Utilisateur) {
        return (await this.sessions.espacesDe(utilisateur.id)).map(vueEspace);
    }

    @Post()
    @AdministrateurGlobalRequis()
    @ApiOperation({ summary: 'Crée un espace de travail (le créateur en devient administrateur).' })
    async creer(@UtilisateurCourant() utilisateur: Utilisateur, @Body(valider(schemaCreation)) corps: z.infer<typeof schemaCreation>) {
        const espace = await this.espaces.creer(corps.code, corps.nom, utilisateur.id);
        await this.journal.consigner({ espaceId: espace.id, utilisateurId: utilisateur.id, action: 'espace.creation', cible: espace.code });
        return vueEspace({ ...espace, role: 'administrateur' });
    }

    @Put(':code')
    @ApiOperation({ summary: 'Renomme un espace (administrateur de l’espace).' })
    async renommer(
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('code') code: string,
        @Body(valider(schemaRenommage)) corps: z.infer<typeof schemaRenommage>
    ) {
        const espace = await this.espaceAdministre(utilisateur, code);
        const modifie = await this.espaces.renommer(code, corps.nom);
        await this.journal.consigner({
            espaceId: espace.id,
            utilisateurId: utilisateur.id,
            action: 'espace.renommage',
            cible: code,
            details: { nom: corps.nom }
        });
        return vueEspace({ ...modifie, role: espace.role });
    }

    @Get(':code/membres')
    @ApiOperation({ summary: 'Membres de l’espace et leurs rôles.' })
    async membres(@UtilisateurCourant() utilisateur: Utilisateur, @Param('code') code: string) {
        const espace = await this.espaceAccessible(utilisateur, code);
        return this.espaces.membresDe(espace.id);
    }

    @Put(':code/membres/:identifiant')
    @ApiOperation({ summary: 'Ajoute un membre ou change son rôle (administrateur de l’espace).' })
    async definirMembre(
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('code') code: string,
        @Param('identifiant') identifiant: string,
        @Body(valider(schemaMembre)) corps: z.infer<typeof schemaMembre>
    ) {
        const espace = await this.espaceAdministre(utilisateur, code);
        await this.espaces.definirMembre(espace.id, identifiant, corps.role);
        await this.journal.consigner({
            espaceId: espace.id,
            utilisateurId: utilisateur.id,
            action: 'espace.membre',
            cible: identifiant,
            details: { role: corps.role }
        });
        return this.espaces.membresDe(espace.id);
    }

    @Delete(':code/membres/:identifiant')
    @ApiOperation({ summary: 'Retire un membre de l’espace (administrateur de l’espace).' })
    async retirerMembre(
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('code') code: string,
        @Param('identifiant') identifiant: string
    ) {
        const espace = await this.espaceAdministre(utilisateur, code);
        await this.espaces.retirerMembre(espace.id, identifiant);
        await this.journal.consigner({
            espaceId: espace.id,
            utilisateurId: utilisateur.id,
            action: 'espace.membre.retrait',
            cible: identifiant
        });
        return this.espaces.membresDe(espace.id);
    }

    private async espaceAccessible(utilisateur: Utilisateur, code: string): Promise<EspaceAvecRole> {
        const espace = (await this.sessions.espacesDe(utilisateur.id)).find(candidat => candidat.code === code);
        if (!espace) throw erreurInterdit(`Vous n'avez pas accès à l'espace « ${code} ».`);
        return espace;
    }

    private async espaceAdministre(utilisateur: Utilisateur, code: string): Promise<EspaceAvecRole> {
        const espace = await this.espaceAccessible(utilisateur, code);
        if (!roleSuffisant(espace.role, 'administrateur'))
            throw erreurInterdit(`Cette action demande le rôle administrateur dans l'espace « ${code} ».`);
        return espace;
    }
}
