// Les réglages de l'application, lus UNE FOIS au démarrage et vérifiés tout de suite.
//
// Deux règles tiennent ce fichier :
//   — aucun secret n'a de valeur par défaut ; si un réglage manque, le serveur refuse de
//     démarrer au lieu de tourner à moitié avec une valeur de secours ;
//   — aucun secret n'est jamais affiché, ni au démarrage, ni dans une erreur.
import { z } from 'zod';

const formeDesReglages = z.object({
    // En développement, on travaille sur une base embarquée : rien à installer.
    // En production, l'adresse de PostgreSQL est fournie par l'hébergeur.
    SD_ADRESSE_POSTGRESQL: z.string().min(1).optional(),
    SD_DOSSIER_DONNEES: z.string().min(1).default('./donnees'),
    SD_PORT: z.coerce.number().int().min(1).max(65535).default(8440),
    SD_ENVIRONNEMENT: z.enum(['developpement', 'recette', 'production']).default('developpement')
});

export type Reglages = {
    adressePostgresql: string | null;
    dossierDesDonnees: string;
    port: number;
    environnement: 'developpement' | 'recette' | 'production';
    /** Vrai quand l'application tourne sur une base embarquée, donc hors production. */
    baseEmbarquee: boolean;
};

/** Lit les réglages depuis l'environnement et s'arrête net s'ils ne tiennent pas debout. */
export function lireLesReglages(environnement: NodeJS.ProcessEnv = process.env): Reglages {
    const lecture = formeDesReglages.safeParse(environnement);
    if (!lecture.success) {
        const details = lecture.error.issues.map(souci => '  — ' + souci.path.join('.') + ' : ' + souci.message);
        throw new Error('Réglages invalides, le serveur ne démarre pas :\n' + details.join('\n'));
    }
    const reglages = lecture.data;
    const adressePostgresql = reglages.SD_ADRESSE_POSTGRESQL ?? null;

    // En production, la base embarquée n'a pas sa place : elle vit dans un fichier local
    // et ne survit pas au redémarrage d'un conteneur.
    if (reglages.SD_ENVIRONNEMENT === 'production' && !adressePostgresql) {
        throw new Error('En production, SD_ADRESSE_POSTGRESQL est obligatoire : la base embarquée ne convient pas.');
    }
    return {
        adressePostgresql,
        dossierDesDonnees: reglages.SD_DOSSIER_DONNEES,
        port: reglages.SD_PORT,
        environnement: reglages.SD_ENVIRONNEMENT,
        baseEmbarquee: adressePostgresql === null
    };
}

/** Ce que l'on a le droit d'afficher au démarrage : jamais d'adresse complète, jamais de secret. */
export function reglagesLisibles(reglages: Reglages): string {
    const base = reglages.baseEmbarquee ? 'base embarquée (développement)' : 'PostgreSQL';
    return `environnement ${reglages.environnement} · ${base} · port ${reglages.port}`;
}
