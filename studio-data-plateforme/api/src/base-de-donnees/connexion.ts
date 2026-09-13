/**
 * Connexion à la base référentielle.
 *
 * Deux pilotes, une seule API Drizzle :
 *   • PostgreSQL (SD_POSTGRES_URL renseignée) — production ;
 *   • PGlite (PostgreSQL compilé en WebAssembly, dans le processus Node) — développement et tests, aucun
 *     service à installer, données dans SD_DONNEES/pglite.
 * Le reste de l'application ne voit qu'un objet `BaseDeDonnees` et ignore le pilote.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

export type BaseDeDonnees = PgDatabase<PgQueryResultHKT, typeof schema>;

export type ConnexionBase = {
    base: BaseDeDonnees;
    pilote: 'postgresql' | 'pglite';
    fermer(): Promise<void>;
};

/** Jeton d'injection NestJS de la base (`@Inject(BASE_DE_DONNEES) base: BaseDeDonnees`). */
export const BASE_DE_DONNEES = Symbol('BASE_DE_DONNEES');

/** Options TLS transmises au pilote pg (voir optionsTls). */
export type OptionsTls = false | { rejectUnauthorized: boolean; ca?: string };

/**
 * Décide du chiffrement de la connexion PostgreSQL d'après l'URL et un éventuel certificat d'autorité :
 *   • un fichier CA fourni (SD_POSTGRES_CA, par exemple le paquet de certificats Amazon RDS) → TLS avec
 *     vérification stricte du serveur : c'est le réglage recommandé en production ;
 *   • sinon `sslmode=require` (ou `ssl=true`) dans l'URL → TLS sans vérification du certificat : chiffré,
 *     mais sans garantie sur l'identité du serveur ;
 *   • sinon → pas de TLS (base sur la même machine ou réseau privé).
 * L'URL est nettoyée de son paramètre sslmode, que le pilote pg interpréterait à sa façon.
 */
export function optionsTls(postgresUrl: string, contenuCa?: string): { url: string; tls: OptionsTls } {
    const adresse = new URL(postgresUrl);
    const modeSsl = adresse.searchParams.get('sslmode') || (adresse.searchParams.get('ssl') === 'true' ? 'require' : '');
    adresse.searchParams.delete('sslmode');
    adresse.searchParams.delete('ssl');
    const url = adresse.toString();
    if (contenuCa) return { url, tls: { rejectUnauthorized: true, ca: contenuCa } };
    if (modeSsl && modeSsl !== 'disable') return { url, tls: { rejectUnauthorized: false } };
    return { url, tls: false };
}

export async function ouvrirBaseDeDonnees(postgresUrl: string, dossierDonnees: string, cheminCa = ''): Promise<ConnexionBase> {
    if (postgresUrl) {
        const { Pool } = await import('pg');
        const { drizzle } = await import('drizzle-orm/node-postgres');
        const { url, tls } = optionsTls(postgresUrl, cheminCa ? fs.readFileSync(cheminCa, 'utf8') : undefined);
        const pool = new Pool({ connectionString: url, ssl: tls });
        const base = drizzle(pool, { schema }) as unknown as BaseDeDonnees;
        return { base, pilote: 'postgresql', fermer: () => pool.end() };
    }
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const dossier = path.join(dossierDonnees, 'pglite');
    fs.mkdirSync(dossier, { recursive: true });
    const client = new PGlite(dossier);
    await client.waitReady;
    const base = drizzle(client, { schema }) as unknown as BaseDeDonnees;
    return { base, pilote: 'pglite', fermer: () => client.close() };
}
