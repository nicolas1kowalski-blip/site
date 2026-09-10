#!/usr/bin/env node
// Mise en forme automatique des sources JS avec Prettier (sans changement de sens).
// Les fichiers sont des fragments d'un <script> indentés de 8 espaces : on retire cette marge, on formate,
// on la remet, pour conserver la convention « premier niveau = 8 espaces » utilisée par build.mjs et les outils.
//   node studio-data/tools/formater.mjs            -> formate tous les fichiers JS des manifestes
//   node studio-data/tools/formater.mjs --check    -> code retour 1 si un fichier n'est pas formaté
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const prettier = await import(process.env.PRETTIER_INDEX || '/opt/node22/lib/node_modules/prettier/index.mjs');
const here = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.join(here, '..', 'src');
const checkOnly = process.argv.includes('--check');
export const PRETTIER_OPTIONS = { parser: 'babel', printWidth: 120, tabWidth: 4, useTabs: false, singleQuote: true, quoteProps: 'preserve', trailingComma: 'none', arrowParens: 'avoid', bracketSpacing: true, semi: true, endOfLine: 'lf' };
const SCRIPT_INDENT = '        ';
const manifests = fs.readdirSync(sourceDir).filter(f => /^manifest.*\.json$/.test(f));
const files = new Set();
manifests.forEach(mf => JSON.parse(fs.readFileSync(path.join(sourceDir, mf), 'utf8')).parts.forEach(p => { if (p.file.endsWith('.js')) files.add(p.file); }));
function dedent(text) { return text.split('\n').map(line => line.startsWith(SCRIPT_INDENT) ? line.slice(SCRIPT_INDENT.length) : line.replace(/^\s+$/, '')).join('\n'); }
function indent(text) { return text.split('\n').map(line => line.length ? SCRIPT_INDENT + line : line).join('\n'); }
let changed = 0, failed = 0;
for (const file of [...files].sort()) {
    const fullPath = path.join(sourceDir, file); const original = fs.readFileSync(fullPath, 'utf8');
    let formatted;
    try { formatted = indent(await prettier.format(dedent(original), PRETTIER_OPTIONS)); }
    catch (error) { failed++; console.error('✗ ' + file + ' : ' + String(error.message).split('\n')[0]); continue; }
    if (!formatted.endsWith('\n')) formatted += '\n';
    if (formatted === original) continue;
    changed++;
    if (checkOnly) console.log('à formater : ' + file); else { fs.writeFileSync(fullPath, formatted); console.log('formaté : ' + file); }
}
console.log((checkOnly ? changed + ' fichier(s) à formater' : changed + ' fichier(s) formaté(s)') + (failed ? ', ' + failed + ' en erreur' : ''));
process.exit(failed || (checkOnly && changed) ? 1 : 0);
