/**
 * Téléchargements côté navigateur : un fichier CSV (séparateur point-virgule, valeurs entre guillemets, BOM pour
 * Excel français) ou un fichier JSON, sans passer par le serveur. Partagé par les écrans qui exportent un tableau.
 */

function telechargerBlob(nomFichier: string, blob: Blob): void {
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(blob);
    lien.download = nomFichier;
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
