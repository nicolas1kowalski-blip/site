#!/usr/bin/env node
// Lanceur des suites de tests headless (Playwright + Chromium) de Studio Data.
//   node studio-data/tests/run.mjs                    -> toutes les suites, sur leur cible d'origine
//   node studio-data/tests/run.mjs --target v14       -> les suites applicables à la cible v14 (V12 + V13 + V14)
//   node studio-data/tests/run.mjs --target v7 --filter lineage
//   node studio-data/tests/run.mjs --list
// Chaque suite est un script autonome qui lit SD_FILE (fichier construit à tester) et affiche « n/m OK ».
// Variables d'environnement : CHROMIUM (exécutable), PLAYWRIGHT_INDEX (index.js de Playwright), DUCKDB_NODE_API.
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(testsDir, '..');
const suitesDir = path.join(testsDir, 'suites');
const FILE_BY_TARGET = { v7: 'StudioDataV7.html', v11: 'StudioDataV11.html', v12: 'StudioDataV12.html', v13: 'StudioDataV13.html', v14: 'StudioDataV14.html' };
// Cible minimale d'une suite d'après son préfixe : v860…v1021 → V7, v11xx → V11, v12xx → V12, v13xx → V13, v14xx → V14.
function minimalTarget(suiteName) {
    const number = parseInt((suiteName.match(/^v(\d+)_/) || [])[1] || '0', 10);
    if (number >= 1400) return 'v14'; if (number >= 1300) return 'v13'; if (number >= 1200) return 'v12'; if (number >= 1100) return 'v11'; return 'v7';
}
const TARGET_ORDER = ['v7', 'v11', 'v12', 'v13', 'v14'];
// Une suite écrite pour V12 vaut aussi pour V13 et V14 (les couches héritent) — sauf les suites de structure (build, titre) propres à leur cible.
const PINNED = new Set(['v960_build', 'v921_title']);
function appliesTo(suiteName, target) { const min = minimalTarget(suiteName); if (PINNED.has(suiteName)) return min === target; return TARGET_ORDER.indexOf(target) >= TARGET_ORDER.indexOf(min) && (min !== 'v7' || target === 'v7') && (min !== 'v11' || target === 'v11'); }

const args = process.argv.slice(2);
const targetIndex = args.indexOf('--target'); const target = targetIndex >= 0 ? args[targetIndex + 1] : null;
const filterIndex = args.indexOf('--filter'); const filter = filterIndex >= 0 ? args[filterIndex + 1] : '';
const suites = fs.readdirSync(suitesDir).filter(f => /^v\d+_.*\.mjs$/.test(f)).map(f => f.replace(/\.mjs$/, '')).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
const plan = [];
suites.forEach(suite => {
    if (filter && !suite.includes(filter)) return;
    const targets = target ? [target] : [minimalTarget(suite)];
    targets.forEach(t => { if (appliesTo(suite, t)) plan.push({ suite, target: t }); });
});
if (args.includes('--list')) { plan.forEach(p => console.log(p.target.padEnd(4) + ' ' + p.suite)); process.exit(0); }
let passed = 0, failed = 0; const failures = [];
for (const { suite, target: t } of plan) {
    const file = path.join(rootDir, FILE_BY_TARGET[t]);
    if (!fs.existsSync(file)) { console.log('⏭  ' + suite + ' (' + t + ') : fichier ' + FILE_BY_TARGET[t] + ' absent'); continue; }
    const run = spawnSync(process.execPath, [path.join(suitesDir, suite + '.mjs')], { encoding: 'utf8', env: { ...process.env, SD_FILE: file, SD_ROOT: rootDir + '/' }, timeout: 300000 });
    const output = (run.stdout || '') + (run.stderr || '');
    const summary = (output.match(/\n(\d+\/\d+ OK[^\n]*)/) || [])[1] || (run.status === 0 ? 'OK' : 'ÉCHEC');
    const ok = run.status === 0;
    if (ok) passed++; else { failed++; failures.push({ suite, target: t, output }); }
    console.log((ok ? '✅ ' : '❌ ') + suite.padEnd(28) + ' ' + t.padEnd(4) + ' ' + summary);
}
// Régression V6 / V7 : les scripts de tests/regression comparent leurs échecs connus (fichier .fail) — un écart = régression.
if (!target && !filter) {
    const regressionDir = path.join(testsDir, 'regression');
    fs.readdirSync(regressionDir).filter(f => /^test_.*\.mjs$/.test(f)).sort().forEach(script => {
        const run = spawnSync(process.execPath, [path.join(regressionDir, script)], { encoding: 'utf8', env: { ...process.env, SD_ROOT: rootDir + '/' }, timeout: 300000 });
        const current = ((run.stdout || '') + (run.stderr || '')).split('\n').filter(l => l.startsWith('❌')).join('\n').trim();
        const baselinePath = path.join(regressionDir, script.replace(/\.mjs$/, '.fail'));
        const baseline = fs.existsSync(baselinePath) ? fs.readFileSync(baselinePath, 'utf8').trim() : '';
        const same = current === baseline;
        if (same) passed++; else { failed++; failures.push({ suite: script, target: 'régression', output: 'attendu :\n' + baseline + '\nobtenu :\n' + current }); }
        console.log((same ? '✅ ' : '❌ ') + script.padEnd(28) + ' rég. ' + (same ? 'identique à la référence' : 'ÉCART avec la référence'));
        plan.push({ suite: script, target: 'régression' });
    });
}
if (failures.length) { console.log('\n---- détail des échecs ----'); failures.forEach(f => { console.log('\n### ' + f.suite + ' (' + f.target + ')'); console.log(f.output.split('\n').filter(l => /❌|ERREUR|Error/.test(l)).slice(0, 12).join('\n')); }); }
console.log(`\n${passed} suite(s) OK, ${failed} en échec, ${plan.length} planifiée(s)`);
process.exit(failed ? 1 : 0);
