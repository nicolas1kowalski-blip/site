#!/usr/bin/env node
// La version hors ligne fait-elle TOUT ce que fait la V13 ordinaire ?
//
//   node tests/parite-hors-ligne.mjs
//
// La suite v1350_hors_ligne prouve que la page s'ouvre et que le moteur démarre sans
// réseau. C'est nécessaire, ce n'est pas suffisant : cela ne dit rien des 28 écrans.
//
// Ce lanceur-ci fait passer à la version hors ligne TOUTES les suites écrites pour la
// V13 ordinaire. Si un seul écran s'était abîmé en rangeant les ressources dans le
// fichier, il le dirait.
//
// Pourquoi il n'est pas utile de remettre le navigateur hors ligne ici : l'outil de
// construction s'arrête s'il reste la moindre adresse extérieure dans la page produite.
// Il n'y a donc rien que cette page PUISSE aller chercher. Le fait qu'elle ne sorte
// jamais est prouvé à part, par v1350_hors_ligne, qui refuse toute adresse http.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dossierDesTests = path.dirname(fileURLToPath(import.meta.url));
const racine = path.join(dossierDesTests, '..');
const fichierHorsLigne = path.join(racine, 'StudioDataV13-hors-ligne.html');

if (!fs.existsSync(fichierHorsLigne)) {
    console.log('⏭  StudioDataV13-hors-ligne.html absent — lancez node tools/hors-ligne.mjs');
    process.exit(0);
}

// Les suites applicables à la V13, moins celle qui teste le hors-ligne lui-même.
const plan = spawnSync(process.execPath, [path.join(dossierDesTests, 'run.mjs'), '--target', 'v13', '--list'], {
    encoding: 'utf8'
})
    .stdout.split('\n')
    .map(ligne => ligne.trim().split(/\s+/)[1])
    .filter(suite => suite && suite !== 'v1350_hors_ligne');

let reussis = 0;
let total = 0;
const enEchec = [];

for (const suite of plan) {
    const execution = spawnSync(process.execPath, [path.join(dossierDesTests, 'suites', suite + '.mjs')], {
        encoding: 'utf8',
        env: { ...process.env, SD_FILE: fichierHorsLigne, SD_ROOT: racine + '/' },
        timeout: 400000
    });
    const bilan = (execution.stdout || '').match(/(\d+)\/(\d+) OK/g);
    if (!bilan) {
        console.log('❌ ' + suite + ' : aucun résultat');
        enEchec.push(suite);
        continue;
    }
    const [, ok, sur] = bilan[bilan.length - 1].match(/(\d+)\/(\d+)/);
    reussis += Number(ok);
    total += Number(sur);
    const complet = ok === sur;
    if (!complet) enEchec.push(suite);
    console.log((complet ? '✅ ' : '❌ ') + suite.padEnd(24) + ok + '/' + sur);
}

console.log('\n' + reussis + '/' + total + ' OK sur la version hors ligne, ' + plan.length + ' suites.');
if (enEchec.length) console.log('Suites en échec : ' + enEchec.join(', '));
process.exit(enEchec.length ? 1 : 0);
