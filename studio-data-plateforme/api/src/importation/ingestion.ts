/**
 * Ingestion d'un fichier déposé en table DuckDB : quel lecteur selon l'extension, quelle requête de création,
 * comment fusionner plusieurs fichiers ou sources en une seule table (colonnes alignées par nom). Fonctions pures.
 * Convention partagée avec l'application classique : le fichier déposé s'appelle src_<id>, la table t_<id>, et
 * chaque table porte un numéro de ligne technique __rn.
 */
import { identifiantSql, litteralSql } from '../espaces/moteur-duckdb';

export const EXTENSIONS_ACCEPTEES = ['csv', 'txt', 'tsv', 'parquet', 'json', 'ndjson', 'xlsx'] as const;
export type ExtensionAcceptee = (typeof EXTENSIONS_ACCEPTEES)[number];

export function extensionDe(nomFichier: string): string {
    return (nomFichier.split('.').pop() || '').toLowerCase();
}

export function extensionAcceptee(extension: string): extension is ExtensionAcceptee {
    return (EXTENSIONS_ACCEPTEES as readonly string[]).includes(extension);
}

/** Type de source enregistré dans les métadonnées (même vocabulaire que l'application classique). */
export function typeSourceDe(extension: string): string {
    if (extension === 'tsv') return 'txt';
    if (extension === 'ndjson') return 'json';
    return extension;
}

/** Paramètres de lecture d'un CSV (mêmes noms que l'application classique : delim, enc, quote, ignoreErrors). */
export type OptionsLectureCsv = { delim?: string; enc?: string; quote?: string; ignoreErrors?: boolean };
export const SEPARATEURS_CSV = {
    '': 'automatique',
    ';': 'point-virgule (;)',
    ',': 'virgule (,)',
    '|': 'barre verticale (|)',
    '\t': 'tabulation'
} as const;
export const ENCODAGES_CSV = { 'UTF-8': 'UTF-8 (recommandé)', 'ISO-8859-1': 'Windows / ANSI (Latin-1)', 'UTF-16': 'UTF-16' } as const;

/** Expression DuckDB qui lit le fichier ; les CSV sont lus tout en texte pour ne rien perdre. */
export function lectureDuckDB(nomFichier: string, extension: string, options: OptionsLectureCsv = {}): string {
    const nom = litteralSql(nomFichier);
    if (extension === 'parquet') return `read_parquet(${nom})`;
    if (extension === 'json' || extension === 'ndjson') return `read_json_auto(${nom})`;
    let lecture = `read_csv_auto(${nom}, header=true, all_varchar=true`;
    if (options.delim) lecture += `, delim=${litteralSql(options.delim)}`;
    if (options.enc === 'ISO-8859-1') lecture += `, encoding='latin-1'`;
    else if (options.enc === 'UTF-16') lecture += `, encoding='utf-16'`;
    if (options.quote === 'none') lecture += `, quote=''`;
    if (options.ignoreErrors) lecture += `, ignore_errors=true`;
    return lecture + ')';
}

export function nomTableDuckDB(idSource: string): string {
    return 't_' + idSource;
}

/** Crée (ou remplace) la table d'une source à partir d'une lecture de fichier. */
export function sqlCreationTable(idSource: string, lecture: string): string {
    return `CREATE OR REPLACE TABLE ${identifiantSql(nomTableDuckDB(idSource))} AS SELECT row_number() OVER () AS __rn, * FROM ${lecture}`;
}

/**
 * Fusion : les fichiers et les sources existantes sont empilés (UNION ALL BY NAME : colonnes alignées par nom,
 * absentes = NULL) ; la colonne « fichier_origine » garde la provenance de chaque ligne.
 */
export function sqlFusion(idSource: string, morceaux: { lecture: string; origine: string }[]): string {
    if (!morceaux.length) throw new Error('Fusion : aucun fichier ni source à fusionner.');
    const selections = morceaux.map(morceau => `SELECT ${litteralSql(morceau.origine)} AS fichier_origine, * FROM ${morceau.lecture}`);
    return `CREATE OR REPLACE TABLE ${identifiantSql(nomTableDuckDB(idSource))} AS SELECT row_number() OVER () AS __rn, * FROM (${selections.join('\nUNION ALL BY NAME\n')})`;
}

/** Lecture d'une source déjà chargée, sans son numéro de ligne (pour une fusion). */
export function lectureSourceExistante(idSource: string): string {
    return `(SELECT * EXCLUDE (__rn) FROM ${identifiantSql(nomTableDuckDB(idSource))})`;
}

/** Nom de source proposé pour une adresse : le dernier segment du chemin, ou « import ». */
export function nomDepuisAdresse(adresse: string): string {
    try {
        const segment = new URL(adresse).pathname.split('/').filter(Boolean).pop() || '';
        return decodeURIComponent(segment) || 'import';
    } catch {
        return 'import';
    }
}

/** Une adresse Google Sheets devient l'adresse d'export CSV de son onglet. */
export function adresseExportGoogleSheets(adresse: string): string {
    const feuille = /docs\.google\.com\/spreadsheets\/d\/([\w-]+)/.exec(adresse);
    if (!feuille) return adresse;
    const onglet = (/[#&?]gid=(\d+)/.exec(adresse) || [])[1] || '0';
    return `https://docs.google.com/spreadsheets/d/${feuille[1]}/export?format=csv&gid=${onglet}`;
}

/** Suit un chemin « a.b.c » dans un document JSON et renvoie le tableau visé. */
export function tableauJsonAuChemin(texte: string, chemin: string): unknown[] {
    let courant: unknown = JSON.parse(texte);
    for (const segment of chemin
        .split('.')
        .map(morceau => morceau.trim())
        .filter(Boolean)) {
        if (!courant || typeof courant !== 'object') break;
        courant = (courant as Record<string, unknown>)[segment];
    }
    if (!Array.isArray(courant)) throw new Error(`Le chemin « ${chemin} » ne pointe pas vers un tableau JSON.`);
    return courant;
}
