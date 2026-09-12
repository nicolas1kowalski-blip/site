/**
 * Service qualité : exécute le profilage, la recherche de doublons et les règles sur le moteur DuckDB de
 * l'espace, et enregistre les audits et les règles dans PostgreSQL.
 */
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { BASE_DE_DONNEES, BaseDeDonnees } from '../base-de-donnees/connexion';
import { AuditQualite, RegleQualite, auditsQualite, reglesQualite } from '../base-de-donnees/schema';
import { erreurIntrouvable, erreurRequete } from '../commun/erreurs';
import { EspaceAvecRole } from '../authentification/contexte-requete';
import { EspacesService } from '../espaces/espaces.service';
import { DocumentSource, SourcesService } from '../sources/sources.service';
import {
    ProfilColonne,
    ProfilSource,
    nombre,
    sqlDoublonsExacts,
    sqlDoublonsParCle,
    sqlMesuresColonne,
    sqlMotifs,
    sqlValeursFrequentes
} from './profilage';
import { DefinitionRegle, ErreurRegle, ResultatRegle, scoreQualite, sqlEvaluation } from './regles';

export type ResultatDoublons = {
    cle: string[];
    groupes: number;
    lignes: number;
    exemples: { valeurs: (string | null)[]; nombre: number }[];
};

export type ExecutionRegles = { score: number | null; regles: (RegleQualite & { resultat: ResultatRegle | null; erreur?: string })[] };

@Injectable()
export class QualiteService {
    constructor(
        @Inject(BASE_DE_DONNEES) private readonly base: BaseDeDonnees,
        private readonly espaces: EspacesService,
        private readonly sources: SourcesService
    ) {}

    // ---- profilage ----
    async profiler(espace: EspaceAvecRole, sourceId: string, auteurId: string): Promise<ProfilSource> {
        const source = await this.sourceDe(espace, sourceId);
        const { moteur } = await this.espaces.ressources(espace);
        const nomTable = 't_' + sourceId;
        const colonnes: ProfilColonne[] = [];
        for (const colonne of source.headers || []) {
            const [mesures, motifs, frequentes] = await Promise.all([
                moteur.executer(sqlMesuresColonne(nomTable, colonne)),
                moteur.executer(sqlMotifs(nomTable, colonne)),
                moteur.executer(sqlValeursFrequentes(nomTable, colonne))
            ]);
            const [total, vides, distinctes, longueurMin, longueurMax, espacesParasites, numeriques, dates] = mesures.lignes[0];
            const nonVides = nombre(total) - nombre(vides);
            const [motif, nombreMotif, motifsDistincts] = motifs.lignes[0];
            colonnes.push({
                colonne,
                total: nombre(total),
                vides: nombre(vides),
                completude: nombre(total) ? nonVides / nombre(total) : 1,
                distinctes: nombre(distinctes),
                longueurMin: longueurMin === null ? null : nombre(longueurMin),
                longueurMax: longueurMax === null ? null : nombre(longueurMax),
                espacesParasites: nombre(espacesParasites),
                partNumerique: nonVides ? nombre(numeriques) / nonVides : 0,
                partDate: nonVides ? nombre(dates) / nonVides : 0,
                motifMajoritaire: motif === null ? null : String(motif),
                partMotifMajoritaire: nonVides ? nombre(nombreMotif) / nonVides : 0,
                motifsDistincts: nombre(motifsDistincts),
                valeursFrequentes: frequentes.lignes.map(([valeur, nombreValeur]) => ({
                    valeur: valeur === null ? null : String(valeur),
                    nombre: nombre(nombreValeur)
                }))
            });
        }
        const lignes = colonnes.length
            ? colonnes[0].total
            : nombre((await moteur.executer(`SELECT COUNT(*)::BIGINT FROM "${nomTable}"`)).lignes[0][0]);
        const doublonsExacts = source.headers?.length
            ? nombre((await moteur.executer(sqlDoublonsExacts(nomTable, source.headers))).lignes[0][0])
            : 0;
        const completudeMoyenne = colonnes.length
            ? colonnes.reduce((somme, colonne) => somme + colonne.completude, 0) / colonnes.length
            : 1;
        const profil: ProfilSource = { sourceId, sourceNom: source.name, lignes, colonnes, completudeMoyenne, doublonsExacts };
        await this.enregistrerAudit(
            espace.id,
            auteurId,
            source,
            'profilage',
            lignes,
            {
                completudeMoyenne,
                doublonsExacts,
                colonnesIncompletes: colonnes.filter(colonne => colonne.completude < 0.95).length
            },
            profil
        );
        return profil;
    }

    // ---- doublons sur une clé ----
    async doublons(espace: EspaceAvecRole, sourceId: string, cle: string[], auteurId: string): Promise<ResultatDoublons> {
        const source = await this.sourceDe(espace, sourceId);
        const inconnues = cle.filter(colonne => !(source.headers || []).includes(colonne));
        if (!cle.length) throw erreurRequete('Choisissez au moins une colonne de clé.');
        if (inconnues.length) throw erreurRequete(`Colonne(s) inconnue(s) : ${inconnues.join(', ')}.`);
        const { moteur } = await this.espaces.ressources(espace);
        const requetes = sqlDoublonsParCle('t_' + sourceId, cle);
        const [synthese, exemples] = await Promise.all([moteur.executer(requetes.synthese), moteur.executer(requetes.exemples)]);
        const resultat: ResultatDoublons = {
            cle,
            groupes: nombre(synthese.lignes[0][0]),
            lignes: nombre(synthese.lignes[0][1]),
            exemples: exemples.lignes.map(ligne => ({
                valeurs: ligne.slice(0, cle.length).map(valeur => (valeur === null ? null : String(valeur))),
                nombre: nombre(ligne[cle.length])
            }))
        };
        await this.enregistrerAudit(
            espace.id,
            auteurId,
            source,
            'doublons',
            nombre((await moteur.executer(`SELECT COUNT(*)::BIGINT FROM "t_${sourceId}"`)).lignes[0][0]),
            { cle, groupes: resultat.groupes, lignes: resultat.lignes },
            resultat
        );
        return resultat;
    }

    // ---- règles ----
    async regles(espaceId: string, sourceId?: string): Promise<RegleQualite[]> {
        const condition = sourceId
            ? and(eq(reglesQualite.espaceId, espaceId), eq(reglesQualite.sourceId, sourceId))
            : eq(reglesQualite.espaceId, espaceId);
        return this.base.select().from(reglesQualite).where(condition).orderBy(reglesQualite.sourceId, reglesQualite.nom);
    }

    async creerRegle(espace: EspaceAvecRole, definition: DefinitionRegle): Promise<RegleQualite> {
        await this.verifierRegle(espace, definition);
        const [regle] = await this.base
            .insert(reglesQualite)
            .values({ espaceId: espace.id, ...definition })
            .returning();
        return regle;
    }

    async modifierRegle(espace: EspaceAvecRole, id: string, definition: DefinitionRegle): Promise<RegleQualite> {
        await this.verifierRegle(espace, definition);
        const [regle] = await this.base
            .update(reglesQualite)
            .set({ ...definition, modifieLe: new Date() })
            .where(and(eq(reglesQualite.espaceId, espace.id), eq(reglesQualite.id, id)))
            .returning();
        if (!regle) throw erreurIntrouvable('Règle inconnue.');
        return regle;
    }

    async supprimerRegle(espaceId: string, id: string): Promise<void> {
        const supprimees = await this.base
            .delete(reglesQualite)
            .where(and(eq(reglesQualite.espaceId, espaceId), eq(reglesQualite.id, id)))
            .returning();
        if (!supprimees.length) throw erreurIntrouvable('Règle inconnue.');
    }

    /** Exécute les règles actives (d'une source ou de tout l'espace), enregistre chaque résultat et un audit par source. */
    async executerRegles(espace: EspaceAvecRole, sourceId: string | undefined, auteurId: string): Promise<ExecutionRegles> {
        const regles = (await this.regles(espace.id, sourceId)).filter(regle => regle.active);
        const { moteur } = await this.espaces.ressources(espace);
        const sources = await this.sources.lister(espace.id);
        const parId = new Map(sources.map(source => [String(source.id), source]));
        const nomTableDe = (id: string) => {
            if (!parId.has(id)) throw new ErreurRegle(`Source inconnue : ${id}`);
            return 't_' + id;
        };
        const resultats: ExecutionRegles['regles'] = [];
        for (const regle of regles) {
            try {
                const requetes = sqlEvaluation(
                    {
                        ...regle,
                        parametres: regle.parametres as DefinitionRegle['parametres'],
                        type: regle.type as DefinitionRegle['type'],
                        criticite: regle.criticite as DefinitionRegle['criticite']
                    },
                    nomTableDe
                );
                const [total, echecs, exemples] = await Promise.all([
                    moteur.executer(requetes.total),
                    moteur.executer(requetes.echecs),
                    moteur.executer(requetes.exemples)
                ]);
                const resultat: ResultatRegle = {
                    total: nombre(total.lignes[0][0]),
                    echecs: nombre(echecs.lignes[0][0]),
                    taux: nombre(total.lignes[0][0]) ? 1 - nombre(echecs.lignes[0][0]) / nombre(total.lignes[0][0]) : 1,
                    executeLe: new Date().toISOString(),
                    exemples: exemples.lignes.map(ligne => String(ligne[0]))
                };
                await this.base.update(reglesQualite).set({ dernierResultat: resultat }).where(eq(reglesQualite.id, regle.id));
                resultats.push({ ...regle, resultat });
            } catch (erreur) {
                resultats.push({ ...regle, resultat: null, erreur: String((erreur as Error).message || erreur) });
            }
        }
        const evaluees = resultats.filter(regle => regle.resultat);
        const score = scoreQualite(evaluees.map(regle => ({ criticite: regle.criticite, taux: regle.resultat!.taux })));
        await this.enregistrerAuditsParSource(espace.id, auteurId, evaluees, parId);
        return { score, regles: resultats };
    }

    /** Après une exécution, enregistre un audit « règles » par source évaluée (score de la source, règles en échec). */
    private async enregistrerAuditsParSource(
        espaceId: string,
        auteurId: string,
        reglesEvaluees: ExecutionRegles['regles'],
        sourcesParId: Map<string, DocumentSource>
    ): Promise<void> {
        for (const idSource of new Set(reglesEvaluees.map(regle => regle.sourceId))) {
            const source = sourcesParId.get(idSource);
            if (!source) continue;
            const reglesSource = reglesEvaluees.filter(regle => regle.sourceId === idSource);
            const scoreSource = scoreQualite(reglesSource.map(regle => ({ criticite: regle.criticite, taux: regle.resultat!.taux })));
            await this.enregistrerAudit(
                espaceId,
                auteurId,
                source,
                'regles',
                reglesSource[0].resultat!.total,
                {
                    score: scoreSource,
                    regles: reglesSource.length,
                    enEchec: reglesSource.filter(regle => regle.resultat!.echecs > 0).length
                },
                {
                    regles: reglesSource.map(regle => ({
                        id: regle.id,
                        nom: regle.nom,
                        type: regle.type,
                        colonne: regle.colonne,
                        criticite: regle.criticite,
                        ...regle.resultat
                    }))
                }
            );
        }
    }

    // ---- audits ----
    async audits(espaceId: string, sourceId?: string, limite = 100): Promise<AuditQualite[]> {
        const condition = sourceId
            ? and(eq(auditsQualite.espaceId, espaceId), eq(auditsQualite.sourceId, sourceId))
            : eq(auditsQualite.espaceId, espaceId);
        return this.base
            .select()
            .from(auditsQualite)
            .where(condition)
            .orderBy(desc(auditsQualite.lanceLe))
            .limit(Math.min(Math.max(limite, 1), 1000));
    }

    async audit(espaceId: string, id: string): Promise<AuditQualite> {
        const audit = (
            await this.base
                .select()
                .from(auditsQualite)
                .where(and(eq(auditsQualite.espaceId, espaceId), eq(auditsQualite.id, id)))
                .limit(1)
        )[0];
        if (!audit) throw erreurIntrouvable('Audit inconnu.');
        return audit;
    }

    private async enregistrerAudit(
        espaceId: string,
        auteurId: string,
        source: DocumentSource,
        genre: string,
        lignes: number,
        resume: object,
        detail: object
    ): Promise<void> {
        await this.base
            .insert(auditsQualite)
            .values({ espaceId, sourceId: String(source.id), sourceNom: source.name, genre, lanceParId: auteurId, lignes, resume, detail });
    }

    private async sourceDe(espace: EspaceAvecRole, sourceId: string): Promise<DocumentSource> {
        return this.sources.lire(espace.id, sourceId);
    }

    private async verifierRegle(espace: EspaceAvecRole, definition: DefinitionRegle): Promise<void> {
        const source = await this.sourceDe(espace, definition.sourceId);
        if (!(source.headers || []).includes(definition.colonne))
            throw erreurRequete(`La colonne « ${definition.colonne} » n'existe pas dans « ${source.name} ».`);
        if (definition.type === 'reference') {
            const cible = await this.sourceDe(espace, definition.parametres.sourceCibleId || '');
            if (!(cible.headers || []).includes(definition.parametres.colonneCible || ''))
                throw erreurRequete(`La colonne cible n'existe pas dans « ${cible.name} ».`);
        }
        try {
            sqlEvaluation(definition, () => 't');
        } catch (erreur) {
            if (erreur instanceof ErreurRegle) throw erreurRequete(erreur.message);
            throw erreur;
        }
    }
}
