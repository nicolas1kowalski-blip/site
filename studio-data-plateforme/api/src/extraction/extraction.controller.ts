/**
 * Extraction : aperçu, comptage, export CSV en flux et modèles d'extraction enregistrés (document « extractions »).
 * La spécification est validée (Zod), traduite en SQL par constructeur-sql.ts, exécutée par DuckDB.
 */
import { Body, Controller, Delete, Get, Param, Post, Put, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import { Readable } from 'node:stream';
import { randomBytes } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { z } from 'zod';
import { EspaceAvecRole, EspaceCourant, RoleEspaceRequis, UtilisateurCourant } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { erreurIntrouvable, erreurRequete, verifierNomSur } from '../commun/erreurs';
import { valider } from '../commun/validation';
import { DocumentsService } from '../documents/documents.service';
import { EspacesService } from '../espaces/espaces.service';
import { JournalService } from '../journal/journal.service';
import { identifiantSql, litteralSql } from '../espaces/moteur-duckdb';
import { SourcesService } from '../sources/sources.service';
import { lireFeuilleExcel } from '../importation/classeur-excel';
import { MODES_SYNTHESE } from './constructeur-avance';
import { COMPARAISONS_FICHIER, MODES_FICHIER, sqlValeursAbsentes } from './filtre-fichier';
import { lireTexteDelimite, tableauDepuisLignes } from './tableau-fichier';
import {
    AGREGATS,
    GENRES_COLONNE,
    ContexteConstruction,
    ErreurSpecification,
    OPERATEURS_FILTRE,
    Specification,
    TRANSFORMATIONS,
    construireSql,
    schemaFiltreFichier,
    schemaSpecification
} from './constructeur-sql';

const LIMITE_APERCU = 200;
/** Une extraction ne lit jamais : un SQL personnalisé qui ne commence pas ainsi est refusé. */
const LECTURE_SEULE = /^\s*(SELECT|WITH)\b/i;
/** Nombre de valeurs proposées dans les listes déroulantes des filtres. */
const VALEURS_SUGGEREES = 200;

/** Nombre de valeurs absentes montrées en exemple : assez pour comprendre, pas assez pour noyer. */
const EXEMPLES_ABSENTS = 20;

const schemaVerification = z.object({ fichier: schemaFiltreFichier });

/** Lecture d'une liste fournie : soit un fichier déjà déposé, soit un texte collé dans l'écran. */
const schemaLectureFichier = z.object({
    nomServeur: z.string().trim().max(300).default(''),
    feuille: z.string().trim().max(200).default(''),
    texte: z.string().default(''),
    separateur: z.string().max(4).default('')
});

const schemaValeurs = z.object({
    tableId: z.string().min(1),
    nomColonne: z.string().min(1),
    debut: z.string().trim().max(200).default('')
});

const schemaApercu = z.object({ specification: schemaSpecification, limite: z.number().int().positive().max(5000).default(LIMITE_APERCU) });
const schemaMaterialisation = z.object({ specification: schemaSpecification, nom: z.string().trim().min(1).max(120) });
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
        return {
            operateurs: OPERATEURS_FILTRE,
            transformations: TRANSFORMATIONS,
            agregats: AGREGATS,
            genresColonne: GENRES_COLONNE,
            modesSynthese: MODES_SYNTHESE,
            comparaisonsFichier: COMPARAISONS_FICHIER,
            modesFichier: MODES_FICHIER
        };
    }

    @Post('lire-fichier')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({
        summary: 'Lit la liste fournie pour un filtre « dans le fichier » : fichier déposé (CSV, texte, Excel) ou texte collé.'
    })
    async lireFichier(
        @EspaceCourant() espace: EspaceAvecRole,
        @Body(valider(schemaLectureFichier)) corps: z.infer<typeof schemaLectureFichier>
    ) {
        if (corps.texte.trim()) return lireTexteDelimite(corps.texte, corps.separateur);
        if (!corps.nomServeur) throw erreurRequete('Déposez un fichier ou collez une liste de valeurs.');
        const nom = verifierNomSur(corps.nomServeur, 'nom de fichier');
        const { fichiers } = await this.espaces.ressources(espace);
        try {
            const contenu = await fsp.readFile(fichiers.chemin(nom));
            if (nom.toLowerCase().endsWith('.xlsx'))
                return tableauDepuisLignes(lireFeuilleExcel(contenu, corps.feuille || undefined).lignes);
            return lireTexteDelimite(contenu.toString('utf8'), corps.separateur);
        } catch (erreur) {
            throw erreurRequete(`Fichier illisible : ${(erreur as Error).message}`);
        }
    }

    @Post('valeurs')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Valeurs les plus fréquentes d’une colonne, pour les suggérer dans les filtres.' })
    async valeurs(@EspaceCourant() espace: EspaceAvecRole, @Body(valider(schemaValeurs)) corps: z.infer<typeof schemaValeurs>) {
        const sources = await this.sources.listerAvecJeux(espace.id);
        const source = sources.find(candidat => String(candidat.id) === corps.tableId);
        if (!source) throw erreurIntrouvable('Source inconnue.');
        if (!(source.headers || []).includes(corps.nomColonne)) throw erreurRequete(`Colonne inconnue : « ${corps.nomColonne} ».`);
        const colonne = `TRIM(CAST(${identifiantSql(corps.nomColonne)} AS VARCHAR))`;
        const commence = corps.debut ? `AND LOWER(${colonne}) LIKE ${litteralSql(corps.debut.toLowerCase())} || '%'` : '';
        const { moteur } = await this.espaces.ressources(espace);
        const resultat = await moteur.executer(
            `SELECT ${colonne} AS valeur, COUNT(*)::BIGINT AS lignes FROM ${identifiantSql('t_' + corps.tableId)}` +
                ` WHERE ${colonne} <> '' ${commence} GROUP BY 1 ORDER BY lignes DESC, valeur LIMIT ${VALEURS_SUGGEREES}`
        );
        return resultat.lignes.map(ligne => ({ valeur: String(ligne[0]), lignes: Number(ligne[1]) }));
    }

    @Post('verifier-fichier')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Combien de valeurs du fichier déposé n’existent pas dans la table visée, et lesquelles.' })
    async verifierFichier(
        @EspaceCourant() espace: EspaceAvecRole,
        @Body(valider(schemaVerification)) corps: z.infer<typeof schemaVerification>
    ) {
        const fichier = corps.fichier;
        const premiere = fichier.correspondances[0];
        if (!premiere) throw erreurRequete('Indiquez d’abord à quelle colonne le fichier correspond.');
        const nomTable = 't_' + premiere.tableId;
        const { moteur } = await this.espaces.ressources(espace);
        const [comptage, exemples] = await Promise.all([
            moteur.executer(sqlValeursAbsentes('verif', fichier, nomTable, 0)),
            moteur.executer(sqlValeursAbsentes('verif', fichier, nomTable, EXEMPLES_ABSENTS))
        ]);
        return {
            lignesDuFichier: fichier.lignes.length,
            manquantes: Number(comptage.lignes[0]?.[0] ?? 0),
            exemples: exemples.lignes.map(ligne => String(ligne[0]))
        };
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

    @Post('bilan')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Bilan qualité du résultat : nombre de lignes et taux de complétude de chaque colonne.' })
    async bilan(@EspaceCourant() espace: EspaceAvecRole, @Body(valider(schemaSpecification)) specification: Specification) {
        const { sql } = await this.construire(espace, { ...specification, limite: undefined, tri: [] });
        const { moteur } = await this.espaces.ressources(espace);
        const colonnes = (await moteur.executer(`SELECT * FROM (${sql}) AS extraction LIMIT 0`)).colonnes.map(colonne => colonne.nom);
        const comptes = colonnes.map(
            colonne =>
                `COUNT(*) FILTER (WHERE ${identifiantSql(colonne)} IS NOT NULL AND TRIM(CAST(${identifiantSql(colonne)} AS VARCHAR)) <> '')::BIGINT`
        );
        const ligne = (
            await moteur.executer(`SELECT COUNT(*)::BIGINT${comptes.length ? ', ' + comptes.join(', ') : ''} FROM (${sql}) AS extraction`)
        ).lignes[0];
        const total = Number(ligne[0]);
        return {
            total,
            colonnes: colonnes.map((nom, index) => {
                const renseignees = Number(ligne[index + 1]);
                return { nom, renseignees, part: total ? renseignees / total : 1 };
            })
        };
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

    @Post('materialiser')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Enregistre le résultat de l’extraction comme une source de l’espace (table DuckDB), réutilisable partout.' })
    async materialiser(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaMaterialisation)) corps: z.infer<typeof schemaMaterialisation>
    ) {
        const { sql } = await this.construire(espace, corps.specification);
        const sources = await this.sources.listerAvecJeux(espace.id);
        const homonyme = sources.find(candidat => candidat.name === corps.nom);
        if (homonyme && homonyme.type !== 'extraction') throw erreurRequete(`Le nom « ${corps.nom} » est déjà celui d'une source déposée.`);
        const id = homonyme?.id || 'tb_' + randomBytes(6).toString('hex');
        const { moteur } = await this.espaces.ressources(espace);
        await moteur.abandonner('t_' + id);
        await moteur.executer(
            `CREATE TABLE ${identifiantSql('t_' + id)} AS SELECT row_number() OVER () AS __rn, * FROM (\n${sql}\n) extraction`
        );
        const [structure, total] = await Promise.all([
            moteur.executer(`SELECT * EXCLUDE (__rn) FROM ${identifiantSql('t_' + id)} LIMIT 0`),
            moteur.executer(`SELECT COUNT(*)::BIGINT FROM ${identifiantSql('t_' + id)}`)
        ]);
        const colonnes = structure.colonnes.map(colonne => colonne.nom);
        await this.sources.ecrire(espace.id, id, {
            id,
            name: corps.nom,
            type: 'extraction',
            storage: 'table',
            size: 0,
            headers: colonnes,
            origine: 'extraction',
            specification: corps.specification
        });
        await this.journal.consigner({
            espaceId: espace.id,
            utilisateurId: utilisateur.id,
            action: 'extraction.materialisation',
            cible: corps.nom
        });
        return { sourceId: id, nom: corps.nom, lignes: Number(total.lignes[0][0]), colonnes };
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
        // Le SQL personnalisé est une requête écrite par l'utilisateur : seule la lecture est acceptée.
        if (specification.sqlPersonnalise.trim() && !LECTURE_SEULE.test(specification.sqlPersonnalise))
            throw erreurRequete('SQL personnalisé : seules les requêtes de lecture (SELECT, WITH) sont acceptées.');
        const sources = await this.sources.listerAvecJeux(espace.id);
        const parId = new Map(sources.map(source => [String(source.id), source]));
        const contexte: ContexteConstruction = {
            nomTableDe: tableId => {
                if (!parId.has(tableId)) throw erreurRequete(`Source inconnue dans l'extraction : ${tableId}`);
                return 't_' + tableId;
            },
            nomSourceDe: tableId => parId.get(tableId)?.name ?? tableId,
            colonnesDe: tableId => parId.get(tableId)?.headers ?? []
        };
        try {
            return construireSql(specification, contexte);
        } catch (erreur) {
            if (erreur instanceof ErreurSpecification) throw erreurRequete(erreur.message);
            throw erreur;
        }
    }
}
