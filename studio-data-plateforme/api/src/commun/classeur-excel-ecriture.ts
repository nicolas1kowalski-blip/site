/**
 * Écriture d'un classeur Excel (.xlsx) sans dépendance : un .xlsx est une archive ZIP de fichiers XML (types de
 * contenu, relations, classeur, une feuille par onglet). Les cellules sont écrites en « chaînes en ligne »
 * (inlineStr) ou en nombres, ce qui suffit aux exports de l'application (doublons, résultats d'audit).
 * L'archive ZIP est écrite ici aussi (en-têtes locaux, répertoire central, compression deflate de Node).
 */
import { deflateRawSync } from 'node:zlib';

export type FeuilleAEcrire = { nom: string; lignes: unknown[][] };

const NOM_FEUILLE_MAXIMUM = 31;
const CARACTERES_INTERDITS_FEUILLE = /[\\/?*[\]:]/g;

/** Caractères de contrôle interdits en XML (tout ce qui est sous 32, sauf tabulation, saut de ligne et retour chariot). */
const estUnCaractereInterdit = (code: number) => code < 32 && code !== 9 && code !== 10 && code !== 13;

function echapperXml(texte: string): string {
    return texte
        .split('')
        .filter(caractere => !estUnCaractereInterdit(caractere.charCodeAt(0)))
        .join('')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Référence de colonne Excel : 0 → A, 25 → Z, 26 → AA… */
export function lettreColonne(index: number): string {
    let reste = index + 1;
    let lettres = '';
    while (reste > 0) {
        const modulo = (reste - 1) % 26;
        lettres = String.fromCharCode(65 + modulo) + lettres;
        reste = Math.floor((reste - 1) / 26);
    }
    return lettres;
}

function celluleXml(reference: string, valeur: unknown): string {
    if (valeur === null || valeur === undefined || valeur === '') return '';
    if (typeof valeur === 'number' && Number.isFinite(valeur)) return `<c r="${reference}"><v>${valeur}</v></c>`;
    return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${echapperXml(String(valeur))}</t></is></c>`;
}

/** XML d'une feuille : une ligne <row> par ligne, cellules nommées A1, B1… */
export function feuilleXml(lignes: unknown[][]): string {
    const corps = lignes
        .map((ligne, indexLigne) => {
            const cellules = ligne
                .map((valeur, indexColonne) => celluleXml(lettreColonne(indexColonne) + (indexLigne + 1), valeur))
                .join('');
            return `<row r="${indexLigne + 1}">${cellules}</row>`;
        })
        .join('');
    return (
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${corps}</sheetData></worksheet>`
    );
}

function nomFeuilleSur(nom: string, index: number, dejaPris: Set<string>): string {
    let base = nom.replace(CARACTERES_INTERDITS_FEUILLE, ' ').trim().slice(0, NOM_FEUILLE_MAXIMUM) || `Feuille${index + 1}`;
    let candidat = base;
    let numero = 2;
    while (dejaPris.has(candidat.toLowerCase())) {
        const suffixe = ` (${numero++})`;
        candidat = base.slice(0, NOM_FEUILLE_MAXIMUM - suffixe.length) + suffixe;
    }
    dejaPris.add(candidat.toLowerCase());
    base = candidat;
    return base;
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

export function crc32(donnees: Buffer): number {
    let crc = 0xffffffff;
    for (const octet of donnees) crc = TABLE_CRC[(crc ^ octet) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

/** Date et heure au format MS-DOS (deux mots de 16 bits) qu'attend un en-tête ZIP. */
function dateDos(date: Date): { heure: number; jour: number } {
    return {
        heure: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
        jour: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
}

/** Archive ZIP (méthode deflate) des fichiers donnés, dans l'ordre. */
export function archiverZip(fichiers: { chemin: string; contenu: Buffer }[]): Buffer {
    const { heure, jour } = dateDos(new Date());
    const locaux: Buffer[] = [];
    const central: Buffer[] = [];
    let decalage = 0;
    for (const fichier of fichiers) {
        const nom = Buffer.from(fichier.chemin, 'utf8');
        const comprime = deflateRawSync(fichier.contenu);
        const somme = crc32(fichier.contenu);
        const enTete = Buffer.alloc(30);
        enTete.writeUInt32LE(0x04034b50, 0);
        enTete.writeUInt16LE(20, 4);
        enTete.writeUInt16LE(0x0800, 6); // noms en UTF-8
        enTete.writeUInt16LE(8, 8); // deflate
        enTete.writeUInt16LE(heure, 10);
        enTete.writeUInt16LE(jour, 12);
        enTete.writeUInt32LE(somme, 14);
        enTete.writeUInt32LE(comprime.length, 18);
        enTete.writeUInt32LE(fichier.contenu.length, 22);
        enTete.writeUInt16LE(nom.length, 26);
        enTete.writeUInt16LE(0, 28);
        locaux.push(enTete, nom, comprime);
        const entree = Buffer.alloc(46);
        entree.writeUInt32LE(0x02014b50, 0);
        entree.writeUInt16LE(20, 4);
        entree.writeUInt16LE(20, 6);
        entree.writeUInt16LE(0x0800, 8);
        entree.writeUInt16LE(8, 10);
        entree.writeUInt16LE(heure, 12);
        entree.writeUInt16LE(jour, 14);
        entree.writeUInt32LE(somme, 16);
        entree.writeUInt32LE(comprime.length, 20);
        entree.writeUInt32LE(fichier.contenu.length, 24);
        entree.writeUInt16LE(nom.length, 28);
        entree.writeUInt16LE(0, 30);
        entree.writeUInt16LE(0, 32);
        entree.writeUInt16LE(0, 34);
        entree.writeUInt16LE(0, 36);
        entree.writeUInt32LE(0, 38);
        entree.writeUInt32LE(decalage, 42);
        central.push(entree, nom);
        decalage += enTete.length + nom.length + comprime.length;
    }
    const tailleCentral = central.reduce((somme, morceau) => somme + morceau.length, 0);
    const fin = Buffer.alloc(22);
    fin.writeUInt32LE(0x06054b50, 0);
    fin.writeUInt16LE(0, 4);
    fin.writeUInt16LE(0, 6);
    fin.writeUInt16LE(fichiers.length, 8);
    fin.writeUInt16LE(fichiers.length, 10);
    fin.writeUInt32LE(tailleCentral, 12);
    fin.writeUInt32LE(decalage, 16);
    fin.writeUInt16LE(0, 20);
    return Buffer.concat([...locaux, ...central, fin]);
}

/** Le classeur complet (.xlsx) : une feuille par entrée, dans l'ordre. */
export function classeurExcel(feuilles: FeuilleAEcrire[]): Buffer {
    const dejaPris = new Set<string>();
    const noms = feuilles.map((feuille, index) => nomFeuilleSur(feuille.nom, index, dejaPris));
    const declarations = feuilles
        .map(
            (_, index) =>
                `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
        )
        .join('');
    const typesContenu =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        declarations +
        `</Types>`;
    const relationsRacine =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`;
    const classeur =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
        noms.map((nom, index) => `<sheet name="${echapperXml(nom)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('') +
        `</sheets></workbook>`;
    const relationsClasseur =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        feuilles
            .map(
                (_, index) =>
                    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
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
