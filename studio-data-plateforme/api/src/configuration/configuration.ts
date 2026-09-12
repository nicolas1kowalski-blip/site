/**
 * Configuration de l'API.
 *
 * Toute la configuration vient des variables d'environnement (préfixe SD_). Elle est validée au démarrage
 * avec Zod : une valeur absente prend son défaut, une valeur invalide arrête le serveur avec un message clair.
 * Voir .env.exemple à la racine du projet pour la liste commentée.
 */
import path from 'node:path';
import { z } from 'zod';

/** Racine du projet api/ (le dossier qui contient package.json). */
export const RACINE_API = path.resolve(__dirname, '..', '..', '..');

const schemaEnvironnement = z.object({
    /** Adresse d'écoute. 127.0.0.1 par défaut : le serveur est prévu derrière un reverse proxy (Caddy, nginx). */
    SD_HOTE: z.string().default('127.0.0.1'),
    SD_PORT: z.coerce.number().int().positive().default(8430),
    /** Dossier des données non relationnelles : bases DuckDB, fichiers déposés, base PGlite en développement. */
    SD_DONNEES: z.string().default(path.join(RACINE_API, 'donnees')),
    /**
     * Chaîne de connexion PostgreSQL (postgres://utilisateur:motdepasse@hote:5432/base).
     * Vide = PGlite (PostgreSQL embarqué dans le processus, fichiers dans SD_DONNEES/pglite) : pratique pour
     * le développement et les tests, à ne pas utiliser en production multi-utilisateurs.
     */
    SD_POSTGRES_URL: z.string().default(''),
    /** Dossier du front Angular construit (web/dist/studio-data/browser). */
    SD_WEB: z.string().default(path.join(RACINE_API, '..', 'web', 'dist', 'studio-data', 'browser')),
    /** Dossier de l'application classique construite (web-classique/dist). */
    SD_WEB_CLASSIQUE: z.string().default(path.join(RACINE_API, '..', 'web-classique', 'dist')),
    SD_DUCKDB_THREADS: z.string().default(''),
    SD_DUCKDB_MEMOIRE: z.string().default(''),
    SD_LIMITE_LIGNES: z.coerce.number().int().positive().default(1_000_000),
    SD_TAILLE_MAX_FICHIER_MO: z.coerce.number().positive().default(4096),
    /** Durée de vie d'une session (heures). */
    SD_SESSION_DUREE_HEURES: z.coerce.number().positive().default(12),
    /** Le cookie de session n'est envoyé qu'en HTTPS quand vrai (à activer en production derrière TLS). */
    SD_COOKIE_SECURISE: z
        .string()
        .default('false')
        .transform(valeur => valeur === 'true' || valeur === '1'),
    /** Identifiant et mot de passe du premier administrateur, créés au premier démarrage si la base est vide. */
    SD_ADMIN_IDENTIFIANT: z.string().default('admin'),
    SD_ADMIN_MOT_DE_PASSE: z.string().default(''),
    SD_JOURNAL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info')
});

export type Configuration = {
    hote: string;
    port: number;
    dossierDonnees: string;
    postgresUrl: string;
    dossierWeb: string;
    dossierWebClassique: string;
    duckdb: { threads: string; memoire: string };
    limiteLignesParReponse: number;
    tailleMaxFichierOctets: number;
    sessionDureeMs: number;
    cookieSecurise: boolean;
    administrateurInitial: { identifiant: string; motDePasse: string };
    journal: 'debug' | 'info' | 'warn' | 'error' | 'silent';
};

/** Jeton d'injection NestJS de la configuration. */
export const CONFIGURATION = Symbol('CONFIGURATION');

/** Lit et valide l'environnement (process.env par défaut ; un objet en tests). */
export function lireConfiguration(environnement: NodeJS.ProcessEnv = process.env): Configuration {
    const valeurs = schemaEnvironnement.parse(environnement);
    return {
        hote: valeurs.SD_HOTE,
        port: valeurs.SD_PORT,
        dossierDonnees: path.resolve(valeurs.SD_DONNEES),
        postgresUrl: valeurs.SD_POSTGRES_URL,
        dossierWeb: path.resolve(valeurs.SD_WEB),
        dossierWebClassique: path.resolve(valeurs.SD_WEB_CLASSIQUE),
        duckdb: { threads: valeurs.SD_DUCKDB_THREADS, memoire: valeurs.SD_DUCKDB_MEMOIRE },
        limiteLignesParReponse: valeurs.SD_LIMITE_LIGNES,
        tailleMaxFichierOctets: valeurs.SD_TAILLE_MAX_FICHIER_MO * 1024 * 1024,
        sessionDureeMs: valeurs.SD_SESSION_DUREE_HEURES * 3600 * 1000,
        cookieSecurise: valeurs.SD_COOKIE_SECURISE,
        administrateurInitial: { identifiant: valeurs.SD_ADMIN_IDENTIFIANT, motDePasse: valeurs.SD_ADMIN_MOT_DE_PASSE },
        journal: valeurs.SD_JOURNAL
    };
}
