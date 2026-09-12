/**
 * Journal d'audit : chaque action significative (connexion, dépôt de source, modification de la gouvernance,
 * administration) est consignée avec son auteur et son espace. Consultable dans l'interface (page Journal).
 */
import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { BASE_DE_DONNEES, BaseDeDonnees } from '../base-de-donnees/connexion';
import { journal, utilisateurs } from '../base-de-donnees/schema';

export type EntreeAConsigner = {
    espaceId?: string | null;
    utilisateurId?: string | null;
    action: string;
    cible?: string | null;
    details?: unknown;
};

@Injectable()
export class JournalService {
    constructor(@Inject(BASE_DE_DONNEES) private readonly base: BaseDeDonnees) {}

    /** Consigne une action ; une erreur d'écriture du journal n'interrompt jamais l'action elle-même. */
    async consigner(entree: EntreeAConsigner): Promise<void> {
        try {
            await this.base.insert(journal).values({
                espaceId: entree.espaceId ?? null,
                utilisateurId: entree.utilisateurId ?? null,
                action: entree.action,
                cible: entree.cible ?? null,
                details: entree.details === undefined ? null : entree.details
            });
        } catch (erreur) {
            console.warn('Journal : écriture impossible', erreur);
        }
    }

    /** Dernières entrées d'un espace, les plus récentes d'abord, avec le nom de l'auteur. */
    async lister(espaceId: string, limite = 100) {
        const lignes = await this.base
            .select({ entree: journal, auteur: utilisateurs.nomAffiche })
            .from(journal)
            .leftJoin(utilisateurs, eq(utilisateurs.id, journal.utilisateurId))
            .where(eq(journal.espaceId, espaceId))
            .orderBy(desc(journal.horodatage))
            .limit(Math.min(Math.max(limite, 1), 1000));
        return lignes.map(ligne => ({
            id: ligne.entree.id,
            action: ligne.entree.action,
            cible: ligne.entree.cible,
            details: ligne.entree.details,
            horodatage: ligne.entree.horodatage,
            auteur: ligne.auteur || '—'
        }));
    }
}
