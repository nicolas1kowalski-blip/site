/**
 * Routes qualité : profilage (avec filtres d'audit), inspecteur d'anomalies, doublons exacts et approchés, clés
 * fonctionnelles, règles (CRUD, exécution, lignes en échec), audit d'un objet métier, audits enregistrés, vocabulaire.
 */
import { Body, Controller, Delete, Get, Param, Post, Put, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import { z } from 'zod';
import { EspaceAvecRole, EspaceCourant, RoleEspaceRequis, UtilisateurCourant } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { valider } from '../commun/validation';
import { JournalService } from '../journal/journal.service';
import { schemaFiltreSource } from '../tables-concues/constructeur-table-concue';
import { GENRES_ANOMALIE } from './anomalies';
import { MODES_APPARIEMENT, schemaProfilCle } from './cle-fonctionnelle';
import { QualiteService } from './qualite.service';
import { CRENEAUX_SAISON, TYPES_REGLE_SERIE } from './regles-series';
import {
    AGREGATS_GROUPE,
    CRITICITES,
    EXPLICATIONS_REGLE,
    OPERATEURS_CONDITION,
    OPERATEURS_GROUPE,
    TYPES_REGLE,
    TYPES_SANS_COLONNE,
    schemaRegle
} from './regles';

/** Filtres d'audit : conditions sur les lignes de la source, pour n'auditer qu'un périmètre. */
const schemaFiltres = z.array(schemaFiltreSource).default([]);
/** Volume analysé : nombre de premières lignes retenues (absent = toute la source). */
const schemaEchantillon = z.number().int().min(1).max(10_000_000).optional();
const schemaSource = z.object({ sourceId: z.string().min(1, 'source requise'), filtres: schemaFiltres, echantillon: schemaEchantillon });
const schemaColonne = schemaSource.extend({ colonne: z.string().min(1, 'colonne requise') });
const schemaDoublons = z.object({
    sourceId: z.string().min(1),
    cle: z.array(z.string().min(1)).min(1, 'au moins une colonne'),
    filtres: schemaFiltres
});
const schemaLignesAnomalie = z.object({
    sourceId: z.string().min(1),
    genre: z.enum(Object.keys(GENRES_ANOMALIE) as [keyof typeof GENRES_ANOMALIE, ...(keyof typeof GENRES_ANOMALIE)[]]),
    colonne: z.string().default(''),
    offset: z.number().int().min(0).default(0),
    filtres: schemaFiltres
});
const schemaExecution = z.object({ sourceId: z.string().optional() });
const schemaAuditObjet = z.object({ objetId: z.string().min(1, 'objet métier requis'), filtres: schemaFiltres });
const schemaProfilsCle = z.object({ profils: z.array(schemaProfilCle).default([]) });
const schemaDoublonsApproches = z.object({ sourceId: z.string().min(1), seuil: z.number().min(0.5).max(1).default(0.92) });

@ApiTags('Qualité')
@Controller('api/qualite')
export class QualiteController {
    constructor(
        private readonly qualite: QualiteService,
        private readonly journal: JournalService
    ) {}

    @Get('vocabulaire')
    @RoleEspaceRequis('lecteur')
    vocabulaire() {
        return {
            typesRegle: TYPES_REGLE,
            typesSansColonne: TYPES_SANS_COLONNE,
            criticites: CRITICITES,
            operateursCondition: OPERATEURS_CONDITION,
            agregatsGroupe: AGREGATS_GROUPE,
            operateursGroupe: OPERATEURS_GROUPE,
            genresAnomalie: GENRES_ANOMALIE,
            modesAppariement: MODES_APPARIEMENT,
            typesRegleSerie: TYPES_REGLE_SERIE,
            creneauxSaison: CRENEAUX_SAISON,
            explications: EXPLICATIONS_REGLE
        };
    }

    // ---- profilage et anomalies ----
    @Post('profil')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Profile une source colonne par colonne (périmètre filtrable), liste ses anomalies et enregistre l’audit.' })
    async profiler(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaSource)) corps: z.infer<typeof schemaSource>
    ) {
        const profil = await this.qualite.profiler(espace, corps.sourceId, utilisateur.id, corps.filtres, corps.echantillon);
        await this.journal.consigner({
            espaceId: espace.id,
            utilisateurId: utilisateur.id,
            action: 'qualite.profilage',
            cible: profil.sourceNom,
            details: { lignes: profil.lignes, filtres: corps.filtres.length, echantillon: corps.echantillon ?? null }
        });
        return profil;
    }

    @Post('colonne')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Détail d’une colonne : type sémantique, statistiques, valeurs fréquentes, formats, signaux.' })
    detailColonne(@EspaceCourant() espace: EspaceAvecRole, @Body(valider(schemaColonne)) corps: z.infer<typeof schemaColonne>) {
        return this.qualite.detailColonne(espace, corps.sourceId, corps.colonne, corps.filtres, corps.echantillon);
    }

    @Post('anomalies/lignes')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Les lignes concernées par une anomalie du profil (page de 50).' })
    lignesAnomalie(
        @EspaceCourant() espace: EspaceAvecRole,
        @Body(valider(schemaLignesAnomalie)) corps: z.infer<typeof schemaLignesAnomalie>
    ) {
        return this.qualite.lignesAnomalie(espace, corps.sourceId, corps.genre, corps.colonne, corps.offset, corps.filtres);
    }

    // ---- doublons ----
    @Post('doublons')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Cherche les doublons d’une source sur une clé (une ou plusieurs colonnes).' })
    async doublons(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaDoublons)) corps: z.infer<typeof schemaDoublons>
    ) {
        const resultat = await this.qualite.doublons(espace, corps.sourceId, corps.cle, utilisateur.id, corps.filtres);
        await this.journal.consigner({
            espaceId: espace.id,
            utilisateurId: utilisateur.id,
            action: 'qualite.doublons',
            cible: corps.sourceId,
            details: { cle: corps.cle, groupes: resultat.groupes }
        });
        return resultat;
    }

    @Get('cles/:nomSource')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Les profils de clé fonctionnelle d’une source (dictionnaire de gouvernance).' })
    profilsCle(@EspaceCourant() espace: EspaceAvecRole, @Param('nomSource') nomSource: string) {
        return this.qualite.profilsCle(espace.id, nomSource);
    }

    @Put('cles/:nomSource')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Remplace les profils de clé fonctionnelle d’une source.' })
    async enregistrerProfilsCle(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('nomSource') nomSource: string,
        @Body(valider(schemaProfilsCle)) corps: z.infer<typeof schemaProfilsCle>
    ) {
        return this.qualite.enregistrerProfilsCle(espace, utilisateur, nomSource, corps.profils);
    }

    @Post('doublons-approches')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Analyse chaque profil de clé : doublons exacts, écritures différentes, clés ressemblantes.' })
    async doublonsApproches(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaDoublonsApproches)) corps: z.infer<typeof schemaDoublonsApproches>
    ) {
        const resultats = await this.qualite.doublonsApproches(espace, corps.sourceId, corps.seuil, utilisateur.id);
        await this.journal.consigner({
            espaceId: espace.id,
            utilisateurId: utilisateur.id,
            action: 'qualite.doublons-approches',
            cible: corps.sourceId,
            details: { profils: resultats.length, seuil: corps.seuil }
        });
        return resultats;
    }

    @Post('doublons-approches/lignes')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Toutes les lignes en double des profils de clé (strictes, normalisées, paires floues).' })
    lignesEnDouble(
        @EspaceCourant() espace: EspaceAvecRole,
        @Body(valider(schemaDoublonsApproches)) corps: z.infer<typeof schemaDoublonsApproches>
    ) {
        return this.qualite.lignesEnDouble(espace, corps.sourceId, corps.seuil);
    }

    @Post('doublons-approches/export.xlsx')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Classeur Excel des lignes en double : synthèse, strictes, casse-accents tolérés, paires floues.' })
    async classeurDoublons(
        @EspaceCourant() espace: EspaceAvecRole,
        @Body(valider(schemaDoublonsApproches)) corps: z.infer<typeof schemaDoublonsApproches>,
        @Res() reponse: FastifyReply
    ) {
        const classeur = await this.qualite.classeurDoublons(espace, corps.sourceId, corps.seuil);
        reponse
            .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            .header('content-disposition', `attachment; filename="${classeur.nomFichier}"`)
            .send(classeur.contenu);
    }

    // ---- règles ----
    @Get('regles')
    @RoleEspaceRequis('lecteur')
    regles(@EspaceCourant() espace: EspaceAvecRole, @Query('sourceId') sourceId?: string) {
        return this.qualite.regles(espace.id, sourceId || undefined);
    }

    @Post('regles')
    @RoleEspaceRequis('editeur')
    async creerRegle(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaRegle)) corps: z.infer<typeof schemaRegle>
    ) {
        const regle = await this.qualite.creerRegle(espace, corps);
        await this.journal.consigner({
            espaceId: espace.id,
            utilisateurId: utilisateur.id,
            action: 'qualite.regle.creation',
            cible: regle.nom
        });
        return regle;
    }

    @Put('regles/:id')
    @RoleEspaceRequis('editeur')
    async modifierRegle(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('id') id: string,
        @Body(valider(schemaRegle)) corps: z.infer<typeof schemaRegle>
    ) {
        const regle = await this.qualite.modifierRegle(espace, id, corps);
        await this.journal.consigner({
            espaceId: espace.id,
            utilisateurId: utilisateur.id,
            action: 'qualite.regle.modification',
            cible: regle.nom
        });
        return regle;
    }

    @Delete('regles/:id')
    @RoleEspaceRequis('editeur')
    async supprimerRegle(@EspaceCourant() espace: EspaceAvecRole, @UtilisateurCourant() utilisateur: Utilisateur, @Param('id') id: string) {
        await this.qualite.supprimerRegle(espace.id, id);
        await this.journal.consigner({
            espaceId: espace.id,
            utilisateurId: utilisateur.id,
            action: 'qualite.regle.suppression',
            cible: id
        });
        return { ok: true };
    }

    @Post('regles/executer')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Exécute les règles actives (d’une source ou de tout l’espace) et renvoie le score.' })
    async executer(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaExecution)) corps: z.infer<typeof schemaExecution>
    ) {
        const execution = await this.qualite.executerRegles(espace, corps.sourceId, utilisateur.id);
        await this.journal.consigner({
            espaceId: espace.id,
            utilisateurId: utilisateur.id,
            action: 'qualite.regles.execution',
            cible: corps.sourceId || 'espace',
            details: { score: execution.score, regles: execution.regles.length }
        });
        return execution;
    }

    @Post('regles/:id/executer')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Exécute une seule règle (même inactive) et renvoie son résultat.' })
    async executerUneRegle(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('id') id: string
    ) {
        const resultat = await this.qualite.executerUneRegle(espace, id, utilisateur.id);
        await this.journal.consigner({
            espaceId: espace.id,
            utilisateurId: utilisateur.id,
            action: 'qualite.regle.execution',
            cible: resultat.nom,
            details: { echecs: resultat.resultat?.echecs ?? null }
        });
        return resultat;
    }

    @Post('regles/:id/dupliquer')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Copie une règle (désactivée, nom suffixé « (copie) »).' })
    async dupliquerRegle(@EspaceCourant() espace: EspaceAvecRole, @UtilisateurCourant() utilisateur: Utilisateur, @Param('id') id: string) {
        const copie = await this.qualite.dupliquerRegle(espace, id);
        await this.journal.consigner({
            espaceId: espace.id,
            utilisateurId: utilisateur.id,
            action: 'qualite.regle.duplication',
            cible: copie.nom
        });
        return copie;
    }

    @Get('regles/:id/lignes')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Les lignes qui ne respectent pas une règle (page de 50).' })
    lignesRegle(@EspaceCourant() espace: EspaceAvecRole, @Param('id') id: string, @Query('offset') offset?: string) {
        return this.qualite.lignesRegle(espace, id, offset ? Number(offset) : 0);
    }

    // ---- objet métier ----
    @Post('objet')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Audit d’un objet métier : profil de la table maître, règles du périmètre, cardinalité des facettes.' })
    async auditObjet(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaAuditObjet)) corps: z.infer<typeof schemaAuditObjet>
    ) {
        const audit = await this.qualite.auditObjet(espace, corps.objetId, utilisateur.id, corps.filtres);
        await this.journal.consigner({
            espaceId: espace.id,
            utilisateurId: utilisateur.id,
            action: 'qualite.objet',
            cible: audit.objet.name,
            details: { score: audit.regles.score, facettes: audit.facettes.length }
        });
        return audit;
    }

    // ---- audits enregistrés ----
    @Get('audits')
    @RoleEspaceRequis('lecteur')
    audits(@EspaceCourant() espace: EspaceAvecRole, @Query('sourceId') sourceId?: string, @Query('limite') limite?: string) {
        return this.qualite.audits(espace.id, sourceId || undefined, limite ? Number(limite) : 100);
    }

    @Get('audits/:id')
    @RoleEspaceRequis('lecteur')
    audit(@EspaceCourant() espace: EspaceAvecRole, @Param('id') id: string) {
        return this.qualite.audit(espace.id, id);
    }
}
