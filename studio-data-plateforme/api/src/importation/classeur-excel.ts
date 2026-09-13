/**
 * Lecture d'un classeur Excel (.xlsx) côté serveur, sans dépendance : l'archive ZIP contient la liste des
 * feuilles (workbook.xml et ses relations), les chaînes partagées (sharedStrings.xml), les styles (pour
 * reconnaître les dates) et une feuille XML par onglet. Chaque feuille devient un tableau de lignes de texte,
 * puis un CSV que DuckDB lit comme n'importe quel fichier déposé.
 * Limites assumées : pas de formules recalculées (la valeur en cache est prise), pas d'ancien format .xls.
 */
import { EntreeZip, lireEntreeZip, listerEntreesZip } from './archive-zip';

export type FeuilleExcel = { nom: string; lignes: string[][] };

/** Formats numériques intégrés d'Excel qui désignent une date ou une heure. */
const FORMATS_DATE_INTEGRES = new Set([
    14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58
]);

function decoderEntites(texte: string): string {
    return texte
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
        .replace(/&amp;/g, '&');
}

/** Texte d'un élément (<t>, éventuellement en plusieurs « runs » <r><t>). */
function texteDesRuns(fragment: string): string {
    const morceaux = [...fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(correspondance => decoderEntites(correspondance[1]));
    return morceaux.join('');
}

function chainesPartagees(archive: Buffer, entrees: EntreeZip[]): string[] {
    const contenu = lireEntreeZip(archive, entrees, 'xl/sharedStrings.xml');
    if (!contenu) return [];
    return [...contenu.toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(correspondance => texteDesRuns(correspondance[1]));
}

/** Pour chaque style de cellule (index dans cellXfs), vrai si son format numérique est une date. */
function stylesDate(archive: Buffer, entrees: EntreeZip[]): boolean[] {
    const contenu = lireEntreeZip(archive, entrees, 'xl/styles.xml');
    if (!contenu) return [];
    const xml = contenu.toString('utf8');
    const formatsPersonnalises = new Set<number>();
    for (const correspondance of xml.matchAll(/<numFmt\s+[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
        const code = decoderEntites(correspondance[2])
            .replace(/\[[^\]]*\]/g, '')
            .replace(/"[^"]*"/g, '');
        if (/[dmyhs]/i.test(code) && !/#|0\.0|%/.test(code)) formatsPersonnalises.add(Number(correspondance[1]));
    }
    const bloc = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
    if (!bloc) return [];
    return [...bloc[1].matchAll(/<xf\b[^>]*>/g)].map(correspondance => {
        const identifiant = Number((/numFmtId="(\d+)"/.exec(correspondance[0]) || [])[1] || 0);
        return FORMATS_DATE_INTEGRES.has(identifiant) || formatsPersonnalises.has(identifiant);
    });
}

/** Numéro de série Excel (jours depuis 1900, système 1900) → texte ISO, date seule si l'heure est nulle. */
export function dateDepuisSerieExcel(serie: number): string {
    const millisecondes = Math.round((serie - 25569) * 86400 * 1000);
    const date = new Date(millisecondes);
    if (Number.isNaN(date.getTime())) return String(serie);
    const iso = date.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.slice(0, 19).replace('T', ' ');
}

/** Lettres de colonne (A, B… AA) → index à partir de 0. */
function indexColonne(reference: string): number {
    const lettres = reference.replace(/\d+$/, '');
    let index = 0;
    for (const lettre of lettres) index = index * 26 + (lettre.charCodeAt(0) - 64);
    return index - 1;
}

/** Les feuilles du classeur, dans l'ordre des onglets, avec le chemin de leur fichier XML. */
function feuillesDuClasseur(archive: Buffer, entrees: EntreeZip[]): { nom: string; chemin: string }[] {
    const classeur = lireEntreeZip(archive, entrees, 'xl/workbook.xml');
    const relations = lireEntreeZip(archive, entrees, 'xl/_rels/workbook.xml.rels');
    if (!classeur || !relations) throw new Error('Classeur Excel invalide : structure workbook.xml absente.');
    const cibles = new Map<string, string>();
    for (const relation of relations.toString('utf8').matchAll(/<Relationship\b[^>]*>/g)) {
        const identifiant = (/\bId="([^"]+)"/.exec(relation[0]) || [])[1];
        const cible = (/\bTarget="([^"]+)"/.exec(relation[0]) || [])[1];
        if (identifiant && cible) cibles.set(identifiant, cible.startsWith('/') ? cible.slice(1) : 'xl/' + cible);
    }
    const feuilles: { nom: string; chemin: string }[] = [];
    for (const feuille of classeur.toString('utf8').matchAll(/<sheet\b[^>]*>/g)) {
        const nom = decoderEntites((/\bname="([^"]*)"/.exec(feuille[0]) || [])[1] || '');
        const relation = (/\br:id="([^"]+)"/.exec(feuille[0]) || /\bid="([^"]+)"/.exec(feuille[0]) || [])[1];
        const chemin = relation ? cibles.get(relation) : undefined;
        if (nom && chemin) feuilles.push({ nom, chemin });
    }
    return feuilles;
}

/** Valeur textuelle d'une cellule selon son type (chaîne partagée, texte en ligne, booléen, nombre ou date). */
function valeurCellule(cellule: string, chaines: string[], styles: boolean[]): string {
    const type = (/\bt="([^"]+)"/.exec(cellule) || [])[1] || 'n';
    const style = Number((/\bs="(\d+)"/.exec(cellule) || [])[1] || -1);
    if (type === 'inlineStr') return texteDesRuns(cellule);
    const brut = (/<v>([\s\S]*?)<\/v>/.exec(cellule) || [])[1];
    if (brut === undefined) return '';
    if (type === 's') return chaines[Number(brut)] ?? '';
    if (type === 'b') return brut === '1' ? 'VRAI' : 'FAUX';
    if (type === 'str' || type === 'e') return decoderEntites(brut);
    const nombre = Number(brut);
    if (Number.isFinite(nombre) && style >= 0 && styles[style]) return dateDepuisSerieExcel(nombre);
    return decoderEntites(brut);
}

/** Lignes d'une feuille : tableau rectangulaire de textes (les cellules absentes sont vides). */
function lignesDeLaFeuille(xml: string, chaines: string[], styles: boolean[]): string[][] {
    const lignes: string[][] = [];
    for (const ligne of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
        const cellules: string[] = [];
        for (const cellule of ligne[1].matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
            const reference = (/\br="([A-Z]+)\d+"/.exec(cellule[1]) || [])[1];
            const index = reference ? indexColonne(reference) : cellules.length;
            while (cellules.length < index) cellules.push('');
            cellules[index] = cellule[2] ? valeurCellule(cellule[1] + '>' + cellule[2], chaines, styles) : '';
        }
        lignes.push(cellules);
    }
    const largeur = Math.max(0, ...lignes.map(ligne => ligne.length));
    for (const ligne of lignes) while (ligne.length < largeur) ligne.push('');
    // Les lignes entièrement vides en fin de feuille (mise en forme sans contenu) sont retirées.
    while (lignes.length && lignes[lignes.length - 1].every(valeur => valeur === '')) lignes.pop();
    return lignes;
}

/** Noms des feuilles, sans lire leur contenu. */
export function nomsDesFeuilles(classeur: Buffer): string[] {
    return feuillesDuClasseur(classeur, listerEntreesZip(classeur)).map(feuille => feuille.nom);
}

/** Lit une feuille (par nom, ou la première) : ses lignes de texte. */
export function lireFeuilleExcel(classeur: Buffer, nomFeuille?: string): FeuilleExcel {
    const entrees = listerEntreesZip(classeur);
    const feuilles = feuillesDuClasseur(classeur, entrees);
    if (!feuilles.length) throw new Error('Classeur Excel sans feuille.');
    const feuille = nomFeuille ? feuilles.find(candidate => candidate.nom === nomFeuille) : feuilles[0];
    if (!feuille)
        throw new Error(`Feuille « ${nomFeuille} » introuvable (feuilles : ${feuilles.map(candidate => candidate.nom).join(', ')}).`);
    const xml = lireEntreeZip(archiveOuErreur(classeur), entrees, feuille.chemin);
    if (!xml) throw new Error(`Feuille « ${feuille.nom} » illisible.`);
    return {
        nom: feuille.nom,
        lignes: lignesDeLaFeuille(xml.toString('utf8'), chainesPartagees(classeur, entrees), stylesDate(classeur, entrees))
    };
}

function archiveOuErreur(classeur: Buffer): Buffer {
    if (!classeur.length) throw new Error('Classeur vide.');
    return classeur;
}

/** Une feuille en CSV (point-virgule, guillemets doublés), première ligne = en-têtes. */
export function feuilleEnCsv(feuille: FeuilleExcel): string {
    const echapper = (valeur: string) => (/[;"\r\n]/.test(valeur) ? '"' + valeur.replace(/"/g, '""') + '"' : valeur);
    return feuille.lignes.map(ligne => ligne.map(echapper).join(';')).join('\n') + '\n';
}
