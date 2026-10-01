// Les en-têtes que le serveur ajoute à CHAQUE réponse.
//
// Ce sont les protections de base que toute revue de sécurité vérifie. Elles coûtent
// quelques lignes et ferment des portes entières : exécution de scripts étrangers,
// inclusion de l'application dans la page d'un tiers, fuite de l'adresse consultée.
import type { FastifyInstance } from 'fastify';

/** La politique de contenu : d'où la page a le droit de charger quelque chose. */
export const POLITIQUE_DE_CONTENU = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
].join('; ');

export function poserLesEntetesDeSecurite(serveur: FastifyInstance, enProduction: boolean): void {
    serveur.addHook('onSend', async (requete, reponse, contenu) => {
        reponse.header('Content-Security-Policy', POLITIQUE_DE_CONTENU);
        // Le navigateur ne doit pas deviner le type d'un contenu : un fichier déposé par
        // quelqu'un pourrait alors être interprété comme une page et s'exécuter.
        reponse.header('X-Content-Type-Options', 'nosniff');
        reponse.header('Referrer-Policy', 'same-origin');
        reponse.header('X-Frame-Options', 'DENY');
        reponse.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        // On ne dit pas au monde quel serveur nous faisons tourner.
        reponse.removeHeader('x-powered-by');
        if (enProduction) {
            reponse.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
        }
        return contenu;
    });
}
