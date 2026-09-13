/**
 * Lecture d'une archive ZIP sans dépendance : répertoire central, entrées, extraction (méthodes « stockée »
 * et « deflate », les seules produites par les outils courants). Sert aux livraisons ZIP (plusieurs fichiers de
 * données d'un coup) et aux classeurs Excel (un .xlsx est une archive ZIP de fichiers XML).
 * Fonctions pures sur des Buffers ; le fichier est lu en mémoire (la taille est bornée par le dépôt).
 */
import zlib from 'node:zlib';

export type EntreeZip = {
    /** Chemin complet dans l'archive (séparateur /). */
    nom: string;
    /** Premier dossier du chemin, ou « (racine) ». */
    dossier: string;
    /** Nom du fichier sans son dossier. */
    nomCourt: string;
    methode: number;
    tailleCompressee: number;
    tailleReelle: number;
    positionEnTeteLocale: number;
    modifieLe: string;
};

const SIGNATURE_FIN_REPERTOIRE = 0x06054b50;
const SIGNATURE_ENTREE_REPERTOIRE = 0x02014b50;
const SIGNATURE_EN_TETE_LOCALE = 0x04034b50;
const TAILLE_FIN_REPERTOIRE = 22;
const TAILLE_COMMENTAIRE_MAXIMALE = 65535;
const METHODE_STOCKEE = 0;
const METHODE_DEFLATE = 8;

/** Date DOS (deux mots de 16 bits) → ISO. */
function dateDos(heure: number, jour: number): string {
    const date = new Date(
        1980 + ((jour >> 9) & 0x7f),
        ((jour >> 5) & 0xf) - 1,
        jour & 0x1f,
        (heure >> 11) & 0x1f,
        (heure >> 5) & 0x3f,
        (heure & 0x1f) * 2
    );
    return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

/** Liste les fichiers de l'archive (les dossiers sont ignorés). */
export function listerEntreesZip(archive: Buffer): EntreeZip[] {
    let position = archive.length - TAILLE_FIN_REPERTOIRE;
    const minimum = Math.max(0, position - TAILLE_COMMENTAIRE_MAXIMALE);
    while (position >= minimum && archive.readUInt32LE(position) !== SIGNATURE_FIN_REPERTOIRE) position--;
    if (position < minimum || position < 0) throw new Error('ZIP invalide : répertoire central introuvable.');
    const nombreEntrees = archive.readUInt16LE(position + 10);
    let decalage = archive.readUInt32LE(position + 16);
    if (decalage === 0xffffffff) throw new Error('Archive ZIP64 non prise en charge (plus de 4 Go).');
    const entrees: EntreeZip[] = [];
    for (let index = 0; index < nombreEntrees; index++) {
        if (archive.readUInt32LE(decalage) !== SIGNATURE_ENTREE_REPERTOIRE) break;
        const methode = archive.readUInt16LE(decalage + 10);
        const heure = archive.readUInt16LE(decalage + 12);
        const jour = archive.readUInt16LE(decalage + 14);
        const tailleCompressee = archive.readUInt32LE(decalage + 20);
        const tailleReelle = archive.readUInt32LE(decalage + 24);
        const longueurNom = archive.readUInt16LE(decalage + 28);
        const longueurExtra = archive.readUInt16LE(decalage + 30);
        const longueurCommentaire = archive.readUInt16LE(decalage + 32);
        const positionEnTeteLocale = archive.readUInt32LE(decalage + 42);
        const nom = archive.toString('utf8', decalage + 46, decalage + 46 + longueurNom).replace(/\\/g, '/');
        if (!nom.endsWith('/')) {
            const morceaux = nom.split('/');
            entrees.push({
                nom,
                dossier: morceaux.length > 1 ? morceaux[0] : '(racine)',
                nomCourt: morceaux[morceaux.length - 1],
                methode,
                tailleCompressee,
                tailleReelle,
                positionEnTeteLocale,
                modifieLe: dateDos(heure, jour)
            });
        }
        decalage += 46 + longueurNom + longueurExtra + longueurCommentaire;
    }
    return entrees;
}

/** Contenu décompressé d'une entrée. */
export function extraireEntreeZip(archive: Buffer, entree: EntreeZip): Buffer {
    const debut = entree.positionEnTeteLocale;
    if (archive.readUInt32LE(debut) !== SIGNATURE_EN_TETE_LOCALE) throw new Error(`Entrée ZIP corrompue : ${entree.nom}`);
    const longueurNom = archive.readUInt16LE(debut + 26);
    const longueurExtra = archive.readUInt16LE(debut + 28);
    const donnees = archive.subarray(
        debut + 30 + longueurNom + longueurExtra,
        debut + 30 + longueurNom + longueurExtra + entree.tailleCompressee
    );
    if (entree.methode === METHODE_STOCKEE) return Buffer.from(donnees);
    if (entree.methode === METHODE_DEFLATE) return zlib.inflateRawSync(donnees);
    throw new Error(`Méthode de compression ${entree.methode} non prise en charge (${entree.nom}).`);
}

/** Lit une entrée par son chemin, ou null si elle n'existe pas. */
export function lireEntreeZip(archive: Buffer, entrees: EntreeZip[], chemin: string): Buffer | null {
    const cible = chemin.replace(/^\//, '');
    const entree = entrees.find(candidate => candidate.nom === cible);
    return entree ? extraireEntreeZip(archive, entree) : null;
}

/** Fabrique une archive ZIP (méthode deflate) à partir de fichiers en mémoire : utile aux tests et aux exports. */
export function fabriquerZip(fichiers: { nom: string; contenu: Buffer | string }[]): Buffer {
    const morceauxLocaux: Buffer[] = [];
    const morceauxCentraux: Buffer[] = [];
    let decalage = 0;
    for (const fichier of fichiers) {
        const contenu = Buffer.isBuffer(fichier.contenu) ? fichier.contenu : Buffer.from(fichier.contenu, 'utf8');
        const compresse = zlib.deflateRawSync(contenu);
        const nom = Buffer.from(fichier.nom, 'utf8');
        const crc = crc32(contenu);
        const enTeteLocale = Buffer.alloc(30);
        enTeteLocale.writeUInt32LE(SIGNATURE_EN_TETE_LOCALE, 0);
        enTeteLocale.writeUInt16LE(20, 4);
        enTeteLocale.writeUInt16LE(METHODE_DEFLATE, 8);
        enTeteLocale.writeUInt32LE(crc, 14);
        enTeteLocale.writeUInt32LE(compresse.length, 18);
        enTeteLocale.writeUInt32LE(contenu.length, 22);
        enTeteLocale.writeUInt16LE(nom.length, 26);
        const entreeCentrale = Buffer.alloc(46);
        entreeCentrale.writeUInt32LE(SIGNATURE_ENTREE_REPERTOIRE, 0);
        entreeCentrale.writeUInt16LE(20, 4);
        entreeCentrale.writeUInt16LE(20, 6);
        entreeCentrale.writeUInt16LE(METHODE_DEFLATE, 10);
        entreeCentrale.writeUInt32LE(crc, 16);
        entreeCentrale.writeUInt32LE(compresse.length, 20);
        entreeCentrale.writeUInt32LE(contenu.length, 24);
        entreeCentrale.writeUInt16LE(nom.length, 28);
        entreeCentrale.writeUInt32LE(decalage, 42);
        morceauxLocaux.push(enTeteLocale, nom, compresse);
        morceauxCentraux.push(entreeCentrale, nom);
        decalage += enTeteLocale.length + nom.length + compresse.length;
    }
    const tailleCentrale = morceauxCentraux.reduce((somme, morceau) => somme + morceau.length, 0);
    const fin = Buffer.alloc(TAILLE_FIN_REPERTOIRE);
    fin.writeUInt32LE(SIGNATURE_FIN_REPERTOIRE, 0);
    fin.writeUInt16LE(fichiers.length, 8);
    fin.writeUInt16LE(fichiers.length, 10);
    fin.writeUInt32LE(tailleCentrale, 12);
    fin.writeUInt32LE(decalage, 16);
    return Buffer.concat([...morceauxLocaux, ...morceauxCentraux, fin]);
}

let TABLE_CRC: Uint32Array | null = null;
function crc32(donnees: Buffer): number {
    if (!TABLE_CRC) {
        TABLE_CRC = new Uint32Array(256);
        for (let octet = 0; octet < 256; octet++) {
            let valeur = octet;
            for (let bit = 0; bit < 8; bit++) valeur = valeur & 1 ? 0xedb88320 ^ (valeur >>> 1) : valeur >>> 1;
            TABLE_CRC[octet] = valeur >>> 0;
        }
    }
    let crc = 0xffffffff;
    for (const octet of donnees) crc = TABLE_CRC[(crc ^ octet) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}
