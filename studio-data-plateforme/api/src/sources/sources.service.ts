/**
 * Métadonnées des sources (table sources de PostgreSQL).
 *
 * Le front envoie un document complet (name, type, config, storage, size, headers, fichier…). Les champs
 * structurants sont rangés en colonnes (nom, type, stockage, taille, en-têtes) pour être interrogeables ;
 * le reste est conservé tel quel dans metadonnees, et le document est reconstitué à la lecture.
 */
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { BASE_DE_DONNEES, BaseDeDonnees } from '../base-de-donnees/connexion';
import { Source, sources } from '../base-de-donnees/schema';
import { erreurIntrouvable } from '../commun/erreurs';

/** Document tel que le front l'envoie et le relit (mêmes noms de champs que l'application classique). */
export type DocumentSource = {
    id?: string;
    name: string;
    type?: string;
    storage?: string;
    size?: number;
    headers?: string[];
    optimized?: boolean;
    pqSize?: number | null;
    [autre: string]: unknown;
};

const CHAMPS_EN_COLONNES = new Set(['id', 'name', 'type', 'storage', 'size', 'headers']);

function documentDe(ligne: Source): DocumentSource {
    return {
        ...(ligne.metadonnees as Record<string, unknown>),
        id: ligne.id,
        name: ligne.nom,
        type: ligne.type,
        storage: ligne.stockage,
        size: ligne.tailleOctets,
        headers: ligne.enTetes as string[],
        enregistreLe: ligne.modifieLe.toISOString()
    };
}

@Injectable()
export class SourcesService {
    constructor(@Inject(BASE_DE_DONNEES) private readonly base: BaseDeDonnees) {}

    async lister(espaceId: string): Promise<DocumentSource[]> {
        const lignes = await this.base.select().from(sources).where(eq(sources.espaceId, espaceId)).orderBy(sources.nom);
        return lignes.map(documentDe);
    }

    async lire(espaceId: string, id: string): Promise<DocumentSource> {
        const ligne = (
            await this.base
                .select()
                .from(sources)
                .where(and(eq(sources.espaceId, espaceId), eq(sources.id, id)))
                .limit(1)
        )[0];
        if (!ligne) throw erreurIntrouvable('Source inconnue : ' + id);
        return documentDe(ligne);
    }

    /** Écrit (crée ou remplace) les métadonnées ; renvoie vrai si la source est nouvelle. */
    async ecrire(espaceId: string, id: string, document: DocumentSource): Promise<boolean> {
        const metadonnees: Record<string, unknown> = {};
        for (const [champ, valeur] of Object.entries(document)) if (!CHAMPS_EN_COLONNES.has(champ)) metadonnees[champ] = valeur;
        const valeurs = {
            nom: document.name,
            type: document.type || 'csv',
            stockage: document.storage || 'table',
            tailleOctets: Number(document.size) || 0,
            enTetes: Array.isArray(document.headers) ? document.headers : [],
            metadonnees,
            modifieLe: new Date()
        };
        const existante = await this.base
            .select({ id: sources.id })
            .from(sources)
            .where(and(eq(sources.espaceId, espaceId), eq(sources.id, id)))
            .limit(1);
        await this.base
            .insert(sources)
            .values({ id, espaceId, ...valeurs })
            .onConflictDoUpdate({ target: [sources.espaceId, sources.id], set: valeurs });
        return existante.length === 0;
    }

    async marquerOptimisee(espaceId: string, id: string, tailleParquet: number): Promise<void> {
        const ligne = (
            await this.base
                .select()
                .from(sources)
                .where(and(eq(sources.espaceId, espaceId), eq(sources.id, id)))
                .limit(1)
        )[0];
        if (!ligne) return;
        const metadonnees = { ...(ligne.metadonnees as Record<string, unknown>), optimized: true, pqSize: tailleParquet };
        await this.base
            .update(sources)
            .set({ stockage: 'parquet', metadonnees, modifieLe: new Date() })
            .where(and(eq(sources.espaceId, espaceId), eq(sources.id, id)));
    }

    async supprimer(espaceId: string, id: string): Promise<void> {
        await this.base.delete(sources).where(and(eq(sources.espaceId, espaceId), eq(sources.id, id)));
    }
}
