/**
 * Routes d'authentification : connexion, déconnexion, identité courante, changement de mot de passe,
 * choix de l'espace de travail actif.
 */
import { Body, Controller, Get, Inject, Post, Put, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { eq } from 'drizzle-orm';
import { FastifyReply } from 'fastify';
import { z } from 'zod';
import { BASE_DE_DONNEES, BaseDeDonnees } from '../base-de-donnees/connexion';
import { Utilisateur, utilisateurs } from '../base-de-donnees/schema';
import { erreurNonAuthentifie, erreurRequete, verifierCodeEspace } from '../commun/erreurs';
import { valider } from '../commun/validation';
import { CONFIGURATION, Configuration } from '../configuration/configuration';
import { JournalService } from '../journal/journal.service';
import { EspaceAvecRole, EspaceCourant, Public, SessionCourante, UtilisateurCourant } from './contexte-requete';
import { hacherMotDePasse, verifierMotDePasse } from './mots-de-passe';
import { NOM_COOKIE_SESSION, SessionsService } from './sessions.service';

const schemaConnexion = z.object({
    identifiant: z.string().trim().min(1, 'identifiant requis'),
    motDePasse: z.string().min(1, 'mot de passe requis')
});
const schemaMotDePasse = z.object({
    ancien: z.string().min(1),
    nouveau: z.string().min(8, 'au moins 8 caractères')
});
const schemaEspace = z.object({ code: z.string() });

/** Vue publique d'un utilisateur (jamais l'empreinte du mot de passe). */
export function vueUtilisateur(utilisateur: Utilisateur) {
    return {
        id: utilisateur.id,
        identifiant: utilisateur.identifiant,
        nomAffiche: utilisateur.nomAffiche,
        email: utilisateur.email,
        roleGlobal: utilisateur.roleGlobal,
        actif: utilisateur.actif,
        creeLe: utilisateur.creeLe
    };
}

@ApiTags('Authentification')
@Controller('api/auth')
export class AuthentificationController {
    constructor(
        @Inject(BASE_DE_DONNEES) private readonly base: BaseDeDonnees,
        @Inject(CONFIGURATION) private readonly configuration: Configuration,
        private readonly sessions: SessionsService,
        private readonly journal: JournalService
    ) {}

    @Public()
    @Post('connexion')
    @ApiOperation({ summary: 'Ouvre une session (cookie httpOnly) à partir d’un identifiant et d’un mot de passe.' })
    async connexion(
        @Body(valider(schemaConnexion)) corps: z.infer<typeof schemaConnexion>,
        @Res({ passthrough: true }) reponse: FastifyReply
    ) {
        const utilisateur = (
            await this.base.select().from(utilisateurs).where(eq(utilisateurs.identifiant, corps.identifiant.toLowerCase())).limit(1)
        )[0];
        const valide = utilisateur && utilisateur.actif && verifierMotDePasse(corps.motDePasse, utilisateur.motDePasseHache);
        if (!valide) throw erreurNonAuthentifie('Identifiant ou mot de passe incorrect.');
        const session = await this.sessions.ouvrir(utilisateur.id);
        reponse.setCookie(NOM_COOKIE_SESSION, session.id, {
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: this.configuration.cookieSecurise,
            expires: session.expireLe
        });
        await this.journal.consigner({ utilisateurId: utilisateur.id, action: 'connexion' });
        return this.identite(utilisateur, session.id);
    }

    @Post('deconnexion')
    @ApiOperation({ summary: 'Ferme la session courante.' })
    async deconnexion(@SessionCourante() sessionId: string, @Res({ passthrough: true }) reponse: FastifyReply) {
        await this.sessions.fermer(sessionId);
        reponse.clearCookie(NOM_COOKIE_SESSION, { path: '/' });
        return { ok: true };
    }

    @Get('moi')
    @ApiOperation({ summary: 'Utilisateur connecté, espace courant et espaces accessibles.' })
    async moi(@UtilisateurCourant() utilisateur: Utilisateur, @SessionCourante() sessionId: string) {
        return this.identite(utilisateur, sessionId);
    }

    @Put('mot-de-passe')
    @ApiOperation({ summary: 'Change son propre mot de passe.' })
    async changerMotDePasse(
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaMotDePasse)) corps: z.infer<typeof schemaMotDePasse>
    ) {
        if (!verifierMotDePasse(corps.ancien, utilisateur.motDePasseHache)) throw erreurRequete('Ancien mot de passe incorrect.');
        await this.base
            .update(utilisateurs)
            .set({ motDePasseHache: hacherMotDePasse(corps.nouveau) })
            .where(eq(utilisateurs.id, utilisateur.id));
        await this.journal.consigner({ utilisateurId: utilisateur.id, action: 'mot-de-passe.changement' });
        return { ok: true };
    }

    @Put('espace-courant')
    @ApiOperation({ summary: 'Choisit l’espace de travail actif de la session.' })
    async changerEspace(
        @UtilisateurCourant() utilisateur: Utilisateur,
        @SessionCourante() sessionId: string,
        @Body(valider(schemaEspace)) corps: z.infer<typeof schemaEspace>
    ) {
        const code = verifierCodeEspace(corps.code);
        const espace = (await this.sessions.espacesDe(utilisateur.id)).find(candidat => candidat.code === code);
        if (!espace) throw erreurRequete(`Vous n'avez pas accès à l'espace « ${code} ».`);
        await this.sessions.changerEspaceCourant(sessionId, espace.id);
        return this.identite(utilisateur, sessionId);
    }

    private async identite(utilisateur: Utilisateur, sessionId: string) {
        const contexte = await this.sessions.resoudre(sessionId);
        const mesEspaces = await this.sessions.espacesDe(utilisateur.id);
        return {
            utilisateur: vueUtilisateur(utilisateur),
            espaceCourant: contexte.espace ? vueEspace(contexte.espace) : null,
            espaces: mesEspaces.map(vueEspace)
        };
    }
}

export function vueEspace(espace: EspaceAvecRole) {
    return { id: espace.id, code: espace.code, nom: espace.nom, role: espace.role, creeLe: espace.creeLe };
}

// Réexporté pour les contrôleurs qui ont besoin de l'espace courant sans importer les décorateurs séparément.
export { EspaceCourant };
