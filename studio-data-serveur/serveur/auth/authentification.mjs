// Authentification : point d'extension du serveur. Aujourd'hui un seul mode, « aucune » : chaque requête
// est attribuée à un utilisateur local unique, propriétaire de l'espace de travail « defaut ».
//
// Le futur module d'authentification n'a qu'un contrat à respecter : poser request.utilisateur
// ({ id, nom, roles, espace }) avant les routes /api, ou répondre 401. L'espace désigne le jeu de
// données (base DuckDB + fichiers + documents) sur lequel l'utilisateur travaille : c'est la clé qui
// permettra plusieurs équipes sur un même serveur sans toucher aux routes ni au front.
import fp from 'fastify-plugin';

export const UTILISATEUR_LOCAL = Object.freeze({
    id: 'local',
    nom: 'Utilisateur local',
    roles: ['administrateur'],
    espace: 'defaut'
});

async function pluginAuthentification(app, options) {
    const mode = (options && options.mode) || 'aucune';
    app.decorateRequest('utilisateur', null);
    app.addHook('onRequest', async (request, reply) => {
        if (!request.url.startsWith('/api/')) return;
        if (mode === 'aucune') {
            request.utilisateur = UTILISATEUR_LOCAL;
            return;
        }
        reply.code(501).send({ erreur: `Mode d'authentification « ${mode} » non disponible : module à venir.` });
    });
    app.get('/api/moi', async request => ({
        id: request.utilisateur.id,
        nom: request.utilisateur.nom,
        roles: request.utilisateur.roles,
        espace: request.utilisateur.espace,
        mode
    }));
}

export const authentification = fp(pluginAuthentification, { name: 'authentification' });
