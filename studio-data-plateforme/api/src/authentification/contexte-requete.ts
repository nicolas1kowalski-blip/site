/**
 * Ce que l'authentification attache à chaque requête, et les décorateurs pour le récupérer dans les contrôleurs.
 *
 *   @UtilisateurCourant() utilisateur   → l'utilisateur connecté
 *   @EspaceCourant() espace             → l'espace de travail actif de sa session (avec son rôle dedans)
 *   @Public()                           → route accessible sans session (connexion, santé)
 *   @RoleEspaceRequis('editeur')        → rôle minimal dans l'espace courant (lecteur < editeur < administrateur)
 *   @AdministrateurGlobalRequis()       → réservé aux administrateurs de la plateforme
 */
import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Espace, RoleEspace, Utilisateur } from '../base-de-donnees/schema';

export type EspaceAvecRole = Espace & { role: RoleEspace };

export type ContexteRequete = {
    utilisateur?: Utilisateur;
    sessionId?: string;
    espace?: EspaceAvecRole;
};

export const CLE_PUBLIC = 'sd:public';
export const CLE_ROLE_ESPACE = 'sd:role-espace';
export const CLE_ADMIN_GLOBAL = 'sd:admin-global';

export const Public = () => SetMetadata(CLE_PUBLIC, true);
export const RoleEspaceRequis = (role: RoleEspace) => SetMetadata(CLE_ROLE_ESPACE, role);
export const AdministrateurGlobalRequis = () => SetMetadata(CLE_ADMIN_GLOBAL, true);

function contexteDe(contexte: ExecutionContext): ContexteRequete {
    return contexte.switchToHttp().getRequest<{ contexte: ContexteRequete }>().contexte || {};
}

export const UtilisateurCourant = createParamDecorator((_donnees: unknown, contexte: ExecutionContext) => contexteDe(contexte).utilisateur);
export const EspaceCourant = createParamDecorator((_donnees: unknown, contexte: ExecutionContext) => contexteDe(contexte).espace);
export const SessionCourante = createParamDecorator((_donnees: unknown, contexte: ExecutionContext) => contexteDe(contexte).sessionId);

/** Ordre des rôles d'espace : un administrateur peut tout ce qu'un éditeur peut, etc. */
export const NIVEAU_ROLE: Record<RoleEspace, number> = { lecteur: 1, editeur: 2, administrateur: 3 };

export function roleSuffisant(role: RoleEspace, requis: RoleEspace): boolean {
    return NIVEAU_ROLE[role] >= NIVEAU_ROLE[requis];
}
