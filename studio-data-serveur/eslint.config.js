// ESLint (config plate) pour le projet serveur : code Node (serveur, tests, constructeur) et couche client.
// La couche client est assemblée avec les sources de studio-data : ses globales viennent du même fichier généré.
//   node /opt/node22/lib/node_modules/eslint/bin/eslint.js -c studio-data-serveur/eslint.config.js studio-data-serveur
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const globalesStudio = JSON.parse(fs.readFileSync(path.join(ici, '..', 'studio-data', 'eslint.globals.json'), 'utf8'));
const globalesNavigateur = Object.fromEntries(
    [
        'window',
        'document',
        'fetch',
        'Blob',
        'File',
        'FileReader',
        'FileSystemHandle',
        'TextDecoder',
        'TextEncoder',
        'URL',
        'console',
        'setTimeout',
        'clearTimeout',
        'navigator',
        'Symbol',
        'ArrayBuffer',
        'Uint8Array',
        'Promise',
        'Object',
        'Array',
        'String',
        'Number',
        'Math',
        'Date',
        'JSON',
        'Error',
        'RegExp',
        'Map',
        'Set',
        'escapeHTML'
    ].map(nom => [nom, 'readonly'])
);
// Globales déclarées par la couche serveur elle-même (fonctions, constantes et classes de premier niveau).
const dossierCouche = path.join(ici, 'client', 'src', '98-couche-serveur');
const globalesCouche = {};
for (const fichier of fs.readdirSync(dossierCouche).filter(nom => nom.endsWith('.js'))) {
    const texte = fs.readFileSync(path.join(dossierCouche, fichier), 'utf8');
    for (const [, nom] of texte.matchAll(/^ {8}(?:async\s+)?(?:function|class|const|let)\s+([A-Za-z_$][\w$]*)/gm))
        globalesCouche[nom] = 'writable';
}
const globalesNode = Object.fromEntries(
    [
        'process',
        'console',
        'Buffer',
        'setTimeout',
        'clearTimeout',
        'URL',
        'TextDecoder',
        'fetch',
        'Promise',
        'Symbol'
    ].map(nom => [nom, 'readonly'])
);
const regles = {
    'no-undef': 'error',
    'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
    'no-redeclare': ['error', { builtinGlobals: false }],
    'no-dupe-keys': 'error',
    'no-func-assign': 'error'
};
export default [
    { ignores: ['node_modules/**', 'client/dist/**', 'donnees/**'] },
    {
        files: ['serveur/**/*.mjs', 'tests/**/*.mjs', 'client/*.mjs', 'eslint.config.js'],
        languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: globalesNode },
        rules: regles
    },
    {
        // Les tests évaluent du code dans la page (page.evaluate) : les globales de l'application y sont légitimes.
        files: ['tests/**/*.mjs'],
        rules: { 'no-undef': 'off' }
    },
    {
        files: ['client/src/**/*.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'script',
            globals: { ...globalesNavigateur, ...globalesStudio, ...globalesCouche }
        },
        rules: { ...regles, 'no-unused-vars': 'off' }
    }
];
