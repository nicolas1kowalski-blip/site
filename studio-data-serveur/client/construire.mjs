#!/usr/bin/env node
// Construction du front : le HTML est assemblé à partir des sources de l'application mono-fichier
// (../studio-data/src, manifeste V14) avec trois différences, décrites dans client/manifest-serveur.json :
//   1. l'en-tête (CDN + DuckDB-Wasm) est remplacé par src/00-entete-serveur.html (bibliothèques locales) ;
//   2. les styles et scripts de la couche serveur (src/98-couche-serveur) sont ajoutés en fin d'assemblage ;
//   3. Tailwind est compilé sur le HTML produit, et les bibliothèques sont copiées depuis node_modules.
// Les marqueurs Studio.beginModule / Studio.registerModules sont posés comme dans studio-data/build.mjs, si bien
// que le panneau « Architecture du code » de l'application montre aussi la couche serveur.
//   node client/construire.mjs            -> client/dist/index.html, tailwind.css, vendor/
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dossierClient = path.dirname(fileURLToPath(import.meta.url));
const racineProjet = path.resolve(dossierClient, '..');
const dossierSortie = path.join(dossierClient, 'dist');
const manifesteServeur = JSON.parse(fs.readFileSync(path.join(dossierClient, 'manifest-serveur.json'), 'utf8'));
const cheminManifesteBase = path.resolve(racineProjet, manifesteServeur.base);
const dossierSourcesBase = path.dirname(cheminManifesteBase);
const dossierSourcesServeur = path.join(dossierClient, 'src');
const { measureFile } = await import(path.join(dossierSourcesBase, '..', 'tools', 'lisibilite-mesurer.mjs'));

const FICHIER_NOYAU_STUDIO = '10-noyau/00-studio.js';
const LIGNE_COUCHE_V14 = "['96-couche-v14', 'V14']";
const LIGNE_COUCHE_SERVEUR = "['96-couche-v14', 'V14'],\n                ['98-couche-serveur', 'Serveur']";
const BIBLIOTHEQUES = [
    ['xlsx/dist/xlsx.full.min.js', 'xlsx.full.min.js'],
    ['chart.js/dist/chart.umd.js', 'chart.umd.js'],
    ['lucide/dist/umd/lucide.min.js', 'lucide.min.js']
];

function lireBase() {
    if (!fs.existsSync(cheminManifesteBase)) {
        console.error(
            'Manifeste de base introuvable : ' +
                cheminManifesteBase +
                ' (les sources de studio-data doivent être présentes à côté).'
        );
        process.exit(2);
    }
    return JSON.parse(fs.readFileSync(cheminManifesteBase, 'utf8'));
}

// Liste ordonnée des parties : { file (nom logique), role, chemin (fichier réel) }.
function composerParties(base) {
    const parties = [];
    for (const partie of base.parts) {
        const remplacement = manifesteServeur.remplacements[partie.file];
        parties.push({
            file: partie.file,
            role: remplacement ? partie.role + ' — remplacé par ' + remplacement : partie.role || '',
            chemin: remplacement ? path.join(dossierClient, remplacement) : path.join(dossierSourcesBase, partie.file)
        });
    }
    const dernierStyle = parties.map(p => p.file.endsWith('.css')).lastIndexOf(true);
    const styles = manifesteServeur.stylesSupplementaires.map(p => ({
        ...p,
        chemin: path.join(dossierSourcesServeur, p.file)
    }));
    parties.splice(dernierStyle + 1, 0, ...styles);
    for (const partie of manifesteServeur.scriptsSupplementaires)
        parties.push({ ...partie, chemin: path.join(dossierSourcesServeur, partie.file) });
    return parties;
}

function fonctionsDeclarees(texteJs) {
    return [...texteJs.matchAll(/^ {8}(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/gm)].map(m => m[1]);
}

function assembler(parties) {
    let html = '';
    let script = '';
    const modules = [];
    let noyauCharge = false;
    for (const partie of parties) {
        if (!fs.existsSync(partie.chemin)) {
            console.error('Fichier manquant : ' + partie.chemin);
            process.exit(2);
        }
        let texte = fs.readFileSync(partie.chemin, 'utf8');
        if (!partie.file.endsWith('.js')) {
            html += texte;
            continue;
        }
        if (partie.file === FICHIER_NOYAU_STUDIO) {
            if (!texte.includes(LIGNE_COUCHE_V14)) {
                console.error('Patch impossible : la table des couches de ' + FICHIER_NOYAU_STUDIO + ' a changé.');
                process.exit(2);
            }
            texte = texte.replace(LIGNE_COUCHE_V14, LIGNE_COUCHE_SERVEUR);
        }
        if (noyauCharge) script += `        Studio.beginModule('${partie.file}');\n`;
        script += texte;
        if (partie.file === FICHIER_NOYAU_STUDIO) noyauCharge = true;
        const metrics = measureFile(texte);
        delete metrics.longLines;
        modules.push({ file: partie.file, functions: fonctionsDeclarees(texte), metrics });
    }
    script += `        Studio.beginModule('(build)');\n        Studio.registerModules(${JSON.stringify(modules)});\n`;
    return { html: html + '    <script>\n' + script + '</script>\n</body>\n</html>\n', modules };
}

function copierBibliotheques() {
    const dossierVendor = path.join(dossierSortie, 'vendor');
    fs.mkdirSync(dossierVendor, { recursive: true });
    for (const [source, cible] of BIBLIOTHEQUES) {
        const chemin = path.join(racineProjet, 'node_modules', source);
        if (!fs.existsSync(chemin)) {
            console.error('Bibliothèque absente : ' + chemin + ' — lancez « npm install ».');
            process.exit(2);
        }
        fs.copyFileSync(chemin, path.join(dossierVendor, cible));
    }
}

function compilerTailwind() {
    const cli = path.join(racineProjet, 'node_modules', 'tailwindcss', 'lib', 'cli.js');
    const resultat = spawnSync(
        process.execPath,
        [
            cli,
            '-c',
            path.join(dossierClient, 'tailwind.config.cjs'),
            '-i',
            path.join(dossierSourcesServeur, 'tailwind.css'),
            '-o',
            path.join(dossierSortie, 'tailwind.css'),
            '--minify'
        ],
        { encoding: 'utf8', cwd: racineProjet }
    );
    if (resultat.status !== 0) {
        console.error('Compilation Tailwind échouée :\n' + (resultat.stderr || resultat.stdout));
        process.exit(2);
    }
}

const base = lireBase();
const parties = composerParties(base);
const { html, modules } = assembler(parties);
fs.mkdirSync(dossierSortie, { recursive: true });
fs.writeFileSync(path.join(dossierSortie, 'index.html'), html);
copierBibliotheques();
compilerTailwind();
const version = (html.match(/const V14_VERSION = '([^']+)'/) || [])[1] || '?';
const versionServeur = (html.match(/const SERVEUR_VERSION = '([^']+)'/) || [])[1] || '?';
const tailleCss = fs.statSync(path.join(dossierSortie, 'tailwind.css')).size;
console.log(
    `Écrit client/dist/index.html (${(html.length / 1048576).toFixed(2)} Mo, application ${version}, couche serveur ${versionServeur}, ${modules.length} modules JS) ; tailwind.css ${(tailleCss / 1024).toFixed(0)} Ko ; ${BIBLIOTHEQUES.length} bibliothèques copiées.`
);
