/**
 * Sauvegarde et partage d'un espace : export de la configuration (documents partagés, métadonnées des sources,
 * recettes des tables conçues) dans un fichier JSON, import de ce fichier (ou d'un fichier de configuration de
 * l'application classique) dans un autre espace, et dossier de gouvernance HTML.
 *
 * Les données elles-mêmes (fichiers déposés) ne voyagent pas dans l'export : un espace se recharge à partir de
 * ses fichiers ; ce qui se partage, c'est ce que l'équipe a décrit et construit autour.
 */
import { Injectable } from '@nestjs/common';
import { EspaceAvecRole } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { erreurRequete, messageUtilisateur } from '../commun/erreurs';
import { DocumentsService } from '../documents/documents.service';
import { EtatApplication, GouvernanceService } from '../gouvernance/gouvernance.service';
import { niveauPropose } from '../gouvernance/sensibilite';
import { QualiteService } from '../qualite/qualite.service';
import { DocumentSource, SourcesService } from '../sources/sources.service';
import { Recette } from '../tables-concues/constructeur-table-concue';
import { TablesConcuesService } from '../tables-concues/tables-concues.service';
import { DonneesDossier, genererDossier } from './dossier';

export const GENRE_EXPORT_PLATEFORME = 'studio-data-espace';
export const GENRE_EXPORT_CLASSIQUE = 'studio-data-config';

export type ExportEspace = {
    kind: typeof GENRE_EXPORT_PLATEFORME;
    version: 1;
    savedAt: string;
    espace: { code: string; nom: string };
    documents: Record<string, unknown>;
    sources: DocumentSource[];
};
/** Fichier de configuration de l'application classique (kind studio-data-config) : sa section « cfg ». */
export type ConfigurationClassique = {
    savedAt?: string;
    relations?: unknown[];
    governance?: Record<string, unknown>;
    designs?: Record<string, Recette>;
    dashboards?: unknown[];
    linkages?: unknown[];
    [autre: string]: unknown;
};
export type RapportImport = {
    documents: number;
    sources: number;
    tablesConcues: { reconstruites: string[]; erreurs: { table: string; erreur: string }[] };
};

type Element = Record<string, unknown>;
const texte = (valeur: unknown) => (valeur == null ? '' : String(valeur));
const liste = <T = Element,>(valeur: unknown): T[] => (Array.isArray(valeur) ? (valeur as T[]) : []);

@Injectable()
export class SauvegardeService {
    constructor(
        private readonly documents: DocumentsService,
        private readonly sources: SourcesService,
        private readonly gouvernance: GouvernanceService,
        private readonly qualite: QualiteService,
        private readonly tablesConcues: TablesConcuesService
    ) {}

    /** Export de la plateforme : tous les documents partagés et les métadonnées des sources. */
    async exporter(espace: EspaceAvecRole): Promise<ExportEspace> {
        const documents: Record<string, unknown> = {};
        for (const cle of await this.documents.cles(espace.id)) documents[cle] = await this.documents.lire(espace.id, cle);
        return {
            kind: GENRE_EXPORT_PLATEFORME,
            version: 1,
            savedAt: new Date().toISOString(),
            espace: { code: espace.code, nom: String(espace.nom || espace.code) },
            documents,
            sources: await this.sources.lister(espace.id)
        };
    }

    /** Export au format de l'application classique (Sauvegarde → Importer une configuration). */
    async exporterClassique(
        espace: EspaceAvecRole
    ): Promise<{ kind: typeof GENRE_EXPORT_CLASSIQUE; savedAt: string; cfg: ConfigurationClassique }> {
        const [etat, sources] = await Promise.all([this.gouvernance.etat(espace.id), this.sources.lister(espace.id)]);
        const designs: Record<string, Recette> = {};
        for (const source of sources)
            if (source.type === 'designed' && source['design'])
                designs[source.name] = { ...(source['design'] as Recette), targetId: undefined };
        return {
            kind: GENRE_EXPORT_CLASSIQUE,
            savedAt: new Date().toISOString(),
            cfg: {
                savedAt: new Date().toISOString(),
                relations: liste(etat['relations']),
                governance: { ...etat.governance, qualityHistory: [] },
                designs,
                themes: {},
                mcdPos: {},
                dashboards: liste(etat['dashboards']),
                linkages: liste(etat['linkages']),
                recipes: [],
                connectors: [],
                extractPresets: liste(etat['extractPresets'])
            }
        };
    }

    /** Import : fichier de la plateforme (documents + sources) ou de l'application classique (cfg). */
    async importer(espace: EspaceAvecRole, utilisateur: Utilisateur, fichier: Record<string, unknown>): Promise<RapportImport> {
        if (fichier['kind'] === GENRE_EXPORT_PLATEFORME)
            return this.importerPlateforme(espace, utilisateur, fichier as unknown as ExportEspace);
        if (fichier['kind'] === GENRE_EXPORT_CLASSIQUE && fichier['cfg'])
            return this.importerClassique(espace, utilisateur, fichier['cfg'] as ConfigurationClassique);
        throw erreurRequete('Fichier non reconnu : attendu un export Studio Data (plateforme ou application classique).');
    }

    private async importerPlateforme(espace: EspaceAvecRole, utilisateur: Utilisateur, fichier: ExportEspace): Promise<RapportImport> {
        let documents = 0;
        for (const [cle, valeur] of Object.entries(fichier.documents || {})) {
            await this.documents.ecrire(espace.id, cle, valeur, utilisateur.id);
            documents++;
        }
        // Les métadonnées de sources ne sont reprises que pour les sources dont la table existe déjà ici (même identifiant).
        const existantes = new Set((await this.sources.lister(espace.id)).map(source => source.id));
        let sources = 0;
        for (const source of fichier.sources || [])
            if (source.id && existantes.has(source.id) && source.type !== 'designed') {
                await this.sources.ecrire(espace.id, source.id, source);
                sources++;
            }
        const recettes = (fichier.sources || [])
            .filter(source => source.type === 'designed' && source['design'])
            .map(source => ({ ...(source['design'] as Recette), name: source.name }));
        const tablesConcues = await this.reconstruireRecettes(espace, utilisateur, recettes);
        await this.gouvernance.enregistrer(
            espace,
            utilisateur,
            await this.gouvernance.etat(espace.id),
            'sauvegarde.import',
            `${documents} document(s)`
        );
        return { documents, sources, tablesConcues };
    }

    private async importerClassique(
        espace: EspaceAvecRole,
        utilisateur: Utilisateur,
        configuration: ConfigurationClassique
    ): Promise<RapportImport> {
        const etat = await this.gouvernance.etat(espace.id);
        if (configuration.governance)
            etat.governance = { ...etat.governance, ...(configuration.governance as EtatApplication['governance']) };
        if (Array.isArray(configuration.relations)) etat['relations'] = configuration.relations;
        if (Array.isArray(configuration.dashboards)) etat['dashboards'] = configuration.dashboards;
        if (Array.isArray(configuration.linkages)) etat['linkages'] = configuration.linkages;
        await this.gouvernance.enregistrer(espace, utilisateur, etat, 'sauvegarde.import', 'configuration classique');
        const recettes = Object.entries(configuration.designs || {}).map(([nom, recette]) => ({ ...recette, name: nom }));
        return { documents: 1, sources: 0, tablesConcues: await this.reconstruireRecettes(espace, utilisateur, recettes) };
    }

    /** Reconstruit chaque table conçue importée sur les sources présentes ; une source absente est signalée, pas bloquante. */
    private async reconstruireRecettes(
        espace: EspaceAvecRole,
        utilisateur: Utilisateur,
        recettes: Recette[]
    ): Promise<RapportImport['tablesConcues']> {
        const reconstruites: string[] = [];
        const erreurs: { table: string; erreur: string }[] = [];
        const existantes = await this.tablesConcues.lister(espace.id);
        for (const recette of recettes) {
            try {
                const homonyme = existantes.find(table => table.name === recette.name);
                await this.tablesConcues.construire(espace, { ...recette, targetId: homonyme?.id || null }, utilisateur.id);
                reconstruites.push(recette.name);
            } catch (erreur) {
                erreurs.push({ table: recette.name, erreur: messageUtilisateur(erreur) });
            }
        }
        return { reconstruites, erreurs };
    }

    /** Dossier de gouvernance HTML : les données de l'espace, mises en forme par genererDossier. */
    async dossier(espace: EspaceAvecRole): Promise<string> {
        const [etat, sources, regles] = await Promise.all([
            this.gouvernance.etat(espace.id),
            this.sources.lister(espace.id),
            this.qualite.regles(espace.id)
        ]);
        const gouvernance = etat.governance;
        const nomSource = new Map(sources.map(source => [source.id!, source.name]));
        return genererDossier({
            espace: String(espace.nom || espace.code),
            genereLe: new Date().toLocaleString('fr-FR'),
            sources: sources.map(source => sourcePourDossier(source, gouvernance.dictionary[source.name])),
            objets: liste(gouvernance.businessObjects).map(objetPourDossier),
            termes: liste(gouvernance.glossary).map(terme => ({
                terme: texte(terme['term']),
                definition: texte(terme['definition']),
                domaine: texte(terme['domain'])
            })),
            actifs: liste(gouvernance.assets).map(actifPourDossier),
            perimetres: liste(gouvernance.perimeters).map(perimetre => ({
                nom: texte(perimetre['name']),
                description: texte(perimetre['description']),
                tables: liste<string>(perimetre['tables']).join(', ')
            })),
            listes: liste(gouvernance.valueLists).map(listeValeursPourDossier),
            personnes: liste(gouvernance.people).map(personnePourDossier),
            regles: regles.map(regle => ({
                nom: regle.nom,
                source: nomSource.get(regle.sourceId) || regle.sourceId,
                colonne: regle.colonne,
                type: regle.type,
                criticite: regle.criticite,
                taux: regle.dernierResultat ? Math.round(100 * (regle.dernierResultat as { taux: number }).taux) + ' %' : '—'
            })),
            sensibilite: compterNiveauxSensibilite(sources, gouvernance)
        });
    }
}

/** Nombre de colonnes par niveau de sensibilité (niveau fixé, sinon niveau proposé d'après le dictionnaire et le nom). */
function compterNiveauxSensibilite(sources: DocumentSource[], gouvernance: EtatApplication['governance']): DonneesDossier['sensibilite'] {
    const compteNiveaux: Record<string, number> = {};
    for (const source of sources)
        for (const colonne of source.headers || []) {
            const niveau =
                gouvernance.privacy.levels[source.name]?.[colonne] ||
                niveauPropose(texte(gouvernance.dictionary[source.name]?.columns?.[colonne]?.['sensitivity']), colonne);
            compteNiveaux[niveau] = (compteNiveaux[niveau] || 0) + 1;
        }
    return Object.entries(compteNiveaux).map(([niveau, colonnes]) => ({ niveau, colonnes }));
}

function sourcePourDossier(source: DocumentSource, fiche: Record<string, unknown> | undefined): DonneesDossier['sources'][number] {
    return {
        nom: source.name,
        type: source.type === 'designed' ? 'table conçue' : source.type || 'table',
        colonnes: (source.headers || []).length,
        domaine: texte(fiche?.['domain']),
        description: texte(fiche?.['description']),
        proprietaire: texte(fiche?.['owner'])
    };
}

function objetPourDossier(objet: Record<string, unknown>): DonneesDossier['objets'][number] {
    return {
        nom: texte(objet['name']),
        definition: texte(objet['definition']),
        domaine: texte(objet['domain']),
        proprietaire: texte(objet['globalOwner']),
        statut: texte(objet['status']),
        attributs: liste(objet['elements']).map(attribut => ({
            nom: texte(attribut['name']),
            definition: texte(attribut['definition']),
            colonnes: liste<{ table: string; col: string }>(attribut['mappings'])
                .map(correspondance => correspondance.table + '.' + correspondance.col)
                .join(', ')
        }))
    };
}

function actifPourDossier(actif: Record<string, unknown>): DonneesDossier['actifs'][number] {
    return {
        nom: texte(actif['name']),
        genre: actif['kind'] === 'process' ? 'processus' : actif['kind'] === 'report' ? 'restitution' : 'application',
        responsable: texte(actif['owner']),
        domaine: texte(actif['domain']),
        criticite: texte(actif['criticality']),
        description: texte(actif['description'])
    };
}

function listeValeursPourDossier(listeValeurs: Record<string, unknown>): DonneesDossier['listes'][number] {
    return {
        nom: texte(listeValeurs['name']),
        description: texte(listeValeurs['description']),
        definition:
            listeValeurs['kind'] === 'table'
                ? `référentiel ${texte(listeValeurs['srcTable'])}.${texte(listeValeurs['colCode'])}`
                : liste<{ code: string; label: string }>(listeValeurs['values'])
                      .map(valeur => valeur.code + (valeur.label ? ' (' + valeur.label + ')' : ''))
                      .join(', ')
    };
}

function personnePourDossier(personne: Record<string, unknown>): DonneesDossier['personnes'][number] {
    return {
        nom: texte(personne['name']),
        email: texte(personne['email']),
        roles: liste<{ domain: string; role: string }>(personne['roles'])
            .map(role => `${role.role}${role.domain ? ' · ' + role.domain : ''}`)
            .join(', ')
    };
}
