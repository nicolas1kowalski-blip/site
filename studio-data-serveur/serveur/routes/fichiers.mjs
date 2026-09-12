// Routes fichiers : l'équivalent de db.registerFileHandle / registerFileText / registerFileBuffer /
// copyFileToBuffer / dropFile du front. Le corps de PUT est écrit en flux sur le disque, jamais chargé en mémoire.
import { erreurRequete } from '../erreurs.mjs';

export async function routesFichiers(app) {
    app.get('/api/fichiers', async request => {
        const espace = await request.espace();
        return espace.fichiers.lister();
    });

    app.put('/api/fichiers/:nom', async (request, reply) => {
        const espace = await request.espace();
        const resultat = await espace.fichiers.ecrireDepuisFlux(request.params.nom, request.corpsBrut());
        reply.code(201);
        return resultat;
    });

    app.head('/api/fichiers/:nom', async (request, reply) => {
        const espace = await request.espace();
        const description = await espace.fichiers.decrire(request.params.nom);
        reply.header('content-length', description.taille);
        return reply.send();
    });

    // Lecture complète ou partielle (en-tête Range « bytes=début-fin », utilisé pour renifler l'encodage).
    app.get('/api/fichiers/:nom', async (request, reply) => {
        const espace = await request.espace();
        const plage = lirePlage(request.headers.range);
        const { flux, description } = await espace.fichiers.lireFlux(request.params.nom, plage);
        reply.type('application/octet-stream');
        if (plage) {
            const fin = Math.min(plage.fin, description.taille - 1);
            reply.code(206);
            reply.header('content-range', `bytes ${plage.debut}-${fin}/${description.taille}`);
            reply.header('content-length', Math.max(0, fin - plage.debut + 1));
        } else {
            reply.header('content-length', description.taille);
        }
        return reply.send(flux);
    });

    app.delete('/api/fichiers/:nom', async (request, reply) => {
        const espace = await request.espace();
        await espace.fichiers.supprimer(request.params.nom);
        reply.code(204);
        return reply.send();
    });
}

function lirePlage(enTete) {
    if (!enTete) return null;
    const correspondance = /^bytes=(\d+)-(\d*)$/.exec(String(enTete).trim());
    if (!correspondance) throw erreurRequete('En-tête Range non pris en charge : ' + enTete);
    const debut = Number(correspondance[1]);
    const fin = correspondance[2] === '' ? Number.MAX_SAFE_INTEGER : Number(correspondance[2]);
    if (fin < debut) throw erreurRequete('Plage d’octets invalide.');
    return { debut, fin };
}
