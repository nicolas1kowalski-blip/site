/**
 * Écriture des fichiers du jeu de démonstration : CSV (point-virgule, UTF-8, guillemets seulement quand il le
 * faut), archive ZIP (pour la livraison mensuelle et le jeu complet) et classeur Excel .xlsx (pour l'import
 * Excel côté serveur). Le ZIP et le classeur sont écrits sans aucune dépendance, sur le même principe que
 * `api/src/commun/classeur-excel-ecriture.ts` : un .xlsx est une archive ZIP de fichiers XML.
 */
import fs from 'node:fs';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';

const SEPARATEUR = ';';

/** Une cellule CSV : entre guillemets seulement si elle contient un séparateur, un guillemet ou un saut de ligne. */
function celluleCsv(valeur) {
    const texte = valeur === null || valeur === undefined ? '' : String(valeur);
    return /[;"\r\n]/.test(texte) ? '"' + texte.replace(/"/g, '""') + '"' : texte;
}

/** Le texte complet d'un fichier CSV : une ligne d'en-têtes puis les lignes de données. */
export function texteCsv(colonnes, lignes) {
    const enTete = colonnes.map(celluleCsv).join(SEPARATEUR);
    const corps = lignes.map(ligne => ligne.map(celluleCsv).join(SEPARATEUR));
    return [enTete, ...corps].join('\n') + '\n';
}

/** Écrit un CSV et renvoie de quoi remplir le manifeste (nom, nombre de lignes, taille). */
export function ecrireCsv(dossier, nomFichier, colonnes, lignes) {
    const contenu = texteCsv(colonnes, lignes);
    fs.writeFileSync(path.join(dossier, nomFichier), contenu, 'utf8');
    return { fichier: nomFichier, colonnes: colonnes.length, lignes: lignes.length, octets: Buffer.byteLength(contenu) };
}

// ---- archive ZIP ----
const TABLE_CRC = (() => {
    const table = new Uint32Array(256);
    for (let octet = 0; octet < 256; octet++) {
        let valeur = octet;
        for (let bit = 0; bit < 8; bit++) valeur = valeur & 1 ? 0xedb88320 ^ (valeur >>> 1) : valeur >>> 1;
        table[octet] = valeur >>> 0;
    }
    return table;
})();

function crc32(donnees) {
    let controle = 0xffffffff;
    for (const octet of donnees) controle = TABLE_CRC[(controle ^ octet) & 0xff] ^ (controle >>> 8);
    return (controle ^ 0xffffffff) >>> 0;
}

/** Date et heure au format MS-DOS attendu par les en-têtes ZIP (fixées pour que l'archive soit reproductible). */
const HEURE_DOS = 0;
const JOUR_DOS = ((2026 - 1980) << 9) | (1 << 5) | 1;

function enTeteLocal(nom, comprime, original, somme) {
    const enTete = Buffer.alloc(30);
    enTete.writeUInt32LE(0x04034b50, 0);
    enTete.writeUInt16LE(20, 4);
    enTete.writeUInt16LE(0x0800, 6);
    enTete.writeUInt16LE(8, 8);
    enTete.writeUInt16LE(HEURE_DOS, 10);
    enTete.writeUInt16LE(JOUR_DOS, 12);
    enTete.writeUInt32LE(somme, 14);
    enTete.writeUInt32LE(comprime, 18);
    enTete.writeUInt32LE(original, 22);
    enTete.writeUInt16LE(nom.length, 26);
    return enTete;
}

function entreeCentrale(nom, comprime, original, somme, decalage) {
    const entree = Buffer.alloc(46);
    entree.writeUInt32LE(0x02014b50, 0);
    entree.writeUInt16LE(20, 4);
    entree.writeUInt16LE(20, 6);
    entree.writeUInt16LE(0x0800, 8);
    entree.writeUInt16LE(8, 10);
    entree.writeUInt16LE(HEURE_DOS, 12);
    entree.writeUInt16LE(JOUR_DOS, 14);
    entree.writeUInt32LE(somme, 16);
    entree.writeUInt32LE(comprime, 20);
    entree.writeUInt32LE(original, 24);
    entree.writeUInt16LE(nom.length, 28);
    entree.writeUInt32LE(decalage, 42);
    return entree;
}

/** Archive ZIP (méthode deflate) des fichiers donnés, dans l'ordre : { chemin, contenu } où contenu est un Buffer. */
export function archiverZip(fichiers) {
    const locaux = [];
    const central = [];
    let decalage = 0;
    for (const fichier of fichiers) {
        const nom = Buffer.from(fichier.chemin, 'utf8');
        const comprime = deflateRawSync(fichier.contenu);
        const somme = crc32(fichier.contenu);
        const enTete = enTeteLocal(nom, comprime.length, fichier.contenu.length, somme);
        locaux.push(enTete, nom, comprime);
        central.push(entreeCentrale(nom, comprime.length, fichier.contenu.length, somme, decalage), nom);
        decalage += enTete.length + nom.length + comprime.length;
    }
    const tailleCentral = central.reduce((somme, morceau) => somme + morceau.length, 0);
    const fin = Buffer.alloc(22);
    fin.writeUInt32LE(0x06054b50, 0);
    fin.writeUInt16LE(fichiers.length, 8);
    fin.writeUInt16LE(fichiers.length, 10);
    fin.writeUInt32LE(tailleCentral, 12);
    fin.writeUInt32LE(decalage, 16);
    return Buffer.concat([...locaux, ...central, fin]);
}

// ---- classeur Excel ----
function echapperXml(texte) {
    return texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Référence de colonne Excel : 0 → A, 25 → Z, 26 → AA… */
function lettreColonne(index) {
    let reste = index + 1;
    let lettres = '';
    while (reste > 0) {
        const modulo = (reste - 1) % 26;
        lettres = String.fromCharCode(65 + modulo) + lettres;
        reste = Math.floor((reste - 1) / 26);
    }
    return lettres;
}

/** Une feuille en XML : les nombres sont écrits comme nombres, le reste comme texte « en ligne ». */
function feuilleXml(lignes) {
    const corps = lignes
        .map((ligne, indexLigne) => {
            const cellules = ligne
                .map((valeur, indexColonne) => {
                    const reference = lettreColonne(indexColonne) + (indexLigne + 1);
                    if (valeur === null || valeur === undefined || valeur === '') return '';
                    if (typeof valeur === 'number' && Number.isFinite(valeur)) return `<c r="${reference}"><v>${valeur}</v></c>`;
                    return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${echapperXml(String(valeur))}</t></is></c>`;
                })
                .join('');
            return `<row r="${indexLigne + 1}">${cellules}</row>`;
        })
        .join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${corps}</sheetData></worksheet>`;
}

/** Classeur .xlsx complet : une feuille par entrée { nom, lignes }. */
export function classeurExcel(feuilles) {
    const espaceOuvert = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const declarations = feuilles
        .map(
            (feuille, index) =>
                `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
        )
        .join('');
    const typesContenu =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${declarations}</Types>`;
    const relationsRacine = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${espaceOuvert}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
    const classeur =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${espaceOuvert}"><sheets>` +
        feuilles
            .map((feuille, index) => `<sheet name="${echapperXml(feuille.nom)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
            .join('') +
        `</sheets></workbook>`;
    const relationsClasseur =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        feuilles
            .map(
                (feuille, index) =>
                    `<Relationship Id="rId${index + 1}" Type="${espaceOuvert}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
            )
            .join('') +
        `</Relationships>`;
    return archiverZip([
        { chemin: '[Content_Types].xml', contenu: Buffer.from(typesContenu, 'utf8') },
        { chemin: '_rels/.rels', contenu: Buffer.from(relationsRacine, 'utf8') },
        { chemin: 'xl/workbook.xml', contenu: Buffer.from(classeur, 'utf8') },
        { chemin: 'xl/_rels/workbook.xml.rels', contenu: Buffer.from(relationsClasseur, 'utf8') },
        ...feuilles.map((feuille, index) => ({
            chemin: `xl/worksheets/sheet${index + 1}.xml`,
            contenu: Buffer.from(feuilleXml(feuille.lignes), 'utf8')
        }))
    ]);
}

/** Écrit un fichier binaire (ZIP, classeur) et renvoie de quoi remplir le manifeste. */
export function ecrireBinaire(dossier, nomFichier, contenu) {
    fs.writeFileSync(path.join(dossier, nomFichier), contenu);
    return { fichier: nomFichier, octets: contenu.length };
}
