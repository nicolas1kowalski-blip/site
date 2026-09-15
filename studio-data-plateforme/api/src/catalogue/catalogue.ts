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
    /** Quand l'élément a été rafraîchi pour la dernière fois (millisecondes), ou null si on ne le sait pas. */
    fraicheur: number | null;
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
    /** L'ordre des résultats : par pertinence (défaut), par qualité, par fraîcheur ou par ordre alphabétique. */
    tri?: TriCatalogue;
};

/** Les quatre ordres de tri du catalogue, dans l'ordre où le classique les propose. */
export const TRIS_CATALOGUE = [
    { cle: 'pertinence', libelle: 'Pertinence' },
    { cle: 'qualite', libelle: 'Qualité' },
    { cle: 'fraicheur', libelle: 'Fraîcheur' },
    { cle: 'alpha', libelle: 'A → Z' }
] as const;
export type TriCatalogue = (typeof TRIS_CATALOGUE)[number]['cle'];

/**
 * Les quatre chiffres du bandeau du catalogue : ce que l'espace contient, et à quel point il est décrit.
 * Les deux pourcentages sont ceux qui comptent pour un nouvel arrivant — « puis-je faire confiance à ce que
 * je lis ? » : la part de sources qui portent une description, et la part de fiches validées par un
 * responsable plutôt que laissées en brouillon.
 */
export type StatistiquesDuCatalogue = { actifs: number; domaines: number; sourcesDocumentees: number; validesParUnResponsable: number };
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

/**
 * Remet les résultats dans l'ordre demandé. La pertinence est l'ordre naturel, déjà posé par `rechercher` ;
 * les trois autres classent sur une seule valeur, et ramènent en fin de liste ce qui ne la porte pas — un
 * élément dont la qualité n'a jamais été mesurée ne doit pas passer devant un élément noté 100.
 */
export function trier(resultats: EntreeCatalogue[], tri: TriCatalogue | undefined): EntreeCatalogue[] {
    const ordonnes = resultats.slice();
    if (tri === 'qualite') ordonnes.sort((premier, second) => (second.qualite ?? -1) - (premier.qualite ?? -1));
    else if (tri === 'fraicheur') ordonnes.sort((premier, second) => (second.fraicheur ?? 0) - (premier.fraicheur ?? 0));
    else if (tri === 'alpha') ordonnes.sort((premier, second) => premier.titre.localeCompare(second.titre, 'fr'));
    return ordonnes;
}

/**
 * Les quatre chiffres du bandeau. Les statuts sont ceux des fiches de dictionnaire et des objets métier
 * réunis, comme dans le classique : c'est la même question posée sur les deux, « un responsable a-t-il
 * validé ce qui est écrit ? ».
 */
export function statistiquesDuCatalogue(
    index: EntreeCatalogue[],
    sources: { documentee: boolean }[],
    statutsDeFiche: string[]
): StatistiquesDuCatalogue {
    const domaines = new Set(index.map(entree => entree.domaine).filter(domaine => domaine && domaine !== '—'));
    const part = (combien: number, sur: number) => (sur ? Math.round((100 * combien) / sur) : 0);
    return {
        actifs: index.length,
        domaines: domaines.size,
        sourcesDocumentees: part(sources.filter(source => source.documentee).length, sources.length),
        validesParUnResponsable: part(statutsDeFiche.filter(statut => statut === 'Validé').length, statutsDeFiche.length)
    };
}

/**
 * Les recherches proposées sous la barre (« Essayez : … »). Le classique en montre quatre, prises dans ce
 * que l'espace contient réellement : le nom d'une source sans son extension, une recherche par
 * confidentialité, le nom d'un objet métier, et le nom d'un propriétaire. Une piste vide est simplement
 * omise — mieux vaut trois exemples justes que quatre dont un ne trouve rien.
 */
export function exemplesDeRecherche(premiereSource: string, premierObjet: string, premierProprietaire: string): string[] {
    return [premiereSource.replace(/\.[^.]*$/, ''), 'données personnelles', premierObjet, premierProprietaire].filter(Boolean).slice(0, 4);
}
