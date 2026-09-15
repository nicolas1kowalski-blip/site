/**
 * Auditer l'arbre déclaré sur un objet métier — la V13 confronte la hiérarchie décrite aux données réelles.
 *
 * Déclarer qu'un local dépend d'un bâtiment ne coûte rien ; savoir combien de locaux n'ont pas de bâtiment,
 * combien sont leur propre parent et combien dépendent d'un niveau que la déclaration n'admet pas, voilà ce
 * qui fait qu'une hiérarchie gouvernée vaut mieux qu'une hiérarchie supposée.
 */
import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { EspaceAvecRole, EspaceCourant, RoleEspaceRequis } from '../authentification/contexte-requete';
import { erreurRequete } from '../commun/erreurs';
import { valider } from '../commun/validation';
import { EspacesService } from '../espaces/espaces.service';
import { SourcesService } from '../sources/sources.service';
import {
    AuditHierarchie,
    Hierarchie,
    cequiManquePourAuditer,
    profondeurMesurable,
    sqlAuditDeLArbre,
    sqlProfondeurDeLArbre
} from './hierarchies';

const schemaNiveau = z.object({ name: z.string().trim().min(1), parents: z.array(z.string()).default([]) });
const schemaAudit = z.object({
    /** La table maître de l'objet : c'est sur elle que porte l'arbre. */
    table: z.string().trim().min(1, 'table requise'),
    hierarchie: z.object({
        id: z.string().default(''),
        name: z.string().default(''),
        mode: z.enum(['self', 'link']).default('self'),
        childCol: z.string().optional(),
        parentKeyCol: z.string().optional(),
        linkTable: z.string().optional(),
        linkChildCol: z.string().optional(),
        linkParentCol: z.string().optional(),
        typeCol: z.string().optional(),
        maxDepth: z.string().optional(),
        levels: z.array(schemaNiveau).default([])
    })
});

/** Une valeur rendue par DuckDB pour un COUNT : un grand entier, parfois nul quand la table est vide. */
function nombre(valeur: unknown): number {
    return Number(valeur ?? 0);
}

@ApiTags('Gouvernance')
@Controller('api/gouvernance/hierarchies')
export class HierarchiesController {
    constructor(
        private readonly espaces: EspacesService,
        private readonly sources: SourcesService
    ) {}

    @Post('auditer')
    @RoleEspaceRequis('lecteur')
    @ApiOperation({ summary: 'Confronte la hiérarchie déclarée aux données : racines, orphelins, boucles, niveaux.' })
    async auditer(@EspaceCourant() espace: EspaceAvecRole, @Body(valider(schemaAudit)) corps: z.infer<typeof schemaAudit>) {
        const hierarchie = corps.hierarchie as Hierarchie;
        const manque = cequiManquePourAuditer(hierarchie);
        if (manque) throw erreurRequete(manque);
        const sources = await this.sources.listerAvecJeux(espace.id);
        const nomTableDe = (nom: string): string => {
            const source = sources.find(candidat => candidat.name === nom);
            if (!source) throw erreurRequete(`Source inconnue : « ${nom} ».`);
            return 't_' + source.id;
        };
        const tableMaitre = nomTableDe(corps.table);
        const tableDeLiaison = hierarchie.mode === 'link' ? nomTableDe(hierarchie.linkTable as string) : '';
        const { moteur } = await this.espaces.ressources(espace);
        const resultat = await moteur.executer(sqlAuditDeLArbre(hierarchie, tableMaitre, tableDeLiaison));
        const [total, racines, orphelins, bouclesSurSoi, violationsDeNiveau, typesInconnus] = resultat.lignes[0].map(nombre);
        const audit: AuditHierarchie = {
            total,
            racines,
            orphelins,
            bouclesSurSoi,
            violationsDeNiveau,
            typesInconnus,
            profondeurMaximale: null,
            auDelaDeLaProfondeur: null
        };
        // La profondeur ne se mesure que sur un arbre porté par la table elle-même, et si une limite est annoncée.
        const annoncee = profondeurMesurable(hierarchie);
        if (annoncee) {
            const descente = await moteur.executer(sqlProfondeurDeLArbre(hierarchie, tableMaitre, annoncee));
            audit.profondeurMaximale = nombre(descente.lignes[0][0]);
            audit.auDelaDeLaProfondeur = nombre(descente.lignes[0][1]);
        }
        return audit;
    }
}
