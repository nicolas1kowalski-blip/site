/**
 * Règles de qualité sur les SÉRIES TEMPORELLES (reprises de l'application classique) : une règle désigne une
 * série déclarée (clé de série, horodatage, mesure) et un contrôle qu'un examen ligne par ligne ne peut pas faire :
 * trou (point attendu absent), doublon d'horodatage, plateau (mesure figée), saut (variation implausible),
 * monotonie (compteur qui recule), fraîcheur (série qui n'alimente plus), saisonnalité (point anormal pour son
 * créneau) et couverture (série incomplète). Chaque contrôle rend la requête des anomalies ; l'unité comptée est
 * le point, sauf pour la fraîcheur et la couverture où c'est la série.
 */
import { ConfigurationSerie, blocCommunSeries } from '../exploitation/series-temporelles';

export const TYPES_REGLE_SERIE = {
    serieTrou: 'série : trou (point attendu absent)',
    serieDoublon: "série : doublon d'horodatage",
    seriePlateau: 'série : plateau (mesure figée)',
    serieSaut: 'série : saut (variation implausible)',
    serieMonotonie: 'série : monotonie (compteur qui recule)',
    serieFraicheur: "série : fraîcheur (série qui n'alimente plus)",
    serieSaisonnalite: 'série : saisonnalité (point anormal pour son créneau)',
    serieCouverture: 'série : couverture (série incomplète)'
} as const;
export type TypeRegleSerie = keyof typeof TYPES_REGLE_SERIE;
export const CRENEAUX_SAISON = { heure: 'heure du jour', jourSemaine: 'jour de semaine', mois: 'mois' } as const;

export type ParametresSerie = {
    serieId?: string;
    longueurMinimale?: number;
    sautAbsolu?: number;
    sautPourcent?: number;
    sens?: 'croissant' | 'decroissant';
    ageMaximalHeures?: number;
    reference?: 'fichier' | 'maintenant';
    sensibilite?: number;
    creneau?: keyof typeof CRENEAUX_SAISON;
    couvertureMinimale?: number;
};

export class ErreurRegleSerie extends Error {}

export function estTypeSerie(type: string): type is TypeRegleSerie {
    return Object.prototype.hasOwnProperty.call(TYPES_REGLE_SERIE, type);
}

const date = (expression: string) => `strftime(${expression}, '%Y-%m-%d %H:%M:%S')`;
const duree = (secondes: string) =>
    `CASE WHEN ${secondes} >= 86400 THEN ROUND(${secondes} / 86400.0, 1) || ' j' WHEN ${secondes} >= 3600 THEN ROUND(${secondes} / 3600.0, 1) || ' h' WHEN ${secondes} >= 60 THEN ROUND(${secondes} / 60.0, 1) || ' min' ELSE CAST(${secondes} AS VARCHAR) || ' s' END`;

/** Requête des anomalies d'un contrôle (colonnes lisibles, la première étant la série). */
function sqlAnomalies(type: TypeRegleSerie, parametres: ParametresSerie, configuration: ConfigurationSerie, nomTable: string): string {
    const bloc = blocCommunSeries(configuration, nomTable);
    const tolerance = 1 + (configuration.tol ?? 0.5);
    switch (type) {
        case 'serieTrou':
            return `${bloc} SELECT s.sid AS serie, ${date('s.pts')} AS dernier_point_avant_le_trou, ${date('s.ts')} AS point_suivant, ${duree('s.d')} AS duree_du_trou, ${duree('o.pas')} AS pas_attendu, (s.d / o.pas - 1)::BIGINT AS points_manquants FROM st s JOIN ok o ON o.sid = s.sid WHERE s.d IS NOT NULL AND s.d > o.pas * ${tolerance} ORDER BY s.d DESC`;
        case 'serieDoublon':
            return `${bloc} SELECT sid AS serie, ${date('ts')} AS horodatage, COUNT(*) AS occurrences, COUNT(DISTINCT v) AS valeurs_distinctes, string_agg(DISTINCT CAST(v AS VARCHAR), ' | ') AS valeurs_concurrentes FROM b GROUP BY sid, ts HAVING COUNT(*) > 1 ORDER BY COUNT(*) DESC`;
        case 'seriePlateau': {
            const longueur = Math.max(2, Number(parametres.longueurMinimale) || 3);
            return `${bloc} SELECT sid AS serie, v AS valeur_figee, COUNT(*) AS points_consecutifs, ${date('MIN(ts)')} AS depuis, ${date('MAX(ts)')} AS jusqu_a, ${duree("date_diff('second', MIN(ts), MAX(ts))")} AS duree_du_blocage FROM pl GROUP BY sid, v, grp HAVING COUNT(*) >= ${longueur} ORDER BY COUNT(*) DESC`;
        }
        case 'serieSaut': {
            const conditionsSaut: string[] = [];
            if (parametres.sautAbsolu) conditionsSaut.push(`abs(v - pv) > ${Number(parametres.sautAbsolu)}`);
            if (parametres.sautPourcent)
                conditionsSaut.push(`(pv <> 0 AND abs(v - pv) / abs(pv) * 100 > ${Number(parametres.sautPourcent)})`);
            if (!conditionsSaut.length) throw new ErreurRegleSerie('Règle « saut » : indiquez un écart absolu ou une variation en %.');
            return `${bloc} SELECT sid AS serie, ${date('pts')} AS point_precedent, ${date('ts')} AS horodatage, pv AS valeur_precedente, v AS valeur, ROUND(v - pv, 4) AS ecart, CASE WHEN pv <> 0 THEN ROUND(abs(v - pv) / abs(pv) * 100, 1) END AS variation_pct, ${duree('d')} AS temps_ecoule FROM st WHERE pv IS NOT NULL AND v IS NOT NULL AND (${conditionsSaut.join(' OR ')}) ORDER BY abs(v - pv) DESC`;
        }
        case 'serieMonotonie': {
            const decroissant = parametres.sens === 'decroissant';
            return `${bloc} SELECT sid AS serie, ${date('pts')} AS point_precedent, ${date('ts')} AS horodatage, pv AS valeur_precedente, v AS valeur, ROUND(${decroissant ? 'v - pv' : 'pv - v'}, 4) AS ${decroissant ? 'hausse' : 'recul'}_constate, ${duree('d')} AS temps_ecoule FROM st WHERE pv IS NOT NULL AND v IS NOT NULL AND v ${decroissant ? '>' : '<'} pv ORDER BY abs(v - pv) DESC`;
        }
        case 'serieFraicheur': {
            const heures = Number(parametres.ageMaximalHeures) || 24;
            const reference = parametres.reference === 'maintenant' ? 'now()::TIMESTAMP' : '(SELECT MAX(ts) FROM b)';
            return `${bloc} SELECT sid AS serie, ${date('MAX(ts)')} AS dernier_point_recu, ${date(reference)} AS compare_a, ${duree(`date_diff('second', MAX(ts), ${reference})`)} AS retard, ${duree(String(heures * 3600))} AS retard_maximal_admis, COUNT(*) AS points FROM b GROUP BY sid HAVING date_diff('hour', MAX(ts), ${reference}) > ${heures} ORDER BY date_diff('second', MAX(ts), ${reference}) DESC`;
        }
        case 'serieCouverture': {
            const minimum = Number(parametres.couvertureMinimale) || 95;
            const attendus = `FLOOR(date_diff('second', a.t0, a.t1) / o.pas) + 1`;
            return `${bloc}, agg AS (SELECT sid, COUNT(DISTINCT ts) AS n_ts, MIN(ts) AS t0, MAX(ts) AS t1 FROM b GROUP BY sid) SELECT a.sid AS serie, ${date('a.t0')} AS debut, ${date('a.t1')} AS fin, ${duree('o.pas')} AS pas, a.n_ts AS horodatages_distincts, (${attendus})::BIGINT AS points_attendus, (${attendus} - a.n_ts)::BIGINT AS points_manquants, ROUND(100.0 * a.n_ts / NULLIF(${attendus}, 0), 1) AS couverture_pct FROM agg a JOIN ok o ON o.sid = a.sid WHERE 100.0 * a.n_ts / NULLIF(${attendus}, 0) < ${minimum} ORDER BY 8`;
        }
        case 'serieSaisonnalite': {
            const sensibilite = Number(parametres.sensibilite) || 4;
            const creneau =
                parametres.creneau === 'jourSemaine'
                    ? 'extract(dow FROM ts)'
                    : parametres.creneau === 'mois'
                      ? 'extract(month FROM ts)'
                      : 'extract(hour FROM ts)';
            return (
                `${bloc}, s AS (SELECT sid, ${creneau} AS bk, ts, v FROM b WHERE v IS NOT NULL), m1 AS (SELECT sid, bk, median(v) AS med FROM s GROUP BY sid, bk), ` +
                `m2 AS (SELECT s.sid, s.bk, median(abs(s.v - m1.med)) AS mad, avg(abs(s.v - m1.med)) AS aad, COUNT(*) AS n FROM s JOIN m1 ON m1.sid = s.sid AND m1.bk = s.bk GROUP BY s.sid, s.bk), ` +
                `ms AS (SELECT sid, median(v) AS smed FROM s GROUP BY sid), m3 AS (SELECT s.sid, median(abs(s.v - ms.smed)) AS smad FROM s JOIN ms ON ms.sid = s.sid GROUP BY s.sid), ` +
                `j AS (SELECT s.sid, s.bk, s.ts, s.v, m1.med, m2.n, CASE WHEN m2.mad > 0 THEN ${sensibilite} * 1.4826 * m2.mad WHEN m2.aad > 0 THEN ${sensibilite} * 1.2533 * m2.aad WHEN m3.smad > 0 THEN ${sensibilite} * 1.4826 * m3.smad END AS seuil, ` +
                `CASE WHEN m2.mad > 0 THEN 'écart médian du créneau' WHEN m2.aad > 0 THEN 'écart moyen du créneau' WHEN m3.smad > 0 THEN 'dispersion de la série entière' END AS methode ` +
                `FROM s JOIN m1 ON m1.sid = s.sid AND m1.bk = s.bk JOIN m2 ON m2.sid = s.sid AND m2.bk = s.bk JOIN m3 ON m3.sid = s.sid) ` +
                `SELECT sid AS serie, ${date('ts')} AS horodatage, bk AS creneau, v AS valeur, ROUND(med, 4) AS mediane_du_creneau, ROUND(abs(v - med), 4) AS ecart_a_la_mediane, ROUND(seuil, 4) AS seuil_declenchant, methode AS dispersion_utilisee, n AS points_du_creneau FROM j WHERE n >= 4 AND seuil IS NOT NULL AND abs(v - med) > seuil ORDER BY abs(v - med) / NULLIF(seuil, 0) DESC`
            );
        }
    }
}

/** Requêtes total / échecs / exemples / lignes d'une règle de série, au format attendu par l'exécution des règles. */
export function sqlEvaluationSerie(
    type: TypeRegleSerie,
    parametres: ParametresSerie,
    configuration: ConfigurationSerie,
    nomTable: string
): { total: string; echecs: string; exemples: string; lignes: string } {
    const anomalies = sqlAnomalies(type, parametres, configuration, nomTable);
    const bloc = blocCommunSeries(configuration, nomTable);
    const parSerie = type === 'serieFraicheur' || type === 'serieCouverture';
    const uniteTotale = parSerie ? `SELECT COUNT(DISTINCT sid)::BIGINT FROM b` : `SELECT COUNT(*)::BIGINT FROM b`;
    return {
        total: `${bloc} ${uniteTotale}`,
        echecs: `SELECT COUNT(*)::BIGINT FROM (${anomalies}) AS anomalies`,
        exemples: `SELECT DISTINCT CAST(serie AS VARCHAR) FROM (${anomalies}) AS anomalies LIMIT 5`,
        lignes: anomalies
    };
}
