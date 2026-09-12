/**
 * Référentiels de gouvernance : objets métier, actifs (applications, processus, restitutions), périmètres,
 * personnes et rôles, domaines métier. Chaque collection vit dans le document appState (format classique) ;
 * les schémas ci-dessous valident les champs connus et laissent passer les autres (passthrough), pour ne
 * jamais perdre une information saisie dans l'application classique.
 */
import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { EspaceAvecRole, EspaceCourant, RoleEspaceRequis, UtilisateurCourant } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { erreurRequete, verifierNomSur } from '../commun/erreurs';
import { valider } from '../commun/validation';
import { GouvernanceService } from './gouvernance.service';

export const ROLES_OBJET_SOURCE = { maitre: 'source maître', contributeur: 'contributeur', destinataire: 'destinataire' } as const;
export const GENRES_ACTIF = { app: 'Application / système', process: 'Processus métier', report: 'Restitution' } as const;
export const ROLES_PERSONNE = { owner: 'Propriétaire', contrib: 'Contributeur', reader: 'Lecteur', admin: 'Administrateur' } as const;
export const CRITICITES_ACTIF = ['Faible', 'Moyenne', 'Haute', 'Critique'] as const;

const schemaCorrespondance = z.object({ table: z.string(), col: z.string() });
const schemaAttribut = z
    .object({
        id: z.string().min(1),
        name: z.string().trim().min(1, 'nom d’attribut requis'),
        definition: z.string().optional(),
        mappings: z.array(schemaCorrespondance).default([]),
        usedBy: z.array(z.string()).default([]),
        owner: z.string().optional(),
        sensitivity: z.string().optional(),
        examples: z.string().optional(),
        term: z.string().optional()
    })
    .passthrough();
const schemaObjetMetier = z
    .object({
        name: z.string().trim().min(1, 'nom requis'),
        definition: z.string().default(''),
        domain: z.string().optional(),
        globalOwner: z.string().default(''),
        contributors: z.array(z.string()).default([]),
        status: z.string().optional(),
        elements: z.array(schemaAttribut).default([]),
        sources: z.array(z.object({ table: z.string().min(1), role: z.enum(['maitre', 'contributeur', 'destinataire']) })).default([]),
        producedBy: z.array(z.string()).default([]),
        consumedBy: z.array(z.string()).default([]),
        references: z.array(z.object({ boId: z.string(), cardinality: z.string().optional() }).passthrough()).default([]),
        appId: z.string().optional()
    })
    .passthrough();
const schemaActif = z
    .object({
        name: z.string().trim().min(1, 'nom requis'),
        kind: z.enum(['app', 'process', 'report']),
        description: z.string().default(''),
        owner: z.string().default(''),
        domain: z.string().default(''),
        criticality: z.string().default('Moyenne'),
        sources: z.array(z.string()).default([]),
        tables: z.array(z.string()).default([]),
        columns: z.array(schemaCorrespondance).default([]),
        boIds: z.array(z.string()).default([]),
        appIds: z.array(z.string()).default([]),
        producedBy: z.array(z.string()).default([]),
        deliveredTo: z.array(z.string()).default([]),
        recipients: z.string().optional(),
        frequency: z.string().optional(),
        format: z.string().optional()
    })
    .passthrough();
const schemaPerimetre = z
    .object({
        name: z.string().trim().min(1, 'nom requis'),
        description: z.string().default(''),
        tables: z.array(z.string()).default([]),
        boIds: z.array(z.string()).default([])
    })
    .passthrough();
const schemaPersonne = z
    .object({
        name: z.string().trim().min(1, 'nom requis'),
        email: z.string().default(''),
        roles: z.array(z.object({ domain: z.string().default(''), role: z.enum(['owner', 'contrib', 'reader', 'admin']) })).default([])
    })
    .passthrough();
const schemaDomaine = z.object({ name: z.string().trim().min(1, 'nom de domaine requis') });

@ApiTags('Gouvernance')
@Controller('api/gouvernance')
export class ReferentielsController {
    constructor(private readonly gouvernance: GouvernanceService) {}

    @Get('vocabulaire')
    @RoleEspaceRequis('lecteur')
    vocabulaire() {
        return { rolesSource: ROLES_OBJET_SOURCE, genresActif: GENRES_ACTIF, rolesPersonne: ROLES_PERSONNE, criticites: CRITICITES_ACTIF };
    }

    // ---- objets métier ----
    @Get('objets-metier')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Objets métier de l’espace (format de l’application classique).' })
    objetsMetier(@EspaceCourant() espace: EspaceAvecRole) {
        return this.gouvernance.lister(espace.id, 'businessObjects');
    }

    @Put('objets-metier/:id')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Crée ou remplace un objet métier (identifiant choisi par le client, ex. bo_xxxxx).' })
    async ecrireObjetMetier(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('id') id: string,
        @Body(valider(schemaObjetMetier)) corps: z.infer<typeof schemaObjetMetier>
    ) {
        const idSur = verifierNomSur(id, 'identifiant d’objet métier');
        const homonyme = (await this.gouvernance.lister(espace.id, 'businessObjects')).find(
            candidat => candidat.id !== idSur && String(candidat['name']).toLowerCase() === corps.name.toLowerCase()
        );
        if (homonyme) throw erreurRequete(`Un objet métier « ${corps.name} » existe déjà.`);
        return this.gouvernance.ecrire(espace, utilisateur, 'businessObjects', idSur, corps, 'objet-metier.enregistrement');
    }

    @Delete('objets-metier/:id')
    @RoleEspaceRequis('editeur')
    async supprimerObjetMetier(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('id') id: string
    ) {
        await this.gouvernance.supprimer(espace, utilisateur, 'businessObjects', id, 'objet-metier.suppression');
        return { ok: true };
    }

    // ---- actifs : applications, processus, restitutions ----
    @Get('actifs')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Actifs : applications, processus, restitutions.' })
    actifs(@EspaceCourant() espace: EspaceAvecRole) {
        return this.gouvernance.lister(espace.id, 'assets');
    }

    @Put('actifs/:id')
    @RoleEspaceRequis('editeur')
    async ecrireActif(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('id') id: string,
        @Body(valider(schemaActif)) corps: z.infer<typeof schemaActif>
    ) {
        const idSur = verifierNomSur(id, 'identifiant d’actif');
        const etat = await this.gouvernance.etat(espace.id);
        // Renommer une application propage le nouveau nom au « système source » de ses fichiers dans le dictionnaire.
        const existant = etat.governance.assets.find(candidat => candidat.id === idSur);
        if (existant && corps.kind === 'app' && existant['name'] !== corps.name) {
            const ancien = String(existant['name'] || '')
                .trim()
                .toLowerCase();
            for (const nomSource of (existant['sources'] as string[]) || []) {
                const fiche = etat.governance.dictionary[nomSource];
                if (
                    fiche &&
                    String(fiche.sourceSystem || '')
                        .trim()
                        .toLowerCase() === ancien
                )
                    fiche.sourceSystem = corps.name;
            }
            await this.gouvernance.enregistrer(espace, utilisateur, etat, 'dictionnaire.modification', corps.name);
        }
        return this.gouvernance.ecrire(espace, utilisateur, 'assets', idSur, corps, 'actif.enregistrement');
    }

    @Delete('actifs/:id')
    @RoleEspaceRequis('editeur')
    async supprimerActif(@EspaceCourant() espace: EspaceAvecRole, @UtilisateurCourant() utilisateur: Utilisateur, @Param('id') id: string) {
        await this.gouvernance.supprimer(espace, utilisateur, 'assets', id, 'actif.suppression');
        return { ok: true };
    }

    // ---- périmètres ----
    @Get('perimetres')
    @RoleEspaceRequis('lecteur')
    perimetres(@EspaceCourant() espace: EspaceAvecRole) {
        return this.gouvernance.lister(espace.id, 'perimeters');
    }

    @Put('perimetres/:id')
    @RoleEspaceRequis('editeur')
    ecrirePerimetre(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('id') id: string,
        @Body(valider(schemaPerimetre)) corps: z.infer<typeof schemaPerimetre>
    ) {
        return this.gouvernance.ecrire(
            espace,
            utilisateur,
            'perimeters',
            verifierNomSur(id, 'identifiant de périmètre'),
            corps,
            'perimetre.enregistrement'
        );
    }

    @Delete('perimetres/:id')
    @RoleEspaceRequis('editeur')
    async supprimerPerimetre(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('id') id: string
    ) {
        await this.gouvernance.supprimer(espace, utilisateur, 'perimeters', id, 'perimetre.suppression');
        return { ok: true };
    }

    // ---- personnes et rôles ----
    @Get('personnes')
    @RoleEspaceRequis('lecteur')
    personnes(@EspaceCourant() espace: EspaceAvecRole) {
        return this.gouvernance.lister(espace.id, 'people');
    }

    @Put('personnes/:id')
    @RoleEspaceRequis('editeur')
    ecrirePersonne(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('id') id: string,
        @Body(valider(schemaPersonne)) corps: z.infer<typeof schemaPersonne>
    ) {
        return this.gouvernance.ecrire(
            espace,
            utilisateur,
            'people',
            verifierNomSur(id, 'identifiant de personne'),
            corps,
            'personne.enregistrement'
        );
    }

    @Delete('personnes/:id')
    @RoleEspaceRequis('editeur')
    async supprimerPersonne(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('id') id: string
    ) {
        await this.gouvernance.supprimer(espace, utilisateur, 'people', id, 'personne.suppression');
        return { ok: true };
    }

    // ---- domaines métier ----
    @Get('domaines')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Domaines métier : déclarés, plus ceux cités par les objets, actifs, termes, périmètres et rôles.' })
    async domaines(@EspaceCourant() espace: EspaceAvecRole) {
        return this.gouvernance.domaines((await this.gouvernance.etat(espace.id)).governance);
    }

    @Post('domaines')
    @RoleEspaceRequis('editeur')
    async ajouterDomaine(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaDomaine)) corps: z.infer<typeof schemaDomaine>
    ) {
        const etat = await this.gouvernance.etat(espace.id);
        if (!etat.governance.domainList.includes(corps.name)) {
            etat.governance.domainList.push(corps.name);
            await this.gouvernance.enregistrer(espace, utilisateur, etat, 'domaine.ajout', corps.name);
        }
        return this.gouvernance.domaines(etat.governance);
    }

    @Delete('domaines/:nom')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Retire un domaine de la liste déclarée (les éléments qui le citent ne sont pas modifiés).' })
    async retirerDomaine(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('nom') nom: string
    ) {
        const etat = await this.gouvernance.etat(espace.id);
        etat.governance.domainList = etat.governance.domainList.filter(candidat => candidat !== nom);
        await this.gouvernance.enregistrer(espace, utilisateur, etat, 'domaine.retrait', nom);
        return this.gouvernance.domaines(etat.governance);
    }
}
