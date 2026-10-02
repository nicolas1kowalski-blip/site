#!/usr/bin/env node
// Prépare les sept ressources dont la version hors ligne a besoin.
//
//   node tools/hors-ligne-preparer.mjs
//
// Il faut une machine CONNECTÉE à internet, et Node.js installé. Rien d'autre : ni
// Git Bash, ni WSL, ni commande à recopier. Le script marche de la même façon sous
// Windows, sous macOS et sous Linux — c'est tout son intérêt, car les commandes
// manuelles, elles, ne s'écrivent pas pareil d'un système à l'autre.
//
// Ce qu'il fait, dans l'ordre :
//   1. installe les bibliothèques dans un dossier de travail à part ;
//   2. rassemble le moteur de données en un seul fichier ;
//   3. construit la feuille de style en ne gardant que les classes employées ;
//   4. recopie les sept fichiers dans hors-ligne/ressources/.
//
// Il peut être relancé autant de fois que nécessaire : il recommence proprement.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dossierDeTravail = path.join(racine, 'hors-ligne', 'travail');
const dossierDesRessources = path.join(racine, 'hors-ligne', 'ressources');
const pageDeReference = path.join(racine, 'StudioDataV13.html');

// Les versions sont celles que la V13 charge aujourd'hui depuis internet. Garder
// exactement les mêmes évite tout écart de comportement entre les deux versions.
const BIBLIOTHEQUES = [
    '@duckdb/duckdb-wasm@1.29.0',
    'xlsx@0.18.5',
    'chart.js@4.4.6',
    'lucide@0.474.0',
    'tailwindcss@3',
    'esbuild'
];

let etape = 0;
function annoncer(texte) {
    etape += 1;
    console.log('\n[' + etape + '/5] ' + texte);
}
function enMo(octets) {
    return (octets / 1048576).toFixed(2) + ' Mo';
}

// Sous Windows, npm est un fichier de commandes : il s'appelle « npm.cmd ». C'est
// exactement le genre de détail qui fait échouer une marche à suivre recopiée à la main.
const commandeNpm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function lancer(commande, arguments_, ou) {
    const resultat = spawnSync(commande, arguments_, { cwd: ou, stdio: 'inherit', shell: process.platform === 'win32' });
    if (resultat.error) {
        if (resultat.error.code === 'ENOENT') {
            throw new Error(
                'La commande « ' + commande + ' » est introuvable.\n' +
                    "Node.js n'est pas installé, ou bien la fenêtre a été ouverte avant son installation.\n" +
                    'Installez Node.js depuis https://nodejs.org (version 22 ou plus), puis OUVREZ UNE\n' +
                    'NOUVELLE fenêtre de commandes : celle-ci ne connaît pas encore le nouveau programme.'
            );
        }
        throw resultat.error;
    }
    if (resultat.status !== 0) {
        throw new Error('La commande « ' + commande + ' ' + arguments_.slice(0, 2).join(' ') + '… » a échoué.');
    }
}

// Charge une bibliothèque installée dans le dossier de travail. Le chemin est transformé
// en adresse de fichier : sous Windows, « C:\\... » n'est pas une adresse valide telle quelle.
async function importerDepuisLeTravail(nom) {
    const point = path.join(dossierDeTravail, 'node_modules', nom, 'lib', 'main.js');
    const chemin = fs.existsSync(point) ? point : path.join(dossierDeTravail, 'node_modules', nom, 'index.js');
    return import(pathToFileURL(chemin).href);
}

function copier(depuis, vers) {
    fs.copyFileSync(depuis, vers);
    console.log('      ✓ ' + path.basename(vers) + '  (' + enMo(fs.statSync(vers).size) + ')');
}

async function preparer() {
    if (!fs.existsSync(pageDeReference)) {
        throw new Error(
            'StudioDataV13.html est absent.\n' +
                'Construisez-la d’abord :  node build.mjs --target v13\n' +
                "La feuille de style est calculée à partir de cette page, pour n'y garder que les\n" +
                'classes réellement employées.'
        );
    }

    annoncer('Préparation du dossier de travail');
    fs.rmSync(dossierDeTravail, { recursive: true, force: true });
    fs.mkdirSync(dossierDeTravail, { recursive: true });
    fs.mkdirSync(dossierDesRessources, { recursive: true });
    // Un package.json minimal évite que npm remonte chercher un projet parent.
    fs.writeFileSync(
        path.join(dossierDeTravail, 'package.json'),
        JSON.stringify({ name: 'studio-data-ressources-hors-ligne', private: true, version: '1.0.0' }, null, 4)
    );
    console.log('      ' + dossierDeTravail);

    annoncer('Installation des bibliothèques (c’est l’étape la plus longue)');
    lancer(commandeNpm, ['install', ...BIBLIOTHEQUES, '--no-audit', '--no-fund'], dossierDeTravail);

    annoncer('Rassemblement du moteur de données en un seul fichier');
    // La partie « côté page » du moteur importe la bibliothèque Arrow : seule, elle ne
    // s'ouvrirait pas. On la rassemble donc avec tout ce dont elle dépend.
    //
    // On appelle esbuild par son interface JavaScript et non par son programme en ligne
    // de commande : selon le système, ce programme est tantôt un script, tantôt un
    // exécutable, et le lancer demanderait un traitement différent par système. Par son
    // interface, c'est le même code partout.
    fs.writeFileSync(
        path.join(dossierDeTravail, 'entree.js'),
        'import * as duckdb from "@duckdb/duckdb-wasm/dist/duckdb-browser.mjs";\nwindow.duckdb = duckdb;\n'
    );
    const esbuild = await importerDepuisLeTravail('esbuild');
    await esbuild.build({
        entryPoints: [path.join(dossierDeTravail, 'entree.js')],
        bundle: true,
        format: 'iife',
        minify: true,
        target: 'es2020',
        outfile: path.join(dossierDeTravail, 'duckdb-navigateur.js')
    });

    annoncer('Construction de la feuille de style');
    fs.writeFileSync(
        path.join(dossierDeTravail, 'tw.css'),
        '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n'
    );
    lancer(
        process.execPath,
        [
            path.join(dossierDeTravail, 'node_modules', 'tailwindcss', 'lib', 'cli.js'),
            '-i',
            'tw.css',
            '-o',
            'tailwind.css',
            '--content',
            pageDeReference,
            '--minify'
        ],
        dossierDeTravail
    );

    annoncer('Mise en place des sept ressources');
    const dans = (...morceaux) => path.join(dossierDeTravail, ...morceaux);
    const vers = nom => path.join(dossierDesRessources, nom);

    copier(dans('duckdb-navigateur.js'), vers('duckdb-navigateur.js'));
    // La variante « eh » (gestion des exceptions) plutôt que « mvp » : elle est plus
    // petite (34 Mo contre 39) et tous les navigateurs actuels la prennent.
    copier(dans('node_modules', '@duckdb', 'duckdb-wasm', 'dist', 'duckdb-browser-eh.worker.js'), vers('duckdb-ouvrier.js'));
    copier(dans('node_modules', '@duckdb', 'duckdb-wasm', 'dist', 'duckdb-eh.wasm'), vers('duckdb-moteur.wasm'));
    copier(dans('tailwind.css'), vers('tailwind.css'));
    copier(dans('node_modules', 'xlsx', 'dist', 'xlsx.full.min.js'), vers('xlsx.full.min.js'));
    copier(dans('node_modules', 'chart.js', 'dist', 'chart.umd.js'), vers('chart.umd.js'));
    copier(dans('node_modules', 'lucide', 'dist', 'umd', 'lucide.min.js'), vers('lucide.min.js'));

    // Le dossier de travail pèse plusieurs centaines de Mo et ne sert plus à rien.
    fs.rmSync(dossierDeTravail, { recursive: true, force: true });

    console.log('\nLes sept ressources sont en place dans hors-ligne/ressources/.');
    console.log('Il reste à construire la page autonome :\n');
    console.log('    node tools/hors-ligne.mjs\n');
}

try {
    await preparer();
} catch (souci) {
    console.error('\n✗ ' + souci.message + '\n');
    process.exit(1);
}
