/**
 * Moteur analytique : DuckDB natif, une base persistante par espace de travail.
 *
 * Contrat avec les fronts : executer(sql) → { colonnes: [{ nom, type }], lignes: [[…]] } avec des valeurs
 * sérialisables en JSON (les BIGINT deviennent des chaînes, comme dans l'application classique) ; flux(sql)
 * produit les mêmes lignes par paquets pour les lectures complètes (exports, audits).
 */
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';
import { erreurRequete, erreurTropVolumineux } from '../commun/erreurs';

/**
 * Réglages que l'application classique envoie pour piloter DuckDB-Wasm (mémoire, répertoire de débordement,
 * threads). Sur le serveur ils viennent de la configuration : acceptés sans être exécutés, sinon
 * « SET temp_directory='' » couperait le débordement disque au premier gros calcul.
 */
const REGLAGES_NAVIGATEUR =
    /^\s*(SET|PRAGMA|RESET)\s+(GLOBAL\s+|SESSION\s+)?(temp_directory|memory_limit|threads|preserve_insertion_order)\b/i;

export type ColonneResultat = { nom: string; type: string };
export type ResultatSql = { colonnes: ColonneResultat[]; lignes: unknown[][]; ignoree?: boolean };
export type PaquetFlux = { colonnes?: ColonneResultat[]; lignes: unknown[][] };

export type OptionsMoteur = {
    cheminBase: string;
    dossierFichiers: string;
    threads?: string;
    memoire?: string;
    limiteLignes?: number;
};

export class MoteurDuckDB {
    private instance: DuckDBInstance | null = null;
    private connexion: DuckDBConnection | null = null;
    /** Les requêtes sont enchaînées sur la connexion principale : jamais deux en même temps. */
    private fileAttente: Promise<unknown> = Promise.resolve();
    requetesExecutees = 0;

    constructor(private readonly options: OptionsMoteur) {}

    async ouvrir(): Promise<this> {
        const reglages: Record<string, string> = {};
        if (this.options.threads) reglages.threads = this.options.threads;
        if (this.options.memoire) reglages.memory_limit = this.options.memoire;
        this.instance = await DuckDBInstance.create(this.options.cheminBase, reglages);
        this.connexion = await this.instance.connect();
        // Les chemins relatifs des requêtes (read_csv_auto('src_tb_x')) sont résolus dans le dossier des fichiers.
        await this.connexion.run(`SET GLOBAL file_search_path=${litteralSql(this.options.dossierFichiers)}`);
        return this;
    }

    async fermer(): Promise<void> {
        try {
            this.connexion?.closeSync();
            this.instance?.closeSync();
        } finally {
            this.connexion = null;
            this.instance = null;
        }
    }

    executer(sql: string): Promise<ResultatSql> {
        const tache = this.fileAttente.then(() => this.executerMaintenant(sql));
        this.fileAttente = tache.then(
            () => undefined,
            () => undefined
        );
        return tache;
    }

    private async executerMaintenant(sql: string): Promise<ResultatSql> {
        if (typeof sql !== 'string' || !sql.trim()) throw erreurRequete('Requête SQL vide.');
        if (REGLAGES_NAVIGATEUR.test(sql)) return { colonnes: [], lignes: [], ignoree: true };
        if (!this.connexion) throw new Error('Moteur DuckDB non ouvert.');
        this.requetesExecutees++;
        let resultat;
        try {
            resultat = await this.connexion.runAndReadAll(sql);
        } catch (erreur) {
            throw erreurRequete(messageDe(erreur));
        }
        const limite = this.options.limiteLignes ?? 1_000_000;
        if (resultat.currentRowCount > limite) {
            throw erreurTropVolumineux(
                `Résultat trop volumineux (${resultat.currentRowCount} lignes, limite ${limite}) : ajoutez une clause LIMIT ou utilisez la lecture en flux.`
            );
        }
        return { colonnes: colonnesDe(resultat), lignes: resultat.getRowsJson() as unknown[][] };
    }

    /** Lecture en flux sur une connexion dédiée, pour ne pas bloquer la file principale. */
    async *flux(sql: string): AsyncGenerator<PaquetFlux> {
        if (typeof sql !== 'string' || !sql.trim()) throw erreurRequete('Requête SQL vide.');
        if (!this.instance) throw new Error('Moteur DuckDB non ouvert.');
        const connexion = await this.instance.connect();
        try {
            let lecteur;
            try {
                lecteur = await connexion.stream(sql);
            } catch (erreur) {
                throw erreurRequete(messageDe(erreur));
            }
            yield { colonnes: colonnesDe(lecteur), lignes: [] };
            for (;;) {
                const paquet = await lecteur.fetchChunk();
                if (!paquet || paquet.rowCount === 0) break;
                yield { lignes: paquet.getRows().map(ligne => ligne.map(valeurJson)) };
            }
        } finally {
            connexion.closeSync();
        }
    }

    async version(): Promise<string> {
        const { lignes } = await this.executer('SELECT version() AS v');
        return String(lignes[0][0]);
    }

    async tables(): Promise<{ nom: string; type: 'table' | 'vue' }[]> {
        const { lignes } = await this.executer(
            "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'main' ORDER BY 1"
        );
        return lignes.map(([nom, type]) => ({ nom: String(nom), type: type === 'VIEW' ? 'vue' : 'table' }));
    }

    /** Supprime une table ou une vue quel que soit son genre (DROP TABLE échoue sur une vue et inversement). */
    async abandonner(nomTable: string): Promise<void> {
        await this.executer(`DROP TABLE IF EXISTS ${identifiantSql(nomTable)}`).catch(() => undefined);
        await this.executer(`DROP VIEW IF EXISTS ${identifiantSql(nomTable)}`).catch(() => undefined);
    }
}

function colonnesDe(resultat: { columnNames(): string[]; columnTypes(): unknown[] }): ColonneResultat[] {
    const types = resultat.columnTypes();
    return resultat.columnNames().map((nom, index) => ({ nom, type: String(types[index]) }));
}

/** Même conversion que getRowsJson() pour les paquets de flux : BIGINT en chaîne, valeurs DuckDB en texte ou tableau. */
function valeurJson(valeur: unknown): unknown {
    if (valeur === null || valeur === undefined) return null;
    if (typeof valeur === 'bigint') return valeur.toString();
    if (typeof valeur === 'object') {
        const objet = valeur as { toJson?: () => unknown; items?: unknown[] };
        if (typeof objet.toJson === 'function') return objet.toJson();
        if (Array.isArray(objet.items)) return objet.items.map(valeurJson);
        return String(valeur);
    }
    return valeur;
}

function messageDe(erreur: unknown): string {
    return String((erreur as { message?: string })?.message || erreur);
}

export function litteralSql(texte: string): string {
    return "'" + String(texte).replace(/'/g, "''") + "'";
}

export function identifiantSql(nom: string): string {
    return '"' + String(nom).replace(/"/g, '""') + '"';
}
