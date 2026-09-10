#!/usr/bin/env node
// Génère studio-data/eslint.globals.json : la liste des identifiants globaux déclarés par les sources
// (fonctions, constantes, variables et classes de premier niveau). Tout le code vit dans un seul <script>,
// chaque fichier voit donc les déclarations des autres ; ESLint (no-undef) en a besoin pour distinguer
// une vraie référence à un symbole inconnu d'une référence inter-fichiers légitime.
//   node studio-data/tools/globales-generer.mjs
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.join(here, '..', 'src');
const manifests = fs.readdirSync(sourceDir).filter(f => /^manifest.*\.json$/.test(f));
const files = new Set();
manifests.forEach(mf => JSON.parse(fs.readFileSync(path.join(sourceDir, mf), 'utf8')).parts.forEach(p => { if (p.file.endsWith('.js')) files.add(p.file); }));
const globals = {}; const declaredIn = {};
for (const file of files) {
    const text = fs.readFileSync(path.join(sourceDir, file), 'utf8');
    // niveau <script> = 8 espaces d'indentation (convention des sources)
    for (const m of text.matchAll(/^ {8}(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/gm)) { globals[m[1]] = 'writable'; (declaredIn[m[1]] = declaredIn[m[1]] || []).push(file); }
    for (const m of text.matchAll(/^ {8}class\s+([A-Za-z0-9_$]+)/gm)) { globals[m[1]] = 'readonly'; (declaredIn[m[1]] = declaredIn[m[1]] || []).push(file); }
    // Une ligne de premier niveau peut porter plusieurs déclarations : « let a = null; let b = {}; »
    for (const line of text.matchAll(/^ {8}(?:const|let|var)\s.*$/gm)) {
        for (const m of line[0].matchAll(/(?:^|;)\s*(const|let|var)\s+([^;=]+?)\s*(?:=|;|$)/g)) {
            // « const a = 1, b = 2 » et déstructurations simples « const { a, b } = … » / « const [a, b] = … »
            const names = m[2].replace(/^[{[]|[}\]]$/g, '').split(',').map(s => s.trim().split(/[\s:=]/)[0]).filter(s => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s));
            names.forEach(n => { globals[n] = m[1] === 'const' ? 'readonly' : 'writable'; (declaredIn[n] = declaredIn[n] || []).push(file); });
        }
    }
}
const duplicates = Object.entries(declaredIn).filter(([, f]) => f.length > 1);
fs.writeFileSync(path.join(here, '..', 'eslint.globals.json'), JSON.stringify(globals, null, 1) + '\n');
console.log(Object.keys(globals).length + ' globales écrites dans eslint.globals.json (' + files.size + ' fichiers)');
if (duplicates.length) { console.log('Déclarées dans plusieurs fichiers (à vérifier) :'); duplicates.forEach(([n, f]) => console.log('  - ' + n + ' : ' + f.join(', '))); }
