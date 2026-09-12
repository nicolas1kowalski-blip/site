// Routes d'état : l'équivalent du magasin « meta » d'IndexedDB (idbGet / idbPut / idbDel / idbKeys / idbClear).
// Chaque clé est un document JSON : appState (configuration, gouvernance), qualityHistory, appStateBackups, qrSnapshots…
const LIMITE_DOCUMENT = 512 * 1024 * 1024;

export async function routesEtat(app) {
    app.get('/api/etat', async request => {
        const espace = await request.espace();
        return espace.etat.cles();
    });

    app.get('/api/etat/:cle', async request => {
        const espace = await request.espace();
        const valeur = await espace.etat.lire(request.params.cle);
        // Une clé absente est un cas normal (première ouverture) : réponse 200 avec absent=true, pas une erreur.
        if (valeur === undefined) return { valeur: null, absent: true };
        return { valeur };
    });

    app.put('/api/etat/:cle', { bodyLimit: LIMITE_DOCUMENT }, async (request, reply) => {
        const espace = await request.espace();
        const corps = request.body && typeof request.body === 'object' ? request.body : {};
        await espace.etat.ecrire(request.params.cle, corps.valeur === undefined ? null : corps.valeur);
        reply.code(204);
        return reply.send();
    });

    app.delete('/api/etat/:cle', async (request, reply) => {
        const espace = await request.espace();
        await espace.etat.supprimer(request.params.cle);
        reply.code(204);
        return reply.send();
    });

    app.delete('/api/etat', async (request, reply) => {
        const espace = await request.espace();
        await espace.etat.vider();
        reply.code(204);
        return reply.send();
    });
}
