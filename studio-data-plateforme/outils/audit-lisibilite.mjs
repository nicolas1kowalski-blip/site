// Audit de lisibilité rejouable : noms d'une ou deux lettres ou abrégés (cfg, tmp, col…), fichiers sans en-tête,
// fonctions de plus de 60 lignes. Lancer depuis studio-data-plateforme : node outils/audit-lisibilite.mjs
import fs from 'node:fs';
import path from 'node:path';

const racine = process.cwd();
const DOSSIERS_IGNORES = new Set(['node_modules', 'dist', 'donnees', '.angular', 'captures']);
const ABREVIATIONS = /^(cfg|conf|cnt|idx|tmp|obj|arr|str|num|val|res|req|err|fn|cb|el|elt|btn|msg|nb|src|dst|tbl|col)$/;
const LONGUEUR_MAXIMALE_FONCTION = 60;

function lister(dossier) {
    const resultats = [];
    for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
        const chemin = path.join(dossier, entree.name);
        if (entree.isDirectory()) {
            if (!DOSSIERS_IGNORES.has(entree.name)) resultats.push(...lister(chemin));
        } else if (/\.(ts|mjs)$/.test(entree.name)) resultats.push(chemin);
    }
    return resultats;
}

/** Identifiants déclarés dans un fichier : const/let, fonctions, paramètres de fonctions fléchées. */
function identifiantsDeclares(texteBrut) {
    // Les chaînes de caractères (SQL, messages) ne déclarent rien : elles sont retirées avant l'analyse.
    const texte = texteBrut.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, "''");
    const identifiants = new Set();
    for (const correspondance of texte.matchAll(/\b(?:const|let)\s+([a-zA-Z_$][\w$]*)/g)) identifiants.add(correspondance[1]);
    for (const correspondance of texte.matchAll(/\bfunction\s+([a-zA-Z_$][\w$]*)/g)) identifiants.add(correspondance[1]);
    for (const correspondance of texte.matchAll(/\(([^()]*)\)\s*(?::\s*[^{=]+)?=>/g)) {
        for (const parametre of correspondance[1].split(',')) {
            const nom = parametre.trim().split(/[:\s=]/)[0];
            if (nom) identifiants.add(nom);
        }
    }
    for (const correspondance of texte.matchAll(/(?<![\w.])([a-zA-Z_$][\w$]*)\s*=>/g)) identifiants.add(correspondance[1]);
    return identifiants;
}

/** Fonctions et méthodes dont le corps dépasse la longueur maximale (comptage d'accolades). */
function fonctionsTropLongues(lignes, fichierRelatif) {
    const resultats = [];
    const debutDeFonction =
        /^\s{4}(?:async\s+)?(?:private\s+)?(?:static\s+)?[a-zA-Z_]\w*\s*\([^)]*\)[^{;]*\{\s*$|^(?:export\s+)?(?:async\s+)?function\s+\w+/;
    for (let debut = 0; debut < lignes.length; debut++) {
        if (!debutDeFonction.test(lignes[debut])) continue;
        let profondeur = 0;
        let fin = debut;
        for (let courant = debut; courant < lignes.length; courant++) {
            profondeur += (lignes[courant].match(/\{/g) || []).length - (lignes[courant].match(/\}/g) || []).length;
            if (profondeur <= 0 && courant > debut) {
                fin = courant;
                break;
            }
        }
        if (fin - debut > LONGUEUR_MAXIMALE_FONCTION)
            resultats.push(`${fichierRelatif}:${debut + 1} (${fin - debut} lignes) ${lignes[debut].trim().slice(0, 60)}`);
    }
    return resultats;
}

const nomsCourts = {};
const sansEntete = [];
const longues = [];
for (const fichier of lister(racine)) {
    const texte = fs.readFileSync(fichier, 'utf8');
    const fichierRelatif = path.relative(racine, fichier);
    if (!/^(\/\*\*|\/\/)/.test(texte.trimStart()) && !texte.startsWith('#!')) sansEntete.push(fichierRelatif);
    for (const nom of identifiantsDeclares(texte)) {
        if ((nom.length <= 2 && nom !== '_' && nom !== 'id') || ABREVIATIONS.test(nom)) (nomsCourts[nom] ||= []).push(fichierRelatif);
    }
    longues.push(...fonctionsTropLongues(texte.split('\n'), fichierRelatif));
}

console.log('--- noms courts ou abrégés (id exclu) ---');
for (const [nom, fichiers] of Object.entries(nomsCourts).sort((premier, second) => second[1].length - premier[1].length)) {
    console.log(nom.padEnd(6), fichiers.length, [...new Set(fichiers)].slice(0, 4).join(', '));
}
console.log('--- fichiers sans en-tête ---');
sansEntete.forEach(fichier => console.log(fichier));
console.log(`--- fonctions de plus de ${LONGUEUR_MAXIMALE_FONCTION} lignes ---`);
longues.forEach(ligne => console.log(ligne));
const anomalies = Object.keys(nomsCourts).length + sansEntete.length + longues.length;
console.log(`\n${anomalies} anomalie(s)`);
process.exit(anomalies ? 1 : 0);
