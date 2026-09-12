/**
 * Garde global d'authentification et d'autorisation.
 *
 * Pour chaque requête /api :
 *   1. lit le cookie de session et résout l'utilisateur et l'espace courant (request.contexte) ;
 *   2. laisse passer les routes @Public() même sans session ;
 *   3. exige une session valide partout ailleurs (401 sinon) ;
 *   4. applique @AdministrateurGlobalRequis() et @RoleEspaceRequis(role) (403 sinon).
 * Les administrateurs globaux ont le rôle administrateur dans tous les espaces.
 */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { RoleEspace } from '../base-de-donnees/schema';
import { erreurInterdit, erreurNonAuthentifie } from '../commun/erreurs';
import { CLE_ADMIN_GLOBAL, CLE_PUBLIC, CLE_ROLE_ESPACE, ContexteRequete, roleSuffisant } from './contexte-requete';
import { NOM_COOKIE_SESSION, SessionsService } from './sessions.service';

type RequeteAvecContexte = FastifyRequest & { contexte: ContexteRequete; cookies?: Record<string, string | undefined> };

@Injectable()
export class AuthentificationGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly sessions: SessionsService
    ) {}

    async canActivate(contexteExecution: ExecutionContext): Promise<boolean> {
        const requete = contexteExecution.switchToHttp().getRequest<RequeteAvecContexte>();
        const sessionId = requete.cookies ? requete.cookies[NOM_COOKIE_SESSION] : undefined;
        requete.contexte = await this.sessions.resoudre(sessionId);

        const cibles = [contexteExecution.getHandler(), contexteExecution.getClass()];
        const estPublique = this.reflector.getAllAndOverride<boolean>(CLE_PUBLIC, cibles);
        if (estPublique) return true;
        if (!requete.contexte.utilisateur) throw erreurNonAuthentifie();

        const adminRequis = this.reflector.getAllAndOverride<boolean>(CLE_ADMIN_GLOBAL, cibles);
        if (adminRequis && requete.contexte.utilisateur.roleGlobal !== 'administrateur') {
            throw erreurInterdit('Réservé aux administrateurs de la plateforme.');
        }

        const roleRequis = this.reflector.getAllAndOverride<RoleEspace>(CLE_ROLE_ESPACE, cibles);
        if (roleRequis) {
            const espace = requete.contexte.espace;
            if (!espace) throw erreurInterdit('Aucun espace de travail : demandez à un administrateur de vous ajouter à un espace.');
            if (!roleSuffisant(espace.role, roleRequis)) {
                throw erreurInterdit(
                    `Cette action demande le rôle « ${roleRequis} » dans l'espace « ${espace.nom} » (vous êtes « ${espace.role} »).`
                );
            }
        }
        return true;
    }
}
