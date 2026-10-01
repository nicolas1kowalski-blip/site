// La connexion à la base interne de l'application.
//
// Deux hébergements possibles derrière la MÊME interface, pour que le reste du code
// n'ait jamais à savoir lequel répond :
//   — PostgreSQL, en recette et en production ;
//   — une base embarquée, en développement et pour les tests, de façon qu'il n'y ait
//     rien à installer pour lancer le projet.
//
// Le SQL écrit ailleurs dans l'application est le même dans les deux cas.
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import type { Reglages } from '../configuration/configuration.js';

/** Une base à laquelle on peut poser des questions, quel que soit son hébergement. */
export interface BaseInterne {
    /**
     * Exécute une requête. Les valeurs passent TOUJOURS par `parametres` et ne sont
     * jamais recopiées dans le texte de la requête — c'est ce qui ferme la porte aux
     * injections SQL.
     */
    interroger<Ligne = Record<string, unknown>>(requete: string, parametres?: unknown[]): Promise<Ligne[]>;
    /**
     * Exécute un SCRIPT : plusieurs instructions d'affilée, sans aucun paramètre.
     * Réservé aux migrations, qui sont des fichiers écrits par nous et relus en revue.
     *
     * La séparation est volontaire : `interroger` ne peut porter qu'UNE instruction et
     * passe toujours par une requête préparée — c'est ce qui rend l'injection SQL
     * impossible par construction, et non par vigilance.
     */
    executerUnScript(script: string): Promise<void>;
    fermer(): Promise<void>;
}

class BaseEmbarquee implements BaseInterne {
    constructor(private readonly moteur: PGlite) {}
    async interroger<Ligne>(requete: string, parametres: unknown[] = []): Promise<Ligne[]> {
        const reponse = await this.moteur.query<Ligne>(requete, parametres);
        return reponse.rows;
    }
    async executerUnScript(script: string): Promise<void> {
        await this.moteur.exec(script);
    }
    async fermer(): Promise<void> {
        await this.moteur.close();
    }
}

class BasePostgresql implements BaseInterne {
    constructor(private readonly reservoir: pg.Pool) {}
    async interroger<Ligne>(requete: string, parametres: unknown[] = []): Promise<Ligne[]> {
        const reponse = await this.reservoir.query(requete, parametres);
        return reponse.rows as Ligne[];
    }
    async executerUnScript(script: string): Promise<void> {
        await this.reservoir.query(script);
    }
    async fermer(): Promise<void> {
        await this.reservoir.end();
    }
}

/** Ouvre la base interne d'après les réglages. */
export async function ouvrirLaBaseInterne(reglages: Reglages): Promise<BaseInterne> {
    if (reglages.baseEmbarquee) {
        const moteur = await PGlite.create(reglages.dossierDesDonnees + '/base-interne');
        return new BaseEmbarquee(moteur);
    }
    const reservoir = new pg.Pool({
        connectionString: reglages.adressePostgresql ?? undefined,
        // Le certificat du serveur est vérifié. Ne jamais désactiver cette vérification
        // « pour que ça marche » : ce serait accepter de parler à n'importe qui.
        ssl: { rejectUnauthorized: true },
        max: 10,
        idleTimeoutMillis: 30_000
    });
    return new BasePostgresql(reservoir);
}

/** Une base embarquée en mémoire, pour les tests : rien n'est écrit sur le disque. */
export async function ouvrirUneBaseDeTest(): Promise<BaseInterne> {
    return new BaseEmbarquee(await PGlite.create());
}
