// Les réglages de la connexion à Redshift.
//
// Le mot de passe peut arriver de deux façons, et la seconde est la bonne :
//   — SD_REDSHIFT_MOT_DE_PASSE : pratique pour un essai rapide, mais une variable
//     d'environnement se retrouve dans la liste des processus et dans les traces ;
//   — SD_REDSHIFT_MOT_DE_PASSE_FICHIER : le chemin d'un fichier que l'hébergeur dépose
//     lui-même depuis son coffre de secrets. Rien n'apparaît dans l'environnement.
//
// Plus tard, la troisième façon sera la bonne pour de bon : aucun mot de passe du tout,
// un jeton de quelques minutes demandé à AWS par le rôle du conteneur.
import fs from 'node:fs';
import { z } from 'zod';

const formeDesReglages = z.object({
    SD_REDSHIFT_HOTE: z.string().min(1),
    SD_REDSHIFT_PORT: z.coerce.number().int().min(1).max(65535).default(5439),
    SD_REDSHIFT_BASE: z.string().min(1),
    SD_REDSHIFT_UTILISATEUR: z.string().min(1),
    SD_REDSHIFT_MOT_DE_PASSE: z.string().min(1).optional(),
    SD_REDSHIFT_MOT_DE_PASSE_FICHIER: z.string().min(1).optional(),
    // Redshift présente un certificat signé par une autorité propre à Amazon. Si elle
    // n'est pas connue du système, on indique ici le fichier qui la contient.
    SD_REDSHIFT_CERTIFICAT_AC: z.string().min(1).optional(),
    SD_REDSHIFT_SCHEMA: z.string().min(1).default('public')
});

export interface ReglagesRedshift {
    hote: string;
    port: number;
    base: string;
    utilisateur: string;
    motDePasse: string;
    certificatDeLAutorite: string | null;
    schemaParDefaut: string;
}

/** Lit les réglages de Redshift, ou explique en français ce qui manque. */
export function lireLesReglagesRedshift(environnement: NodeJS.ProcessEnv = process.env): ReglagesRedshift {
    const lecture = formeDesReglages.safeParse(environnement);
    if (!lecture.success) {
        const manquants = lecture.error.issues.map(souci => '  — ' + souci.path.join('.') + ' : ' + souci.message);
        throw new Error('La connexion à Redshift n’est pas renseignée :\n' + manquants.join('\n'));
    }
    const reglages = lecture.data;

    const motDePasse = reglages.SD_REDSHIFT_MOT_DE_PASSE_FICHIER
        ? fs.readFileSync(reglages.SD_REDSHIFT_MOT_DE_PASSE_FICHIER, 'utf8').trim()
        : reglages.SD_REDSHIFT_MOT_DE_PASSE;
    if (!motDePasse) {
        throw new Error(
            'Aucun mot de passe : renseignez SD_REDSHIFT_MOT_DE_PASSE_FICHIER (recommandé) ' +
                'ou SD_REDSHIFT_MOT_DE_PASSE.'
        );
    }
    return {
        hote: reglages.SD_REDSHIFT_HOTE,
        port: reglages.SD_REDSHIFT_PORT,
        base: reglages.SD_REDSHIFT_BASE,
        utilisateur: reglages.SD_REDSHIFT_UTILISATEUR,
        motDePasse,
        certificatDeLAutorite: reglages.SD_REDSHIFT_CERTIFICAT_AC ?? null,
        schemaParDefaut: reglages.SD_REDSHIFT_SCHEMA
    };
}

/** Ce que l'on a le droit d'afficher : jamais le mot de passe. */
export function reglagesRedshiftLisibles(reglages: ReglagesRedshift): string {
    return `${reglages.utilisateur}@${reglages.hote}:${reglages.port}/${reglages.base} · schéma ${reglages.schemaParDefaut}`;
}
