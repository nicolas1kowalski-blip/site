// La route de santé : elle dit si l'application est debout et si la base répond.
//
// Elle ne demande aucune authentification, car c'est l'hébergeur qui l'interroge pour
// savoir s'il doit remplacer le conteneur. Elle ne révèle donc RIEN d'utile à un curieux :
// pas de version détaillée, pas d'adresse, pas de réglage.
import type { FastifyInstance } from 'fastify';
import type { BaseInterne } from '../base-de-donnees/connexion.js';

export function poserLaRouteDeSante(serveur: FastifyInstance, base: BaseInterne): void {
    serveur.get('/api/sante', async (_requete, reponse) => {
        try {
            await base.interroger('SELECT 1');
            return { etat: 'en ligne', base: 'repond' };
        } catch {
            reponse.code(503);
            return { etat: 'degrade', base: 'ne repond pas' };
        }
    });
}
