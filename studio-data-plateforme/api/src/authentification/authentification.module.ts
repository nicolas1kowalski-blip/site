/**
 * Module d'authentification : sessions, garde global, routes /api/auth, et création du premier
 * administrateur au démarrage si la base ne contient aucun utilisateur.
 */
import { Global, Inject, Logger, Module, OnModuleInit } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { sql } from 'drizzle-orm';
import { BASE_DE_DONNEES, BaseDeDonnees } from '../base-de-donnees/connexion';
import { espaces, membres, utilisateurs } from '../base-de-donnees/schema';
import { CONFIGURATION, Configuration } from '../configuration/configuration';
import { JournalModule } from '../journal/journal.module';
import { AuthentificationController } from './authentification.controller';
import { AuthentificationGuard } from './authentification.guard';
import { genererMotDePasse, hacherMotDePasse } from './mots-de-passe';
import { SessionsService } from './sessions.service';

@Global()
@Module({
    imports: [JournalModule],
    controllers: [AuthentificationController],
    providers: [SessionsService, { provide: APP_GUARD, useClass: AuthentificationGuard }],
    exports: [SessionsService]
})
export class AuthentificationModule implements OnModuleInit {
    private readonly journal = new Logger('Authentification');

    constructor(
        @Inject(BASE_DE_DONNEES) private readonly base: BaseDeDonnees,
        @Inject(CONFIGURATION) private readonly configuration: Configuration
    ) {}

    /**
     * Premier démarrage : aucun utilisateur → un administrateur (SD_ADMIN_IDENTIFIANT / SD_ADMIN_MOT_DE_PASSE,
     * ou mot de passe généré et affiché dans le journal) et un espace « defaut » dont il est administrateur.
     */
    async onModuleInit(): Promise<void> {
        const resultat = (await this.base.execute(sql`SELECT count(*)::int AS n FROM utilisateurs`)) as { rows: { n: number }[] };
        const nombre = Number(resultat.rows[0].n);
        if (nombre > 0) return;
        const { identifiant, motDePasse } = this.configuration.administrateurInitial;
        const motDePasseEffectif = motDePasse || genererMotDePasse();
        const [administrateur] = await this.base
            .insert(utilisateurs)
            .values({
                identifiant: identifiant.toLowerCase(),
                nomAffiche: 'Administrateur',
                motDePasseHache: hacherMotDePasse(motDePasseEffectif),
                roleGlobal: 'administrateur'
            })
            .returning();
        const [espace] = await this.base.insert(espaces).values({ code: 'defaut', nom: 'Espace par défaut' }).returning();
        await this.base.insert(membres).values({ espaceId: espace.id, utilisateurId: administrateur.id, role: 'administrateur' });
        this.journal.warn(
            `Premier démarrage : administrateur « ${identifiant} » créé` +
                (motDePasse
                    ? ' avec le mot de passe configuré.'
                    : ` avec le mot de passe généré « ${motDePasseEffectif} » — changez-le dès la première connexion.`)
        );
    }
}
