#!/usr/bin/env node
// Application classique (l'interface actuelle, complète) servie par la plateforme sous /classique/.
// Elle est assemblée exactement comme dans studio-data-serveur (mêmes sources, même couche serveur) : le
// constructeur de studio-data-serveur/client est réutilisé tel quel, et sa sortie copiée ici (dist/).
//   node web-classique/construire.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const projetClassique = path.resolve(ici, '..', '..', 'studio-data-serveur');
const constructeur = path.join(projetClassique, 'client', 'construire.mjs');
if (!fs.existsSync(constructeur)) {
    console.error('Constructeur introuvable : ' + constructeur + ' (le dossier studio-data-serveur doit être présent à côté).');
    process.exit(2);
}
if (!fs.existsSync(path.join(projetClassique, 'node_modules'))) {
    const installation = spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: projetClassique, stdio: 'inherit' });
    if (installation.status !== 0) process.exit(installation.status || 2);
}
const construction = spawnSync(process.execPath, [constructeur], { cwd: projetClassique, stdio: 'inherit' });
if (construction.status !== 0) process.exit(construction.status || 2);
const source = path.join(projetClassique, 'client', 'dist');
const cible = path.join(ici, 'dist');
fs.rmSync(cible, { recursive: true, force: true });
fs.cpSync(source, cible, { recursive: true });
console.log('Application classique copiée dans web-classique/dist (' + fs.readdirSync(cible).join(', ') + ')');
