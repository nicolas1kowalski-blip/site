/**
 * La pastille d'une personne : ses initiales et sa couleur — reprises de la V13.
 *
 * Partout où une personne apparaît (catalogue, écran des personnes, propriétaire d'une fiche), le classique
 * montre une petite pastille ronde portant ses initiales. La couleur est tirée du nom lui-même : la même
 * personne garde donc la même pastille d'un écran à l'autre et d'une session à l'autre, sans qu'on ait à
 * lui en attribuer une ni à la ranger quelque part.
 *
 * Fonctions pures.
 */

/** Les initiales d'une personne : deux lettres au plus, comme sur les pastilles du classique. */
export function initialesDe(nom: string): string {
    return (nom || '')
        .split(/\s+/)
        .map(mot => mot[0] || '')
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

/** Les sept couleurs de pastille du classique, dans leur ordre. */
const COULEURS_DE_RESPONSABLE = ['#2563eb', '#059669', '#8b5cf6', '#f59e0b', '#0ea5e9', '#dc2626', '#0f172a'];

/**
 * La couleur de la pastille d'une personne, tirée de son nom. Le calcul est celui du classique : chaque
 * caractère fait avancer un total, dont on garde le reste — une même personne retombe donc toujours sur la
 * même couleur.
 */
export function couleurDeResponsable(nom: string): string {
    let total = 0;
    for (const caractere of String(nom)) total = (total * 31 + caractere.charCodeAt(0)) >>> 0;
    return COULEURS_DE_RESPONSABLE[total % COULEURS_DE_RESPONSABLE.length];
}
