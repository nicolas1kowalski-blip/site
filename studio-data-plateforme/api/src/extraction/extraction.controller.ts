/**
 * Extraction : aperçu, comptage, export CSV en flux et modèles d'extraction enregistrés (document « extractions »).
 * La spécification est validée (Zod), traduite en SQL par constructeur-sql.ts, exécutée par DuckDB.
 */
import { Body, Controller, Delete, Get, Param, Post, Put, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { EspaceAvecRole, EspaceCourant, RoleEspaceRequis, UtilisateurCourant } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { erreurIntrouvable, erreurRequete, verifierNomSur } from '../commun/erreurs';
import { valider } from '../commun/validation';
import { DocumentsService } from '../documents/documents.service';
import { EspacesService } from '../espaces/espaces.service';
import { JournalService } from '../journal/journal.service';
import { SourcesService } from '../sources/sources.service';
import {
    AGREGATS,
    ContexteConstruction,
    ErreurSpecification,
    OPERATEURS_FILTRE,
    Specification,
    TRANSFORMATIONS,
    construireSql,
    schemaSpecification
} from './constructeur-sql';

const LIMITE_APERCU = 200;

const schemaApercu = z.object({ specification: schemaSpecification, limite: z.number().int().positive().max(5000).default(LIMITE_APERCU) });
const schemaExport = z.object({ specification: schemaSpecification, nomFichier: z.string().trim().min(1).max(120).default('extraction') });
const schemaModele = z.object({
    nom: z.string().trim().min(1, 'nom requis').max(120),
    description: z.string().trim().max(1000).default(''),
    specification: schemaSpecification
});

export type ModeleExtraction = {
    id: string;
    nom: string;
    description: string;
    specification: Specification;
    modifieLe: string;
    auteur: string;
};

/** Échappement CSV « à la française » : point-virgule, guillemets doublés, tout entre guillemets. */
export function ligneCsv(valeurs: unknown[]): string {
    return (
        valeurs.map(valeur => '"' + String(valeur === null || valeur === undefined ? '' : valeur).replace(/"/g, '""') + '"').join(';') +
        '\r\n'
    );
}

@ApiTags('Extraction')
@Controller('api/extraction')
export class ExtractionController {
    constructor(
        private readonly espaces: EspacesService,
        private readonly sources: SourcesService,
        private readonly documents: DocumentsService,
        private readonly journal: JournalService
    ) {}

    @Get('vocabulaire')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Opérateurs de filtre, transformations et agrégats disponibles, avec leurs libellés.' })
    vocabulaire() {
        return { operateurs: OPERATEURS_FILTRE, transformations: TRANSFORMATIONS, agregats: AGREGATS };
    }

    @Post('sql')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Traduit une spécification en SQL sans l’exécuter.' })
    async sql(@EspaceCourant() espace: EspaceAvecRole, @Body(valider(schemaSpecification)) specification: Specification) {
        return { sql: (await this.construire(espace, specification)).sql };
    }

    @Post('apercu')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Exécute l’extraction avec une limite de lignes et renvoie le résultat et le SQL.' })
    async apercu(@EspaceCourant() espace: EspaceAvecRole, @Body(valider(schemaApercu)) corps: z.infer<typeof schemaApercu>) {
        const { sql } = await this.construire(espace, {
            ...corps.specification,
            limite: Math.min(corps.limite, corps.specification.limite ?? corps.limite)
        });
        const { moteur } = await this.espaces.ressources(espace);
        const resultat = await moteur.executer(sql);
        return { sql, colonnes: resultat.colonnes, lignes: resultat.lignes, limite: corps.limite };
    }

    @Post('compter')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Nombre total de lignes de l’extraction (sans limite).' })
    async compter(@EspaceCourant() espace: EspaceAvecRole, @Body(valider(schemaSpecification)) specification: Specification) {
        const { sql } = await this.construire(espace, { ...specification, limite: undefined, tri: [] });
        const { moteur } = await this.espaces.ressources(espace);
        const resultat = await moteur.executer(`SELECT COUNT(*)::BIGINT FROM (${sql}) AS extraction`);
        return { total: Number(resultat.lignes[0][0]) };
    }

    @Post('export.csv')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Export CSV complet en flux (séparateur ;, UTF-8 avec BOM pour Excel).' })
    async exporterCsv(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaExport)) corps: z.infer<typeof schemaExport>,
        @Res() reponse: FastifyReply
    ) {
        const { sql } = await this.construire(espace, corps.specification);
        const { moteur } = await this.espaces.ressources(espace);
        const generateur = moteur.flux(sql);
        const premiere = await generateur.next();
        const nomFichier = corps.nomFichier.replace(/[^\w.-]+/g, '_') + '.csv';
        async function* lignesCsv() {
            yield '\ufeff';
            if (!premiere.done && premiere.value.colonnes) yield ligneCsv(premiere.value.colonnes.map(colonne => colonne.nom));
            for await (const paquet of generateur) for (const ligne of paquet.lignes) yield ligneCsv(ligne);
        }
        await this.journal.consigner({
            espaceId: espace.id,
            utilisateurId: utilisateur.id,
            action: 'extraction.export',
            cible: nomFichier
        });
        reponse
            .type('text/csv; charset=utf-8')
            .header('content-disposition', `attachment; filename="${nomFichier}"`)
            .send(Readable.from(lignesCsv()));
    }

    // ---- modèles d'extraction enregistrés ----
    @Get('modeles')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Modèles d’extraction enregistrés dans l’espace.' })
    modeles(@EspaceCourant() espace: EspaceAvecRole) {
        return this.listeModeles(espace.id);
    }

    @Put('modeles/:id')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Crée ou remplace un modèle d’extraction.' })
    async enregistrerModele(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('id') id: string,
        @Body(valider(schemaModele)) corps: z.infer<typeof schemaModele>
    ) {
        const idSur = verifierNomSur(id, 'identifiant de modèle');
        const modeles = await this.listeModeles(espace.id);
        const modele: ModeleExtraction = {
            id: idSur,
            nom: corps.nom,
            description: corps.description,
            specification: corps.specification,
            modifieLe: new Date().toISOString(),
            auteur: utilisateur.nomAffiche
        };
        const position = modeles.findIndex(candidat => candidat.id === idSur);
        if (position >= 0) modeles[position] = modele;
        else modeles.push(modele);
        await this.documents.ecrire(espace.id, 'extractions', modeles, utilisateur.id);
        await this.journal.consigner({ espaceId: espace.id, utilisateurId: utilisateur.id, action: 'extraction.modele', cible: corps.nom });
        return modele;
    }

    @Delete('modeles/:id')
    @RoleEspaceRequis('editeur')
    async supprimerModele(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('id') id: string
    ) {
        const modeles = await this.listeModeles(espace.id);
        const restants = modeles.filter(candidat => candidat.id !== id);
        if (restants.length === modeles.length) throw erreurIntrouvable('Modèle inconnu.');
        await this.documents.ecrire(espace.id, 'extractions', restants, utilisateur.id);
        return { ok: true };
    }

    private async listeModeles(espaceId: string): Promise<ModeleExtraction[]> {
        const liste = await this.documents.lire<ModeleExtraction[]>(espaceId, 'extractions');
        return Array.isArray(liste) ? liste : [];
    }

    /** Résout les identifiants de sources et construit le SQL ; une spécification incohérente répond 400. */
    private async construire(espace: EspaceAvecRole, specification: Specification): Promise<{ sql: string; alias: string[] }> {
        const sources = await this.sources.lister(espace.id);
        const parId = new Map(sources.map(source => [String(source.id), source]));
        const contexte: ContexteConstruction = {
            nomTableDe: tableId => {
                if (!parId.has(tableId)) throw erreurRequete(`Source inconnue dans l'extraction : ${tableId}`);
                return 't_' + tableId;
            },
            nomSourceDe: tableId => parId.get(tableId)?.name ?? tableId
        };
        try {
            return construireSql(specification, contexte);
        } catch (erreur) {
            if (erreur instanceof ErreurSpecification) throw erreurRequete(erreur.message);
            throw erreur;
        }
    }
}
