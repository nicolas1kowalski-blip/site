// Routes tables : métadonnées des sources (nom, type, configuration de lecture, stockage…) — l'équivalent du
// magasin « tabledata » d'IndexedDB, sans les données : celles-ci vivent dans la base DuckDB du serveur
// (table t_<id>) et dans le dépôt de fichiers (src_<id>, pq_<id>.parquet). Deux opérations lourdes sont
// faites côté serveur, sans transiter par le navigateur : l'optimisation Parquet et l'export Parquet.
import fsp from 'node:fs/promises';
import { identifiant, litteral } from '../moteur/duckdb.mjs';
import { erreurIntrouvable, erreurRequete, verifierNomSur } from '../erreurs.mjs';

const nomTableDuckDB = id => 't_' + id;

export async function routesTables(app) {
    app.get('/api/tables', async request => {
        const espace = await request.espace();
        return espace.tables.tout();
    });

    app.get('/api/tables/:id', async request => {
        const espace = await request.espace();
        const document = await espace.tables.lire(request.params.id);
        if (!document) throw erreurIntrouvable('Table inconnue : ' + request.params.id);
        return document;
    });

    app.put('/api/tables/:id', { bodyLimit: 64 * 1024 * 1024 }, async (request, reply) => {
        const espace = await request.espace();
        const id = verifierNomSur(request.params.id, 'identifiant de table');
        const document = request.body && typeof request.body === 'object' ? request.body : null;
        if (!document || typeof document.name !== 'string')
            throw erreurRequete('Métadonnées de table invalides (name attendu).');
        await espace.tables.ecrire(id, { ...document, id, enregistreLe: new Date().toISOString() });
        reply.code(204);
        return reply.send();
    });

    // Supprime les métadonnées, la table DuckDB et les fichiers de la source.
    app.delete('/api/tables/:id', async (request, reply) => {
        const espace = await request.espace();
        await supprimerTable(espace, verifierNomSur(request.params.id, 'identifiant de table'));
        reply.code(204);
        return reply.send();
    });

    // Remise à zéro complète de l'espace : toutes les tables, tous les fichiers.
    app.delete('/api/tables', async (request, reply) => {
        const espace = await request.espace();
        for (const document of await espace.tables.tout()) await supprimerTable(espace, document.id);
        for (const table of await espace.moteur.tables()) {
            if (table.nom.startsWith('t_')) await abandonner(espace, table.nom);
        }
        for (const fichier of await espace.fichiers.lister()) await espace.fichiers.supprimer(fichier.nom);
        reply.code(204);
        return reply.send();
    });

    // Optimisation : la table est réécrite en Parquet ZSTD sur le disque du serveur et remplacée par une vue.
    app.post('/api/tables/:id/optimiser', async request => {
        const espace = await request.espace();
        const id = verifierNomSur(request.params.id, 'identifiant de table');
        const nomTable = identifiant(nomTableDuckDB(id));
        const nomParquet = 'pq_' + id + '.parquet';
        const cheminParquet = espace.fichiers.chemin(nomParquet);
        const cheminTemporaire = cheminParquet + '.partiel.parquet';
        await espace.moteur.executer(
            `COPY (SELECT * FROM ${nomTable}) TO ${litteral(cheminTemporaire)} (FORMAT PARQUET, COMPRESSION ZSTD)`
        );
        await abandonner(espace, nomTableDuckDB(id));
        await fsp.rename(cheminTemporaire, cheminParquet);
        await espace.moteur.executer(`CREATE VIEW ${nomTable} AS SELECT * FROM read_parquet(${litteral(nomParquet)})`);
        const description = await espace.fichiers.decrire(nomParquet);
        const document = await espace.tables.lire(id);
        if (document)
            await espace.tables.ecrire(id, {
                ...document,
                storage: 'parquet',
                optimized: true,
                pqSize: description.taille
            });
        return { fichier: nomParquet, taille: description.taille };
    });

    // Export Parquet (bundles de partage) : produit sur le serveur, renvoyé au navigateur, puis effacé.
    app.post('/api/tables/:id/parquet', async (request, reply) => {
        const espace = await request.espace();
        const id = verifierNomSur(request.params.id, 'identifiant de table');
        const nomExport = 'exp_' + id + '_' + Date.now() + '.parquet';
        const cheminExport = espace.fichiers.chemin(nomExport);
        await espace.moteur.executer(
            `COPY (SELECT * EXCLUDE (__rn) FROM ${identifiant(nomTableDuckDB(id))}) TO ${litteral(cheminExport)} (FORMAT PARQUET, COMPRESSION ZSTD)`
        );
        try {
            const contenu = await fsp.readFile(cheminExport);
            reply.type('application/octet-stream');
            reply.header('content-length', contenu.length);
            return reply.send(contenu);
        } finally {
            await fsp.rm(cheminExport, { force: true });
        }
    });
}

async function abandonner(espace, nomTable) {
    const nom = identifiant(nomTable);
    await espace.moteur.executer(`DROP TABLE IF EXISTS ${nom}`).catch(() => {});
    await espace.moteur.executer(`DROP VIEW IF EXISTS ${nom}`).catch(() => {});
}

async function supprimerTable(espace, id) {
    await abandonner(espace, nomTableDuckDB(id));
    await espace.tables.supprimer(id);
    await espace.fichiers.supprimerParPrefixe('src_' + id);
    await espace.fichiers.supprimerParPrefixe('pq_' + id + '.');
    await espace.fichiers.supprimerParPrefixe('exp_' + id + '.');
}

export { nomTableDuckDB };
