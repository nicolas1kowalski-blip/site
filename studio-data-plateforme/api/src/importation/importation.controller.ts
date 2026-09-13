/**
 * Routes d'importation : fichier déposé → source (création ou mise à jour), feuilles d'un classeur Excel, fusion,
 * import par adresse, inventaire et import d'une livraison ZIP. Le dépôt du fichier lui-même passe par
 * PUT /api/fichiers/<nom> (flux avec progression) ; ces routes prennent ensuite le relais côté serveur.
 */
import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { EspaceAvecRole, EspaceCourant, RoleEspaceRequis, UtilisateurCourant } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { verifierNomSur } from '../commun/erreurs';
import { valider } from '../commun/validation';
import { ImportationService } from './importation.service';
import { EXTENSIONS_ACCEPTEES } from './ingestion';

const schemaFichierDepose = z.object({
    nomServeur: z.string().min(1),
    nomFichier: z.string().trim().min(1, 'nom de fichier requis'),
    taille: z.number().nonnegative().optional(),
    modifieLe: z.number().optional(),
    feuille: z.string().optional()
});
const schemaImportFichier = schemaFichierDepose.extend({ sourceId: z.string().optional() });
const schemaFeuilles = z.object({ nomServeur: z.string().min(1) });
const schemaFusion = z.object({
    nom: z.string().trim().min(1, 'nom de la source fusionnée requis'),
    fichiers: z.array(schemaFichierDepose).default([]),
    sourceIds: z.array(z.string().min(1)).default([]),
    retirerOrigines: z.boolean().default(false)
});
const schemaAdresse = z.object({
    adresse: z.string().trim().min(1, 'adresse requise'),
    genre: z.enum(['csv', 'json', 'parquet', 'gsheet']).default('csv'),
    nom: z.string().optional(),
    cheminJson: z.string().optional(),
    enTeteNom: z.string().optional(),
    enTeteValeur: z.string().optional(),
    sourceId: z.string().optional(),
    colonneCle: z.string().optional(),
    mode: z.enum(['remplacer', 'ajouter']).optional()
});
const schemaZip = z.object({
    nomServeur: z.string().min(1),
    choix: z
        .array(
            z.object({ nom: z.string().min(1), action: z.enum(['importer', 'mettreAJour', 'ignorer']), nomSource: z.string().optional() })
        )
        .default([])
});

@ApiTags('Importation')
@Controller('api/importation')
export class ImportationController {
    constructor(private readonly importation: ImportationService) {}

    @Get('vocabulaire')
    @RoleEspaceRequis('lecteur')
    vocabulaire() {
        return { extensions: EXTENSIONS_ACCEPTEES };
    }

    @Post('fichier')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Transforme un fichier déposé en source ; avec sourceId, met à jour la source existante.' })
    importerFichier(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaImportFichier)) corps: z.infer<typeof schemaImportFichier>
    ) {
        const { sourceId, ...fichier } = corps;
        return this.importation.importerFichier(
            espace,
            utilisateur,
            { ...fichier, nomServeur: verifierNomSur(fichier.nomServeur, 'nom de fichier') },
            sourceId
        );
    }

    @Post('excel/feuilles')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Les feuilles d’un classeur Excel déposé.' })
    feuilles(@EspaceCourant() espace: EspaceAvecRole, @Body(valider(schemaFeuilles)) corps: z.infer<typeof schemaFeuilles>) {
        return this.importation.feuillesExcel(espace, verifierNomSur(corps.nomServeur, 'nom de fichier'));
    }

    @Post('fusion')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Fusionne des fichiers déposés et des sources existantes en une seule source (colonnes alignées par nom).' })
    fusionner(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaFusion)) corps: z.infer<typeof schemaFusion>
    ) {
        return this.importation.fusionner(espace, utilisateur, corps);
    }

    @Post('adresse')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Importe (ou met à jour) une source depuis une adresse : CSV, JSON, Parquet ou Google Sheets.' })
    importerDepuisAdresse(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaAdresse)) corps: z.infer<typeof schemaAdresse>
    ) {
        return this.importation.importerDepuisAdresse(espace, utilisateur, corps);
    }

    @Post('zip/inventaire')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Les fichiers de données d’une archive ZIP déposée, avec la source du même nom si elle existe.' })
    inventaireZip(@EspaceCourant() espace: EspaceAvecRole, @Body(valider(schemaFeuilles)) corps: z.infer<typeof schemaFeuilles>) {
        return this.importation.inventaireZip(espace, verifierNomSur(corps.nomServeur, 'nom de fichier'));
    }

    @Post('zip/importer')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Importe ou met à jour les fichiers choisis d’une archive ZIP, puis supprime l’archive.' })
    importerZip(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Body(valider(schemaZip)) corps: z.infer<typeof schemaZip>
    ) {
        return this.importation.importerZip(espace, utilisateur, verifierNomSur(corps.nomServeur, 'nom de fichier'), corps.choix);
    }
}
