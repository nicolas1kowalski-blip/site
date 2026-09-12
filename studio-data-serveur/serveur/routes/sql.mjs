// Routes SQL : l'équivalent de conn.query (POST /api/sql) et de conn.send (POST /api/sql/flux) du front.
import { Readable } from 'node:stream';

export async function routesSql(app) {
    // Résultat complet : { colonnes: [{ nom, type }], lignes: [[…]] }.
    app.post('/api/sql', { bodyLimit: 64 * 1024 * 1024 }, async request => {
        const espace = await request.espace();
        return espace.moteur.executer(request.body && request.body.sql);
    });

    // Résultat en flux NDJSON : une ligne JSON par paquet, la première portant les colonnes.
    app.post('/api/sql/flux', { bodyLimit: 64 * 1024 * 1024 }, async (request, reply) => {
        const espace = await request.espace();
        const generateur = espace.moteur.flux(request.body && request.body.sql);
        // La première étape est attendue ici pour qu'une erreur SQL devienne une vraie réponse 400
        // (une fois le flux commencé, le statut est déjà parti).
        const premiere = await generateur.next();
        async function* lignesNdjson() {
            if (!premiere.done) yield JSON.stringify(premiere.value) + '\n';
            for await (const paquet of generateur) yield JSON.stringify(paquet) + '\n';
        }
        reply.type('application/x-ndjson');
        return reply.send(Readable.from(lignesNdjson()));
    });
}
