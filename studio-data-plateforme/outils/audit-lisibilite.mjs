// Audit de lisibilité rejouable : noms d'une ou deux lettres ou abrégés (cfg, tmp, col…), fichiers sans en-tête,
// fonctions de plus de 60 lignes. Lancer depuis studio-data-plateforme : node outils/audit-lisibilite.mjs
import fs from 'node:fs';
import path from 'node:path';
const racine = process.cwd();
const ignores = new Set(['node_modules', 'dist', 'donnees', '.angular', 'captures']);
function lister(d) {
    const r = [];
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) {
            if (!ignores.has(e.name)) r.push(...lister(p));
        } else if (/\.(ts|mjs)$/.test(e.name)) r.push(p);
    }
    return r;
}
const courts = {};
const sansEntete = [];
const longues = [];
const abreviations = /^(cfg|conf|cnt|idx|tmp|obj|arr|str|num|val|res|req|err|fn|cb|el|elt|btn|msg|nb|src|dst|tbl|col)$/;
for (const f of lister(racine)) {
    const texte = fs.readFileSync(f, 'utf8');
    const rel = path.relative(racine, f);
    if (!/^(\/\*\*|\/\/)/.test(texte.trimStart()) && !texte.startsWith('#!')) sansEntete.push(rel);
    const identifiants = new Set();
    for (const m of texte.matchAll(/\b(?:const|let)\s+([a-zA-Z_$][\w$]*)/g)) identifiants.add(m[1]);
    for (const m of texte.matchAll(/\bfunction\s+([a-zA-Z_$][\w$]*)/g)) identifiants.add(m[1]);
    for (const m of texte.matchAll(/\(([^()]*)\)\s*(?::\s*[^{=]+)?=>/g))
        for (const p of m[1].split(',')) {
            const n = p.trim().split(/[:\s=]/)[0];
            if (n) identifiants.add(n);
        }
    for (const m of texte.matchAll(/(?<![\w.])([a-zA-Z_$][\w$]*)\s*=>/g)) identifiants.add(m[1]);
    for (const n of identifiants) if ((n.length <= 2 && n !== '_') || abreviations.test(n)) (courts[n] ||= []).push(rel);
    // fonctions longues : blocs commençant par function/méthode async et se terminant à l'accolade correspondante
    const lignes = texte.split('\n');
    for (let i = 0; i < lignes.length; i++) {
        if (
            /^\s{4}(?:async\s+)?(?:private\s+)?(?:static\s+)?[a-zA-Z_]\w*\s*\([^)]*\)[^{;]*\{\s*$/.test(lignes[i]) ||
            /^(?:export\s+)?(?:async\s+)?function\s+\w+/.test(lignes[i])
        ) {
            let profondeur = 0,
                fin = i;
            for (let j = i; j < lignes.length; j++) {
                profondeur += (lignes[j].match(/\{/g) || []).length - (lignes[j].match(/\}/g) || []).length;
                if (profondeur <= 0 && j > i) {
                    fin = j;
                    break;
                }
            }
            if (fin - i > 60) longues.push(`${rel}:${i + 1} (${fin - i} lignes) ${lignes[i].trim().slice(0, 60)}`);
        }
    }
}
console.log('--- noms courts ou abrégés ---');
for (const [n, fichiers] of Object.entries(courts).sort((a, b) => b[1].length - a[1].length))
    console.log(n.padEnd(6), fichiers.length, [...new Set(fichiers)].slice(0, 4).join(', '));
console.log('--- fichiers sans en-tête ---');
sansEntete.forEach(f => console.log(f));
console.log('--- fonctions de plus de 60 lignes ---');
longues.forEach(l => console.log(l));
