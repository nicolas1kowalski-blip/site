/**
 * Migrations SQL : les fichiers de api/migrations sont appliqués dans l'ordre de leur nom, une seule fois
 * chacun (table migrations_appliquees). Chaque fichier contient des instructions terminées par « ; » en fin
 * de ligne ; elles sont exécutées une par une pour fonctionner à l'identique sur PostgreSQL et PGlite.
 */
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { BaseDeDonnees } from './connexion';

export const DOSSIER_MIGRATIONS = path.resolve(__dirname, '..', '..', '..', 'migrations');

function instructionsDe(texteSql: string): string[] {
    return texteSql
        .split(/;\s*\n/)
        .map(instruction => instruction.replace(/^\s*--.*$/gm, '').trim())
        .filter(instruction => instruction.length > 0);
}

export async function appliquerMigrations(base: BaseDeDonnees, dossier = DOSSIER_MIGRATIONS): Promise<string[]> {
    await base.execute(
        sql.raw('CREATE TABLE IF NOT EXISTS migrations_appliquees (nom text PRIMARY KEY, appliquee_le timestamptz NOT NULL DEFAULT now())')
    );
    const dejaAppliquees = new Set(
        ((await base.execute(sql.raw('SELECT nom FROM migrations_appliquees'))) as { rows: { nom: string }[] }).rows.map(ligne => ligne.nom)
    );
    const fichiers = fs
        .readdirSync(dossier)
        .filter(nom => nom.endsWith('.sql'))
        .sort();
    const appliquees: string[] = [];
    for (const fichier of fichiers) {
        if (dejaAppliquees.has(fichier)) continue;
        const texte = fs.readFileSync(path.join(dossier, fichier), 'utf8');
        for (const instruction of instructionsDe(texte)) await base.execute(sql.raw(instruction));
        await base.execute(sql`INSERT INTO migrations_appliquees (nom) VALUES (${fichier})`);
        appliquees.push(fichier);
    }
    return appliquees;
}
