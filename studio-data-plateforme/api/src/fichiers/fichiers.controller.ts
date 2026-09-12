/**
 * Fichiers de l'espace courant : dépôt en flux (jamais chargé en mémoire), lecture complète ou par plage
 * d'octets, liste, suppression. C'est l'équivalent de db.registerFile* / copyFileToBuffer / dropFile de
 * l'application classique.
 */
import { Controller, Delete, Get, Head, HttpCode, Param, Put, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Readable } from 'node:stream';
import { EspaceAvecRole, EspaceCourant, RoleEspaceRequis, UtilisateurCourant } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { erreurRequete } from '../commun/erreurs';
import { EspacesService } from '../espaces/espaces.service';
import { JournalService } from '../journal/journal.service';

function lirePlage(enTete: string | undefined): { debut: number; fin: number } | null {
    if (!enTete) return null;
    const correspondance = /^bytes=(\d+)-(\d*)$/.exec(String(enTete).trim());
    if (!correspondance) throw erreurRequete('En-tête Range non pris en charge : ' + enTete);
    const debut = Number(correspondance[1]);
    const fin = correspondance[2] === '' ? Number.MAX_SAFE_INTEGER : Number(correspondance[2]);
    if (fin < debut) throw erreurRequete('Plage d’octets invalide.');
    return { debut, fin };
}

@ApiTags('Fichiers')
@Controller('api/fichiers')
export class FichiersController {
    constructor(
        private readonly espaces: EspacesService,
        private readonly journal: JournalService
    ) {}

    @Get()
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Liste des fichiers de l’espace courant.' })
    async lister(@EspaceCourant() espace: EspaceAvecRole) {
        return (await this.espaces.ressources(espace)).fichiers.lister();
    }

    @Put(':nom')
    @HttpCode(201)
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Dépose un fichier (corps brut, écrit en flux sur le disque).' })
    async deposer(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('nom') nom: string,
        @Req() requete: FastifyRequest
    ) {
        const { fichiers } = await this.espaces.ressources(espace);
        // Le corps arrive soit comme flux (analyseur « * » de main.ts), soit non analysé (requête sans content-type).
        const corps = requete.body as unknown;
        const flux = corps && typeof (corps as Readable).pipe === 'function' ? (corps as Readable) : requete.raw;
        const resultat = await fichiers.ecrireDepuisFlux(nom, flux);
        if (/^src_/.test(nom))
            await this.journal.consigner({
                espaceId: espace.id,
                utilisateurId: utilisateur.id,
                action: 'fichier.depot',
                cible: nom,
                details: { octets: resultat.taille }
            });
        return resultat;
    }

    @Head(':nom')
    @RoleEspaceRequis('lecteur')
    async decrire(@EspaceCourant() espace: EspaceAvecRole, @Param('nom') nom: string, @Res() reponse: FastifyReply) {
        const { fichiers } = await this.espaces.ressources(espace);
        const description = await fichiers.decrire(nom);
        reponse.header('content-length', description.taille).send();
    }

    @Get(':nom')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Lecture d’un fichier, complète ou partielle (en-tête Range: bytes=a-b).' })
    async lire(
        @EspaceCourant() espace: EspaceAvecRole,
        @Param('nom') nom: string,
        @Req() requete: FastifyRequest,
        @Res() reponse: FastifyReply
    ) {
        const { fichiers } = await this.espaces.ressources(espace);
        const plage = lirePlage(requete.headers.range);
        const { flux, description } = await fichiers.lireFlux(nom, plage);
        reponse.type('application/octet-stream');
        if (plage) {
            const fin = Math.min(plage.fin, description.taille - 1);
            reponse
                .code(206)
                .header('content-range', `bytes ${plage.debut}-${fin}/${description.taille}`)
                .header('content-length', Math.max(0, fin - plage.debut + 1));
        } else {
            reponse.header('content-length', description.taille);
        }
        reponse.send(flux);
    }

    @Delete(':nom')
    @HttpCode(204)
    @RoleEspaceRequis('editeur')
    async supprimer(@EspaceCourant() espace: EspaceAvecRole, @Param('nom') nom: string) {
        const { fichiers } = await this.espaces.ressources(espace);
        await fichiers.supprimer(nom);
    }
}
