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

export async function ouvrirBaseDeDonnees(postgresUrl: string, dossierDonnees: string): Promise<ConnexionBase> {
    if (postgresUrl) {
        const { Pool } = await import('pg');
        const { drizzle } = await import('drizzle-orm/node-postgres');
        const pool = new Pool({ connectionString: postgresUrl });
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
