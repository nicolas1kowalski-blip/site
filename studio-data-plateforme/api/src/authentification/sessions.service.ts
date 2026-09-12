/**
 * Sessions : création à la connexion, lecture à chaque requête (à partir du cookie), suppression à la
 * déconnexion. Une session référence l'utilisateur et l'espace de travail actif.
 */
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, lt } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { BASE_DE_DONNEES, BaseDeDonnees } from '../base-de-donnees/connexion';
import { espaces, membres, sessions, utilisateurs } from '../base-de-donnees/schema';
import { CONFIGURATION, Configuration } from '../configuration/configuration';
import { ContexteRequete, EspaceAvecRole } from './contexte-requete';

export const NOM_COOKIE_SESSION = 'sd_session';

@Injectable()
export class SessionsService {
    constructor(
        @Inject(BASE_DE_DONNEES) private readonly base: BaseDeDonnees,
        @Inject(CONFIGURATION) private readonly configuration: Configuration
    ) {}

    /** Crée une session pour l'utilisateur ; l'espace actif est le premier de ses espaces (ordre alphabétique). */
    async ouvrir(utilisateurId: string): Promise<{ id: string; expireLe: Date }> {
        const id = randomBytes(32).toString('base64url');
        const expireLe = new Date(Date.now() + this.configuration.sessionDureeMs);
        const premierEspace = (await this.espacesDe(utilisateurId))[0];
        await this.base.insert(sessions).values({ id, utilisateurId, expireLe, espaceCourantId: premierEspace ? premierEspace.id : null });
        return { id, expireLe };
    }

    async fermer(sessionId: string): Promise<void> {
        await this.base.delete(sessions).where(eq(sessions.id, sessionId));
    }

    async changerEspaceCourant(sessionId: string, espaceId: string): Promise<void> {
        await this.base.update(sessions).set({ espaceCourantId: espaceId }).where(eq(sessions.id, sessionId));
    }

    /**
     * Résout le contexte d'une requête à partir de l'identifiant de session : utilisateur actif et espace
     * courant (avec le rôle de l'utilisateur dans cet espace). Une session expirée ou inconnue donne un
     * contexte vide, jamais une erreur : c'est le garde qui décide.
     */
    async resoudre(sessionId: string | undefined): Promise<ContexteRequete> {
        if (!sessionId) return {};
        const lignes = await this.base
            .select({ session: sessions, utilisateur: utilisateurs })
            .from(sessions)
            .innerJoin(utilisateurs, eq(utilisateurs.id, sessions.utilisateurId))
            .where(and(eq(sessions.id, sessionId), gt(sessions.expireLe, new Date())))
            .limit(1);
        const ligne = lignes[0];
        if (!ligne || !ligne.utilisateur.actif) return {};
        const contexte: ContexteRequete = { utilisateur: ligne.utilisateur, sessionId };
        const mesEspaces = await this.espacesDe(ligne.utilisateur.id);
        const courant = mesEspaces.find(espace => espace.id === ligne.session.espaceCourantId) || mesEspaces[0];
        if (courant) {
            contexte.espace = courant;
            if (courant.id !== ligne.session.espaceCourantId) await this.changerEspaceCourant(sessionId, courant.id);
        }
        return contexte;
    }

    /** Espaces accessibles à un utilisateur avec son rôle ; un administrateur global voit tous les espaces en administrateur. */
    async espacesDe(utilisateurId: string): Promise<EspaceAvecRole[]> {
        const utilisateur = (await this.base.select().from(utilisateurs).where(eq(utilisateurs.id, utilisateurId)).limit(1))[0];
        if (!utilisateur) return [];
        if (utilisateur.roleGlobal === 'administrateur') {
            const tous = await this.base.select().from(espaces).orderBy(espaces.code);
            return tous.map(espace => ({ ...espace, role: 'administrateur' as const }));
        }
        const lignes = await this.base
            .select({ espace: espaces, role: membres.role })
            .from(membres)
            .innerJoin(espaces, eq(espaces.id, membres.espaceId))
            .where(eq(membres.utilisateurId, utilisateurId))
            .orderBy(espaces.code);
        return lignes.map(ligne => ({ ...ligne.espace, role: ligne.role as EspaceAvecRole['role'] }));
    }

    /** Ménage périodique : supprime les sessions expirées. */
    async purgerExpirees(): Promise<void> {
        await this.base.delete(sessions).where(lt(sessions.expireLe, new Date()));
    }
}
