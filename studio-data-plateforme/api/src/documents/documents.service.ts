/** Accès aux documents JSON d'un espace (table documents). */
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { BASE_DE_DONNEES, BaseDeDonnees } from '../base-de-donnees/connexion';
import { documents } from '../base-de-donnees/schema';

@Injectable()
export class DocumentsService {
    constructor(@Inject(BASE_DE_DONNEES) private readonly base: BaseDeDonnees) {}

    async cles(espaceId: string): Promise<string[]> {
        const lignes = await this.base
            .select({ cle: documents.cle })
            .from(documents)
            .where(eq(documents.espaceId, espaceId))
            .orderBy(documents.cle);
        return lignes.map(ligne => ligne.cle);
    }

    async lire<T = unknown>(espaceId: string, cle: string): Promise<T | undefined> {
        const ligne = (
            await this.base
                .select()
                .from(documents)
                .where(and(eq(documents.espaceId, espaceId), eq(documents.cle, cle)))
                .limit(1)
        )[0];
        return ligne ? (ligne.valeur as T) : undefined;
    }

    async ecrire(espaceId: string, cle: string, valeur: unknown, auteurId?: string | null): Promise<void> {
        await this.base
            .insert(documents)
            .values({ espaceId, cle, valeur: valeur as object, modifieParId: auteurId ?? null, modifieLe: new Date() })
            .onConflictDoUpdate({
                target: [documents.espaceId, documents.cle],
                set: { valeur: valeur as object, modifieParId: auteurId ?? null, modifieLe: new Date() }
            });
    }

    async supprimer(espaceId: string, cle: string): Promise<void> {
        await this.base.delete(documents).where(and(eq(documents.espaceId, espaceId), eq(documents.cle, cle)));
    }

    async vider(espaceId: string): Promise<void> {
        await this.base.delete(documents).where(eq(documents.espaceId, espaceId));
    }
}
