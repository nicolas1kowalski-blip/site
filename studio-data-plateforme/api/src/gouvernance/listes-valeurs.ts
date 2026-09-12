/**
 * Listes de valeurs (référentiels de codes) : ce qu'un attribut a le droit de contenir. Deux formes :
 *   • en clair : codes saisis (code ; libellé ; statut) ;
 *   • par source : une table chargée sert de référentiel ; une colonne « nom de la liste » peut en distinguer
 *     plusieurs, une colonne « statut » peut restreindre aux codes actifs.
 * Le contrôle d'une colonne compte les valeurs qui n'appartiennent pas au référentiel (codes normalisés en
 * majuscules, sans espaces de bord, des deux côtés). Fonctions pures : le SQL est produit, pas exécuté.
 */
import { z } from 'zod';
import { identifiantSql, litteralSql } from '../espaces/moteur-duckdb';

export const schemaListeValeurs = z
    .object({
        name: z.string().trim().min(1, 'nom requis'),
        description: z.string().default(''),
        kind: z.enum(['inline', 'table']).default('inline'),
        values: z.array(z.object({ code: z.string(), label: z.string().default(''), status: z.string().default('') })).default([]),
        srcTable: z.string().default(''),
        colCode: z.string().default(''),
        colLabel: z.string().default(''),
        colStatus: z.string().default(''),
        colList: z.string().default(''),
        listValue: z.string().default(''),
        activeStatus: z.string().default('')
    })
    .passthrough();
export type ListeValeurs = z.infer<typeof schemaListeValeurs> & { id: string };

const codeNormalise = (expression: string) => `NULLIF(UPPER(TRIM(CAST(${expression} AS VARCHAR))), '')`;

/** Saisie en clair : une ligne = code ; libellé ; statut (les deux derniers facultatifs). */
export function analyserSaisie(texte: string): { code: string; label: string; status: string }[] {
    return String(texte || '')
        .split('\n')
        .map(ligne => ligne.trim())
        .filter(Boolean)
        .map(ligne => {
            const parties = ligne.split(';').map(partie => partie.trim());
            return { code: parties[0] || '', label: parties[1] || '', status: parties[2] || '' };
        })
        .filter(valeur => valeur.code);
}

/** Requête rendant les codes autorisés (colonne « c ») ; null si la liste est vide ou incomplète. */
export function sqlCodesAutorises(liste: ListeValeurs, nomTableDe: (nomSource: string) => string | null): string | null {
    if (liste.kind === 'table') {
        const nomTable = liste.srcTable ? nomTableDe(liste.srcTable) : null;
        if (!nomTable || !liste.colCode) return null;
        const conditions = [`${codeNormalise(identifiantSql(liste.colCode))} IS NOT NULL`];
        if (liste.colList && liste.listValue)
            conditions.push(`${codeNormalise(identifiantSql(liste.colList))} = ${litteralSql(liste.listValue.trim().toUpperCase())}`);
        if (liste.colStatus && liste.activeStatus)
            conditions.push(`${codeNormalise(identifiantSql(liste.colStatus))} = ${litteralSql(liste.activeStatus.trim().toUpperCase())}`);
        return `SELECT ${codeNormalise(identifiantSql(liste.colCode))} AS c FROM ${identifiantSql(nomTable)} WHERE ${conditions.join(' AND ')}`;
    }
    const valeurs = liste.values.filter(
        valeur => !liste.activeStatus || !valeur.status || valeur.status.trim().toUpperCase() === liste.activeStatus.trim().toUpperCase()
    );
    if (!valeurs.length) return null;
    return `SELECT * FROM (VALUES ${valeurs.map(valeur => `(${litteralSql(valeur.code.trim().toUpperCase())})`).join(', ')}) AS t(c)`;
}

/** Contrôle d'une colonne : total non vide, nombre hors liste, exemples de valeurs hors liste. */
export function sqlControleColonne(
    nomTable: string,
    colonne: string,
    codes: string
): { total: string; horsListe: string; exemples: string } {
    const valeur = codeNormalise(identifiantSql(colonne));
    const table = identifiantSql(nomTable);
    return {
        total: `SELECT COUNT(*)::BIGINT FROM ${table} WHERE ${valeur} IS NOT NULL`,
        horsListe: `SELECT COUNT(*)::BIGINT FROM ${table} WHERE ${valeur} IS NOT NULL AND ${valeur} NOT IN (${codes})`,
        exemples: `SELECT ${valeur} AS v, COUNT(*)::BIGINT AS n FROM ${table} WHERE ${valeur} IS NOT NULL AND ${valeur} NOT IN (${codes}) GROUP BY 1 ORDER BY n DESC LIMIT 20`
    };
}
