// Les migrations : des fichiers SQL numérotés, appliqués une fois chacun, dans l'ordre.
//
// Pas de génération de code, pas d'outil à apprendre : un fichier .sql se lit, se relit
// en revue, et se retrouve tel quel dans la base. Chaque migration appliquée est inscrite,
// si bien qu'un redémarrage ne rejoue rien.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BaseInterne } from './connexion.js';

const dossierDesMigrations = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'migrations');

/** Les migrations présentes sur le disque, rangées par numéro. */
export function listerLesMigrations(dossier: string = dossierDesMigrations): string[] {
    if (!fs.existsSync(dossier)) return [];
    return fs
        .readdirSync(dossier)
        .filter(nom => nom.endsWith('.sql'))
        .sort();
}

/** Applique ce qui n'a pas encore été appliqué. Renvoie les noms des migrations jouées. */
export async function appliquerLesMigrations(base: BaseInterne, dossier: string = dossierDesMigrations): Promise<string[]> {
    await base.interroger(`CREATE TABLE IF NOT EXISTS migrations_appliquees (
        nom         TEXT PRIMARY KEY,
        appliquee_le TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const dejaFaites = new Set(
        (await base.interroger<{ nom: string }>('SELECT nom FROM migrations_appliquees')).map(ligne => ligne.nom)
    );
    const jouees: string[] = [];
    for (const nom of listerLesMigrations(dossier)) {
        if (dejaFaites.has(nom)) continue;
        const script = fs.readFileSync(path.join(dossier, nom), 'utf8');
        await base.executerUnScript(script);
        await base.interroger('INSERT INTO migrations_appliquees (nom) VALUES ($1)', [nom]);
        jouees.push(nom);
    }
    return jouees;
}
