/**
 * Sensibilité des données : niveaux de confidentialité par colonne et détection des données personnelles (RGPD).
 * La détection regarde d'abord le nom de la colonne, puis un échantillon de valeurs (emails, téléphones, IBAN).
 * Fonctions pures : le SQL est produit ici, exécuté par le contrôleur.
 */
import { identifiantSql } from '../espaces/moteur-duckdb';

export const NIVEAUX_SENSIBILITE = {
    public: 'Public',
    interne: 'Interne',
    confidentiel: 'Confidentiel',
    personnel: 'Données personnelles'
} as const;
export type NiveauSensibilite = keyof typeof NIVEAUX_SENSIBILITE;

export const ACTIONS_ANONYMISATION = {
    none: 'aucune (en clair)',
    mask: 'masquage (1er caractère + •••)',
    pseudo: 'pseudonymisation (jeton stable salé)',
    generalize: 'généralisation (tranches / année)',
    drop: 'suppression de la colonne'
} as const;

export const MOTIF_NOM_PERSONNEL =
    /nom|prenom|prénom|name|email|mail|tel|phone|portable|mobile|adresse|address|rue|iban|bic|naissance|birth|secu|nir|salaire|salary|cni|passeport/i;

/** Requête : sur 300 valeurs non vides, combien ressemblent à un email, un téléphone français, un IBAN. */
export function sqlIndicesPersonnels(nomTable: string, colonne: string): string {
    const brut = `TRIM(CAST(${identifiantSql(colonne)} AS VARCHAR))`;
    return (
        `SELECT COUNT(*)::BIGINT AS n, ` +
        `SUM(CASE WHEN regexp_matches(${brut}, '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$') THEN 1 ELSE 0 END)::BIGINT AS emails, ` +
        `SUM(CASE WHEN regexp_matches(${brut}, '^(\\+33|0)[1-9]([ .-]?[0-9]{2}){4}$') THEN 1 ELSE 0 END)::BIGINT AS telephones, ` +
        `SUM(CASE WHEN regexp_matches(UPPER(${brut}), '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$') THEN 1 ELSE 0 END)::BIGINT AS ibans ` +
        `FROM (SELECT ${identifiantSql(colonne)} FROM ${identifiantSql(nomTable)} WHERE ${identifiantSql(colonne)} IS NOT NULL LIMIT 300) s`
    );
}

/** Motif détecté d'après les comptages (plus de 30 % des valeurs), ou chaîne vide. */
export function motifDesIndices(total: number, emails: number, telephones: number, ibans: number): string {
    const base = total || 1;
    if (emails / base > 0.3) return 'emails détectés';
    if (telephones / base > 0.3) return 'téléphones détectés';
    if (ibans / base > 0.3) return 'IBAN détectés';
    return '';
}

/**
 * Niveau proposé pour une colonne : classification saisie > sensibilité du dictionnaire > nom de colonne > interne.
 * Même règle que l'application classique (pvSuggestLevel).
 */
export function niveauPropose(sensibiliteDictionnaire: string | undefined, colonne: string): NiveauSensibilite {
    if (sensibiliteDictionnaire === 'Personnel (RGPD)') return 'personnel';
    if (sensibiliteDictionnaire === 'Sensible') return 'confidentiel';
    if (sensibiliteDictionnaire === 'Public') return 'public';
    if (MOTIF_NOM_PERSONNEL.test(colonne) || /naiss|birthd/i.test(colonne)) return 'personnel';
    return 'interne';
}
