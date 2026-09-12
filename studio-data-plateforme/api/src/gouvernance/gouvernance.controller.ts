/**
 * Gouvernance typée pour l'interface Angular : glossaire et dictionnaire des sources.
 *
 * Une seule source de vérité : le document « appState » de l'espace (celui que l'application classique lit
 * et écrit). Ces routes en lisent et modifient des parties précises, si bien que les deux interfaces voient
 * les mêmes données. Quand tous les écrans seront en Angular, ce document pourra être éclaté en tables.
 */
import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { EspaceAvecRole, EspaceCourant, RoleEspaceRequis, UtilisateurCourant } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { erreurIntrouvable, verifierNomSur } from '../commun/erreurs';
import { valider } from '../commun/validation';
import { DocumentsService } from '../documents/documents.service';
import { JournalService } from '../journal/journal.service';

/** Terme du glossaire, tel que l'application classique le range dans governance.glossary. */
export type TermeGlossaire = { id: string; term: string; definition: string; domain?: string; synonyms?: string; owner?: string };
/** Fiche de dictionnaire d'une source (governance.dictionary[nomSource]). */
export type FicheDictionnaire = {
    description?: string;
    owner?: string;
    domain?: string;
    updateFrequency?: string;
    sensitivity?: string;
    columns?: Record<string, { description?: string; sensitivity?: string }>;
};

type EtatApplication = {
    governance?: { glossary?: TermeGlossaire[]; dictionary?: Record<string, FicheDictionnaire>; [autre: string]: unknown };
    [autre: string]: unknown;
};

const schemaTerme = z.object({
    term: z.string().trim().min(1, 'terme requis'),
    definition: z.string().trim().default(''),
    domain: z.string().trim().optional(),
    synonyms: z.string().trim().optional(),
    owner: z.string().trim().optional()
});
const schemaFiche = z.object({
    description: z.string().trim().optional(),
    owner: z.string().trim().optional(),
    domain: z.string().trim().optional(),
    updateFrequency: z.string().trim().optional(),
    sensitivity: z.string().trim().optional(),
    columns: z.record(z.object({ description: z.string().optional(), sensitivity: z.string().optional() })).optional()
});

@ApiTags('Gouvernance')
@Controller('api/gouvernance')
export class GouvernanceController {
    constructor(
        private readonly documents: DocumentsService,
        private readonly journal: JournalService
    ) {}

    @Get('glossaire')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Termes du glossaire, triés par terme.' })
    async glossaire(@EspaceCourant() espace: EspaceAvecRole): Promise<TermeGlossaire[]> {
        const etat = await this.etat(espace.id);
        return [...(etat.governance?.glossary || [])].sort((a, b) => a.term.localeCompare(b.term, 'fr'));
    }

    @Put('glossaire/:id')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Crée ou modifie un terme (l’identifiant est choisi par le client, ex. gl_xxxxx).' })
    async ecrireTerme(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('id') id: string,
        @Body(valider(schemaTerme)) corps: z.infer<typeof schemaTerme>
    ) {
        const idSur = verifierNomSur(id, 'identifiant de terme');
        const etat = await this.etat(espace.id);
        const glossaire = etat.governance!.glossary!;
        const position = glossaire.findIndex(terme => terme.id === idSur);
        const terme: TermeGlossaire = { ...(position >= 0 ? glossaire[position] : {}), id: idSur, ...corps };
        if (position >= 0) glossaire[position] = terme;
        else glossaire.push(terme);
        await this.enregistrer(espace, utilisateur, etat, position >= 0 ? 'glossaire.modification' : 'glossaire.ajout', terme.term);
        return terme;
    }

    @Delete('glossaire/:id')
    @RoleEspaceRequis('editeur')
    async supprimerTerme(@EspaceCourant() espace: EspaceAvecRole, @UtilisateurCourant() utilisateur: Utilisateur, @Param('id') id: string) {
        const etat = await this.etat(espace.id);
        const glossaire = etat.governance!.glossary!;
        const position = glossaire.findIndex(terme => terme.id === id);
        if (position < 0) throw erreurIntrouvable('Terme inconnu.');
        const [supprime] = glossaire.splice(position, 1);
        await this.enregistrer(espace, utilisateur, etat, 'glossaire.suppression', supprime.term);
        return { ok: true };
    }

    @Get('dictionnaire')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Fiches du dictionnaire, par nom de source.' })
    async dictionnaire(@EspaceCourant() espace: EspaceAvecRole): Promise<Record<string, FicheDictionnaire>> {
        return (await this.etat(espace.id)).governance!.dictionary!;
    }

    @Put('dictionnaire/:source')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Crée ou modifie la fiche d’une source (fusion champ par champ).' })
    async ecrireFiche(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('source') source: string,
        @Body(valider(schemaFiche)) corps: z.infer<typeof schemaFiche>
    ) {
        const etat = await this.etat(espace.id);
        const dictionnaire = etat.governance!.dictionary!;
        const fiche: FicheDictionnaire = { ...(dictionnaire[source] || {}), ...corps };
        if (corps.columns) fiche.columns = { ...(dictionnaire[source]?.columns || {}), ...corps.columns };
        dictionnaire[source] = fiche;
        await this.enregistrer(espace, utilisateur, etat, 'dictionnaire.modification', source);
        return fiche;
    }

    /** Lit l'état de l'application en garantissant la présence des sections utilisées ici. */
    private async etat(espaceId: string): Promise<EtatApplication> {
        const etat = ((await this.documents.lire<EtatApplication>(espaceId, 'appState')) || {}) as EtatApplication;
        etat.governance = etat.governance || {};
        if (!Array.isArray(etat.governance.glossary)) etat.governance.glossary = [];
        if (!etat.governance.dictionary || typeof etat.governance.dictionary !== 'object') etat.governance.dictionary = {};
        return etat;
    }

    private async enregistrer(
        espace: EspaceAvecRole,
        utilisateur: Utilisateur,
        etat: EtatApplication,
        action: string,
        cible: string
    ): Promise<void> {
        etat.savedAt = new Date().toISOString();
        await this.documents.ecrire(espace.id, 'appState', etat, utilisateur.id);
        await this.journal.consigner({ espaceId: espace.id, utilisateurId: utilisateur.id, action, cible });
    }
}
