#!/usr/bin/env node
// Mise en forme Prettier de tout le projet, avec les mêmes options que studio-data (120 colonnes, 4 espaces,
// guillemets simples). Les fichiers de la couche client sont indentés de 8 espaces (niveau du <script> assemblé) :
// ils sont désindentés avant Prettier puis réindentés, comme le fait studio-data/tools/formater.mjs.
//   node formater.mjs            -> réécrit les fichiers
//   node formater.mjs --check    -> code retour 1 si un fichier n'est pas conforme
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const verifier = process.argv.includes('--check');
const cheminPrettier = process.env.PRETTIER || '/opt/node22/lib/node_modules/prettier/index.mjs';
const prettier = await import(cheminPrettier);
const options = {
    printWidth: 120,
    tabWidth: 4,
    singleQuote: true,
    quoteProps: 'preserve',
    trailingComma: 'none',
    arrowParens: 'avoid'
};

function lister(dossier, filtre) {
    const resultats = [];
    for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
        const chemin = path.join(dossier, entree.name);
        if (entree.isDirectory()) {
            if (!['node_modules', 'dist', 'donnees', 'captures'].includes(entree.name))
                resultats.push(...lister(chemin, filtre));
        } else if (filtre(entree.name)) resultats.push(chemin);
    }
    return resultats;
}
const fichiersNode = [
    ...lister(path.join(ici, 'serveur'), n => n.endsWith('.mjs')),
    ...lister(path.join(ici, 'tests'), n => n.endsWith('.mjs')),
    path.join(ici, 'client', 'construire.mjs'),
    path.join(ici, 'formater.mjs'),
    path.join(ici, 'eslint.config.js')
];
const fichiersCouche = lister(path.join(ici, 'client', 'src', '98-couche-serveur'), n => n.endsWith('.js'));

const INDENTATION = '        ';
function desindenter(texte) {
    return texte
        .split('\n')
        .map(ligne => (ligne.startsWith(INDENTATION) ? ligne.slice(INDENTATION.length) : ligne))
        .join('\n');
}
function reindenter(texte) {
    return texte
        .split('\n')
        .map(ligne => (ligne.trim() ? INDENTATION + ligne : ligne))
        .join('\n');
}

let nonConformes = 0;
async function traiter(chemin, couche) {
    const original = fs.readFileSync(chemin, 'utf8');
    const entree = couche ? desindenter(original) : original;
    let sortie = await prettier.format(entree, { ...options, parser: 'babel' });
    if (couche) sortie = reindenter(sortie);
    if (sortie === original) return;
    nonConformes++;
    if (verifier) console.log('Non conforme : ' + path.relative(ici, chemin));
    else {
        fs.writeFileSync(chemin, sortie);
        console.log('Mis en forme : ' + path.relative(ici, chemin));
    }
}
for (const chemin of fichiersNode) await traiter(chemin, false);
for (const chemin of fichiersCouche) await traiter(chemin, true);
console.log(verifier ? `${nonConformes} fichier(s) non conforme(s)` : `${nonConformes} fichier(s) réécrit(s)`);
process.exit(verifier && nonConformes ? 1 : 0);
