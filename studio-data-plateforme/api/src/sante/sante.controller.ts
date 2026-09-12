/**
 * Santé du serveur. Sans session : version et état de la base (pour la supervision et Docker). Avec
 * session : en plus, les volumes de l'espace courant (l'application classique et la page d'accueil Angular
 * s'en servent).
 */
import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { EspaceAvecRole, EspaceCourant, Public } from '../authentification/contexte-requete';
import { BASE_DE_DONNEES, BaseDeDonnees } from '../base-de-donnees/connexion';
import { CONNEXION_BASE } from '../base-de-donnees/base-de-donnees.module';
import { ConnexionBase } from '../base-de-donnees/connexion';
import { EspacesService } from '../espaces/espaces.service';

const { version: VERSION_API } = require('../../../package.json') as { version: string };

@ApiTags('Santé')
@Controller('api/sante')
export class SanteController {
    constructor(
        @Inject(BASE_DE_DONNEES) private readonly base: BaseDeDonnees,
        @Inject(CONNEXION_BASE) private readonly connexion: ConnexionBase,
        private readonly espaces: EspacesService
    ) {}

    @Get()
    @Public()
    @ApiOperation({ summary: 'État du serveur ; détails de l’espace courant si une session est ouverte.' })
    async sante(@EspaceCourant() espace?: EspaceAvecRole) {
        let baseOk = true;
        try {
            await this.base.execute(sql`SELECT 1`);
        } catch (erreur) {
            baseOk = false;
        }
        const reponse: Record<string, unknown> = {
            ok: baseOk,
            serveur: VERSION_API,
            baseReferentielle: { pilote: this.connexion.pilote, ok: baseOk },
            memoireProcessusMo: Math.round(process.memoryUsage().rss / 1048576)
        };
        if (espace) {
            const { moteur, fichiers } = await this.espaces.ressources(espace);
            const [versionDuckDB, tables, listeFichiers] = await Promise.all([moteur.version(), moteur.tables(), fichiers.lister()]);
            Object.assign(reponse, {
                duckdb: versionDuckDB,
                espace: espace.code,
                tables: tables.length,
                fichiers: listeFichiers.length,
                octetsFichiers: listeFichiers.reduce((somme, fichier) => somme + fichier.taille, 0),
                requetesExecutees: moteur.requetesExecutees
            });
        }
        return reponse;
    }
}

export { VERSION_API };
