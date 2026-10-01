#!/usr/bin/env node
// Construit une V13 qui fonctionne SANS INTERNET, en un seul fichier.
//
// La V13 ordinaire va chercher quatre choses sur internet au premier chargement :
// la feuille de style Tailwind, trois bibliothèques (tableur, graphiques, icônes),
// et le moteur de données DuckDB (WebAssembly + son ouvrier). Sans réseau, le moteur
// manque et toute la partie analyse s'arrête.
//
// Cet outil range ces quatre choses DANS le fichier. Le moteur, qui pèse 34 Mo, est
// rangé compressé (gzip) puis décompressé par le navigateur au démarrage : le fichier
// final tient autour de 15 Mo au lieu de 51.
//
//   node tools/hors-ligne.mjs
//
// Les ressources sont cherchées dans hors-ligne/ressources/. Si elles manquent, l'outil
// affiche les commandes exactes pour les obtenir.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dossierDesRessources = path.join(racine, 'hors-ligne', 'ressources');
const fichierDeSortie = path.join(racine, 'StudioDataV13-hors-ligne.html');

// Chaque ressource : le fichier attendu, son rôle, et comment l'obtenir.
const RESSOURCES = [
    { nom: 'tailwind.css', role: 'feuille de style' },
    { nom: 'xlsx.full.min.js', role: 'lecture et écriture des classeurs Excel' },
    { nom: 'chart.umd.js', role: 'graphiques' },
    { nom: 'lucide.min.js', role: 'icônes' },
    { nom: 'duckdb-navigateur.js', role: 'moteur de données, côté page' },
    { nom: 'duckdb-ouvrier.js', role: 'moteur de données, côté ouvrier' },
    { nom: 'duckdb-moteur.wasm', role: 'moteur de données, le programme lui-même' }
];

function lire(nom) {
    return fs.readFileSync(path.join(dossierDesRessources, nom));
}
function enMo(octets) {
    return (octets / 1048576).toFixed(2) + ' Mo';
}
// Compressé puis en base64 : c'est ce qui divise la taille du fichier par trois.
function comprime(octets) {
    return zlib.gzipSync(octets, { level: 9 }).toString('base64');
}
// Une balise <script> ne doit jamais contenir la suite « </script » : on la coupe.
function sansFermetureParasite(texte) {
    return String(texte).split('</script').join('<\\/script');
}

function verifierLesRessources() {
    const manquantes = RESSOURCES.filter(r => !fs.existsSync(path.join(dossierDesRessources, r.nom)));
    if (!manquantes.length) return;
    console.error('\nRessources manquantes dans ' + dossierDesRessources + ' :\n');
    manquantes.forEach(r => console.error('  ✗ ' + r.nom + '  (' + r.role + ')'));
    console.error('\nPour les obtenir, voir hors-ligne/COMMENT-OBTENIR-LES-RESSOURCES.md\n');
    process.exit(1);
}

// ---- Le remplacement des appels à internet ------------------------------------
// Chaque règle dit ce qu'elle cherche dans la page et par quoi elle le remplace.
// Si l'une d'elles ne trouve rien, on s'arrête : mieux vaut échouer que livrer une
// page qui irait encore chercher quelque chose sur internet.
function remplacer(page, quoi, parQuoi, libelle) {
    if (page.indexOf(quoi) === -1) throw new Error('Introuvable dans la page : ' + libelle);
    return page.replace(quoi, () => parQuoi);
}

function construire() {
    verifierLesRessources();
    const source = path.join(racine, 'StudioDataV13.html');
    if (!fs.existsSync(source)) throw new Error('StudioDataV13.html absent — lancez d’abord node build.mjs --target v13');
    let page = fs.readFileSync(source, 'utf8');
    const tailleDeDepart = Buffer.byteLength(page);

    // 1. La politique de sécurité : plus aucune adresse extérieure n'est autorisée.
    page = page.replace(
        /<meta http-equiv="Content-Security-Policy"[^>]*>/,
        '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; ' +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:; " +
            "style-src 'self' 'unsafe-inline'; worker-src blob:; child-src blob:; " +
            "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' data: blob:; " +
            "object-src 'none'; base-uri 'self'; form-action 'none'\">"
    );

    // 2. La feuille de style, construite une fois pour toutes au lieu d'être calculée
    //    dans le navigateur par le script de Tailwind.
    page = remplacer(
        page,
        '<script src="https://cdn.tailwindcss.com"></script>',
        '<style>' + lire('tailwind.css').toString('utf8') + '</style>',
        'le script Tailwind'
    );

    // 3. Les trois bibliothèques, recopiées dans la page.
    [
        ['xlsx@0.18.5', 'xlsx.full.min.js'],
        ['chart.js@4.4.6', 'chart.umd.js'],
        ['lucide@0.474.0', 'lucide.min.js']
    ].forEach(([marque, fichier]) => {
        const balise = page.match(new RegExp('<script src="https://cdn\\.jsdelivr\\.net[^"]*' + marque.replace('.', '\\.') + '[^>]*></script>'));
        if (!balise) throw new Error('Balise introuvable pour ' + marque);
        page = page.replace(balise[0], () => '<script>' + sansFermetureParasite(lire(fichier).toString('utf8')) + '</script>');
    });

    // 4. Le moteur de données.
    //
    // Pourquoi ce n'est pas aussi simple que les trois autres : le moteur tourne dans
    // un OUVRIER (un fil d'exécution à part), et cet ouvrier doit lire le programme
    // WebAssembly. Depuis une page ouverte sur le disque, un ouvrier n'a pas le droit
    // d'aller lire un contenu fabriqué par la page : le navigateur le lui refuse.
    //
    // On range donc le programme DANS l'ouvrier lui-même, compressé, et on pose devant
    // l'ouvrier une petite amorce qui sert ce programme quand on le lui demande. Plus
    // rien ne franchit de frontière : l'ouvrier se suffit à lui-même.
    const ouvrier = comprime(lire('duckdb-ouvrier.js'));
    const moteur = comprime(lire('duckdb-moteur.wasm'));
    // L'adresse que l'ouvrier réclamera. Il faut une adresse COMPLÈTE : un simple nom
    // de fichier ne peut pas être interprété depuis une page ouverte sur le disque.
    // On fabrique donc une adresse vide et valide, et l'amorce la reconnaît.
    const amorce = [
        'function sdDecompresser(base64) {',
        '    var brut = atob(base64);',
        '    var octets = new Uint8Array(brut.length);',
        '    for (var i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i);',
        "    var flux = new Blob([octets]).stream().pipeThrough(new DecompressionStream('gzip'));",
        '    return new Response(flux).arrayBuffer();',
        '}',
        'var sdLireDehors = self.fetch.bind(self);',
        'self.fetch = function (entree, options) {',
        "    var adresse = typeof entree === 'string' ? entree : (entree && entree.url) || '';",
        '    if (adresse === SD_ADRESSE) {',
        '        return sdDecompresser(SD_MOTEUR_GZ).then(function (octets) {',
        "            return new Response(octets, { headers: { 'Content-Type': 'application/wasm' } });",
        '        });',
        '    }',
        '    return sdLireDehors(entree, options);',
        '};'
    ].join('\n');

    const socleDuMoteur =
        '<script>' +
        sansFermetureParasite(lire('duckdb-navigateur.js').toString('utf8')) +
        '\n</script>\n<script>\n' +
        '// Le moteur de données est rangé ici, compressé. Rien ne part sur internet.\n' +
        'const SD_OUVRIER_GZ = "' + ouvrier + '";\n' +
        'const SD_MOTEUR_GZ = "' + moteur + '";\n' +
        'const SD_AMORCE = ' + JSON.stringify(amorce) + ';\n' +
        'async function sdTexteDecompresse(base64) {\n' +
        '    const brut = atob(base64);\n' +
        '    const octets = new Uint8Array(brut.length);\n' +
        '    for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i);\n' +
        "    const flux = new Blob([octets]).stream().pipeThrough(new DecompressionStream('gzip'));\n" +
        '    return new Response(flux).text();\n' +
        '}\n' +
        'window.sdRessourcesHorsLigne = async function () {\n' +
        '    const ouvrier = await sdTexteDecompresse(SD_OUVRIER_GZ);\n' +
        "    const adresse = URL.createObjectURL(new Blob([new Uint8Array(0)], { type: 'application/wasm' }));\n" +
        '    const source = [\n' +
        '        \'const SD_MOTEUR_GZ = "\' + SD_MOTEUR_GZ + \'";\',\n' +
        "        'const SD_ADRESSE = ' + JSON.stringify(adresse) + ';',\n" +
        '        SD_AMORCE,\n' +
        '        ouvrier\n' +
        "    ].join('\\n');\n" +
        '    return {\n' +
        "        mainWorker: URL.createObjectURL(new Blob([source], { type: 'text/javascript' })),\n" +
        '        mainModule: adresse,\n' +
        '        pthreadWorker: null\n' +
        '    };\n' +
        '};\n' +
        '</script>';

    page = remplacer(
        page,
        "import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm';",
        'const duckdb = window.duckdb;',
        "l'import du moteur de données"
    );
    page = remplacer(
        page,
        'const bundles = duckdb.getJsDelivrBundles();\n            const bundle = await duckdb.selectBundle(bundles);',
        'const bundle = await window.sdRessourcesHorsLigne();',
        'le choix de la version du moteur'
    );
    page = remplacer(
        page,
        'const workerUrl = URL.createObjectURL(new Blob(\n                [`importScripts(${JSON.stringify(bundle.mainWorker)});`],\n                { type: \'text/javascript\' }\n            ));',
        'const workerUrl = bundle.mainWorker;',
        "l'ouverture de l'ouvrier"
    );

    // Le socle du moteur se pose juste avant le script qui s'en sert.
    page = remplacer(page, '<script type="module">', socleDuMoteur + '\n    <script type="module">', 'le bloc du moteur');

    // 5. Dernier contrôle : plus aucune adresse extérieure ne doit subsister.
    const restantes = (page.match(/(src|href)="https?:\/\/[^"]*"/g) || []).filter(a => !/schema\.org|www\.w3\.org/.test(a));
    if (restantes.length) throw new Error('Des adresses extérieures subsistent :\n  ' + restantes.join('\n  '));

    fs.writeFileSync(fichierDeSortie, page);
    console.log('StudioDataV13-hors-ligne.html construit.');
    console.log('  page de départ : ' + enMo(tailleDeDepart));
    console.log('  page autonome  : ' + enMo(Buffer.byteLength(page)));
    console.log('  aucune adresse extérieure ne subsiste.');
}

construire();
