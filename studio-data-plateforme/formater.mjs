#!/usr/bin/env node
// Mise en forme Prettier de tout le projet (API, front, tests, scripts) : 4 espaces, guillemets simples,
// 140 colonnes. « --check » ne réécrit rien et renvoie 1 si un fichier n'est pas conforme.
//   node formater.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const verifier = process.argv.includes('--check');
const prettier = await import(path.join(ici, 'node_modules', 'prettier', 'index.mjs'));
const options = { printWidth: 140, tabWidth: 4, singleQuote: true, quoteProps: 'preserve', trailingComma: 'none', arrowParens: 'avoid' };
const DOSSIERS_IGNORES = new Set(['node_modules', 'dist', 'donnees', 'captures', '.angular']);

function lister(dossier) {
    const fichiers = [];
    for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
        const chemin = path.join(dossier, entree.name);
        if (entree.isDirectory()) {
            if (!DOSSIERS_IGNORES.has(entree.name)) fichiers.push(...lister(chemin));
        } else if (/\.(ts|mjs|js)$/.test(entree.name)) fichiers.push(chemin);
    }
    return fichiers;
}

let nonConformes = 0;
for (const chemin of lister(ici)) {
    const original = fs.readFileSync(chemin, 'utf8');
    const parser = chemin.endsWith('.ts') ? 'typescript' : 'babel';
    const sortie = await prettier.format(original, { ...options, parser });
    if (sortie === original) continue;
    nonConformes++;
    if (verifier) console.log('Non conforme : ' + path.relative(ici, chemin));
    else {
        fs.writeFileSync(chemin, sortie);
        console.log('Mis en forme : ' + path.relative(ici, chemin));
    }
}
console.log(verifier ? `${nonConformes} fichier(s) non conforme(s)` : `${nonConformes} fichier(s) réécrit(s)`);
process.exit(verifier && nonConformes ? 1 : 0);
