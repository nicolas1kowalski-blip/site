/**
 * Types partagés par le front : ce que l'API renvoie (voir api/src). Les noms de champs sont ceux de l'API.
 *
 * Note sur les champs en anglais (name, headers, storage, size, term, definition, owner, domain, sourceTable,
 * targetCol…) : ce sont les noms que l'application classique enregistre dans ses documents. Ils sont conservés
 * tels quels pour que les deux interfaces lisent les mêmes données ; ils seront francisés quand l'application
 * classique sera retirée. Tout ce qui est propre à la plateforme (espaces, membres, journal, extraction) est en français.
 */
export type RoleGlobal = 'administrateur' | 'utilisateur';
export type RoleEspace = 'lecteur' | 'editeur' | 'administrateur';

export type Utilisateur = {
    id: string;
    identifiant: string;
    nomAffiche: string;
    email: string | null;
    roleGlobal: RoleGlobal;
    actif: boolean;
    creeLe: string;
};

export type Espace = { id: string; code: string; nom: string; role: RoleEspace; creeLe: string };

/** Réponse de /api/auth/moi et de la connexion. */
export type Identite = { utilisateur: Utilisateur; espaceCourant: Espace | null; espaces: Espace[] };

export type Membre = { utilisateurId: string; identifiant: string; nomAffiche: string; actif: boolean; role: RoleEspace };

/** Métadonnées d'une source, mêmes champs que l'application classique. */
export type Source = {
    id: string;
    name: string;
    type: string;
    storage: string;
    size: number;
    headers: string[];
    optimized?: boolean;
    pqSize?: number | null;
    fichier?: { nom: string; name: string; size: number; lastModified?: number };
    srcModified?: number | null;
    enregistreLe?: string;
    config?: Record<string, unknown>;
};

export type ColonneResultat = { nom: string; type: string };
export type ResultatSql = { colonnes: ColonneResultat[]; lignes: unknown[][]; ignoree?: boolean };

export type TermeGlossaire = { id: string; term: string; definition: string; domain?: string; synonyms?: string; owner?: string };
export type FicheDictionnaire = {
    description?: string;
    owner?: string;
    domain?: string;
    updateFrequency?: string;
    sensitivity?: string;
    columns?: Record<string, { description?: string; sensitivity?: string }>;
};

export type EntreeJournal = { id: string; action: string; cible: string | null; details: unknown; horodatage: string; auteur: string };

export type Sante = {
    ok: boolean;
    serveur: string;
    baseReferentielle: { pilote: string; ok: boolean };
    memoireProcessusMo: number;
    duckdb?: string;
    espace?: string;
    tables?: number;
    fichiers?: number;
    octetsFichiers?: number;
    requetesExecutees?: number;
};

/** Rôles d'espace ordonnés : sert à savoir si un rôle suffit pour une action. */
const NIVEAU_ROLE: Record<RoleEspace, number> = { lecteur: 1, editeur: 2, administrateur: 3 };
export function roleSuffisant(role: RoleEspace | undefined, requis: RoleEspace): boolean {
    return !!role && NIVEAU_ROLE[role] >= NIVEAU_ROLE[requis];
}

export function formaterOctets(octets: number | null | undefined): string {
    const valeur = Number(octets) || 0;
    if (valeur < 1024) return valeur + ' o';
    if (valeur < 1048576) return (valeur / 1024).toFixed(1) + ' Ko';
    if (valeur < 1073741824) return (valeur / 1048576).toFixed(1) + ' Mo';
    return (valeur / 1073741824).toFixed(2) + ' Go';
}

export function formaterDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('fr-FR');
}

/** Identifiant court aléatoire, même forme que dans l'application classique (tb_xxxxxxxxx, gl_xxxxxxxxx). */
export function genererIdentifiant(prefixe: string): string {
    return prefixe + Math.random().toString(36).slice(2, 11);
}

// ---- modèle de données et extraction ----
export type Relation = {
    id: string;
    sourceTable: string;
    sourceCol: string;
    targetTable: string;
    targetCol: string;
    cardinality?: string;
    kind?: string;
    sourceId: string | null;
    targetId: string | null;
};
export type PropositionLien = Omit<Relation, 'id' | 'sourceId' | 'targetId'> & {
    sourceId: string;
    targetId: string;
    couverture: number;
    valeursSource: number;
};

export type OperateurFiltre =
    '=' | '!=' | 'contains' | 'startsWith' | 'in' | '>=' | '<=' | 'between' | 'dfrom' | 'dto' | 'empty' | 'notempty';
export type Transformation = 'none' | 'trim' | 'upper' | 'lower' | 'noaccent';
export type Agregat = 'count' | 'countd' | 'sum' | 'avg' | 'min' | 'max' | 'values';

export type ColonneExtraction = { tableId: string; nomColonne: string; alias?: string; transformation: Transformation; agregat?: Agregat };
export type FiltreExtraction = { tableId: string; nomColonne: string; op: OperateurFiltre; valeur?: string; valeur2?: string };
export type JointureExtraction = { deTableId: string; deColonne: string; versTableId: string; versColonne: string };
export type SpecificationExtraction = {
    baseId: string;
    jointures: JointureExtraction[];
    typeJointure: 'left' | 'inner';
    colonnes: ColonneExtraction[];
    filtres: FiltreExtraction[];
    regrouper: boolean;
    dedoublonner: boolean;
    tri: { alias: string; sens: 'asc' | 'desc' }[];
    limite?: number;
};
export type ApercuExtraction = { sql: string; colonnes: ColonneResultat[]; lignes: unknown[][]; limite: number };
export type ModeleExtraction = {
    id: string;
    nom: string;
    description: string;
    specification: SpecificationExtraction;
    modifieLe: string;
    auteur: string;
};
export type VocabulaireExtraction = {
    operateurs: Record<OperateurFiltre, string>;
    transformations: Record<Transformation, string>;
    agregats: Record<Agregat, string>;
};

/** Les opérateurs qui n'attendent aucune valeur, et celui qui en attend deux. */
export const OPERATEURS_SANS_VALEUR: OperateurFiltre[] = ['empty', 'notempty'];
export const OPERATEUR_DEUX_VALEURS: OperateurFiltre = 'between';

// ---- qualité ----
export type ProfilColonne = {
    colonne: string;
    total: number;
    vides: number;
    completude: number;
    distinctes: number;
    longueurMin: number | null;
    longueurMax: number | null;
    espacesParasites: number;
    partNumerique: number;
    partDate: number;
    motifMajoritaire: string | null;
    partMotifMajoritaire: number;
    motifsDistincts: number;
    valeursFrequentes: { valeur: string | null; nombre: number }[];
};
export type ProfilSource = {
    sourceId: string;
    sourceNom: string;
    lignes: number;
    colonnes: ProfilColonne[];
    completudeMoyenne: number;
    doublonsExacts: number;
};
export type ResultatDoublons = {
    cle: string[];
    groupes: number;
    lignes: number;
    exemples: { valeurs: (string | null)[]; nombre: number }[];
};
export type TypeRegle = 'nonVide' | 'unique' | 'format' | 'dansListe' | 'plage' | 'longueur' | 'dateValide' | 'reference';
export type Criticite = 'bloquante' | 'majeure' | 'mineure';
export type ParametresRegle = {
    expression?: string;
    valeurs?: string[];
    minimum?: number;
    maximum?: number;
    sourceCibleId?: string;
    colonneCible?: string;
};
export type ResultatRegle = { total: number; echecs: number; taux: number; executeLe: string; exemples: string[] };
export type RegleQualite = {
    id: string;
    nom: string;
    sourceId: string;
    colonne: string;
    type: TypeRegle;
    parametres: ParametresRegle;
    criticite: Criticite;
    active: boolean;
    dernierResultat: ResultatRegle | null;
    modifieLe: string;
};
export type DefinitionRegle = Omit<RegleQualite, 'id' | 'dernierResultat' | 'modifieLe'>;
export type ExecutionRegles = { score: number | null; regles: (RegleQualite & { resultat: ResultatRegle | null; erreur?: string })[] };
export type AuditQualite = {
    id: string;
    sourceId: string;
    sourceNom: string;
    genre: 'profilage' | 'doublons' | 'regles';
    lanceLe: string;
    lignes: number;
    resume: Record<string, unknown>;
    detail?: unknown;
};
export type VocabulaireQualite = { typesRegle: Record<TypeRegle, string>; criticites: Record<Criticite, number> };
