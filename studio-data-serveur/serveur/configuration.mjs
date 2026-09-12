// Configuration du serveur : tout vient des variables d'environnement (préfixe SD_), avec des valeurs
// par défaut qui permettent de démarrer sans rien régler. Voir README.md et .env.exemple.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racineProjet = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @typedef {object} Configuration
 * @property {string} hote               Adresse d'écoute (127.0.0.1 par défaut : derrière un reverse proxy).
 * @property {number} port               Port d'écoute.
 * @property {string} dossierDonnees     Dossier racine des données (base DuckDB, fichiers, documents JSON).
 * @property {string} dossierClient      Dossier du front construit (client/dist).
 * @property {{ threads: string, memoire: string }} duckdb  Réglages transmis au moteur ('' = défaut DuckDB).
 * @property {number} limiteLignesParReponse  Nombre maximal de lignes renvoyées par POST /api/sql (au-delà : erreur).
 * @property {number} tailleMaxFichier   Taille maximale d'un fichier déposé (octets).
 * @property {{ mode: string }} authentification  Mode d'authentification ('aucune' pour l'instant).
 * @property {string} journal            Niveau de journalisation Fastify (info, warn, error, silent).
 */

/** @returns {Configuration} */
export function lireConfiguration(env = process.env) {
    return {
        hote: env.SD_HOTE || '127.0.0.1',
        port: Number(env.SD_PORT || 8420),
        dossierDonnees: path.resolve(env.SD_DONNEES || path.join(racineProjet, 'donnees')),
        dossierClient: path.resolve(env.SD_CLIENT || path.join(racineProjet, 'client', 'dist')),
        duckdb: {
            threads: env.SD_DUCKDB_THREADS || '',
            memoire: env.SD_DUCKDB_MEMOIRE || ''
        },
        limiteLignesParReponse: Number(env.SD_LIMITE_LIGNES || 1000000),
        tailleMaxFichier: Number(env.SD_TAILLE_MAX_FICHIER_MO || 4096) * 1024 * 1024,
        authentification: { mode: env.SD_AUTH_MODE || 'aucune' },
        journal: env.SD_JOURNAL || 'info'
    };
}

export { racineProjet };
