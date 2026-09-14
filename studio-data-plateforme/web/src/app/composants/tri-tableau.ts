/**
 * Tri d'un tableau de résultats par une colonne, et affichage des valeurs — repris de la V11 de
 * l'application classique : « tri par colonne d'un clic, valeurs vides affichées "—" ».
 *
 * Le tri se fait dans le navigateur, sur les lignes déjà reçues : c'est instantané et cela ne redemande
 * rien au serveur. Un clic trie du plus petit au plus grand, un deuxième renverse, un troisième rend
 * l'ordre d'origine — on peut toujours revenir à ce que le serveur a renvoyé.
 *
 * Comparer du texte n'est pas comparer des nombres : « 100 » vient après « 20 » quand ce sont des nombres,
 * avant quand ce sont des mots. On regarde donc la valeur avant de choisir. Les dates ISO (2026-09-14) se
 * trient déjà correctement comme du texte. Les valeurs vides sont toujours reléguées à la fin.
 *
 * Fonctions pures : elles ne touchent ni au DOM ni au réseau.
 */

/** Sens de tri : du plus petit au plus grand, ou l'inverse. */
export type SensTri = 'asc' | 'desc';

/** La colonne triée et son sens ; `null` = l'ordre d'origine, celui du serveur. */
export type TriColonne = { colonne: number; sens: SensTri } | null;

/** Ce qu'on affiche à la place d'une valeur absente : un tiret cadratin, plus lisible qu'une case vide. */
export const VALEUR_VIDE = '—';

/** Le texte d'une cellule : une valeur absente ou vide devient « — ». */
export function valeurAffichee(valeur: unknown): string {
    if (valeur === null || valeur === undefined) return VALEUR_VIDE;
    const texte = String(valeur);
    return texte.trim() === '' ? VALEUR_VIDE : texte;
}

/** Vrai quand la valeur ne dit rien : elle passera en fin de tri, quel que soit le sens. */
export function estVide(valeur: unknown): boolean {
    return valeur === null || valeur === undefined || String(valeur).trim() === '';
}

/** Le nombre que porte la valeur, ou null si ce n'en est pas un (« 1 234,50 » et « 1234.5 » comptent). */
export function nombreDe(valeur: unknown): number | null {
    if (typeof valeur === 'number') return Number.isFinite(valeur) ? valeur : null;
    const texte = String(valeur ?? '')
        .trim()
        .replace(/\s/g, '')
        .replace(',', '.');
    if (!texte || !/^[-+]?\d*\.?\d+$/.test(texte)) return null;
    const nombre = Number(texte);
    return Number.isFinite(nombre) ? nombre : null;
}

/**
 * Compare deux valeurs : les vides en dernier, les nombres entre eux comme des nombres, le reste comme du
 * texte français (« é » à sa place alphabétique, majuscules et minuscules mêlées).
 */
export function comparerValeurs(premiere: unknown, seconde: unknown): number {
    if (estVide(premiere) || estVide(seconde)) return Number(estVide(premiere)) - Number(estVide(seconde));
    const gauche = nombreDe(premiere);
    const droite = nombreDe(seconde);
    if (gauche !== null && droite !== null) return gauche - droite;
    return String(premiere).localeCompare(String(seconde), 'fr', { sensitivity: 'base', numeric: true });
}

/**
 * Les lignes triées selon `tri`. Sans tri, les lignes d'origine sont rendues telles quelles (même tableau) :
 * l'ordre du serveur est la vérité par défaut. Le tri ne modifie jamais le tableau reçu.
 */
export function lignesTriees<Ligne extends unknown[]>(lignes: Ligne[], tri: TriColonne): Ligne[] {
    if (!tri) return lignes;
    const sens = tri.sens === 'desc' ? -1 : 1;
    return [...lignes].sort((premiere, seconde) => {
        const gauche = premiere[tri.colonne];
        const droite = seconde[tri.colonne];
        // Les vides restent en fin de liste dans les deux sens : ils n'ont pas de place dans l'ordre.
        if (estVide(gauche) || estVide(droite)) return Number(estVide(gauche)) - Number(estVide(droite));
        return sens * comparerValeurs(gauche, droite);
    });
}

/** L'état suivant quand on clique une en-tête : croissant, puis décroissant, puis retour à l'ordre d'origine. */
export function triSuivant(courant: TriColonne, colonne: number): TriColonne {
    if (!courant || courant.colonne !== colonne) return { colonne, sens: 'asc' };
    return courant.sens === 'asc' ? { colonne, sens: 'desc' } : null;
}

/** La flèche montrée dans l'en-tête d'une colonne : rien quand elle n'est pas celle qui trie. */
export function flecheTri(tri: TriColonne, colonne: number): string {
    if (!tri || tri.colonne !== colonne) return '';
    return tri.sens === 'asc' ? ' ▲' : ' ▼';
}
