/**
 * Espaces de travail : création et administration (PostgreSQL) et ressources analytiques ouvertes à la
 * demande (moteur DuckDB + dépôt de fichiers sous SD_DONNEES/espaces/<code>/).
 */
import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import path from 'node:path';
import { BASE_DE_DONNEES, BaseDeDonnees } from '../base-de-donnees/connexion';
import { Espace, RoleEspace, espaces, membres, utilisateurs } from '../base-de-donnees/schema';
import { erreurIntrouvable, erreurRequete, verifierCodeEspace } from '../commun/erreurs';
import { CONFIGURATION, Configuration } from '../configuration/configuration';
import { DepotFichiers } from './depot-fichiers';
import { MoteurDuckDB } from './moteur-duckdb';

/** Ressources analytiques d'un espace : ouvertes une fois, partagées par toutes les requêtes. */
export type RessourcesEspace = { moteur: MoteurDuckDB; fichiers: DepotFichiers };

@Injectable()
export class EspacesService implements OnApplicationShutdown {
    private readonly ressourcesOuvertes = new Map<string, Promise<RessourcesEspace>>();

    constructor(
        @Inject(BASE_DE_DONNEES) private readonly base: BaseDeDonnees,
        @Inject(CONFIGURATION) private readonly configuration: Configuration
    ) {}

    /** Moteur et fichiers de l'espace ; les ouvertures concurrentes partagent la même promesse. */
    ressources(espace: Pick<Espace, 'code'>): Promise<RessourcesEspace> {
        const code = verifierCodeEspace(espace.code);
        let promesse = this.ressourcesOuvertes.get(code);
        if (!promesse) {
            const dossier = path.join(this.configuration.dossierDonnees, 'espaces', code);
            const fichiers = new DepotFichiers(path.join(dossier, 'fichiers'), this.configuration.tailleMaxFichierOctets);
            const moteur = new MoteurDuckDB({
                cheminBase: path.join(dossier, 'studio.duckdb'),
                dossierFichiers: fichiers.dossier,
                threads: this.configuration.duckdb.threads,
                memoire: this.configuration.duckdb.memoire,
                limiteLignes: this.configuration.limiteLignesParReponse
            });
            promesse = moteur.ouvrir().then(() => ({ moteur, fichiers }));
            promesse.catch(() => this.ressourcesOuvertes.delete(code));
            this.ressourcesOuvertes.set(code, promesse);
        }
        return promesse;
    }

    async lister(): Promise<Espace[]> {
        return this.base.select().from(espaces).orderBy(espaces.code);
    }

    async parCode(code: string): Promise<Espace> {
        const espace = (
            await this.base
                .select()
                .from(espaces)
                .where(eq(espaces.code, verifierCodeEspace(code)))
                .limit(1)
        )[0];
        if (!espace) throw erreurIntrouvable(`Espace inconnu : ${code}`);
        return espace;
    }

    async creer(code: string, nom: string, createurId: string): Promise<Espace> {
        verifierCodeEspace(code);
        const existant = await this.base.select().from(espaces).where(eq(espaces.code, code)).limit(1);
        if (existant.length) throw erreurRequete(`Le code d'espace « ${code} » est déjà utilisé.`);
        const [espace] = await this.base
            .insert(espaces)
            .values({ code, nom: nom.trim() || code })
            .returning();
        await this.base.insert(membres).values({ espaceId: espace.id, utilisateurId: createurId, role: 'administrateur' });
        return espace;
    }

    async renommer(code: string, nom: string): Promise<Espace> {
        const espace = await this.parCode(code);
        const [modifie] = await this.base
            .update(espaces)
            .set({ nom: nom.trim() || espace.nom })
            .where(eq(espaces.id, espace.id))
            .returning();
        return modifie;
    }

    async membresDe(espaceId: string) {
        const lignes = await this.base
            .select({ utilisateur: utilisateurs, role: membres.role })
            .from(membres)
            .innerJoin(utilisateurs, eq(utilisateurs.id, membres.utilisateurId))
            .where(eq(membres.espaceId, espaceId))
            .orderBy(utilisateurs.identifiant);
        return lignes.map(ligne => ({
            utilisateurId: ligne.utilisateur.id,
            identifiant: ligne.utilisateur.identifiant,
            nomAffiche: ligne.utilisateur.nomAffiche,
            actif: ligne.utilisateur.actif,
            role: ligne.role as RoleEspace
        }));
    }

    async definirMembre(espaceId: string, identifiant: string, role: RoleEspace): Promise<void> {
        const utilisateur = (
            await this.base.select().from(utilisateurs).where(eq(utilisateurs.identifiant, identifiant.toLowerCase())).limit(1)
        )[0];
        if (!utilisateur) throw erreurIntrouvable(`Utilisateur inconnu : ${identifiant}`);
        await this.base
            .insert(membres)
            .values({ espaceId, utilisateurId: utilisateur.id, role })
            .onConflictDoUpdate({ target: [membres.espaceId, membres.utilisateurId], set: { role } });
    }

    async retirerMembre(espaceId: string, identifiant: string): Promise<void> {
        const utilisateur = (
            await this.base.select().from(utilisateurs).where(eq(utilisateurs.identifiant, identifiant.toLowerCase())).limit(1)
        )[0];
        if (!utilisateur) throw erreurIntrouvable(`Utilisateur inconnu : ${identifiant}`);
        await this.base.delete(membres).where(and(eq(membres.espaceId, espaceId), eq(membres.utilisateurId, utilisateur.id)));
    }

    async onApplicationShutdown(): Promise<void> {
        for (const promesse of this.ressourcesOuvertes.values()) {
            try {
                await (await promesse).moteur.fermer();
            } catch (erreur) {
                /* fermeture au mieux */
            }
        }
        this.ressourcesOuvertes.clear();
    }
}
