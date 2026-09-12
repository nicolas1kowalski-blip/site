/**
 * Administration des utilisateurs (administrateur global) : liste, création, modification (nom, courriel,
 * rôle global, activation, réinitialisation du mot de passe), suppression.
 */
import { Body, Controller, Delete, Get, Inject, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { vueUtilisateur } from '../authentification/authentification.controller';
import { AdministrateurGlobalRequis, UtilisateurCourant } from '../authentification/contexte-requete';
import { hacherMotDePasse } from '../authentification/mots-de-passe';
import { BASE_DE_DONNEES, BaseDeDonnees } from '../base-de-donnees/connexion';
import { Utilisateur, utilisateurs } from '../base-de-donnees/schema';
import { erreurIntrouvable, erreurRequete } from '../commun/erreurs';
import { valider } from '../commun/validation';
import { JournalService } from '../journal/journal.service';

const schemaCreation = z.object({
    identifiant: z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9][a-z0-9._-]{1,60}$/, 'lettres minuscules, chiffres, . _ - (2 à 61 caractères)'),
    nomAffiche: z.string().trim().min(1, 'nom requis'),
    email: z.string().trim().email('courriel invalide').optional().or(z.literal('')),
    motDePasse: z.string().min(8, 'au moins 8 caractères'),
    roleGlobal: z.enum(['administrateur', 'utilisateur']).default('utilisateur')
});
const schemaModification = z.object({
    nomAffiche: z.string().trim().min(1).optional(),
    email: z.string().trim().email('courriel invalide').optional().or(z.literal('')),
    roleGlobal: z.enum(['administrateur', 'utilisateur']).optional(),
    actif: z.boolean().optional(),
    motDePasse: z.string().min(8, 'au moins 8 caractères').optional()
});

@ApiTags('Utilisateurs')
@Controller('api/utilisateurs')
@AdministrateurGlobalRequis()
export class UtilisateursController {
    constructor(
        @Inject(BASE_DE_DONNEES) private readonly base: BaseDeDonnees,
        private readonly journal: JournalService
    ) {}

    @Get()
    @ApiOperation({ summary: 'Tous les utilisateurs de la plateforme.' })
    async lister() {
        return (await this.base.select().from(utilisateurs).orderBy(utilisateurs.identifiant)).map(vueUtilisateur);
    }

    @Post()
    @ApiOperation({ summary: 'Crée un utilisateur.' })
    async creer(@UtilisateurCourant() auteur: Utilisateur, @Body(valider(schemaCreation)) corps: z.infer<typeof schemaCreation>) {
        const existant = await this.base.select().from(utilisateurs).where(eq(utilisateurs.identifiant, corps.identifiant)).limit(1);
        if (existant.length) throw erreurRequete(`L'identifiant « ${corps.identifiant} » est déjà utilisé.`);
        const [cree] = await this.base
            .insert(utilisateurs)
            .values({
                identifiant: corps.identifiant,
                nomAffiche: corps.nomAffiche,
                email: corps.email || null,
                motDePasseHache: hacherMotDePasse(corps.motDePasse),
                roleGlobal: corps.roleGlobal
            })
            .returning();
        await this.journal.consigner({
            utilisateurId: auteur.id,
            action: 'utilisateur.creation',
            cible: cree.identifiant,
            details: { roleGlobal: cree.roleGlobal }
        });
        return vueUtilisateur(cree);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Modifie un utilisateur (nom, courriel, rôle, activation, mot de passe).' })
    async modifier(
        @UtilisateurCourant() auteur: Utilisateur,
        @Param('id') id: string,
        @Body(valider(schemaModification)) corps: z.infer<typeof schemaModification>
    ) {
        const existant = (await this.base.select().from(utilisateurs).where(eq(utilisateurs.id, id)).limit(1))[0];
        if (!existant) throw erreurIntrouvable('Utilisateur inconnu.');
        if (existant.id === auteur.id && (corps.actif === false || corps.roleGlobal === 'utilisateur')) {
            throw erreurRequete('Vous ne pouvez pas retirer vos propres droits d’administrateur.');
        }
        const modifications: Partial<typeof utilisateurs.$inferInsert> = {};
        if (corps.nomAffiche !== undefined) modifications.nomAffiche = corps.nomAffiche;
        if (corps.email !== undefined) modifications.email = corps.email || null;
        if (corps.roleGlobal !== undefined) modifications.roleGlobal = corps.roleGlobal;
        if (corps.actif !== undefined) modifications.actif = corps.actif;
        if (corps.motDePasse !== undefined) modifications.motDePasseHache = hacherMotDePasse(corps.motDePasse);
        const [modifie] = await this.base.update(utilisateurs).set(modifications).where(eq(utilisateurs.id, id)).returning();
        await this.journal.consigner({
            utilisateurId: auteur.id,
            action: 'utilisateur.modification',
            cible: modifie.identifiant,
            details: {
                champs: Object.keys(modifications)
                    .filter(champ => champ !== 'motDePasseHache')
                    .concat(corps.motDePasse ? ['motDePasse'] : [])
            }
        });
        return vueUtilisateur(modifie);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Supprime un utilisateur (ses sessions et appartenances disparaissent).' })
    async supprimer(@UtilisateurCourant() auteur: Utilisateur, @Param('id') id: string) {
        if (id === auteur.id) throw erreurRequete('Vous ne pouvez pas supprimer votre propre compte.');
        const [supprime] = await this.base.delete(utilisateurs).where(eq(utilisateurs.id, id)).returning();
        if (!supprime) throw erreurIntrouvable('Utilisateur inconnu.');
        await this.journal.consigner({ utilisateurId: auteur.id, action: 'utilisateur.suppression', cible: supprime.identifiant });
        return { ok: true };
    }
}
