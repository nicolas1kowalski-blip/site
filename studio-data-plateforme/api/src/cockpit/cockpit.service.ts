/** Service du cockpit : rassemble sources (avec comptage DuckDB), relations, objets métier, audits et domaines. */
import { Injectable } from '@nestjs/common';
import { EspaceAvecRole } from '../authentification/contexte-requete';
import { EspacesService } from '../espaces/espaces.service';
import { identifiantSql } from '../espaces/moteur-duckdb';
import { GouvernanceService } from '../gouvernance/gouvernance.service';
import { ModeleService } from '../modele/modele.service';
import { QualiteService } from '../qualite/qualite.service';
import { SourcesService } from '../sources/sources.service';
import { Cockpit, assemblerCockpit } from './cockpit';

const texte = (valeur: unknown) => (valeur == null ? '' : String(valeur).trim());

@Injectable()
export class CockpitService {
    constructor(
        private readonly espaces: EspacesService,
        private readonly sources: SourcesService,
        private readonly modele: ModeleService,
        private readonly gouvernance: GouvernanceService,
        private readonly qualite: QualiteService
    ) {}

    async cockpit(espace: EspaceAvecRole): Promise<Cockpit> {
        const [sources, relations, etat, audits] = await Promise.all([
            this.sources.lister(espace.id),
            this.modele.relations(espace.id),
            this.gouvernance.etat(espace.id),
            this.qualite.audits(espace.id, undefined, 200)
        ]);
        const { moteur } = await this.espaces.ressources(espace);
        const sourcesComptees = await Promise.all(
            sources.map(async source => ({
                id: source.id!,
                name: source.name,
                type: source.type,
                enregistreLe: typeof source.enregistreLe === 'string' ? source.enregistreLe : undefined,
                lignes: await this.compterLignes(moteur, 't_' + source.id),
                domaine: texte(etat.governance.dictionary[source.name]?.domain)
            }))
        );
        return assemblerCockpit(
            sourcesComptees,
            relations,
            (etat.governance.businessObjects as unknown as { name: string; globalOwner?: string }[]) || [],
            audits.map(audit => ({
                sourceNom: audit.sourceNom,
                genre: audit.genre,
                lanceLe: audit.lanceLe.toISOString(),
                lignes: audit.lignes,
                resume: (audit.resume || {}) as Record<string, unknown>
            })),
            this.gouvernance.domaines(etat.governance)
        );
    }

    /** Nombre de lignes d'une table, ou null si elle n'existe pas dans le moteur. */
    private async compterLignes(
        moteur: { executer(sql: string): Promise<{ lignes: unknown[][] }> },
        table: string
    ): Promise<number | null> {
        try {
            const resultat = await moteur.executer(`SELECT COUNT(*)::BIGINT FROM ${identifiantSql(table)}`);
            return Number(resultat.lignes[0][0]);
        } catch {
            return null;
        }
    }
}
