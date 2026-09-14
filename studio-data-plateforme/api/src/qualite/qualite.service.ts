/**
 * Service qualité : exécute le profilage (avec filtres d'audit), la recherche de doublons, les règles et l'inspecteur
 * d'anomalies sur le moteur DuckDB de l'espace ; enregistre audits et règles dans PostgreSQL. Reprend aussi de
 * l'application classique l'audit d'un objet métier (table maître, règles du périmètre, facettes 1–1) et les
 * clés fonctionnelles composites avec doublons approchés.
 */
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { EspaceAvecRole } from '../authentification/contexte-requete';
import { BASE_DE_DONNEES, BaseDeDonnees } from '../base-de-donnees/connexion';
import { AuditQualite, RegleQualite, Utilisateur, auditsQualite, reglesQualite } from '../base-de-donnees/schema';
import { erreurIntrouvable, erreurRequete, messageUtilisateur } from '../commun/erreurs';
import { EspacesService } from '../espaces/espaces.service';
import { ConfigurationSerie } from '../exploitation/series-temporelles';
import { MoteurDuckDB, identifiantSql } from '../espaces/moteur-duckdb';
import { GouvernanceService } from '../gouvernance/gouvernance.service';
import { ListeValeurs, sqlCodesAutorises } from '../gouvernance/listes-valeurs';
import { ModeleService } from '../modele/modele.service';
import { DocumentSource, SourcesService } from '../sources/sources.service';
import { FiltreSource, conditionFiltreSource } from '../tables-concues/constructeur-table-concue';
import { Anomalie, GenreAnomalie, anomaliesDuProfil, sqlLignesAnomalie } from './anomalies';
import { FeuilleAEcrire, classeurExcel } from '../commun/classeur-excel-ecriture';
import {
    COLONNES_TECHNIQUES_CLE,
    ContexteCle,
    ProfilCle,
    SEPARATEUR_COMPOSANTS,
    sqlAnalyseCle,
    sqlLignesEnDouble,
    sqlSourceCle
} from './cle-fonctionnelle';
import { DetailColonne, assemblerDetailColonne, sqlMotifsFrequents, sqlStatistiquesColonne } from './detail-colonne';
import {
    ProfilColonne,
    ProfilSource,
    nombre,
    sqlDoublonsExacts,
    sqlDoublonsParCle,
    sqlHygieneColonne,
    sqlLignesVides,
    sqlMesuresColonne,
    sqlMotifs,
    sqlValeursFrequentes
} from './profilage';
import { ContexteRegle, DefinitionRegle, ErreurRegle, ResultatRegle, TYPES_SANS_COLONNE, scoreQualite, sqlEvaluation } from './regles';

export type ResultatDoublons = {
    cle: string[];
    groupes: number;
    lignes: number;
    exemples: { valeurs: (string | null)[]; nombre: number }[];
};

export type ExecutionRegles = { score: number | null; regles: (RegleQualite & { resultat: ResultatRegle | null; erreur?: string })[] };

export type PageLignes = { colonnes: string[]; lignes: unknown[][]; total: number; offset: number };

export type ResultatFacette = {
    nom: string;
    table: string;
    total: number;
    sansLigne: number;
    plusieurs: number;
    exemples: string[];
    erreur?: string;
};
export type AuditObjet = {
    objet: { id: string; name: string };
    tableMaitre: string;
    profil: ProfilSource;
    regles: ExecutionRegles;
    facettes: ResultatFacette[];
};

export type ResultatProfilCle = {
    profil: ProfilCle;
    totalLignes: number;
    exactes: { groupes: number; lignes: number; exemples: { cle: string; nombre: number }[] };
    proches: { groupes: number; exemples: { cle: string; nombre: number; ecritures: string[] }[] };
    floues: { exemple1: string; exemple2: string; nombre1: number; nombre2: number; similarite: number }[];
    erreur?: string;
};

export type TypeDoublon = 'stricte' | 'normalisee' | 'floue';
export type LignesEnDouble = {
    source: string;
    seuil: number;
    colonnes: string[];
    lignes: { profil: string; type: TypeDoublon; groupe: string; cle: string; valeurs: (string | null)[] }[];
    erreurs: string[];
};

const TAILLE_PAGE = 50;
/** Nombre de valeurs les plus fréquentes renvoyées par le détail d'une colonne. */
const VALEURS_FREQUENTES_DETAIL = 12;

/** Les composants d'une clé sont concaténés avec le séparateur ASCII 31 ; à l'écran on les sépare par « · ». */
const cleLisible = (valeur: unknown) => String(valeur).split(SEPARATEUR_COMPOSANTS).join(' · ');

@Injectable()
export class QualiteService {
    constructor(
        @Inject(BASE_DE_DONNEES) private readonly base: BaseDeDonnees,
        private readonly espaces: EspacesService,
        private readonly sources: SourcesService,
        private readonly gouvernance: GouvernanceService,
        private readonly modele: ModeleService
    ) {}

    // ---- périmètre d'audit (filtres) ----
    /**
     * Table à auditer : la source elle-même, ou une copie filtrée et/ou limitée aux premières lignes (« volume
     * analysé »), table temporaire à abandonner après usage.
     */
    private async tableAuditee(
        moteur: MoteurDuckDB,
        sourceId: string,
        filtres: FiltreSource[] | undefined,
        echantillon?: number
    ): Promise<{ nomTable: string; liberer: () => Promise<void> }> {
        const conditions = (filtres || []).map(filtre => conditionFiltreSource(filtre)).filter(Boolean);
        if (!conditions.length && !echantillon) return { nomTable: 't_' + sourceId, liberer: async () => undefined };
        const nomTable = 'audit_' + sourceId;
        const clauseWhere = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
        const clauseLimite = echantillon ? ` ORDER BY __rn LIMIT ${Math.floor(echantillon)}` : '';
        await moteur.executer(
            `CREATE OR REPLACE TABLE ${identifiantSql(nomTable)} AS SELECT * FROM ${identifiantSql('t_' + sourceId)}${clauseWhere}${clauseLimite}`
        );
        return { nomTable, liberer: () => moteur.abandonner(nomTable) };
    }

    // ---- profilage ----
    async profiler(
        espace: EspaceAvecRole,
        sourceId: string,
        auteurId: string,
        filtres?: FiltreSource[],
        echantillon?: number
    ): Promise<ProfilSource & { anomalies: Anomalie[] }> {
        const source = await this.sourceDe(espace, sourceId);
        const { moteur } = await this.espaces.ressources(espace);
        const { nomTable, liberer } = await this.tableAuditee(moteur, sourceId, filtres, echantillon);
        try {
            const colonnes: ProfilColonne[] = [];
            for (const colonne of source.headers || []) colonnes.push(await this.profilerColonne(moteur, nomTable, colonne));
            const lignes = colonnes.length
                ? colonnes[0].total
                : nombre((await moteur.executer(`SELECT COUNT(*)::BIGINT FROM ${identifiantSql(nomTable)}`)).lignes[0][0]);
            const entetes = source.headers || [];
            const [doublonsExacts, lignesVides] = entetes.length
                ? await Promise.all([
                      moteur.executer(sqlDoublonsExacts(nomTable, entetes)).then(resultat => nombre(resultat.lignes[0][0])),
                      moteur.executer(sqlLignesVides(nomTable, entetes)).then(resultat => nombre(resultat.lignes[0][0]))
                  ])
                : [0, 0];
            const completudeMoyenne = colonnes.length
                ? colonnes.reduce((somme, colonne) => somme + colonne.completude, 0) / colonnes.length
                : 1;
            const profil: ProfilSource = {
                sourceId,
                sourceNom: source.name,
                lignes,
                colonnes,
                completudeMoyenne,
                doublonsExacts,
                lignesVides,
                filtres: filtres || [],
                ...(echantillon ? { echantillon } : {})
            };
            await this.enregistrerAudit(
                espace.id,
                auteurId,
                source,
                'profilage',
                lignes,
                {
                    completudeMoyenne,
                    doublonsExacts,
                    colonnesIncompletes: colonnes.filter(colonne => colonne.completude < 0.95).length,
                    filtres: (filtres || []).length
                },
                profil
            );
            return { ...profil, anomalies: anomaliesDuProfil(profil, entetes) };
        } finally {
            await liberer();
        }
    }

    /** Mesures d'une colonne : complétude, formats, motifs, valeurs fréquentes et hygiène. */
    private async profilerColonne(moteur: MoteurDuckDB, nomTable: string, colonne: string): Promise<ProfilColonne> {
        const [mesures, motifs, frequentes, hygiene] = await Promise.all([
            moteur.executer(sqlMesuresColonne(nomTable, colonne)),
            moteur.executer(sqlMotifs(nomTable, colonne)),
            moteur.executer(sqlValeursFrequentes(nomTable, colonne)),
            moteur.executer(sqlHygieneColonne(nomTable, colonne))
        ]);
        const [total, vides, distinctes, longueurMin, longueurMax, espacesParasites, numeriques, dates] = mesures.lignes[0];
        const nonVides = nombre(total) - nombre(vides);
        const [motif, nombreMotif, motifsDistincts] = motifs.lignes[0];
        const [espacesMultiples, boucheTrous, cassesIncoherentes, aberrantes, moyenne, ecartType] = hygiene.lignes[0];
        return {
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
            })),
            espacesMultiples: nombre(espacesMultiples),
            boucheTrous: nombre(boucheTrous),
            cassesIncoherentes: nombre(cassesIncoherentes),
            aberrantes: nombre(aberrantes),
            moyenne: moyenne === null ? null : nombre(moyenne),
            ecartType: ecartType === null ? null : nombre(ecartType)
        };
    }

    /** Détail d'une colonne (« Analyse Colonnes ») : type sémantique, statistiques, valeurs fréquentes, motifs, signaux. */
    async detailColonne(
        espace: EspaceAvecRole,
        sourceId: string,
        colonne: string,
        filtres?: FiltreSource[],
        echantillon?: number
    ): Promise<DetailColonne> {
        const source = await this.sourceDe(espace, sourceId);
        if (!(source.headers || []).includes(colonne)) throw erreurRequete(`Colonne inconnue : « ${colonne} ».`);
        const { moteur } = await this.espaces.ressources(espace);
        const { nomTable, liberer } = await this.tableAuditee(moteur, sourceId, filtres, echantillon);
        try {
            const [profil, statistiques, frequentes, motifs] = await Promise.all([
                this.profilerColonne(moteur, nomTable, colonne),
                moteur.executer(sqlStatistiquesColonne(nomTable, colonne)),
                moteur.executer(sqlValeursFrequentes(nomTable, colonne, VALEURS_FREQUENTES_DETAIL)),
                moteur.executer(sqlMotifsFrequents(nomTable, colonne))
            ]);
            return assemblerDetailColonne(profil, statistiques.lignes[0], frequentes.lignes, motifs.lignes);
        } finally {
            await liberer();
        }
    }

    /** Les lignes d'une anomalie du profil, par page de 50 (inspecteur d'anomalies). */
    async lignesAnomalie(
        espace: EspaceAvecRole,
        sourceId: string,
        genre: GenreAnomalie,
        colonne: string,
        offset: number,
        filtres?: FiltreSource[]
    ): Promise<PageLignes> {
        const source = await this.sourceDe(espace, sourceId);
        const entetes = source.headers || [];
        if (colonne && !colonne.startsWith('(') && !entetes.includes(colonne)) throw erreurRequete(`Colonne inconnue : « ${colonne} ».`);
        const { moteur } = await this.espaces.ressources(espace);
        const { nomTable, liberer } = await this.tableAuditee(moteur, sourceId, filtres);
        try {
            const profilColonne = genre === 'aberrantes' ? await this.profilerColonne(moteur, nomTable, colonne) : undefined;
            return await this.page(moteur, sqlLignesAnomalie(genre, nomTable, entetes, colonne, profilColonne), offset);
        } finally {
            await liberer();
        }
    }

    private async page(moteur: MoteurDuckDB, sql: string, offset: number): Promise<PageLignes> {
        const [total, resultat] = await Promise.all([
            moteur.executer(`SELECT COUNT(*)::BIGINT FROM (${sql}) AS lignes`),
            moteur.executer(`SELECT * FROM (${sql}) AS lignes LIMIT ${TAILLE_PAGE} OFFSET ${Math.max(0, offset)}`)
        ]);
        return {
            colonnes: resultat.colonnes.map(colonne => colonne.nom),
            lignes: resultat.lignes,
            total: nombre(total.lignes[0][0]),
            offset: Math.max(0, offset)
        };
    }

    // ---- doublons sur une clé ----
    async doublons(
        espace: EspaceAvecRole,
        sourceId: string,
        cle: string[],
        auteurId: string,
        filtres?: FiltreSource[]
    ): Promise<ResultatDoublons> {
        const source = await this.sourceDe(espace, sourceId);
        const inconnues = cle.filter(colonne => !(source.headers || []).includes(colonne));
        if (!cle.length) throw erreurRequete('Choisissez au moins une colonne de clé.');
        if (inconnues.length) throw erreurRequete(`Colonne(s) inconnue(s) : ${inconnues.join(', ')}.`);
        const { moteur } = await this.espaces.ressources(espace);
        const { nomTable, liberer } = await this.tableAuditee(moteur, sourceId, filtres);
        try {
            const requetes = sqlDoublonsParCle(nomTable, cle);
            const [synthese, exemples, total] = await Promise.all([
                moteur.executer(requetes.synthese),
                moteur.executer(requetes.exemples),
                moteur.executer(`SELECT COUNT(*)::BIGINT FROM ${identifiantSql(nomTable)}`)
            ]);
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
                nombre(total.lignes[0][0]),
                { cle, groupes: resultat.groupes, lignes: resultat.lignes },
                resultat
            );
            return resultat;
        } finally {
            await liberer();
        }
    }

    // ---- clés fonctionnelles composites et doublons approchés ----
    async profilsCle(espaceId: string, nomSource: string): Promise<ProfilCle[]> {
        const etat = await this.gouvernance.etat(espaceId);
        const fiche = etat.governance.dictionary[nomSource] as { keyProfiles?: ProfilCle[] } | undefined;
        return Array.isArray(fiche?.keyProfiles) ? fiche!.keyProfiles : [];
    }

    async enregistrerProfilsCle(
        espace: EspaceAvecRole,
        utilisateur: Utilisateur,
        nomSource: string,
        profils: ProfilCle[]
    ): Promise<ProfilCle[]> {
        const etat = await this.gouvernance.etat(espace.id);
        const fiche = (etat.governance.dictionary[nomSource] ||= { columns: {} } as never) as unknown as { keyProfiles?: ProfilCle[] };
        fiche.keyProfiles = profils;
        await this.gouvernance.enregistrer(espace, utilisateur, etat, 'qualite.cle-fonctionnelle', nomSource);
        return profils;
    }

    /** Analyse chaque profil de clé fonctionnelle d'une source : doublons exacts, proches (normalisés) et flous. */
    async doublonsApproches(espace: EspaceAvecRole, sourceId: string, seuilFlou: number, auteurId: string): Promise<ResultatProfilCle[]> {
        const { source, profils, contexte } = await this.preparerAnalyseCle(espace, sourceId);
        const { moteur } = await this.espaces.ressources(espace);
        const resultats: ResultatProfilCle[] = [];
        for (const profil of profils) resultats.push(await this.analyserProfilCle(moteur, source, profil, contexte, seuilFlou));
        await this.enregistrerAudit(
            espace.id,
            auteurId,
            source,
            'doublons-approches',
            resultats[0]?.totalLignes || 0,
            {
                profils: resultats.length,
                groupesExacts: resultats.reduce((somme, resultat) => somme + resultat.exactes.groupes, 0),
                pairesFloues: resultats.reduce((somme, resultat) => somme + resultat.floues.length, 0)
            },
            { resultats }
        );
        return resultats;
    }

    /**
     * Les lignes en double de tous les profils d'une source, par type (strictes, normalisées, paires floues) :
     * de quoi retravailler la donnée à l'extérieur. Chaque ligne porte le profil, le type, le groupe et la clé.
     */
    async lignesEnDouble(espace: EspaceAvecRole, sourceId: string, seuilFlou: number): Promise<LignesEnDouble> {
        const { source, profils, contexte } = await this.preparerAnalyseCle(espace, sourceId);
        const { moteur } = await this.espaces.ressources(espace);
        const resultat: LignesEnDouble = { source: source.name, seuil: seuilFlou, colonnes: [], lignes: [], erreurs: [] };
        for (const profil of profils) {
            try {
                const avecFlou = profil.parts.some(composant => (composant.match || 'fuzzy') === 'fuzzy');
                const requetes = sqlLignesEnDouble(
                    sqlSourceCle('t_' + source.id, source.name, profil, contexte, true),
                    seuilFlou,
                    avecFlou
                );
                const [strictes, normalisees, floues] = await Promise.all([
                    moteur.executer(requetes.strictes),
                    moteur.executer(requetes.normalisees),
                    requetes.floues ? moteur.executer(requetes.floues) : Promise.resolve(null)
                ]);
                const versLignes = (jeu: { colonnes: { nom: string }[]; lignes: unknown[][] }, type: TypeDoublon) => {
                    const noms = jeu.colonnes.map(colonne => colonne.nom);
                    const indexUtiles = noms
                        .map((nom, index) => (COLONNES_TECHNIQUES_CLE.has(nom) ? -1 : index))
                        .filter(index => index >= 0);
                    if (!resultat.colonnes.length) resultat.colonnes = indexUtiles.map(index => noms[index]);
                    const colonne = (ligne: unknown[], nom: string) => ligne[noms.indexOf(nom)];
                    for (const ligne of jeu.lignes) {
                        const groupe =
                            type === 'floue'
                                ? `paire ${colonne(ligne, '__pid')} (similarité ${(100 * nombre(colonne(ligne, '__sim'))).toFixed(1)} %)`
                                : cleLisible(colonne(ligne, type === 'stricte' ? 'ke' : 'kn'));
                        resultat.lignes.push({
                            profil: profil.id,
                            type,
                            groupe,
                            cle: cleLisible(colonne(ligne, 'ke')),
                            valeurs: indexUtiles.map(index =>
                                ligne[index] === null || ligne[index] === undefined ? null : String(ligne[index])
                            )
                        });
                    }
                };
                versLignes(strictes, 'stricte');
                versLignes(normalisees, 'normalisee');
                if (floues) versLignes(floues, 'floue');
            } catch (erreur) {
                resultat.erreurs.push(`${profil.id} : ${messageUtilisateur(erreur)}`);
            }
        }
        return resultat;
    }

    /** Le classeur Excel des lignes en double : une feuille de synthèse puis une feuille par type. */
    async classeurDoublons(espace: EspaceAvecRole, sourceId: string, seuilFlou: number): Promise<{ nomFichier: string; contenu: Buffer }> {
        const doublons = await this.lignesEnDouble(espace, sourceId, seuilFlou);
        const parType = (type: TypeDoublon) => doublons.lignes.filter(ligne => ligne.type === type);
        const enTete = ['PROFIL', 'GROUPE', 'CLE_FONCTIONNELLE', ...doublons.colonnes];
        const feuille = (nom: string, type: TypeDoublon): FeuilleAEcrire => {
            const lignes = parType(type).map(ligne => [ligne.profil, ligne.groupe, ligne.cle, ...ligne.valeurs]);
            return { nom, lignes: lignes.length ? [enTete, ...lignes] : [['Aucune ligne pour ce rapprochement.']] };
        };
        const synthese: unknown[][] = [
            ['Table', doublons.source],
            ['Exporté le', new Date().toLocaleString('fr-FR')],
            ['Seuil de similarité (flou)', seuilFlou],
            [],
            ['Onglet', 'Rapprochement', 'Lignes'],
            ['Stricts', 'Clé strictement identique', parType('stricte').length],
            ['Casse-accents tolérés', 'Identique une fois casse, accents, espaces et ponctuation tolérés', parType('normalisee').length],
            ['Paires floues', 'Paires suspectes au-dessus du seuil (les 2 lignes de chaque paire)', parType('floue').length],
            ...doublons.erreurs.map(erreur => ['Profil en erreur', erreur])
        ];
        return {
            nomFichier: `Doublons_${doublons.source.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`,
            contenu: classeurExcel([
                { nom: 'Synthèse', lignes: synthese },
                feuille('Stricts', 'stricte'),
                feuille('Casse-accents tolérés', 'normalisee'),
                feuille('Paires floues', 'floue')
            ])
        };
    }

    /** Source, profils de clé enregistrés et contexte (tables et relations) d'une analyse de clé fonctionnelle. */
    private async preparerAnalyseCle(
        espace: EspaceAvecRole,
        sourceId: string
    ): Promise<{ source: DocumentSource; profils: ProfilCle[]; contexte: ContexteCle }> {
        const source = await this.sourceDe(espace, sourceId);
        const profils = (await this.profilsCle(espace.id, source.name)).filter(profil => profil.parts.length);
        if (!profils.length) throw erreurRequete('Composez au moins un profil de clé fonctionnelle.');
        const [sources, relations] = await Promise.all([this.sources.listerAvecJeux(espace.id), this.modele.relations(espace.id)]);
        const contexte: ContexteCle = {
            nomTableDe: nom => {
                const candidate = sources.find(candidat => candidat.name === nom);
                return candidate ? 't_' + candidate.id : null;
            },
            relationVers: nomTableLiee => {
                const relation = relations.find(
                    candidat =>
                        (candidat.sourceTable === source.name && candidat.targetTable === nomTableLiee) ||
                        (candidat.targetTable === source.name && candidat.sourceTable === nomTableLiee)
                );
                if (!relation) return null;
                const directe = relation.sourceTable === source.name;
                return {
                    tableLiee: nomTableLiee,
                    colonneBase: directe ? relation.sourceCol : relation.targetCol,
                    colonneLiee: directe ? relation.targetCol : relation.sourceCol
                };
            }
        };
        return { source, profils, contexte };
    }

    private async analyserProfilCle(
        moteur: MoteurDuckDB,
        source: DocumentSource,
        profil: ProfilCle,
        contexte: ContexteCle,
        seuilFlou: number
    ): Promise<ResultatProfilCle> {
        const vide: ResultatProfilCle = {
            profil,
            totalLignes: 0,
            exactes: { groupes: 0, lignes: 0, exemples: [] },
            proches: { groupes: 0, exemples: [] },
            floues: []
        };
        try {
            const avecFlou = profil.parts.some(composant => (composant.match || 'fuzzy') === 'fuzzy');
            const requetes = sqlAnalyseCle(sqlSourceCle('t_' + source.id, source.name, profil, contexte, false), seuilFlou, avecFlou);
            const [total, exactes, exactesExemples, prochesNombre, prochesExemples, floues] = await Promise.all([
                moteur.executer(requetes.total),
                moteur.executer(requetes.exactes),
                moteur.executer(requetes.exactesExemples),
                moteur.executer(requetes.prochesNombre),
                moteur.executer(requetes.prochesExemples),
                requetes.floues ? moteur.executer(requetes.floues) : Promise.resolve({ lignes: [] as unknown[][] })
            ]);
            return {
                profil,
                totalLignes: nombre(total.lignes[0][0]),
                exactes: {
                    groupes: nombre(exactes.lignes[0][0]),
                    lignes: nombre(exactes.lignes[0][1]),
                    exemples: exactesExemples.lignes.map(ligne => ({ cle: cleLisible(ligne[0]), nombre: nombre(ligne[1]) }))
                },
                proches: {
                    groupes: nombre(prochesNombre.lignes[0][0]),
                    exemples: prochesExemples.lignes.map(ligne => ({
                        cle: cleLisible(ligne[0]),
                        nombre: nombre(ligne[1]),
                        ecritures: (Array.isArray(ligne[2]) ? (ligne[2] as string[]) : []).map(cleLisible).slice(0, 4)
                    }))
                },
                floues: floues.lignes.map(ligne => ({
                    exemple1: cleLisible(ligne[0]),
                    exemple2: cleLisible(ligne[1]),
                    nombre1: nombre(ligne[2]),
                    nombre2: nombre(ligne[3]),
                    similarite: Math.round(1000 * nombre(ligne[4])) / 1000
                }))
            };
        } catch (erreur) {
            return { ...vide, erreur: messageUtilisateur(erreur) };
        }
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

    /** Copie d'une règle (« nom (copie) »), désactivée pour être relue avant de compter dans le score. */
    async dupliquerRegle(espace: EspaceAvecRole, id: string): Promise<RegleQualite> {
        const origine = await this.regleDe(espace.id, id);
        const definition = this.definitionDe(origine);
        const [copie] = await this.base
            .insert(reglesQualite)
            .values({
                espaceId: espace.id,
                nom: origine.nom + ' (copie)',
                sourceId: definition.sourceId,
                colonne: definition.colonne,
                type: definition.type,
                parametres: definition.parametres,
                criticite: definition.criticite,
                active: false
            })
            .returning();
        return copie;
    }

    /** Exécute une seule règle (même inactive) et mémorise son résultat. */
    async executerUneRegle(espace: EspaceAvecRole, id: string, auteurId: string): Promise<ExecutionRegles['regles'][number]> {
        const regle = await this.regleDe(espace.id, id);
        const execution = await this.executerListeRegles(espace, [regle], auteurId);
        return execution.regles[0];
    }

    private async regleDe(espaceId: string, id: string): Promise<RegleQualite> {
        const regle = (
            await this.base
                .select()
                .from(reglesQualite)
                .where(and(eq(reglesQualite.espaceId, espaceId), eq(reglesQualite.id, id)))
                .limit(1)
        )[0];
        if (!regle) throw erreurIntrouvable('Règle inconnue.');
        return regle;
    }

    /** Environnement d'évaluation : tables des sources et codes des listes de valeurs de la gouvernance. */
    private async contexteRegles(espaceId: string): Promise<{ contexte: ContexteRegle; parId: Map<string, DocumentSource> }> {
        const [sources, etat] = await Promise.all([this.sources.listerAvecJeux(espaceId), this.gouvernance.etat(espaceId)]);
        const parId = new Map(sources.map(source => [String(source.id), source]));
        const parNom = new Map(sources.map(source => [source.name, source]));
        const listes = (etat.governance.valueLists || []) as unknown as ListeValeurs[];
        // Les séries temporelles déclarées vivent dans governance.series (format de l'application classique).
        const series = ((etat.governance as Record<string, unknown>)['series'] || []) as ConfigurationSerie[];
        return {
            parId,
            contexte: {
                nomTableDe: id => {
                    if (!parId.has(id)) throw new ErreurRegle(`Source inconnue : ${id}`);
                    return 't_' + id;
                },
                sqlListeValeurs: listeId => {
                    const liste = listes.find(candidat => candidat.id === listeId);
                    return liste ? sqlCodesAutorises(liste, nom => (parNom.has(nom) ? 't_' + parNom.get(nom)!.id : null)) : null;
                },
                configurationSerie: serieId => series.find(candidat => candidat.id === serieId) || null
            }
        };
    }

    private definitionDe(regle: RegleQualite): DefinitionRegle {
        return {
            ...regle,
            parametres: regle.parametres as DefinitionRegle['parametres'],
            type: regle.type as DefinitionRegle['type'],
            criticite: regle.criticite as DefinitionRegle['criticite']
        };
    }

    /** Exécute les règles actives (d'une source ou de tout l'espace), enregistre chaque résultat et un audit par source. */
    async executerRegles(espace: EspaceAvecRole, sourceId: string | undefined, auteurId: string): Promise<ExecutionRegles> {
        const regles = (await this.regles(espace.id, sourceId)).filter(regle => regle.active);
        return this.executerListeRegles(espace, regles, auteurId);
    }

    private async executerListeRegles(espace: EspaceAvecRole, regles: RegleQualite[], auteurId: string): Promise<ExecutionRegles> {
        const { moteur } = await this.espaces.ressources(espace);
        const { contexte, parId } = await this.contexteRegles(espace.id);
        const resultats: ExecutionRegles['regles'] = [];
        for (const regle of regles) {
            try {
                const requetes = sqlEvaluation(this.definitionDe(regle), contexte);
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
                resultats.push({ ...regle, resultat: null, erreur: messageUtilisateur(erreur) });
            }
        }
        const evaluees = resultats.filter(regle => regle.resultat);
        const score = scoreQualite(evaluees.map(regle => ({ criticite: regle.criticite, taux: regle.resultat!.taux })));
        await this.enregistrerAuditsParSource(espace.id, auteurId, evaluees, parId);
        return { score, regles: resultats };
    }

    /** Les lignes en échec d'une règle, par page de 50. */
    async lignesRegle(espace: EspaceAvecRole, id: string, offset: number): Promise<PageLignes> {
        const regle = await this.regleDe(espace.id, id);
        const { contexte } = await this.contexteRegles(espace.id);
        const { moteur } = await this.espaces.ressources(espace);
        try {
            return await this.page(moteur, sqlEvaluation(this.definitionDe(regle), contexte).lignes, offset);
        } catch (erreur) {
            if (erreur instanceof ErreurRegle) throw erreurRequete(erreur.message);
            throw erreur;
        }
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

    // ---- audit d'un objet métier ----
    /** Profil de la table maître, règles des tables du périmètre de l'objet, cardinalité 1–1 des facettes. */
    async auditObjet(espace: EspaceAvecRole, objetId: string, auteurId: string, filtres?: FiltreSource[]): Promise<AuditObjet> {
        const [etat, sources, relations] = await Promise.all([
            this.gouvernance.etat(espace.id),
            this.sources.listerAvecJeux(espace.id),
            this.modele.relations(espace.id)
        ]);
        const objet = (etat.governance.businessObjects as unknown as ObjetPourAudit[]).find(candidat => candidat.id === objetId);
        if (!objet) throw erreurIntrouvable('Objet métier inconnu.');
        const nomMaitre = (objet.sources || []).find(source => source.role === 'maitre')?.table || (objet.sources || [])[0]?.table;
        const maitre = sources.find(source => source.name === nomMaitre);
        if (!maitre) throw erreurRequete(`L'objet « ${objet.name} » n'a pas de source maître chargée.`);
        const profil = await this.profiler(espace, maitre.id!, auteurId, filtres);
        const tablesPerimetre = new Set([
            maitre.name,
            ...(objet.sources || []).map(source => source.table),
            ...(objet.structure || []).map(facette => facette.table)
        ]);
        const idsPerimetre = new Set(sources.filter(source => tablesPerimetre.has(source.name)).map(source => source.id!));
        const regles = (await this.regles(espace.id)).filter(regle => regle.active && idsPerimetre.has(regle.sourceId));
        const execution = await this.executerListeRegles(espace, regles, auteurId);
        const { moteur } = await this.espaces.ressources(espace);
        const facettes: ResultatFacette[] = [];
        for (const facette of objet.structure || [])
            facettes.push(await this.cardinaliteFacette(moteur, maitre, facette, sources, relations));
        return { objet: { id: objet.id, name: objet.name }, tableMaitre: maitre.name, profil, regles: execution, facettes };
    }

    /** Une facette 1–1 : chaque ligne maître doit avoir exactement une ligne dans la table de la facette (dans son périmètre). */
    private async cardinaliteFacette(
        moteur: MoteurDuckDB,
        maitre: DocumentSource,
        facette: FacettePourAudit,
        sources: DocumentSource[],
        relations: { sourceTable: string; sourceCol: string; targetTable: string; targetCol: string }[]
    ): Promise<ResultatFacette> {
        const nom = facette.name || facette.table;
        const enfant = sources.find(source => source.name === facette.table);
        const relation = relations.find(
            candidat =>
                (candidat.sourceTable === maitre.name && candidat.targetTable === facette.table) ||
                (candidat.targetTable === maitre.name && candidat.sourceTable === facette.table)
        );
        if (!enfant) return { nom, table: facette.table, total: 0, sansLigne: 0, plusieurs: 0, exemples: [], erreur: 'Table non chargée.' };
        if (!relation)
            return {
                nom,
                table: facette.table,
                total: 0,
                sansLigne: 0,
                plusieurs: 0,
                exemples: [],
                erreur: `Aucun lien du modèle de données entre ${maitre.name} et ${facette.table}.`
            };
        const colonneMaitre = relation.sourceTable === maitre.name ? relation.sourceCol : relation.targetCol;
        const colonneEnfant = relation.sourceTable === maitre.name ? relation.targetCol : relation.sourceCol;
        const normalisee = (alias: string, colonne: string) =>
            `NULLIF(UPPER(TRIM(CAST(${alias}.${identifiantSql(colonne)} AS VARCHAR))), '')`;
        const perimetre = (facette.scope || []).map(condition => conditionFiltreSource(condition as FiltreSource, 'x.')).filter(Boolean);
        const applicabilite = (facette.applies || [])
            .map(condition => conditionFiltreSource(condition as FiltreSource, 'p.'))
            .filter(Boolean);
        const resultat = await moteur.executer(
            `WITH parents AS (SELECT ${normalisee('p', colonneMaitre)} AS k, MIN(TRIM(CAST(p.${identifiantSql(colonneMaitre)} AS VARCHAR))) AS affichage FROM ${identifiantSql('t_' + maitre.id)} p WHERE ${normalisee('p', colonneMaitre)} IS NOT NULL${applicabilite.length ? ' AND ' + applicabilite.join(' AND ') : ''} GROUP BY 1),
                  enfants AS (SELECT ${normalisee('x', colonneEnfant)} AS k, COUNT(*)::BIGINT AS c FROM ${identifiantSql('t_' + enfant.id)} x WHERE ${normalisee('x', colonneEnfant)} IS NOT NULL${perimetre.length ? ' AND ' + perimetre.join(' AND ') : ''} GROUP BY 1)
             SELECT (SELECT COUNT(*) FROM parents)::BIGINT AS total,
                    SUM(CASE WHEN COALESCE(enfants.c, 0) = 0 THEN 1 ELSE 0 END)::BIGINT AS sans_ligne,
                    SUM(CASE WHEN COALESCE(enfants.c, 0) > 1 THEN 1 ELSE 0 END)::BIGINT AS plusieurs,
                    list(parents.affichage) FILTER (WHERE COALESCE(enfants.c, 0) <> 1) AS exemples
             FROM parents LEFT JOIN enfants ON parents.k = enfants.k`
        );
        const [total, sansLigne, plusieurs, exemples] = resultat.lignes[0];
        return {
            nom,
            table: facette.table,
            total: nombre(total),
            sansLigne: nombre(sansLigne),
            plusieurs: nombre(plusieurs),
            exemples: (Array.isArray(exemples) ? (exemples as string[]) : []).filter(Boolean).slice(0, 5)
        };
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
        const entetes = source.headers || [];
        if (!TYPES_SANS_COLONNE.includes(definition.type) && !entetes.includes(definition.colonne))
            throw erreurRequete(`La colonne « ${definition.colonne} » n'existe pas dans « ${source.name} ».`);
        for (const colonne of [
            ...(definition.parametres.colonnes || []),
            ...(definition.parametres.colonnesGroupe || []),
            definition.parametres.alorsColonne,
            definition.parametres.colonneAgregee
        ])
            if (colonne && !entetes.includes(colonne))
                throw erreurRequete(`La colonne « ${colonne} » n'existe pas dans « ${source.name} ».`);
        if (definition.type === 'reference') {
            const cible = await this.sourceDe(espace, definition.parametres.sourceCibleId || '');
            if (!(cible.headers || []).includes(definition.parametres.colonneCible || ''))
                throw erreurRequete(`La colonne cible n'existe pas dans « ${cible.name} ».`);
        }
        try {
            const { contexte } = await this.contexteRegles(espace.id);
            sqlEvaluation(definition, contexte);
        } catch (erreur) {
            if (erreur instanceof ErreurRegle) throw erreurRequete(erreur.message);
            throw erreur;
        }
    }
}

type FacettePourAudit = {
    id?: string;
    name?: string;
    table: string;
    scope?: { col: string; op: string; val: string }[];
    applies?: { col: string; op: string; val: string }[];
};
type ObjetPourAudit = { id: string; name: string; sources?: { table: string; role: string }[]; structure?: FacettePourAudit[] };
