/**
 * Gardes de routes : la session est chargée une seule fois, puis
 *   • gardeConnecte       → vers /connexion si personne n'est connecté ;
 *   • gardeDeconnecte     → vers l'accueil si quelqu'un l'est déjà (page de connexion) ;
 *   • gardeAdministrateur → vers l'accueil si l'utilisateur n'est pas administrateur de la plateforme.
 */
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from './session.service';

async function sessionChargee(): Promise<SessionService> {
    const session = inject(SessionService);
    if (!session.chargee()) await session.charger();
    return session;
}

export const gardeConnecte: CanActivateFn = async () => {
    const routeur = inject(Router);
    const session = await sessionChargee();
    return session.estConnecte() ? true : routeur.createUrlTree(['/connexion']);
};

export const gardeDeconnecte: CanActivateFn = async () => {
    const routeur = inject(Router);
    const session = await sessionChargee();
    return session.estConnecte() ? routeur.createUrlTree(['/']) : true;
};

export const gardeAdministrateur: CanActivateFn = async () => {
    const routeur = inject(Router);
    const session = await sessionChargee();
    return session.estAdministrateurGlobal() ? true : routeur.createUrlTree(['/']);
};
