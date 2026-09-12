/** Routes des listes de valeurs : CRUD, aperçu des codes, contrôle d'une colonne, rattachement d'attributs (dictionnaire). */
import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { EspaceAvecRole, EspaceCourant, RoleEspaceRequis, UtilisateurCourant } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { erreurRequete, verifierNomSur } from '../commun/erreurs';
import { valider } from '../commun/validation';
import { EspacesService } from '../espaces/espaces.service';
import { nombre } from '../qualite/profilage';
import { SourcesService } from '../sources/sources.service';
import { GouvernanceService } from './gouvernance.service';
import { ListeValeurs, schemaListeValeurs, sqlCodesAutorises, sqlControleColonne } from './listes-valeurs';

const schemaColonne = z.object({ table: z.string().min(1, 'table requise'), col: z.string().min(1, 'colonne requise') });

@ApiTags('Gouvernance')
@Controller('api/gouvernance/listes-de-valeurs')
export class ListesValeursController {
    constructor(
        private readonly gouvernance: GouvernanceService,
        private readonly sources: SourcesService,
        private readonly espaces: EspacesService
    ) {}

    @Get()
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Listes de valeurs, avec les attributs (table.colonne) rattachés à chacune.' })
    async lister(@EspaceCourant() espace: EspaceAvecRole) {
        const etat = await this.gouvernance.etat(espace.id);
        return etat.governance.valueLists.map(liste => ({
            ...liste,
            utilisations: this.utilisations(etat.governance.dictionary, liste.id)
        }));
    }

    @Put(':id')
    @RoleEspaceRequis('editeur')
    ecrire(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('id') id: string,
        @Body(valider(schemaListeValeurs)) corps: z.infer<typeof schemaListeValeurs>
    ) {
        return this.gouvernance.ecrire(
            espace,
            utilisateur,
            'valueLists',
            verifierNomSur(id, 'identifiant de liste'),
            corps,
            'liste-valeurs.enregistrement'
        );
    }

    @Delete(':id')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Supprime la liste et détache les attributs qui y étaient rattachés.' })
    async supprimer(@EspaceCourant() espace: EspaceAvecRole, @UtilisateurCourant() utilisateur: Utilisateur, @Param('id') id: string) {
        const etat = await this.gouvernance.etat(espace.id);
        for (const fiche of Object.values(etat.governance.dictionary))
            for (const colonne of Object.values(fiche.columns || {})) if (colonne['valueListId'] === id) delete colonne['valueListId'];
        await this.gouvernance.enregistrer(espace, utilisateur, etat, 'liste-valeurs.detachement', id);
        await this.gouvernance.supprimer(espace, utilisateur, 'valueLists', id, 'liste-valeurs.suppression');
        return { ok: true };
    }

    @Post(':id/apercu')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Codes autorisés par la liste (50 premiers) et leur nombre, lus dans le moteur.' })
    async apercu(@EspaceCourant() espace: EspaceAvecRole, @Param('id') id: string) {
        const codes = await this.codesDe(espace, id);
        const { moteur } = await this.espaces.ressources(espace);
        const [liste, total] = await Promise.all([
            moteur.executer(`SELECT c FROM (${codes}) q GROUP BY 1 ORDER BY 1 LIMIT 50`),
            moteur.executer(`SELECT COUNT(DISTINCT c)::BIGINT FROM (${codes}) q`)
        ]);
        return { codes: liste.lignes.map(ligne => String(ligne[0])), total: nombre(total.lignes[0][0]) };
    }

    @Post(':id/controler')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Contrôle une colonne d’une source : valeurs hors liste et exemples.' })
    async controler(
        @EspaceCourant() espace: EspaceAvecRole,
        @Param('id') id: string,
        @Body(valider(schemaColonne)) corps: z.infer<typeof schemaColonne>
    ) {
        const codes = await this.codesDe(espace, id);
        const source = (await this.sources.lister(espace.id)).find(candidat => candidat.name === corps.table);
        if (!source || !(source.headers || []).includes(corps.col)) throw erreurRequete(`Colonne inconnue : ${corps.table}.${corps.col}.`);
        const requetes = sqlControleColonne('t_' + source.id, corps.col, codes);
        const { moteur } = await this.espaces.ressources(espace);
        const [total, horsListe, exemples] = await Promise.all([
            moteur.executer(requetes.total),
            moteur.executer(requetes.horsListe),
            moteur.executer(requetes.exemples)
        ]);
        return {
            table: corps.table,
            col: corps.col,
            total: nombre(total.lignes[0][0]),
            horsListe: nombre(horsListe.lignes[0][0]),
            exemples: exemples.lignes.map(([valeur, occurrences]) => ({ valeur: String(valeur), nombre: nombre(occurrences) }))
        };
    }

    @Put(':id/rattacher')
    @RoleEspaceRequis('editeur')
    @ApiOperation({ summary: 'Rattache un attribut (table.colonne) à la liste : l’audit contrôlera l’appartenance au référentiel.' })
    async rattacher(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('id') id: string,
        @Body(valider(schemaColonne)) corps: z.infer<typeof schemaColonne>
    ) {
        return this.definirRattachement(espace, utilisateur, id, corps, true);
    }

    @Post(':id/detacher')
    @RoleEspaceRequis('editeur')
    async detacher(
        @EspaceCourant() espace: EspaceAvecRole,
        @UtilisateurCourant() utilisateur: Utilisateur,
        @Param('id') id: string,
        @Body(valider(schemaColonne)) corps: z.infer<typeof schemaColonne>
    ) {
        return this.definirRattachement(espace, utilisateur, id, corps, false);
    }

    private async definirRattachement(
        espace: EspaceAvecRole,
        utilisateur: Utilisateur,
        id: string,
        colonne: z.infer<typeof schemaColonne>,
        rattacher: boolean
    ) {
        const etat = await this.gouvernance.etat(espace.id);
        await this.gouvernance.lire(espace.id, 'valueLists', id);
        const fiche = this.gouvernance.ficheDictionnaire(etat, colonne.table);
        const champs = (fiche.columns[colonne.col] = fiche.columns[colonne.col] || {});
        if (rattacher) champs['valueListId'] = id;
        else delete champs['valueListId'];
        await this.gouvernance.enregistrer(
            espace,
            utilisateur,
            etat,
            rattacher ? 'liste-valeurs.rattachement' : 'liste-valeurs.detachement',
            `${colonne.table}.${colonne.col}`
        );
        return { utilisations: this.utilisations(etat.governance.dictionary, id) };
    }

    /** Attributs rattachés à une liste, d'après les colonnes du dictionnaire. */
    private utilisations(
        dictionnaire: Record<string, { columns?: Record<string, Record<string, unknown>> }>,
        id: string
    ): { table: string; col: string }[] {
        const resultat: { table: string; col: string }[] = [];
        for (const [table, fiche] of Object.entries(dictionnaire))
            for (const [col, champs] of Object.entries(fiche.columns || {}))
                if (champs && champs['valueListId'] === id) resultat.push({ table, col });
        return resultat;
    }

    /** Requête des codes autorisés d'une liste ; 400 si la liste est vide ou sa source absente. */
    private async codesDe(espace: EspaceAvecRole, id: string): Promise<string> {
        const liste = (await this.gouvernance.lire(espace.id, 'valueLists', id)) as unknown as ListeValeurs;
        const sources = await this.sources.lister(espace.id);
        const codes = sqlCodesAutorises(schemaListeValeurs.parse(liste) as ListeValeurs, nomSource => {
            const source = sources.find(candidat => candidat.name === nomSource);
            return source ? 't_' + source.id : null;
        });
        if (!codes) throw erreurRequete('La liste ne définit aucun code (saisie vide, ou source et colonne de code non renseignées).');
        return codes;
    }
}
