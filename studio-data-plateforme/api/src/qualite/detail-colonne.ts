/**
 * Détail d'une colonne (l'« Analyse Colonnes » de l'application classique) : type sémantique, statistiques
 * descriptives (nombres : moyenne, écart-type, minimum, maximum, somme, quantiles ; dates : première, dernière,
 * futures, avant 1900 ; textes : longueurs), valeurs les plus fréquentes avec leur part, formats détectés
 * (A = lettre, 9 = chiffre) et signaux (clé candidate, colonne constante, faible cardinalité). Fonctions pures.
 */
import { identifiantSql } from '../espaces/moteur-duckdb';
import { ProfilColonne, expressionMotif } from './profilage';

export type TypeSemantique = 'Numérique' | 'Date/Heure' | 'Email' | 'Téléphone' | 'Texte' | 'Vide';

export type StatistiquesNumeriques = {
    minimum: number;
    maximum: number;
    somme: number;
    moyenne: number;
    ecartType: number;
    p05: number;
    q1: number;
    mediane: number;
    q3: number;
    p95: number;
} | null;
export type StatistiquesDates = { premiere: string | null; derniere: string | null; futures: number; avant1900: number } | null;

export type DetailColonne = {
    colonne: string;
    typeSemantique: TypeSemantique;
    profil: ProfilColonne;
    longueurMoyenne: number | null;
    nombres: StatistiquesNumeriques;
    dates: StatistiquesDates;
    valeursFrequentes: { valeur: string | null; nombre: number; part: number }[];
    motifs: { motif: string; nombre: number; part: number }[];
    motifsDistincts: number;
    signaux: { cleCandidate: boolean; constante: boolean; faibleCardinalite: boolean; asymetrique: boolean };
};

const PART_TYPE = 0.9;

/** Type sémantique déduit des parts numérique / date / email / téléphone parmi les valeurs renseignées. */
export function typeSemantiqueDe(profil: ProfilColonne, partEmail: number, partTelephone: number): TypeSemantique {
    if (profil.total === profil.vides) return 'Vide';
    if (profil.partDate >= PART_TYPE) return 'Date/Heure';
    if (profil.partNumerique >= PART_TYPE) return 'Numérique';
    if (partEmail >= PART_TYPE) return 'Email';
    if (partTelephone >= PART_TYPE) return 'Téléphone';
    return 'Texte';
}

const nombreDe = (valeur: string) => `TRY_CAST(REPLACE(REPLACE(TRIM(${valeur}), ' ', ''), ',', '.') AS DOUBLE)`;
const dateDe = (valeur: string) =>
    `COALESCE(${['%Y-%m-%d', '%d/%m/%Y', '%Y-%m-%d %H:%M:%S', '%d/%m/%Y %H:%M:%S', '%Y/%m/%d', '%d-%m-%Y'].map(format => `TRY_CAST(TRY_STRPTIME(TRIM(${valeur}), '${format}') AS DATE)`).join(', ')}, TRY_CAST(TRIM(${valeur}) AS DATE))`;

/** Parts email / téléphone, longueur moyenne, statistiques numériques et de dates : une seule ligne de résultat. */
export function sqlStatistiquesColonne(nomTable: string, colonne: string): string {
    const valeur = `CAST(${identifiantSql(colonne)} AS VARCHAR)`;
    const nonVide = `(${valeur} IS NOT NULL AND TRIM(${valeur}) <> '')`;
    const nombre = nombreDe(valeur);
    const date = dateDe(valeur);
    return `SELECT
        COUNT(*) FILTER (WHERE ${nonVide})::BIGINT AS renseignees,
        COUNT(*) FILTER (WHERE ${nonVide} AND regexp_matches(TRIM(${valeur}), '^[^@\\s]+@[^@\\s]+\\.[A-Za-z]{2,}$'))::BIGINT AS emails,
        COUNT(*) FILTER (WHERE ${nonVide} AND regexp_matches(regexp_replace(${valeur}, '[ .()-]', '', 'g'), '^\\+?[0-9]{8,15}$'))::BIGINT AS telephones,
        AVG(length(TRIM(${valeur}))) FILTER (WHERE ${nonVide}) AS longueur_moyenne,
        MIN(${nombre}), MAX(${nombre}), SUM(${nombre}), AVG(${nombre}), STDDEV_POP(${nombre}),
        quantile_cont(${nombre}, 0.05), quantile_cont(${nombre}, 0.25), quantile_cont(${nombre}, 0.5), quantile_cont(${nombre}, 0.75), quantile_cont(${nombre}, 0.95),
        MIN(${date}), MAX(${date}),
        COUNT(*) FILTER (WHERE ${date} > CURRENT_DATE)::BIGINT AS futures,
        COUNT(*) FILTER (WHERE ${date} < DATE '1900-01-01')::BIGINT AS avant_1900
    FROM ${identifiantSql(nomTable)}`;
}

/** Les motifs les plus fréquents (A = lettre, 9 = chiffre) et leur nombre. */
export function sqlMotifsFrequents(nomTable: string, colonne: string, limite = 10): string {
    const valeur = `TRIM(CAST(${identifiantSql(colonne)} AS VARCHAR))`;
    return `SELECT ${expressionMotif(valeur)} AS motif, COUNT(*)::BIGINT AS nombre FROM ${identifiantSql(nomTable)} WHERE ${valeur} IS NOT NULL AND ${valeur} <> '' GROUP BY 1 ORDER BY nombre DESC, motif LIMIT ${limite}`;
}

/** Assemble le détail à partir du profil de la colonne et des lignes de résultat des requêtes. */
export function assemblerDetailColonne(
    profil: ProfilColonne,
    statistiques: unknown[],
    valeursFrequentes: unknown[][],
    motifs: unknown[][]
): DetailColonne {
    const nombre = (valeur: unknown) => (valeur === null || valeur === undefined ? null : Number(valeur));
    const [
        renseignees,
        emails,
        telephones,
        longueurMoyenne,
        minimum,
        maximum,
        somme,
        moyenne,
        ecartType,
        p05,
        q1,
        mediane,
        q3,
        p95,
        premiere,
        derniere,
        futures,
        avant1900
    ] = statistiques;
    const renseigneesNombre = Number(renseignees) || 0;
    const typeSemantique = typeSemantiqueDe(
        profil,
        renseigneesNombre ? Number(emails) / renseigneesNombre : 0,
        renseigneesNombre ? Number(telephones) / renseigneesNombre : 0
    );
    const nombres: StatistiquesNumeriques =
        typeSemantique === 'Numérique' && nombre(moyenne) !== null
            ? {
                  minimum: Number(minimum),
                  maximum: Number(maximum),
                  somme: Number(somme),
                  moyenne: Number(moyenne),
                  ecartType: Number(ecartType) || 0,
                  p05: Number(p05),
                  q1: Number(q1),
                  mediane: Number(mediane),
                  q3: Number(q3),
                  p95: Number(p95)
              }
            : null;
    const dates: StatistiquesDates =
        typeSemantique === 'Date/Heure'
            ? {
                  premiere: premiere ? String(premiere) : null,
                  derniere: derniere ? String(derniere) : null,
                  futures: Number(futures) || 0,
                  avant1900: Number(avant1900) || 0
              }
            : null;
    const interquartile = nombres ? nombres.q3 - nombres.q1 : 0;
    const echelle = interquartile > 0 ? interquartile / 2 : (nombres?.ecartType || 0) / 2;
    return {
        colonne: profil.colonne,
        typeSemantique,
        profil,
        longueurMoyenne: nombre(longueurMoyenne),
        nombres,
        dates,
        valeursFrequentes: valeursFrequentes.map(ligne => ({
            valeur: ligne[0] === null ? null : String(ligne[0]),
            nombre: Number(ligne[1]),
            part: renseigneesNombre ? Number(ligne[1]) / renseigneesNombre : 0
        })),
        motifs: motifs.map(ligne => ({
            motif: String(ligne[0] ?? ''),
            nombre: Number(ligne[1]),
            part: renseigneesNombre ? Number(ligne[1]) / renseigneesNombre : 0
        })),
        motifsDistincts: profil.motifsDistincts,
        signaux: {
            cleCandidate: profil.vides === 0 && profil.total > 0 && profil.distinctes === profil.total,
            constante: renseigneesNombre > 0 && profil.distinctes === 1,
            faibleCardinalite: profil.distinctes > 1 && renseigneesNombre > 50 && profil.distinctes / renseigneesNombre < 0.02,
            asymetrique: !!nombres && echelle > 0 && Math.abs(nombres.mediane - nombres.moyenne) > echelle
        }
    };
}
