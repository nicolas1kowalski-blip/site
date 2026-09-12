// Route de santé : version, moteur, volumes — pour la supervision et le panneau « Sauvegarde » du front.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { version: VERSION_SERVEUR } = require('../../package.json');

export async function routesSante(app) {
    app.get('/api/sante', async request => {
        const espace = await request.espace();
        const [versionDuckDB, tables, fichiers] = await Promise.all([
            espace.moteur.version(),
            espace.moteur.tables(),
            espace.fichiers.lister()
        ]);
        return {
            ok: true,
            serveur: VERSION_SERVEUR,
            duckdb: versionDuckDB,
            espace: espace.nom,
            tables: tables.length,
            fichiers: fichiers.length,
            octetsFichiers: fichiers.reduce((somme, fichier) => somme + fichier.taille, 0),
            requetesExecutees: espace.moteur.requetesExecutees,
            memoireProcessusMo: Math.round(process.memoryUsage().rss / 1048576)
        };
    });
}

export { VERSION_SERVEUR };
