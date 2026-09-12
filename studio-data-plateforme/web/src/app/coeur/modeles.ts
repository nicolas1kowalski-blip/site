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
    /** Recette d'une table conçue (type « designed »). */
    design?: Recette;
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

// ---- tables conçues (recette au format de l'application classique, voir l'en-tête et le README) ----
export type FormatAttribut = '' | 'int' | 'dec' | 'date' | 'bool' | 'code';
export type OperateurFiltreSource =
    'eq' | 'neq' | 'contains' | 'ncontains' | 'starts' | 'ends' | 'empty' | 'nempty' | 'gt' | 'gte' | 'lt' | 'lte';
export type ModeValidite = '' | 'status' | 'period';
/** Filtre d'entrée d'une source contributrice : col (colonne), op (opérateur), val (valeur). */
export type FiltreSourceRecette = { col: string; op: OperateurFiltreSource; val: string };
/** Source contributrice : src (nom de la source), map (attribut → colonne de la source), filters. */
export type SourceContributrice = { src: string; map: Record<string, string>; filters: FiltreSourceRecette[] };
/**
 * Enrichissement : colonne « col » de la source « src » ramenée sous le nom « as », en joignant la clé « srcKey »
 * à la colonne d'accroche « attr » de la table ; via une table de lien (viaSrc, viaIn, viaOut) si besoin ;
 * lignes valides par statut (vCol, vOp, vVal) ou par période (vStart, vEnd).
 */
export type Enrichissement = {
    src: string;
    srcKey: string;
    attr: string;
    col: string;
    as: string;
    viaSrc: string;
    viaIn: string;
    viaOut: string;
    validMode: ModeValidite;
    vCol: string;
    vOp: OperateurFiltreSource;
    vVal: string;
    vStart: string;
    vEnd: string;
};
/** Clé étrangère déclarée : l'attribut « attr » référence la colonne « col » de la source « table ». */
export type CleEtrangere = { attr: string; table: string; col: string };
export type ResultatCleEtrangere = CleEtrangere & { orphans: number | null };
export type Recette = {
    name: string;
    sources: SourceContributrice[];
    attrs: string[];
    calcs: { name: string; formula: string }[];
    key: string[];
    formats: Record<string, FormatAttribut>;
    joins: Enrichissement[];
    fks: CleEtrangere[];
    targetId?: string | null;
    lastRows?: number;
    lastBuild?: string;
    lastConform?: Record<string, number>;
    lastFk?: ResultatCleEtrangere[];
};
export type TableConcue = Source & { design: Recette };
export type Ecart = { cle: string; attribut: string; source: string; valeur: string };
export type RapportEcarts = { cle: string[]; nombreCles: number; ecarts: Ecart[]; tronque: boolean };
export type Contribution = { source: string; lignes: number; part: number; completude: number };
export type VocabulaireTablesConcues = {
    formats: Record<FormatAttribut, string>;
    operateursFiltre: Record<OperateurFiltreSource, string>;
    modesValidite: Record<ModeValidite, string>;
};

// ---- gouvernance : référentiels (format de l'application classique, champs en anglais) ----
export type RoleObjetSource = 'maitre' | 'contributeur' | 'destinataire';
/** Attribut (« information ») d'un objet métier : mappings = colonnes techniques qui l'alimentent, usedBy = actifs. */
export type AttributObjetMetier = {
    id: string;
    name: string;
    definition?: string;
    mappings: { table: string; col: string }[];
    usedBy: string[];
    owner?: string;
    sensitivity?: string;
    examples?: string;
    term?: string;
    [autre: string]: unknown;
};
export type ObjetMetier = {
    id: string;
    name: string;
    definition: string;
    domain?: string;
    globalOwner: string;
    contributors: string[];
    status?: string;
    elements: AttributObjetMetier[];
    sources: { table: string; role: RoleObjetSource }[];
    producedBy: string[];
    consumedBy: string[];
    references: { boId: string; cardinality?: string }[];
    appId?: string;
    history?: { at: string; from: string; to: string; by: string; comment: string }[];
    [autre: string]: unknown;
};
export type GenreActif = 'app' | 'process' | 'report';
/** Actif : application (sources = tables produites, tables = tables lues), processus (appIds), restitution. */
export type Actif = {
    id: string;
    name: string;
    kind: GenreActif;
    description: string;
    owner: string;
    domain: string;
    criticality: string;
    sources: string[];
    tables: string[];
    columns: { table: string; col: string }[];
    boIds: string[];
    appIds: string[];
    producedBy: string[];
    deliveredTo: string[];
    recipients?: string;
    frequency?: string;
    format?: string;
    [autre: string]: unknown;
};
export type Perimetre = { id: string; name: string; description: string; tables: string[]; boIds: string[]; [autre: string]: unknown };
export type RolePersonne = 'owner' | 'contrib' | 'reader' | 'admin';
export type Personne = {
    id: string;
    name: string;
    email: string;
    roles: { domain: string; role: RolePersonne }[];
    [autre: string]: unknown;
};
export type VocabulaireGouvernance = {
    rolesSource: Record<RoleObjetSource, string>;
    genresActif: Record<GenreActif, string>;
    rolesPersonne: Record<RolePersonne, string>;
    criticites: string[];
};
/** Liste de valeurs : codes en clair (values) ou lus dans une source (srcTable, colCode…). */
export type ListeValeurs = {
    id: string;
    name: string;
    description: string;
    kind: 'inline' | 'table';
    values: { code: string; label: string; status: string }[];
    srcTable: string;
    colCode: string;
    colLabel: string;
    colStatus: string;
    colList: string;
    listValue: string;
    activeStatus: string;
    utilisations?: { table: string; col: string }[];
    [autre: string]: unknown;
};
export type ControleListe = {
    table: string;
    col: string;
    total: number;
    horsListe: number;
    exemples: { valeur: string; nombre: number }[];
};
export type NiveauSensibilite = '' | 'public' | 'interne' | 'confidentiel' | 'personnel';
export type ColonneClassee = {
    table: string;
    col: string;
    niveau: NiveauSensibilite;
    niveauPropose: Exclude<NiveauSensibilite, ''>;
    sensibilite: string;
};
export type Classification = {
    niveaux: Record<Exclude<NiveauSensibilite, ''>, string>;
    actionsPossibles: Record<string, string>;
    actions: Record<string, string>;
    colonnes: ColonneClassee[];
};
export type ColonnePersonnelle = { table: string; col: string; motif: string };
export type GenreProposition = 'attr' | 'bo' | 'term' | 'asset' | 'dict' | 'dictcol';
export type DefinitionProposition = {
    kind: GenreProposition;
    field: string;
    target: Record<string, string>;
    label: string;
    before: string;
    after: string;
    raw?: unknown;
    domain: string;
};
export type Proposition = DefinitionProposition & {
    id: string;
    status: 'pending' | 'accepted' | 'rejected';
    by: string;
    byName: string;
    at: string;
    decidedAt?: string;
    decidedBy?: string;
    comment?: string;
};

// ---- lineage : carte des flux (governance.flow, format classique) ----
export type GenreNoeudFlux = 'table' | 'app' | 'object';
export type NoeudFlux = {
    id: string;
    name: string;
    kind?: GenreNoeudFlux;
    tableName?: string;
    assetId?: string;
    boId?: string;
    origine?: string;
    domain?: string;
    derived?: boolean;
    producer?: boolean;
    [autre: string]: unknown;
};
export type TransformationPaire = { kind: 'none' | 'agg' | 'scalar'; fn?: string; op?: string; param?: string };
/** Attribut contrôlé d'un lien : colonne source (src), colonne cible (tgt), transformation attendue. */
export type PaireAttributs = { id: string; src: string; tgt: string; xform?: TransformationPaire };
export type ResultatReconciliation = {
    at: number;
    rows: number;
    missing: number;
    distAny: number;
    rate: number;
    worstRate: number;
    pairs: { src: string; tgt: string; dist: number; rate: number; samples: string[][] }[];
};
export type LienFlux = {
    id: string;
    source: string;
    target: string;
    rel?: string;
    srcKey?: string;
    tgtKey?: string;
    attrPairs?: PaireAttributs[];
    slaHours?: number | null;
    transformation?: string;
    nature?: string;
    scope?: string;
    lastRun?: ResultatReconciliation | null;
    derived?: boolean;
    [autre: string]: unknown;
};
export type Flux = {
    nodes: NoeudFlux[];
    edges: LienFlux[];
    threshold: number;
    showObjects: boolean;
    hideSources: boolean;
    grain: 'bo' | 'table';
};
export type StatutFraicheur = 'ok' | 'warn' | 'bad' | 'none';
export type Fraicheur = {
    status: StatutFraicheur;
    ageJours?: number;
    joursMaximum?: number | null;
    frequence?: string;
    source?: string;
    herite?: boolean;
};
export type NoeudFluxEnrichi = NoeudFlux & { role: string; fraicheur: Fraicheur };
export type LienFluxEnrichi = LienFlux & { type: string; fraicheur: Fraicheur; distorsion: StatutFraicheur; sante: 'ok' | 'warn' | 'bad' };
export type ControleModele = { severite: 'error' | 'warn'; categorie: string; message: string };
export type CarteFlux = { flux: Flux; noeuds: NoeudFluxEnrichi[]; liens: LienFluxEnrichi[]; controles: ControleModele[] };
export type BilanSynchronisation = {
    noeudsAjoutes: number;
    liensAjoutes: number;
    originesRenseignees: number;
    liensRetires: number;
    noeudsRetires: number;
};
export type NoeudGraphe = {
    id: string;
    titre: string;
    detail?: string;
    genre: 'app' | 'table' | 'colonne' | 'attribut' | 'objet' | 'alerte';
};
export type Graphe = { noeuds: NoeudGraphe[]; liens: { source: string; target: string; libelle?: string }[] };
export type VocabulaireLineage = {
    relations: Record<string, string>;
    roles: Record<string, string>;
    natures: Record<string, string>;
    agregats: Record<string, string>;
    scalaires: Record<string, string>;
};
