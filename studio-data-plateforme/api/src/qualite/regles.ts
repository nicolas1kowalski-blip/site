/**
 * Règles de qualité : chaque type de règle se traduit en une condition SQL « la valeur est conforme ».
 * L'évaluation compte les lignes contrôlées et les lignes en échec ; le score d'une source est la moyenne des
 * taux de conformité pondérée par la criticité.
 */
import { z } from 'zod';
import { identifiantSql, litteralSql } from '../espaces/moteur-duckdb';

export const TYPES_REGLE = {
    nonVide: 'non vide',
    unique: 'unique (pas de doublon)',
    format: 'respecte un format (expression régulière)',
    dansListe: 'dans une liste de valeurs',
    plage: 'nombre compris entre deux bornes',
    longueur: 'longueur comprise entre deux bornes',
    dateValide: 'date valide (AAAA-MM-JJ)',
    reference: 'existe dans une autre source (clé étrangère)'
} as const;
export type TypeRegle = keyof typeof TYPES_REGLE;

export const CRITICITES = { bloquante: 3, majeure: 2, mineure: 1 } as const;
export type Criticite = keyof typeof CRITICITES;

export const schemaRegle = z.object({
    nom: z.string().trim().min(1, 'nom requis').max(200),
    sourceId: z.string().min(1, 'source requise'),
    colonne: z.string().min(1, 'colonne requise'),
    type: z.enum(['nonVide', 'unique', 'format', 'dansListe', 'plage', 'longueur', 'dateValide', 'reference']),
    parametres: z
        .object({
            expression: z.string().optional(),
            valeurs: z.array(z.string()).optional(),
            minimum: z.number().optional(),
            maximum: z.number().optional(),
            sourceCibleId: z.string().optional(),
            colonneCible: z.string().optional()
        })
        .default({}),
    criticite: z.enum(['bloquante', 'majeure', 'mineure']).default('majeure'),
    active: z.boolean().default(true)
});
export type DefinitionRegle = z.infer<typeof schemaRegle>;

export type ResultatRegle = { total: number; echecs: number; taux: number; executeLe: string; exemples: string[] };

export class ErreurRegle extends Error {}

const cleNormalisee = (expression: string) => `NULLIF(UPPER(TRIM(CAST(${expression} AS VARCHAR))), '')`;

/**
 * Requêtes d'évaluation : « total » (lignes contrôlées) et « echecs » (lignes non conformes), plus quelques
 * exemples de valeurs en échec. Les valeurs vides ne sont contrôlées que par la règle « non vide » : une règle
 * de format sur une valeur absente n'est ni un succès ni un échec.
 */
export function sqlEvaluation(
    regle: DefinitionRegle,
    nomTableDe: (sourceId: string) => string
): { total: string; echecs: string; exemples: string } {
    const table = identifiantSql(nomTableDe(regle.sourceId));
    const valeur = `CAST(${identifiantSql(regle.colonne)} AS VARCHAR)`;
    const nonVide = `(${valeur} IS NOT NULL AND TRIM(${valeur}) <> '')`;
    const parametres = regle.parametres;
    let conforme: string;
    let perimetre = nonVide;
    switch (regle.type) {
        case 'nonVide':
            perimetre = 'TRUE';
            conforme = nonVide;
            break;
        case 'unique':
            conforme = `COUNT(*) OVER (PARTITION BY ${cleNormalisee(valeur)}) = 1`;
            break;
        case 'format':
            if (!parametres.expression) throw new ErreurRegle('Règle « format » : expression régulière requise.');
            conforme = `regexp_matches(${valeur}, ${litteralSql(parametres.expression)})`;
            break;
        case 'dansListe': {
            const valeurs = (parametres.valeurs || []).map(valeurAttendue => valeurAttendue.trim()).filter(Boolean);
            if (!valeurs.length) throw new ErreurRegle('Règle « dans une liste » : au moins une valeur requise.');
            conforme = `${cleNormalisee(valeur)} IN (${valeurs.map(valeurAttendue => litteralSql(valeurAttendue.toUpperCase())).join(', ')})`;
            break;
        }
        case 'plage': {
            const nombre = `TRY_CAST(REPLACE(${valeur}, ',', '.') AS DOUBLE)`;
            const bornes: string[] = [`${nombre} IS NOT NULL`];
            if (parametres.minimum !== undefined) bornes.push(`${nombre} >= ${parametres.minimum}`);
            if (parametres.maximum !== undefined) bornes.push(`${nombre} <= ${parametres.maximum}`);
            conforme = '(' + bornes.join(' AND ') + ')';
            break;
        }
        case 'longueur': {
            const bornes: string[] = [];
            if (parametres.minimum !== undefined) bornes.push(`length(TRIM(${valeur})) >= ${Math.round(parametres.minimum)}`);
            if (parametres.maximum !== undefined) bornes.push(`length(TRIM(${valeur})) <= ${Math.round(parametres.maximum)}`);
            if (!bornes.length) throw new ErreurRegle('Règle « longueur » : au moins une borne requise.');
            conforme = '(' + bornes.join(' AND ') + ')';
            break;
        }
        case 'dateValide':
            conforme = `TRY_CAST(${valeur} AS DATE) IS NOT NULL`;
            break;
        case 'reference': {
            if (!parametres.sourceCibleId || !parametres.colonneCible)
                throw new ErreurRegle('Règle « référence » : source et colonne cibles requises.');
            const cible = identifiantSql(nomTableDe(parametres.sourceCibleId));
            conforme = `${cleNormalisee(valeur)} IN (SELECT ${cleNormalisee(`CAST(${identifiantSql(parametres.colonneCible)} AS VARCHAR)`)} FROM ${cible})`;
            break;
        }
    }
    // Les fonctions de fenêtre (unique) ne s'écrivent pas dans un WHERE : on passe par une sous-requête.
    const base = `SELECT ${valeur} AS valeur, ${perimetre} AS dans_perimetre, ${conforme} AS conforme FROM ${table}`;
    return {
        total: `SELECT COUNT(*)::BIGINT FROM (${base}) AS evaluation WHERE dans_perimetre`,
        echecs: `SELECT COUNT(*)::BIGINT FROM (${base}) AS evaluation WHERE dans_perimetre AND NOT COALESCE(conforme, FALSE)`,
        exemples: `SELECT DISTINCT valeur FROM (${base}) AS evaluation WHERE dans_perimetre AND NOT COALESCE(conforme, FALSE) LIMIT 5`
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
