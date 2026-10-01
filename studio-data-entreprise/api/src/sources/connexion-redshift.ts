// La connexion à Redshift.
//
// Redshift parle le même protocole que PostgreSQL : le même pilote convient. Ce qui lui
// est propre tient en deux points, et ce sont justement ceux qui font échouer la première
// tentative dans une entreprise : le chiffrement obligatoire avec une autorité de
// certification à part, et un réseau le plus souvent fermé par défaut.
import fs from 'node:fs';
import pg from 'pg';
import { type ReglagesRedshift } from './reglages-redshift.js';

/** Une source que l'on peut interroger en lecture. */
export interface SourceInterrogeable {
    interroger<Ligne = Record<string, unknown>>(requete: string, parametres?: unknown[]): Promise<Ligne[]>;
    fermer(): Promise<void>;
}

class ConnexionRedshift implements SourceInterrogeable {
    constructor(private readonly client: pg.Client) {}
    async interroger<Ligne>(requete: string, parametres: unknown[] = []): Promise<Ligne[]> {
        const reponse = await this.client.query(requete, parametres);
        return reponse.rows as Ligne[];
    }
    async fermer(): Promise<void> {
        await this.client.end();
    }
}

/**
 * Traduit les échecs de connexion les plus courants en une phrase qui dit quoi faire.
 * Un message brut comme « ETIMEDOUT » oblige à chercher ; celui-ci indique la sortie.
 */
export function expliquerLEchec(souci: unknown): string {
    const message = souci instanceof Error ? souci.message : String(souci);
    const code = (souci as { code?: string } | null)?.code ?? '';

    if (code === 'ENOTFOUND' || /getaddrinfo/i.test(message)) {
        return "L'adresse de l'entrepôt est introuvable. Vérifiez SD_REDSHIFT_HOTE : c'est le nom complet du point d'accès, pas le nom du cluster.";
    }
    if (code === 'ETIMEDOUT' || /timeout/i.test(message)) {
        return "La connexion n'aboutit pas. Le plus souvent, le groupe de sécurité de l'entrepôt n'autorise pas l'adresse d'où vous appelez : faites-la ajouter sur le port indiqué.";
    }
    if (code === 'ECONNREFUSED') {
        return "L'entrepôt refuse la connexion sur ce port. Vérifiez SD_REDSHIFT_PORT (5439 par défaut pour Redshift).";
    }
    if (/password authentication failed|authentification/i.test(message)) {
        return "L'utilisateur ou le mot de passe est refusé par l'entrepôt. Le mot de passe n'est pas affiché ici, c'est volontaire.";
    }
    if (/self[- ]signed|unable to verify|certificate/i.test(message)) {
        return (
            "Le certificat de l'entrepôt n'a pas pu être vérifié. Téléchargez le fichier d'autorité " +
            "de certification d'Amazon Redshift et indiquez son chemin dans SD_REDSHIFT_CERTIFICAT_AC. " +
            'Ne désactivez pas la vérification : ce serait accepter de parler à n’importe qui.'
        );
    }
    if (/does not exist|n'existe pas/i.test(message)) {
        return 'La base demandée n’existe pas sur cet entrepôt. Vérifiez SD_REDSHIFT_BASE.';
    }
    return message;
}

/** Ouvre une connexion à Redshift. Le chiffrement est exigé et le certificat vérifié. */
export async function ouvrirUneConnexionRedshift(reglages: ReglagesRedshift): Promise<SourceInterrogeable> {
    const autorite = reglages.certificatDeLAutorite ? fs.readFileSync(reglages.certificatDeLAutorite, 'utf8') : undefined;
    const client = new pg.Client({
        host: reglages.hote,
        port: reglages.port,
        database: reglages.base,
        user: reglages.utilisateur,
        password: reglages.motDePasse,
        // La vérification du certificat n'est jamais désactivée. Quand l'autorité d'Amazon
        // n'est pas connue du système, on la fournit — on ne baisse pas la garde.
        ssl: autorite ? { rejectUnauthorized: true, ca: autorite } : { rejectUnauthorized: true },
        connectionTimeoutMillis: 15_000,
        query_timeout: 120_000,
        // L'application ne lit que le catalogue et les données : elle n'écrit jamais ici.
        application_name: 'studio-data-entreprise'
    });
    try {
        await client.connect();
    } catch (souci) {
        await client.end().catch(() => {});
        throw new Error(expliquerLEchec(souci));
    }
    return new ConnexionRedshift(client);
}
