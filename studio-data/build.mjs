#!/usr/bin/env node
// Assemblage des fichiers livrés à partir de studio-data/src (voir src/README.md et src/ARCHITECTURE.md).
//   node studio-data/build.mjs                 -> construit StudioDataV7.html (manifest.json)
//   node studio-data/build.mjs --target v14    -> construit la cible v14 (manifest-v14.json) ; v11, v12, v13 de même
//   node studio-data/build.mjs --all           -> construit toutes les cibles
//   node studio-data/build.mjs --check         -> vérifie que les fichiers livrés sont à jour (code retour 1 sinon)
//   node studio-data/build.mjs --api           -> écrit src/API.md (index des modules et fonctions) sans construire
// Chaque cible est une simple concaténation des parties listées dans son manifeste : HTML/CSS d'abord,
// puis tous les fichiers JS dans un seul <script>. Dès que le noyau d'architecture (10-noyau/00-studio.js)
// est chargé, le build pose « Studio.beginModule('fichier') » devant chaque fichier JS et, en fin de script,
// « Studio.registerModules([...]) » avec les fonctions déclarées par chaque fichier : c'est ce qui permet
// Studio.selfCheck(), le panneau Architecture (V14) et API.md.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

const buildDir = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.join(buildDir, 'src');
const STUDIO_CORE_FILE = '10-noyau/00-studio.js';
const MANIFEST_BY_TARGET = { v7: 'manifest.json', v11: 'manifest-v11.json', v12: 'manifest-v12.json', v13: 'manifest-v13.json', v14: 'manifest-v14.json' };
const VERSION_PATTERN_BY_TARGET = { v7: /V11_VERSION : '([^']+)'/, v11: /const V11_VERSION = '([^']+)'/, v12: /const V12_VERSION = '([^']+)'/, v13: /const V13_VERSION = '([^']+)'/, v14: /const V14_VERSION = '([^']+)'/ };

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const apiOnly = args.includes('--api');
const targetIndex = args.indexOf('--target');
const requestedTargets = args.includes('--all') ? Object.keys(MANIFEST_BY_TARGET) : [targetIndex >= 0 ? args[targetIndex + 1] : 'v7'];

function readManifest(target) {
    const manifestFile = MANIFEST_BY_TARGET[target];
    if (!manifestFile) { console.error('Cible inconnue : ' + target + ' (attendu : ' + Object.keys(MANIFEST_BY_TARGET).join(', ') + ')'); process.exit(2); }
    const manifestPath = path.join(sourceDir, manifestFile);
    if (!fs.existsSync(manifestPath)) return null;
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}
function readPart(part) {
    const partPath = path.join(sourceDir, part.file);
    if (!fs.existsSync(partPath)) { console.error('Fichier manquant : ' + part.file); process.exit(2); }
    return fs.readFileSync(partPath, 'utf8');
}
// Fonctions déclarées au premier niveau d'un fichier JS (indentation de 8 espaces = niveau du <script>).
function declaredFunctions(jsText) {
    const names = [];
    for (const match of jsText.matchAll(/^ {8}(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/gm)) names.push(match[1]);
    return names;
}
function assemble(manifest) {
    let html = '', script = ''; const modules = []; let studioLoaded = false;
    for (const part of manifest.parts) {
        const text = readPart(part);
        if (!part.file.endsWith('.js')) { html += text; continue; }
        if (studioLoaded) script += `        Studio.beginModule('${part.file}');\n`;
        script += text;
        if (part.file === STUDIO_CORE_FILE) studioLoaded = true;
        modules.push({ file: part.file, role: part.role || '', functions: declaredFunctions(text) });
    }
    if (studioLoaded) script += `        Studio.beginModule('(build)');\n        Studio.registerModules(${JSON.stringify(modules.map(m => ({ file: m.file, functions: m.functions })))});\n`;
    return { html: html + '    <script>\n' + script + '</script>\n</body>\n</html>\n', modules };
}
function detectVersion(target, html) { return (html.match(VERSION_PATTERN_BY_TARGET[target]) || [])[1] || '?'; }

function writeApiIndex() {
    const manifest = readManifest('v14') || readManifest('v13');
    const { modules } = assemble(manifest);
    const lines = ['# Index de l\'API — Studio Data', '', 'Généré par `node studio-data/build.mjs --api` à partir de `' + (readManifest('v14') ? 'manifest-v14.json' : 'manifest-v13.json') + '`. Une ligne par fichier : rôle, puis fonctions globales déclarées.', '', '| Fichier | Rôle | Fonctions |', '|---|---|---|'];
    modules.forEach(m => lines.push(`| \`${m.file}\` | ${m.role.replace(/\|/g, '\\|')} | ${m.functions.length ? m.functions.map(f => '`' + f + '`').join(', ') : '—'} |`));
    const total = modules.reduce((n, m) => n + m.functions.length, 0);
    lines.push('', `${modules.length} fichiers JS, ${total} fonctions globales.`, '');
    fs.writeFileSync(path.join(sourceDir, 'API.md'), lines.join('\n'));
    console.log('Écrit src/API.md (' + modules.length + ' fichiers, ' + total + ' fonctions)');
}

if (apiOnly) { writeApiIndex(); process.exit(0); }
let exitCode = 0;
for (const target of requestedTargets) {
    const manifest = readManifest(target);
    if (!manifest) { if (args.includes('--all')) continue; console.error('Manifeste absent pour la cible ' + target); process.exit(2); }
    const outputPath = path.resolve(sourceDir, manifest.output);
    const outputName = path.basename(outputPath);
    const { html } = assemble(manifest);
    const version = detectVersion(target, html);
    if (checkOnly) {
        const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
        if (current === html) console.log('OK : ' + outputName + ' est à jour (v' + version + ')');
        else { console.error('ÉCART : ' + outputName + ' ne correspond pas aux sources — lancez node studio-data/build.mjs' + (target !== 'v7' ? ' --target ' + target : '')); exitCode = 1; }
        continue;
    }
    fs.writeFileSync(outputPath, html);
    console.log('Construit ' + path.relative(process.cwd(), outputPath) + ' (v' + version + ', ' + manifest.parts.length + ' fichiers, ' + (html.length / 1024 / 1024).toFixed(2) + ' Mo)');
}
process.exit(exitCode);
