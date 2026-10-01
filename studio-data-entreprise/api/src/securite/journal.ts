// Le journal d'audit : qui a fait quoi, quand, sur quoi.
//
// On n'y écrit qu'en AJOUTANT ; la base refuse toute modification ou suppression (voir
// la migration 0001). Un journal que l'on peut retoucher ne prouve rien.
//
// Rien de secret n'entre ici : ni mot de passe, ni contenu de données métier. Le détail
// décrit l'action, pas la donnée.
import type { BaseInterne } from '../base-de-donnees/connexion.js';

export interface EvenementAInscrire {
    /** Le compte qui agit, ou null quand l'action précède toute authentification. */
    compte: string | null;
    espace: string | null;
    /** Ce qui a été fait, en un mot : « connexion », « source.declaree », « audit.lance ». */
    action: string;
    /** Sur quoi : l'identifiant d'une source, d'un objet métier… */
    objet?: string | null;
    detail?: Record<string, unknown> | null;
    adresse?: string | null;
}

/** Des mots dont la valeur ne doit jamais atterrir dans le journal. */
const MOTS_SENSIBLES = ['motdepasse', 'mot_de_passe', 'secret', 'jeton', 'token', 'password', 'cle', 'key'];

/** Retire du détail tout ce qui ressemble à un secret, avant l'écriture. */
export function detailSansSecret(detail: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
    if (!detail) return null;
    const propre: Record<string, unknown> = {};
    for (const [nom, valeur] of Object.entries(detail)) {
        const nomNormalise = nom.toLowerCase().replace(/[^a-z]/g, '');
        propre[nom] = MOTS_SENSIBLES.some(mot => nomNormalise.includes(mot.replace(/[^a-z]/g, ''))) ? '(retiré)' : valeur;
    }
    return propre;
}

export async function inscrireAuJournal(base: BaseInterne, evenement: EvenementAInscrire): Promise<void> {
    await base.interroger(
        `INSERT INTO journal (compte, espace, action, objet, detail, adresse)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
            evenement.compte,
            evenement.espace,
            evenement.action,
            evenement.objet ?? null,
            JSON.stringify(detailSansSecret(evenement.detail)),
            evenement.adresse ?? null
        ]
    );
}
