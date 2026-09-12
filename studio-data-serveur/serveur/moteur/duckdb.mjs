// Moteur SQL : DuckDB natif (@duckdb/node-api), base persistante sur disque. C'est lui qui remplace
// DuckDB-Wasm du navigateur : multi-cœurs, mémoire de la machine, débordement disque automatique,
// tables conservées d'une session à l'autre sans ré-ingestion.
//
// Contrat avec le front : executer(sql) renvoie { colonnes: [{ nom, type }], lignes: [[…]] } avec des
// valeurs sérialisables en JSON (les BIGINT deviennent des chaînes, comme dans l'application d'origine) ;
// flux(sql) produit les mêmes lignes par paquets, pour les lectures complètes (exports, audits).
import { DuckDBInstance } from '@duckdb/node-api';
import { erreurRequete, erreurTropVolumineux } from '../erreurs.mjs';

// Réglages que l'application navigateur envoie pour piloter DuckDB-Wasm (limite mémoire, répertoire de
// débordement, threads). Sur le serveur ils sont pilotés par la configuration : on les accepte sans les exécuter,
// sinon « SET temp_directory='' » couperait le débordement disque au premier gros calcul.
const REGLAGES_NAVIGATEUR =
    /^\s*(SET|PRAGMA|RESET)\s+(GLOBAL\s+|SESSION\s+)?(temp_directory|memory_limit|threads|preserve_insertion_order)\b/i;

export class MoteurDuckDB {
    /**
     * @param {object} options
     * @param {string} options.cheminBase        Fichier .duckdb (créé au premier démarrage).
     * @param {string} options.dossierFichiers   Dossier résolu pour les chemins relatifs (file_search_path).
     * @param {string} [options.threads]         Nombre de threads ('' = automatique).
     * @param {string} [options.memoire]         Limite mémoire DuckDB ('' = 80 % de la RAM).
     * @param {number} [options.limiteLignes]    Lignes maximales renvoyées par executer().
     */
    constructor({ cheminBase, dossierFichiers, threads = '', memoire = '', limiteLignes = 1000000 }) {
        this.cheminBase = cheminBase;
        this.dossierFichiers = dossierFichiers;
        this.threads = threads;
        this.memoire = memoire;
        this.limiteLignes = limiteLignes;
        this.instance = null;
        this.connexion = null;
        this.fileAttente = Promise.resolve();
        this.requetesExecutees = 0;
    }

    async ouvrir() {
        const options = {};
        if (this.threads) options.threads = String(this.threads);
        if (this.memoire) options.memory_limit = String(this.memoire);
        this.instance = await DuckDBInstance.create(this.cheminBase, options);
        this.connexion = await this.instance.connect();
        await this.connexion.run(`SET GLOBAL file_search_path=${litteral(this.dossierFichiers)}`);
        return this;
    }

    async fermer() {
        try {
            if (this.connexion) this.connexion.closeSync();
            if (this.instance) this.instance.closeSync();
        } finally {
            this.connexion = null;
            this.instance = null;
        }
    }

    /** Exécute une requête et renvoie tout le résultat (sérialisable). Les requêtes sont enchaînées, jamais entrelacées. */
    executer(sql) {
        const tache = this.fileAttente.then(() => this._executerMaintenant(sql));
        this.fileAttente = tache.then(
            () => {},
            () => {}
        );
        return tache;
    }

    async _executerMaintenant(sql) {
        if (typeof sql !== 'string' || !sql.trim()) throw erreurRequete('Requête SQL vide.');
        if (REGLAGES_NAVIGATEUR.test(sql)) return { colonnes: [], lignes: [], ignoree: true };
        this.requetesExecutees++;
        let resultat;
        try {
            resultat = await this.connexion.runAndReadAll(sql);
        } catch (erreur) {
            throw erreurRequete(messageDuckDB(erreur));
        }
        if (resultat.currentRowCount > this.limiteLignes) {
            throw erreurTropVolumineux(
                `Résultat trop volumineux (${resultat.currentRowCount} lignes, limite ${this.limiteLignes}) : ajoutez une clause LIMIT ou utilisez la lecture en flux.`
            );
        }
        return { colonnes: colonnesDe(resultat), lignes: resultat.getRowsJson() };
    }

    /**
     * Lecture en flux : une connexion dédiée (pour ne pas bloquer la file principale), des paquets de lignes.
     * @returns {AsyncGenerator<{ colonnes?: object[], lignes: any[][] }>}
     */
    async *flux(sql) {
        if (typeof sql !== 'string' || !sql.trim()) throw erreurRequete('Requête SQL vide.');
        const connexion = await this.instance.connect();
        try {
            let lecteur;
            try {
                lecteur = await connexion.stream(sql);
            } catch (erreur) {
                throw erreurRequete(messageDuckDB(erreur));
            }
            const colonnes = colonnesDe(lecteur);
            yield { colonnes, lignes: [] };
            for (;;) {
                const paquet = await lecteur.fetchChunk();
                if (!paquet || paquet.rowCount === 0) break;
                yield { lignes: paquet.getRows().map(ligne => ligne.map(valeurJson)) };
            }
        } finally {
            connexion.closeSync();
        }
    }

    async version() {
        const { lignes } = await this.executer('SELECT version() AS v');
        return lignes[0][0];
    }

    async tables() {
        const { lignes } = await this.executer(
            "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'main' ORDER BY 1"
        );
        return lignes.map(([nom, type]) => ({ nom, type: type === 'VIEW' ? 'vue' : 'table' }));
    }
}

function colonnesDe(resultat) {
    const noms = resultat.columnNames();
    const types = resultat.columnTypes();
    return noms.map((nom, index) => ({ nom, type: String(types[index]) }));
}

// Même conversion que getRowsJson() pour les paquets de flux : BIGINT en chaîne, valeurs DuckDB en texte/JSON.
function valeurJson(valeur) {
    if (valeur === null || valeur === undefined) return null;
    if (typeof valeur === 'bigint') return valeur.toString();
    if (typeof valeur === 'object') {
        if (typeof valeur.toJson === 'function') return valeur.toJson();
        if (Array.isArray(valeur.items)) return valeur.items.map(valeurJson);
        return String(valeur);
    }
    return valeur;
}

function messageDuckDB(erreur) {
    return String((erreur && erreur.message) || erreur);
}

export function litteral(texte) {
    return "'" + String(texte).replace(/'/g, "''") + "'";
}

export function identifiant(nom) {
    return '"' + String(nom).replace(/"/g, '""') + '"';
}
