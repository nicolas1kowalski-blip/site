/**
 * Téléchargements côté navigateur : un fichier CSV (séparateur point-virgule, valeurs entre guillemets, BOM pour
 * Excel français) ou un fichier JSON, sans passer par le serveur. Partagé par les écrans qui exportent un tableau.
 */

/** Nom de fichier accepté par tous les navigateurs : sans accents, espaces et caractères interdits remplacés par _. */
export function nomDeFichierSur(nomFichier: string): string {
    return nomFichier
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w.-]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

export function telechargerBlob(nomFichier: string, blob: Blob): void {
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(blob);
    lien.download = nomDeFichierSur(nomFichier);
    lien.click();
    URL.revokeObjectURL(lien.href);
}

/** Texte CSV d'un tableau (en-têtes + lignes) ; les valeurs nulles deviennent des cellules vides. */
export function texteCsv(colonnes: string[], lignes: unknown[][]): string {
    const echapper = (valeur: unknown) => '"' + String(valeur === null || valeur === undefined ? '' : valeur).replace(/"/g, '""') + '"';
    return [colonnes.map(echapper).join(';'), ...lignes.map(ligne => ligne.map(echapper).join(';'))].join('\r\n');
}

export function telechargerCsv(nomFichier: string, colonnes: string[], lignes: unknown[][]): void {
    telechargerBlob(nomFichier, new Blob(['﻿' + texteCsv(colonnes, lignes)], { type: 'text/csv;charset=utf-8' }));
}

export function telechargerJson(nomFichier: string, contenu: unknown): void {
    telechargerBlob(nomFichier, new Blob([JSON.stringify(contenu, null, 2)], { type: 'application/json' }));
}

export function telechargerHtml(nomFichier: string, html: string): void {
    telechargerBlob(nomFichier, new Blob([html], { type: 'text/html;charset=utf-8' }));
}

/** Export CSV complet d'une table DuckDB (jusqu'à 200 000 lignes) via une fonction qui exécute du SQL. */
export async function exporterTableEnCsv(
    executerSql: (requete: string) => Promise<{ colonnes: { nom: string }[]; lignes: unknown[][] }>,
    sourceId: string,
    nomFichier: string
): Promise<number> {
    const resultat = await executerSql(`SELECT * EXCLUDE (__rn) FROM "t_${sourceId.replace(/"/g, '""')}" ORDER BY __rn LIMIT 200000`);
    telechargerCsv(
        nomFichier,
        resultat.colonnes.map(colonne => colonne.nom),
        resultat.lignes
    );
    return resultat.lignes.length;
}
