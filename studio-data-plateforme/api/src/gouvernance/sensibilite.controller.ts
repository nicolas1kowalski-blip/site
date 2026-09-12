/** Routes de sensibilité : classification par colonne (niveaux saisis et proposés), actions par niveau, détection RGPD. */
import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { EspaceAvecRole, EspaceCourant, RoleEspaceRequis, UtilisateurCourant } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { valider } from '../commun/validation';
import { EspacesService } from '../espaces/espaces.service';
import { MoteurDuckDB } from '../espaces/moteur-duckdb';
import { nombre } from '../qualite/profilage';
import { DocumentSource, SourcesService } from '../sources/sources.service';
import { EtatApplication, GouvernanceService } from './gouvernance.service';
import {
    ACTIONS_ANONYMISATION,
    MOTIF_NOM_PERSONNEL,
    NIVEAUX_SENSIBILITE,
    motifDesIndices,
    niveauPropose,
    sqlIndicesPersonnels
} from './sensibilite';

const schemaNiveau = z.object({
    table: z.string().min(1),
    col: z.string().min(1),
    niveau: z.enum(['', 'public', 'interne', 'confidentiel', 'personnel'])
});
const schemaActions = z.object({
    actions: z.record(z.enum(['public', 'interne', 'confidentiel', 'personnel']), z.enum(['none', 'mask', 'pseudo', 'generalize', 'drop']))
});

export type ColonneClassee = { table: string; col: string; niveau: string; niveauPropose: string; sensibilite: string };
export type ColonnePersonnelle = { table: string; col: string; motif: string };

@ApiTags('Gouvernance')
@Controller('api/gouvernance/sensibilite')
export class SensibiliteController {
    constructor(
        private readonly gouvernance: GouvernanceService,
        private readonly sources: SourcesService,
        private readonly espaces: EspacesService
    ) {}

    @Get()
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Classification de chaque colonne (niveau saisi, niveau proposé) et actions par niveau.' })
    async classification(@EspaceCourant() espace: EspaceAvecRole) {
        const [etat, sources] = await Promise.all([this.gouvernance.etat(espace.id), this.sources.lister(espace.id)]);
        const colonnes: ColonneClassee[] = [];
        for (const source of sources)
            for (const nomColonne of source.headers || []) {
                const sensibilite = String(etat.governance.dictionary[source.name]?.columns?.[nomColonne]?.['sensitivity'] || '');
                colonnes.push({
                    table: source.name,
                    col: nomColonne,
                    niveau: etat.governance.privacy.levels[source.name]?.[nomColonne] || '',
                    niveauPropose: niveauPropose(sensibilite, nomColonne),
                    sensibilite
                });
            }
        return {
            niveaux: NIVEAUX_SENSIBILITE,
            actionsPossibles: ACTIONS_ANONYMISATION,
            actions: etat.governance.privacy.actions,
            colonnes
        };
    }

    @Put('niveau')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Fixe (ou efface, niveau vide) la classification d’une colonne.' })
    async definirNiveau(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaNiveau)) corps: z.infer<typeof schemaNiveau>
    ) {
        const etat = await this.gouvernance.etat(espace.id);
        const niveaux = etat.governance.privacy.levels;
        if (corps.niveau) (niveaux[corps.table] = niveaux[corps.table] || {})[corps.col] = corps.niveau;
        else if (niveaux[corps.table]) delete niveaux[corps.table][corps.col];
        await this.gouvernance.enregistrer(espace, utilisateur, etat, 'sensibilite.niveau', `${corps.table}.${corps.col}`);
        return { ok: true };
    }

    @Put('actions')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Action d’anonymisation associée à chaque niveau.' })
    async definirActions(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaActions)) corps: z.infer<typeof schemaActions>
    ) {
        const etat = await this.gouvernance.etat(espace.id);
        etat.governance.privacy.actions = { ...etat.governance.privacy.actions, ...corps.actions };
        await this.gouvernance.enregistrer(espace, utilisateur, etat, 'sensibilite.actions', 'niveaux');
        return etat.governance.privacy.actions;
    }

    @Post('detecter')
    @RoleEspaceRequis('editeur')
    @ApiOperation({
        summary: 'Détecte les colonnes à caractère personnel (nom, puis échantillon) et pré-remplit la sensibilité du dictionnaire.'
    })
    async detecter(@EspaceCourant() espace: EspaceAvecRole, @UtilisateurCourant() utilisateur: Utilisateur) {
        const [etat, sources] = await Promise.all([this.gouvernance.etat(espace.id), this.sources.lister(espace.id)]);
        const { moteur } = await this.espaces.ressources(espace);
        const trouvees: ColonnePersonnelle[] = [];
        for (const source of sources) trouvees.push(...(await this.detecterDansSource(moteur, source)));
        for (const colonne of trouvees) this.preRemplirSensibilite(etat, colonne);
        await this.gouvernance.enregistrer(espace, utilisateur, etat, 'sensibilite.detection', `${trouvees.length} colonne(s)`);
        return trouvees;
    }

    /** Colonnes personnelles d'une source : par le nom, sinon par l'échantillon de valeurs. */
    private async detecterDansSource(moteur: MoteurDuckDB, source: DocumentSource): Promise<ColonnePersonnelle[]> {
        const trouvees: ColonnePersonnelle[] = [];
        for (const nomColonne of source.headers || []) {
            let motif = MOTIF_NOM_PERSONNEL.test(nomColonne) ? 'nom de colonne' : '';
            if (!motif)
                try {
                    const [total, emails, telephones, ibans] = (await moteur.executer(sqlIndicesPersonnels('t_' + source.id, nomColonne)))
                        .lignes[0];
                    motif = motifDesIndices(nombre(total), nombre(emails), nombre(telephones), nombre(ibans));
                } catch {
                    motif = '';
                }
            if (motif) trouvees.push({ table: source.name, col: nomColonne, motif });
        }
        return trouvees;
    }

    /** La sensibilité « Personnel (RGPD) » est proposée dans le dictionnaire si la colonne n'en a pas encore. */
    private preRemplirSensibilite(etat: EtatApplication, colonne: ColonnePersonnelle): void {
        const fiche = this.gouvernance.ficheDictionnaire(etat, colonne.table);
        const champs = (fiche.columns[colonne.col] = fiche.columns[colonne.col] || {});
        if (!champs['sensitivity']) champs['sensitivity'] = 'Personnel (RGPD)';
    }
}
