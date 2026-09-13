/**
 * Catalogue de données recherchable : un index unique de tout ce que l'espace décrit — tables et colonnes,
 * objets métier et attributs, termes, applications et processus, périmètres, listes de valeurs, règles de
 * qualité, tableaux de bord, séries, rapprochements — avec les signaux de confiance (qualité, sensibilité,
 * validation, propriétaire). Deux couches de lecture : « métier » par défaut (objets, termes, applications…),
 * « tout » pour voir aussi les données techniques (tables, colonnes, vues dérivées). Fonctions pures.
 */

export const TYPES_CATALOGUE = {
    bo: 'Objet métier',
    attr: 'Attribut métier',
    term: 'Terme du glossaire',
    asset: 'Application / processus',
    perimeter: 'Périmètre',
    valuelist: 'Liste de valeurs',
    rule: 'Règle de qualité',
    report: 'Tableau de bord',
    series: 'Série temporelle',
    table: 'Table',
    view: 'Vue dérivée',
    column: 'Colonne',
    linkage: 'Rapprochement'
} as const;
export type TypeCatalogue = keyof typeof TYPES_CATALOGUE;
/** Types techniques, masqués dans la couche « métier ». */
export const TYPES_TECHNIQUES: TypeCatalogue[] = ['table', 'view', 'column', 'linkage'];

export type EntreeCatalogue = {
    type: TypeCatalogue;
    id: string;
    titre: string;
    sousTitre: string;
    description: string;
    domaine: string;
    proprietaire: string;
    /** Signal de qualité 0–100 (score des règles, complétude…), null si inconnu. */
    qualite: number | null;
    /** 'perso' (données personnelles), 'conf' (confidentiel), 'non', ou null. */
    sensibilite: 'perso' | 'conf' | 'non' | null;
    /** 'ok' (validé / défini), 'pending', ou null. */
    validation: 'ok' | 'pending' | null;
    etiquettes: string[];
    motsCles: string[];
    /** Route Angular où ouvrir l'élément. */
    lien: string;
    /** Texte de recherche normalisé (rempli par l'index). */
    texte?: string;
};

export type FiltresCatalogue = {
    q?: string;
    type?: string[];
    domaine?: string[];
    sensibilite?: string[];
    proprietaire?: string[];
    couche?: 'metier' | 'tout';
};
export type Facettes = Record<'type' | 'domaine' | 'sensibilite' | 'proprietaire', { valeur: string; nombre: number }[]>;

/** Texte comparable : minuscules, sans accents, espaces réduits. */
export function normaliser(texte: unknown): string {
    return String(texte || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/** Sensibilité normalisée à partir d'un libellé du dictionnaire ou d'un niveau de classification. */
export function sensibiliteDe(libelle: unknown): EntreeCatalogue['sensibilite'] {
    const texte = normaliser(libelle);
    if (!texte) return null;
    if (/perso|rgpd/.test(texte)) return 'perso';
    if (/sensible|confid/.test(texte)) return 'conf';
    return 'non';
}

/** Validation d'après un statut libre (« Validé », « Brouillon »…). */
export function validationDe(statut: unknown): EntreeCatalogue['validation'] {
    const texte = normaliser(statut);
    if (!texte) return null;
    return /valid/.test(texte) ? 'ok' : 'pending';
}

/** Remplit le texte de recherche d'une entrée. */
export function indexer(entree: EntreeCatalogue): EntreeCatalogue {
    entree.texte = normaliser(
        [
            entree.titre,
            entree.sousTitre,
            entree.description,
            entree.domaine,
            entree.proprietaire,
            ...entree.etiquettes,
            ...entree.motsCles
        ].join(' ')
    );
    return entree;
}

/** Score de pertinence d'une entrée pour une recherche (titre exact > titre > texte) ; 0 si absente. */
export function pertinence(entree: EntreeCatalogue, recherche: string): number {
    if (!recherche) return 1;
    const titre = normaliser(entree.titre);
    if (titre === recherche) return 100;
    if (titre.startsWith(recherche)) return 60;
    if (titre.includes(recherche)) return 40;
    const mots = recherche.split(' ').filter(Boolean);
    return mots.every(mot => (entree.texte || '').includes(mot)) ? 10 : 0;
}

/** Applique les filtres et la couche, trie par pertinence puis titre, calcule les facettes sur le résultat non filtré par type. */
export function rechercher(
    index: EntreeCatalogue[],
    filtres: FiltresCatalogue
): { resultats: EntreeCatalogue[]; facettes: Facettes; techniquesMasquees: number } {
    const recherche = normaliser(filtres.q);
    const typesDemandes = filtres.type || [];
    const coucheTout = filtres.couche === 'tout' || typesDemandes.some(type => TYPES_TECHNIQUES.includes(type as TypeCatalogue));
    const correspond = (entree: EntreeCatalogue, ignorerType = false) =>
        pertinence(entree, recherche) > 0 &&
        (ignorerType || !typesDemandes.length || typesDemandes.includes(entree.type)) &&
        (!filtres.domaine?.length || filtres.domaine.includes(entree.domaine)) &&
        (!filtres.sensibilite?.length || filtres.sensibilite.includes(entree.sensibilite || '')) &&
        (!filtres.proprietaire?.length || filtres.proprietaire.includes(entree.proprietaire));
    const pertinents = index.filter(entree => correspond(entree));
    const resultats = pertinents
        .filter(entree => coucheTout || !TYPES_TECHNIQUES.includes(entree.type))
        .sort(
            (premier, second) =>
                pertinence(second, recherche) - pertinence(premier, recherche) || premier.titre.localeCompare(second.titre, 'fr')
        );
    const compter = (valeurDe: (entree: EntreeCatalogue) => string, ignorerType: boolean) => {
        const compteur = new Map<string, number>();
        for (const entree of index.filter(candidat => correspond(candidat, ignorerType))) {
            const valeur = valeurDe(entree);
            if (valeur) compteur.set(valeur, (compteur.get(valeur) || 0) + 1);
        }
        return [...compteur].map(([valeur, nombre]) => ({ valeur, nombre })).sort((premier, second) => second.nombre - premier.nombre);
    };
    return {
        resultats,
        facettes: {
            type: compter(entree => entree.type, true),
            domaine: compter(entree => entree.domaine, false),
            sensibilite: compter(entree => entree.sensibilite || '', false),
            proprietaire: compter(entree => entree.proprietaire, false)
        },
        techniquesMasquees: pertinents.length - resultats.length
    };
}
