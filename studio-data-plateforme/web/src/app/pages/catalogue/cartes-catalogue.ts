/**
 * Ce que la carte d'un résultat du catalogue montre — repris de la V13.
 *
 * Le catalogue est l'écran où l'on arrive quand on ne sait pas encore ce que l'on cherche. Chaque résultat
 * doit donc se lire d'un coup d'œil : une pastille colorée qui dit de quoi il s'agit, le domaine, le nom,
 * puis les signaux de confiance — la qualité mesurée, la confidentialité, l'état de validation, le
 * responsable, la date du dernier rafraîchissement, les étiquettes.
 *
 * La couleur du responsable est tirée de son nom : la même personne garde la même pastille d'un écran à
 * l'autre, sans qu'on ait à lui en attribuer une.
 *
 * Fonctions pures : elles ne connaissent que ce qu'on leur donne.
 */
import type { EntreeCatalogue, TypeCatalogue } from '../../coeur/modeles';

/** L'allure d'un type de résultat : la couleur de sa pastille, son pictogramme, et son nom en clair. */
export type AllureDeType = { couleur: string; pictogramme: string; libelle: string };

/** Les treize types du catalogue, avec les couleurs et pictogrammes du classique. */
export const ALLURES_DE_TYPE: Record<TypeCatalogue, AllureDeType> = {
    table: { couleur: '#0ea5e9', pictogramme: '▦', libelle: 'Table' },
    view: { couleur: '#6366f1', pictogramme: '◧', libelle: 'Vue dérivée' },
    column: { couleur: '#8b5cf6', pictogramme: '◈', libelle: 'Colonne' },
    attr: { couleur: '#059669', pictogramme: '🔹', libelle: 'Attribut métier' },
    bo: { couleur: '#059669', pictogramme: '🏛', libelle: 'Objet métier' },
    report: { couleur: '#f59e0b', pictogramme: '📊', libelle: 'Tableau de bord' },
    term: { couleur: '#0f172a', pictogramme: '📖', libelle: 'Terme' },
    perimeter: { couleur: '#0f172a', pictogramme: '🧩', libelle: 'Périmètre' },
    valuelist: { couleur: '#0f172a', pictogramme: '🎚️', libelle: 'Liste de valeurs' },
    asset: { couleur: '#0f172a', pictogramme: '🖥', libelle: 'Appli / processus' },
    rule: { couleur: '#0f172a', pictogramme: '📏', libelle: 'Règle qualité' },
    series: { couleur: '#6366f1', pictogramme: '📈', libelle: 'Série temporelle' },
    linkage: { couleur: '#0f172a', pictogramme: '🤝', libelle: 'Rapprochement' }
};

/** L'allure d'un type ; celle d'une table quand le type est inconnu, plutôt que rien du tout. */
export function allureDe(type: string): AllureDeType {
    return ALLURES_DE_TYPE[type as TypeCatalogue] || ALLURES_DE_TYPE.table;
}

/** La ligne de survol d'une carte : le type, puis le domaine quand il est renseigné. */
export function surtitreDe(entree: EntreeCatalogue): string {
    const domaine = entree.domaine && entree.domaine !== '—' ? ' · ' + entree.domaine : '';
    return allureDe(entree.type).libelle + domaine;
}

/** Les initiales d'un responsable : deux lettres au plus, comme sur les pastilles du classique. */
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
 * La couleur de la pastille d'un responsable, tirée de son nom. Le calcul est celui du classique : chaque
 * caractère fait avancer un total, dont on garde le reste — une même personne retombe donc toujours sur la
 * même couleur, sur tous les écrans et d'une session à l'autre.
 */
export function couleurDeResponsable(nom: string): string {
    let total = 0;
    for (const caractere of String(nom)) total = (total * 31 + caractere.charCodeAt(0)) >>> 0;
    return COULEURS_DE_RESPONSABLE[total % COULEURS_DE_RESPONSABLE.length];
}

/** La pastille de qualité : verte au-delà de 90, orange au-delà de 70, rouge en deçà. */
export function classeDeQualite(qualite: number): string {
    if (qualite >= 90) return 'qualite-bonne';
    if (qualite >= 70) return 'qualite-moyenne';
    return 'qualite-mauvaise';
}

/** Le libellé de confidentialité affiché sur la carte, ou rien quand elle n'est pas renseignée. */
export function libelleDeConfidentialite(sensibilite: string | null): string {
    if (sensibilite === 'perso') return '🛡 Personnelle';
    if (sensibilite === 'conf') return '🔒 Confidentiel';
    if (sensibilite === 'non') return 'Non sensible';
    return '';
}

/** Le libellé de l'état de validation affiché sur la carte, ou rien quand rien n'est déclaré. */
export function libelleDeValidation(validation: string | null): string {
    if (validation === 'ok') return '✓ Validé';
    if (validation === 'pending') return '◷ À valider';
    return '';
}

/** Le nombre de cartes que le classique montre avant d'inviter à préciser la recherche. */
export const CARTES_MONTREES = 60;

/**
 * Ce que l'on affiche, et ce qui reste au-delà. Passé soixante résultats, le classique s'arrête et le dit :
 * lire deux cents cartes n'apprend rien, mieux vaut affiner.
 */
export function cartesLimitees(resultats: EntreeCatalogue[]): { visibles: EntreeCatalogue[]; restantes: number } {
    return { visibles: resultats.slice(0, CARTES_MONTREES), restantes: Math.max(0, resultats.length - CARTES_MONTREES) };
}

/** La date de dernier rafraîchissement, écrite à la française, ou rien quand on ne la connaît pas. */
export function fraicheurLisible(fraicheur: number | null, formater: (quand: number) => string): string {
    return fraicheur ? '↻ ' + formater(fraicheur) : '';
}
