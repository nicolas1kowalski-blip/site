/**
 * Routes des propositions à valider : tout membre de l'espace peut proposer une modification ; un éditeur
 * l'accepte (elle est appliquée) ou la refuse ; l'auteur peut la retirer tant qu'elle est en attente.
 */
import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { EspaceAvecRole, EspaceCourant, RoleEspaceRequis, UtilisateurCourant } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { erreurInterdit, erreurIntrouvable, erreurRequete } from '../commun/erreurs';
import { valider } from '../commun/validation';
import { GouvernanceService } from './gouvernance.service';
import {
    DefinitionProposition,
    ErreurProposition,
    GENRES_PROPOSITION,
    LIBELLES_CHAMP,
    Proposition,
    appliquerProposition,
    elementVise,
    schemaProposition,
    tracerDecision
} from './propositions';

const schemaDecision = z.object({ comment: z.string().default('') });

@ApiTags('Gouvernance')
@Controller('api/gouvernance/propositions')
export class PropositionsController {
    constructor(private readonly gouvernance: GouvernanceService) {}

    @Get('vocabulaire')
    @RoleEspaceRequis('lecteur')
    vocabulaire() {
        return { genres: GENRES_PROPOSITION, champs: LIBELLES_CHAMP };
    }

    @Get()
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Propositions de l’espace (en attente d’abord, puis décidées, les plus récentes en tête).' })
    async lister(@EspaceCourant() espace: EspaceAvecRole) {
        const propositions = (await this.gouvernance.lister(espace.id, 'proposals')) as unknown as Proposition[];
        return [...propositions].sort((premiere, seconde) => {
            if (premiere.status !== seconde.status) return premiere.status === 'pending' ? -1 : seconde.status === 'pending' ? 1 : 0;
            return String(seconde.decidedAt || seconde.at).localeCompare(String(premiere.decidedAt || premiere.at));
        });
    }

    @Post()
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Dépose une proposition ; une proposition en attente sur la même cible et le même champ est remplacée.' })
    async proposer(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaProposition)) corps: DefinitionProposition
    ) {
        const etat = await this.gouvernance.etat(espace.id);
        if (!elementVise(etat, corps)) throw erreurRequete('L’élément visé par la proposition n’existe pas.');
        const propositions = etat.governance.proposals as unknown as Proposition[];
        const meme = propositions.find(
            candidat =>
                candidat.status === 'pending' &&
                candidat.kind === corps.kind &&
                candidat.field === corps.field &&
                JSON.stringify(candidat.target) === JSON.stringify(corps.target)
        );
        let proposition: Proposition;
        if (meme) {
            meme.after = corps.after;
            meme.raw = corps.raw;
            meme.at = new Date().toISOString();
            proposition = meme;
        } else {
            proposition = {
                id: 'pr_' + randomBytes(5).toString('hex'),
                status: 'pending',
                by: utilisateur.identifiant,
                byName: utilisateur.nomAffiche,
                at: new Date().toISOString(),
                comment: '',
                ...corps
            };
            propositions.push(proposition);
        }
        await this.gouvernance.enregistrer(espace, utilisateur, etat, 'proposition.depot', corps.label);
        return proposition;
    }

    @Post(':id/accepter')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Accepte la proposition et applique la valeur proposée.' })
    accepter(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('id') id: string,
        @Body(valider(schemaDecision)) corps: z.infer<typeof schemaDecision>
    ) {
        return this.decider(espace, utilisateur, id, 'accepted', corps.comment);
    }

    @Post(':id/refuser')
    @RoleEspaceRequis('editeur')
    refuser(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('id') id: string,
        @Body(valider(schemaDecision)) corps: z.infer<typeof schemaDecision>
    ) {
        return this.decider(espace, utilisateur, id, 'rejected', corps.comment);
    }

    @Delete(':id')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Retire une proposition : son auteur, ou un éditeur.' })
    async retirer(@EspaceCourant() espace: EspaceAvecRole, @UtilisateurCourant() utilisateur: Utilisateur, @Param('id') id: string) {
        const etat = await this.gouvernance.etat(espace.id);
        const proposition = (etat.governance.proposals as unknown as Proposition[]).find(candidat => candidat.id === id);
        if (!proposition) throw erreurIntrouvable('Proposition inconnue.');
        const estEditeur = espace.role === 'editeur' || espace.role === 'administrateur';
        if (proposition.by !== utilisateur.identifiant && !estEditeur) throw erreurInterdit('Seul l’auteur peut retirer sa proposition.');
        etat.governance.proposals = etat.governance.proposals.filter(candidat => candidat.id !== id);
        await this.gouvernance.enregistrer(espace, utilisateur, etat, 'proposition.retrait', proposition.label);
        return { ok: true };
    }

    private async decider(
        espace: EspaceAvecRole,
        utilisateur: Utilisateur,
        id: string,
        verdict: 'accepted' | 'rejected',
        commentaire: string
    ) {
        const etat = await this.gouvernance.etat(espace.id);
        const proposition = (etat.governance.proposals as unknown as Proposition[]).find(candidat => candidat.id === id);
        if (!proposition) throw erreurIntrouvable('Proposition inconnue.');
        if (proposition.status !== 'pending') throw erreurRequete('Cette proposition a déjà été décidée.');
        proposition.status = verdict;
        proposition.decidedAt = new Date().toISOString();
        proposition.decidedBy = utilisateur.nomAffiche;
        proposition.comment = commentaire;
        try {
            if (verdict === 'accepted') appliquerProposition(etat, proposition);
        } catch (erreur) {
            if (erreur instanceof ErreurProposition) throw erreurRequete(erreur.message);
            throw erreur;
        }
        tracerDecision(etat, proposition, verdict);
        await this.gouvernance.enregistrer(
            espace,
            utilisateur,
            etat,
            verdict === 'accepted' ? 'proposition.acceptation' : 'proposition.refus',
            proposition.label
        );
        return proposition;
    }
}
