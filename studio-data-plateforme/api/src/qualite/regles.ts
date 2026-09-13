/**
 * Règles de qualité : chaque type de règle se traduit en une condition SQL « la valeur est conforme ».
 * L'évaluation compte les unités contrôlées (lignes, ou groupes pour une règle d'agrégat) et celles en échec ;
 * le score d'une source est la moyenne des taux de conformité pondérée par la criticité.
 *
 * Types repris de l'application classique : non vide, unique (simple ou composite), format, liste de valeurs
 * saisie, liste de valeurs de la gouvernance, plage, longueur, date valide, référence (clé étrangère), condition
 * « si… alors… », cohérence (expression avec [colonnes], comparaisons typées date / nombre / texte), fraîcheur
 * d'une date, condition SQL libre (lecture seule) et agrégat par groupe.
 */
import { z } from 'zod';
import { identifiantSql, litteralSql } from '../espaces/moteur-duckdb';
import { ConfigurationSerie } from '../exploitation/series-temporelles';
import { ErreurRegleSerie, TYPES_REGLE_SERIE, TypeRegleSerie, estTypeSerie, sqlEvaluationSerie } from './regles-series';
import { formuleEnSql } from '../extraction/constructeur-avance';

export const TYPES_REGLE = {
    nonVide: 'non vide',
    unique: 'unique (pas de doublon, clé simple ou composite)',
    format: 'respecte un format (expression régulière)',
    dansListe: 'dans une liste de valeurs saisie',
    listeValeurs: 'dans une liste de valeurs de la gouvernance',
    plage: 'nombre compris entre deux bornes',
    longueur: 'longueur comprise entre deux bornes',
    dateValide: 'date valide (AAAA-MM-JJ)',
    fraicheur: 'date récente (moins de N jours)',
    reference: 'existe dans une autre source (clé étrangère)',
    condition: 'condition : si… alors…',
    expression: 'cohérence : expression entre colonnes',
    sql: 'condition SQL libre (avancé)',
    groupe: 'agrégat par groupe (avancé)',
    ...TYPES_REGLE_SERIE
} as const;
export type TypeRegle = keyof typeof TYPES_REGLE;

/** Types qui ne portent pas sur une colonne précise (l'expression ou la condition cite ses colonnes). */
export const TYPES_SANS_COLONNE: TypeRegle[] = ['expression', 'sql', 'groupe', ...(Object.keys(TYPES_REGLE_SERIE) as TypeRegleSerie[])];

export const OPERATEURS_CONDITION = { renseigne: 'est renseignée', vide: 'est vide', dans: 'vaut (liste ;)' } as const;
export const AGREGATS_GROUPE = {
    count: 'nombre de lignes',
    countd: 'valeurs distinctes',
    sum: 'somme',
    avg: 'moyenne',
    min: 'minimum',
    max: 'maximum'
} as const;
export const OPERATEURS_GROUPE = ['<=', '>=', '=', '<', '>', '<>'] as const;

export const CRITICITES = { bloquante: 3, majeure: 2, mineure: 1 } as const;
export type Criticite = keyof typeof CRITICITES;

export const schemaRegle = z.object({
    nom: z.string().trim().min(1, 'nom requis').max(200),
    sourceId: z.string().min(1, 'source requise'),
    colonne: z.string().default(''),
    type: z.enum(Object.keys(TYPES_REGLE) as [TypeRegle, ...TypeRegle[]]),
    parametres: z
        .object({
            expression: z.string().optional(),
            valeurs: z.array(z.string()).optional(),
            minimum: z.number().optional(),
            maximum: z.number().optional(),
            sourceCibleId: z.string().optional(),
            colonneCible: z.string().optional(),
            /** unique : colonnes supplémentaires de la clé composite. */
            colonnes: z.array(z.string()).optional(),
            /** listeValeurs : identifiant de la liste de valeurs de la gouvernance. */
            listeId: z.string().optional(),
            /** fraicheur : âge maximal en jours. */
            jours: z.number().optional(),
            /** condition : si (colonne de la règle) opérateur [valeurs] alors (alorsColonne) opérateur [valeurs]. */
            siOperateur: z.enum(['renseigne', 'vide', 'dans']).optional(),
            siValeurs: z.array(z.string()).optional(),
            alorsColonne: z.string().optional(),
            alorsOperateur: z.enum(['renseigne', 'vide', 'dans']).optional(),
            alorsValeurs: z.array(z.string()).optional(),
            /** expression : formule booléenne avec [colonnes] ; sql : condition SQL libre. */
            formule: z.string().optional(),
            condition: z.string().optional(),
            /** groupe : clé de regroupement, agrégat (sur une colonne), comparaison au seuil. */
            colonnesGroupe: z.array(z.string()).optional(),
            agregat: z.enum(['count', 'countd', 'sum', 'avg', 'min', 'max']).optional(),
            colonneAgregee: z.string().optional(),
            operateur: z.enum(OPERATEURS_GROUPE).optional(),
            seuil: z.number().optional(),
            /** règles de série : la série déclarée et les seuils propres à chaque contrôle. */
            serieId: z.string().optional(),
            longueurMinimale: z.number().optional(),
            sautAbsolu: z.number().optional(),
            sautPourcent: z.number().optional(),
            sens: z.enum(['croissant', 'decroissant']).optional(),
            ageMaximalHeures: z.number().optional(),
            reference: z.enum(['fichier', 'maintenant']).optional(),
            sensibilite: z.number().optional(),
            creneau: z.enum(['heure', 'jourSemaine', 'mois']).optional(),
            couvertureMinimale: z.number().optional()
        })
        .default({}),
    criticite: z.enum(['bloquante', 'majeure', 'mineure']).default('majeure'),
    active: z.boolean().default(true)
});
export type DefinitionRegle = z.infer<typeof schemaRegle>;

export type ResultatRegle = { total: number; echecs: number; taux: number; executeLe: string; exemples: string[] };

export class ErreurRegle extends Error {}

/** Ce que l'évaluation d'une règle demande à son environnement : la table d'une source, les codes d'une liste de valeurs. */
export type ContexteRegle = {
    nomTableDe: (sourceId: string) => string;
    /** SQL renvoyant les codes autorisés (une colonne « c »), ou null si la liste est inconnue. */
    sqlListeValeurs?: (listeId: string) => string | null;
    /** Configuration d'une série temporelle déclarée (règles de série), ou null si elle est inconnue. */
    configurationSerie?: (serieId: string) => ConfigurationSerie | null;
};

const cleNormalisee = (expression: string) => `NULLIF(UPPER(TRIM(CAST(${expression} AS VARCHAR))), '')`;
const texteDe = (colonne: string) => `CAST(${identifiantSql(colonne)} AS VARCHAR)`;
const nonVideDe = (colonne: string) => `(${texteDe(colonne)} IS NOT NULL AND TRIM(${texteDe(colonne)}) <> '')`;
const nombreDe = (expression: string) => `TRY_CAST(REPLACE(REPLACE(TRIM(${expression}), ' ', ''), ',', '.') AS DOUBLE)`;
const dateDe = (expression: string) =>
    'COALESCE(' +
    ['%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y', '%d.%m.%Y', '%Y/%m/%d', '%d/%m/%Y %H:%M:%S', '%Y-%m-%d %H:%M:%S']
        .map(motif => `TRY_CAST(TRY_STRPTIME(TRIM(${expression}), '${motif}') AS DATE)`)
        .join(', ') +
    ')';

/** Une condition SQL libre : une seule expression booléenne, en lecture seule. */
export function verifierConditionSql(texte: string | undefined): string {
    const condition = String(texte || '').trim();
    if (!condition) throw new ErreurRegle('Condition SQL vide.');
    if (condition.includes(';')) throw new ErreurRegle("Le caractère « ; » n'est pas autorisé : écrivez une seule condition.");
    if (/\b(insert|update|delete|drop|alter|create|attach|copy|pragma|call|export|install|load)\b/i.test(condition))
        throw new ErreurRegle('Seule une condition de lecture est autorisée (pas de INSERT, UPDATE, DELETE, DROP…).');
    let profondeur = 0;
    for (const caractere of condition) {
        if (caractere === '(') profondeur++;
        if (caractere === ')') profondeur--;
        if (profondeur < 0) throw new ErreurRegle('Parenthèses déséquilibrées.');
    }
    if (profondeur !== 0) throw new ErreurRegle('Parenthèses déséquilibrées.');
    return condition;
}

/** Comparaison typée : date si les deux côtés sont des dates, nombre s'ils sont des nombres, sinon texte. */
function comparaisonTypee(gauche: string, operateur: string, droite: string): string {
    const texte = (expression: string) => `NULLIF(TRIM(CAST(${expression} AS VARCHAR)), '')`;
    return (
        `(CASE WHEN ${dateDe(gauche)} IS NOT NULL AND ${dateDe(droite)} IS NOT NULL THEN (${dateDe(gauche)} ${operateur} ${dateDe(droite)})` +
        ` WHEN ${nombreDe(gauche)} IS NOT NULL AND ${nombreDe(droite)} IS NOT NULL THEN (${nombreDe(gauche)} ${operateur} ${nombreDe(droite)})` +
        ` ELSE (${texte(gauche)} ${operateur} ${texte(droite)}) END)`
    );
}

/** Découpe une expression en atomes séparés par AND / OR au premier niveau (hors parenthèses et chaînes). */
function decouperLogique(expression: string): { atome?: string; operateur?: string }[] {
    const resultat: { atome?: string; operateur?: string }[] = [];
    let profondeur = 0;
    let guillemet: string | null = null;
    let courant = '';
    for (let position = 0; position < expression.length;) {
        const caractere = expression[position];
        if (guillemet) {
            courant += caractere;
            if (caractere === guillemet) guillemet = null;
            position++;
            continue;
        }
        if (caractere === "'" || caractere === '"') guillemet = caractere;
        if (caractere === '(') profondeur++;
        if (caractere === ')') profondeur--;
        const logique = profondeur === 0 ? /^\s+(AND|OR)\s+/i.exec(expression.slice(position)) : null;
        if (logique) {
            resultat.push({ atome: courant }, { operateur: logique[1].toUpperCase() });
            courant = '';
            position += logique[0].length;
            continue;
        }
        courant += caractere;
        position++;
    }
    resultat.push({ atome: courant });
    return resultat;
}

/** Position de l'opérateur de comparaison de plus haut niveau d'un atome, s'il y en a un. */
function trouverComparaison(atome: string): { position: number; operateur: string; longueur: number } | null {
    let profondeur = 0;
    let guillemet: string | null = null;
    for (let position = 0; position < atome.length; position++) {
        const caractere = atome[position];
        if (guillemet) {
            if (caractere === guillemet) guillemet = null;
            continue;
        }
        if (caractere === "'" || caractere === '"') guillemet = caractere;
        else if (caractere === '(') profondeur++;
        else if (caractere === ')') profondeur--;
        else if (profondeur === 0) {
            const deux = atome.substr(position, 2);
            if (['>=', '<=', '<>', '!='].includes(deux)) return { position, operateur: deux === '!=' ? '<>' : deux, longueur: 2 };
            if (['>', '<', '='].includes(caractere)) return { position, operateur: caractere, longueur: 1 };
        }
    }
    return null;
}

/**
 * Compile une expression de cohérence : les [colonnes] deviennent des identifiants, chaque comparaison est
 * typée (date, nombre, texte), les AND / OR sont conservés. Un atome sans comparaison (IS NULL, LIKE…) passe tel quel.
 */
export function expressionCoherence(formule: string, colonnesConnues?: string[]): string {
    const resoudre = (reference: string) => (colonnesConnues && !colonnesConnues.includes(reference) ? null : identifiantSql(reference));
    const compilerAtome = (atome: string): string => {
        const texte = atome.trim();
        if (!texte) return 'TRUE';
        if (texte.startsWith('(') && texte.endsWith(')')) {
            let profondeur = 0;
            let englobe = true;
            for (let position = 0; position < texte.length; position++) {
                if (texte[position] === '(') profondeur++;
                else if (texte[position] === ')') {
                    profondeur--;
                    if (profondeur === 0 && position < texte.length - 1) englobe = false;
                }
            }
            if (englobe) return `(${expressionCoherence(texte.slice(1, -1), colonnesConnues)})`;
        }
        const comparaison = trouverComparaison(texte);
        if (!comparaison) return formuleEnSql(texte, resoudre);
        const gauche = formuleEnSql(texte.slice(0, comparaison.position).trim(), resoudre);
        const droite = formuleEnSql(texte.slice(comparaison.position + comparaison.longueur).trim(), resoudre);
        return comparaisonTypee(gauche, comparaison.operateur, droite);
    };
    return decouperLogique(formule)
        .map(partie => (partie.operateur ? ` ${partie.operateur} ` : compilerAtome(partie.atome || '')))
        .join('');
}

/** Un membre d'une règle « condition » : la colonne est renseignée, vide, ou dans une liste. */
function membreCondition(colonne: string, operateur: string | undefined, valeurs: string[] | undefined): string {
    if (operateur === 'vide') return `NOT ${nonVideDe(colonne)}`;
    if (operateur === 'dans') {
        const liste = (valeurs || []).map(valeur => valeur.trim()).filter(Boolean);
        if (!liste.length) throw new ErreurRegle('Règle « condition » : indiquez les valeurs attendues.');
        return `${cleNormalisee(texteDe(colonne))} IN (${liste.map(valeur => litteralSql(valeur.toUpperCase())).join(', ')})`;
    }
    return nonVideDe(colonne);
}

/** Requête d'une règle d'agrégat : une ligne par groupe avec la valeur calculée (colonne « valeur_agregat »). */
export function sqlGroupes(regle: DefinitionRegle, table: string): { groupes: string; cle: string; conforme: string } {
    const parametres = regle.parametres;
    const cles = (parametres.colonnesGroupe || []).map(colonne => colonne.trim()).filter(Boolean);
    if (!cles.length) throw new ErreurRegle('Règle « agrégat par groupe » : choisissez au moins une colonne de regroupement.');
    const agregat = parametres.agregat || 'count';
    const colonne = parametres.colonneAgregee ? identifiantSql(parametres.colonneAgregee) : null;
    if (agregat !== 'count' && !colonne) throw new ErreurRegle('Règle « agrégat par groupe » : choisissez la colonne à agréger.');
    if (parametres.seuil === undefined) throw new ErreurRegle('Règle « agrégat par groupe » : indiquez le seuil.');
    const nombre = colonne ? nombreDe(`CAST(${colonne} AS VARCHAR)`) : null;
    const expressions: Record<string, string> = {
        count: 'COUNT(*)',
        countd: `COUNT(DISTINCT ${colonne})`,
        sum: `COALESCE(SUM(${nombre}), 0)`,
        avg: `AVG(${nombre})`,
        min: `MIN(${nombre})`,
        max: `MAX(${nombre})`
    };
    const cle = cles.map(identifiantSql).join(', ');
    const condition = parametres.condition ? ` WHERE ${verifierConditionSql(parametres.condition)}` : '';
    return {
        groupes: `SELECT ${cle}, ${expressions[agregat]} AS valeur_agregat FROM ${table}${condition} GROUP BY ${cle}`,
        cle,
        conforme: `(valeur_agregat IS NOT NULL AND valeur_agregat ${parametres.operateur || '<='} ${parametres.seuil})`
    };
}

type Conformite = { conforme: string; perimetre: string };

/** Règles sur la valeur seule (sans autre table ni gouvernance) : format, listes en dur, bornes, dates. */
function conformiteDeLaValeur(regle: DefinitionRegle, valeur: string, nonVide: string): Conformite | null {
    const parametres = regle.parametres;
    switch (regle.type) {
        case 'nonVide':
            return { perimetre: 'TRUE', conforme: nonVide };
        case 'format':
            if (!parametres.expression) throw new ErreurRegle('Règle « format » : expression régulière requise.');
            return { perimetre: nonVide, conforme: `regexp_matches(${valeur}, ${litteralSql(parametres.expression)})` };
        case 'dansListe': {
            const valeurs = (parametres.valeurs || []).map(valeurAttendue => valeurAttendue.trim()).filter(Boolean);
            if (!valeurs.length) throw new ErreurRegle('Règle « dans une liste » : au moins une valeur requise.');
            return {
                perimetre: nonVide,
                conforme: `${cleNormalisee(valeur)} IN (${valeurs.map(valeurAttendue => litteralSql(valeurAttendue.toUpperCase())).join(', ')})`
            };
        }
        case 'plage': {
            const nombre = nombreDe(valeur);
            const bornes: string[] = [`${nombre} IS NOT NULL`];
            if (parametres.minimum !== undefined) bornes.push(`${nombre} >= ${parametres.minimum}`);
            if (parametres.maximum !== undefined) bornes.push(`${nombre} <= ${parametres.maximum}`);
            return { perimetre: nonVide, conforme: '(' + bornes.join(' AND ') + ')' };
        }
        case 'longueur': {
            const bornes: string[] = [];
            if (parametres.minimum !== undefined) bornes.push(`length(TRIM(${valeur})) >= ${Math.round(parametres.minimum)}`);
            if (parametres.maximum !== undefined) bornes.push(`length(TRIM(${valeur})) <= ${Math.round(parametres.maximum)}`);
            if (!bornes.length) throw new ErreurRegle('Règle « longueur » : au moins une borne requise.');
            return { perimetre: nonVide, conforme: '(' + bornes.join(' AND ') + ')' };
        }
        case 'dateValide':
            return { perimetre: nonVide, conforme: `${dateDe(valeur)} IS NOT NULL` };
        case 'fraicheur': {
            const jours = Math.max(1, Math.round(parametres.jours || 365));
            return {
                perimetre: nonVide,
                conforme: `(${dateDe(valeur)} IS NOT NULL AND ${dateDe(valeur)} >= CURRENT_DATE - INTERVAL ${jours} DAY)`
            };
        }
        default:
            return null;
    }
}

/** Règles qui regardent ailleurs : une liste de valeurs de la gouvernance, une autre table, d'autres colonnes, du SQL. */
function conformiteCroisee(regle: DefinitionRegle, contexte: ContexteRegle, valeur: string, nonVide: string): Conformite {
    const parametres = regle.parametres;
    switch (regle.type) {
        case 'listeValeurs': {
            const codes = parametres.listeId && contexte.sqlListeValeurs ? contexte.sqlListeValeurs(parametres.listeId) : null;
            if (!codes) throw new ErreurRegle('Règle « liste de valeurs » : liste inconnue ou vide.');
            return { perimetre: nonVide, conforme: `${cleNormalisee(valeur)} IN (${codes})` };
        }
        case 'reference': {
            if (!parametres.sourceCibleId || !parametres.colonneCible)
                throw new ErreurRegle('Règle « référence » : source et colonne cibles requises.');
            const cible = identifiantSql(contexte.nomTableDe(parametres.sourceCibleId));
            return {
                perimetre: nonVide,
                conforme: `${cleNormalisee(valeur)} IN (SELECT ${cleNormalisee(texteDe(parametres.colonneCible))} FROM ${cible})`
            };
        }
        case 'condition': {
            if (!parametres.alorsColonne) throw new ErreurRegle('Règle « condition » : choisissez la colonne « alors ».');
            const conditionSi = membreCondition(regle.colonne, parametres.siOperateur || 'renseigne', parametres.siValeurs);
            const conditionAlors = membreCondition(
                parametres.alorsColonne,
                parametres.alorsOperateur || 'renseigne',
                parametres.alorsValeurs
            );
            return { perimetre: conditionSi, conforme: conditionAlors };
        }
        case 'expression': {
            if (!String(parametres.formule || '').trim()) throw new ErreurRegle('Règle « cohérence » : formule requise.');
            return { perimetre: 'TRUE', conforme: `COALESCE((${expressionCoherence(parametres.formule!)}), TRUE)` };
        }
        case 'sql':
            return { perimetre: 'TRUE', conforme: `COALESCE((${verifierConditionSql(parametres.condition)}), TRUE)` };
        default:
            throw new ErreurRegle(`Type de règle inconnu : ${regle.type}.`);
    }
}

/** Condition « conforme » et périmètre d'une règle par ligne (toutes sauf « unique » et « groupe »). */
function conditionConforme(regle: DefinitionRegle, contexte: ContexteRegle): Conformite {
    const colonne = regle.colonne;
    if (!colonne && !TYPES_SANS_COLONNE.includes(regle.type)) throw new ErreurRegle(`Règle « ${regle.nom} » : colonne requise.`);
    const valeur = colonne ? texteDe(colonne) : 'NULL';
    const nonVide = colonne ? nonVideDe(colonne) : 'TRUE';
    return conformiteDeLaValeur(regle, valeur, nonVide) || conformiteCroisee(regle, contexte, valeur, nonVide);
}

/**
 * Requêtes d'évaluation : « total » (unités contrôlées), « echecs » (unités non conformes), « exemples » (quelques
 * valeurs en échec) et « lignes » (les lignes en échec, pour l'inspecteur d'anomalies). Les valeurs vides ne sont
 * contrôlées que par la règle « non vide » : une règle de format sur une valeur absente n'est ni un succès ni un échec.
 */
export function sqlEvaluation(
    regle: DefinitionRegle,
    contexte: ContexteRegle | ((sourceId: string) => string)
): { total: string; echecs: string; exemples: string; lignes: string } {
    const environnement: ContexteRegle = typeof contexte === 'function' ? { nomTableDe: contexte } : contexte;
    const table = identifiantSql(environnement.nomTableDe(regle.sourceId));
    if (estTypeSerie(regle.type)) {
        const serie =
            regle.parametres.serieId && environnement.configurationSerie
                ? environnement.configurationSerie(regle.parametres.serieId)
                : null;
        if (!serie) throw new ErreurRegle('Règle de série : choisissez une série temporelle déclarée.');
        try {
            return sqlEvaluationSerie(regle.type, regle.parametres, serie, environnement.nomTableDe(regle.sourceId));
        } catch (erreur) {
            if (erreur instanceof ErreurRegleSerie) throw new ErreurRegle(erreur.message);
            throw erreur;
        }
    }
    if (regle.type === 'groupe') {
        const groupes = sqlGroupes(regle, table);
        const base = `SELECT *, ${groupes.conforme} AS conforme FROM (${groupes.groupes}) AS agregats`;
        return {
            total: `SELECT COUNT(*)::BIGINT FROM (${base}) AS evaluation`,
            echecs: `SELECT COUNT(*)::BIGINT FROM (${base}) AS evaluation WHERE NOT COALESCE(conforme, FALSE)`,
            exemples: `SELECT CAST(valeur_agregat AS VARCHAR) FROM (${base}) AS evaluation WHERE NOT COALESCE(conforme, FALSE) LIMIT 5`,
            lignes: `SELECT * EXCLUDE (conforme) FROM (${base}) AS evaluation WHERE NOT COALESCE(conforme, FALSE)`
        };
    }
    // Sans colonne contrôlée (cohérence, SQL), l'exemple montré est le numéro de la ligne en échec.
    const valeur = regle.colonne ? texteDe(regle.colonne) : `'ligne ' || CAST("__rn" AS VARCHAR)`;
    let perimetre: string;
    let conforme: string;
    if (regle.type === 'unique') {
        const cle = [regle.colonne, ...(regle.parametres.colonnes || [])].map(colonne => colonne.trim()).filter(Boolean);
        if (!cle.length) throw new ErreurRegle('Règle « unique » : au moins une colonne.');
        perimetre = cle.map(nonVideDe).join(' AND ');
        conforme = `COUNT(*) OVER (PARTITION BY ${cle.map(colonne => cleNormalisee(texteDe(colonne))).join(', ')}) = 1`;
    } else ({ perimetre, conforme } = conditionConforme(regle, environnement));
    // Les fonctions de fenêtre (unique) ne s'écrivent pas dans un WHERE : on passe par une sous-requête.
    const base = `SELECT * EXCLUDE (__rn), ${valeur} AS valeur_controlee, ${perimetre} AS dans_perimetre, ${conforme} AS conforme FROM ${table}`;
    return {
        total: `SELECT COUNT(*)::BIGINT FROM (${base}) AS evaluation WHERE dans_perimetre`,
        echecs: `SELECT COUNT(*)::BIGINT FROM (${base}) AS evaluation WHERE dans_perimetre AND NOT COALESCE(conforme, FALSE)`,
        exemples: `SELECT DISTINCT valeur_controlee FROM (${base}) AS evaluation WHERE dans_perimetre AND NOT COALESCE(conforme, FALSE) LIMIT 5`,
        lignes: `SELECT * EXCLUDE (valeur_controlee, dans_perimetre, conforme) FROM (${base}) AS evaluation WHERE dans_perimetre AND NOT COALESCE(conforme, FALSE)`
    };
}

/** Score 0–100 : moyenne des taux de conformité pondérée par la criticité ; null si aucune règle évaluée. */
export function scoreQualite(resultats: { criticite: string; taux: number }[]): number | null {
    let poidsTotal = 0;
    let somme = 0;
    for (const resultat of resultats) {
        const poids = CRITICITES[resultat.criticite as Criticite] || 2;
        poidsTotal += poids;
        somme += poids * resultat.taux;
    }
    return poidsTotal ? Math.round((100 * somme) / poidsTotal) : null;
}
