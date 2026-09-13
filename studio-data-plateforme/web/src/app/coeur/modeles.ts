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
    /** Date de la dernière mise à jour du contenu (relecture, nouveau fichier, adresse). */
    derniereMiseAJour?: string;
    /** Domaine (groupe de sources : Achats, Référentiels…), même champ que l'application classique. */
    theme?: string;
    /** Provenance particulière : « fusion » (plusieurs fichiers), « adresse » (import par URL), « preparation », « extraction ». */
    origine?: string;
    /** Paramètres mémorisés d'un import par adresse (pour le relancer). */
    adresse?: ParametresAdresse;
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
    /** Mesure sur les données (cardinalité constatée, orphelins), si elle a été faite. */
    measured?: MesureRelation | null;
    sourceId: string | null;
    targetId: string | null;
};
export type MesureRelation = {
    stotal: number;
    ttotal: number;
    smax: number;
    tmax: number;
    sorph: number;
    torph: number;
    suggested: string;
    date: string;
};
/** Règle métier sur un lien : « 1 parent doit avoir exactement / au plus / au moins N enfants [condition] ». */
export type RegleLien = {
    id: string;
    parentTable: string;
    parentCol: string;
    childTable: string;
    childCol: string;
    cond: { col: string; op: string; val: string } | null;
    expect: '=' | '<=' | '>=';
    n: number;
    label: string;
    libelle?: string;
};
export type ResultatRegleLien = { total: number; violations: number; exemples: string[] };
export type VocabulaireReglesLiens = { operateursAttendu: Record<string, string>; operateursCondition: Record<string, string> };
export type PropositionLien = Omit<Relation, 'id' | 'sourceId' | 'targetId'> & {
    sourceId: string;
    targetId: string;
    couverture: number;
    valeursSource: number;
};

export type OperateurFiltre =
    '=' | '!=' | 'contains' | 'startsWith' | 'in' | '>=' | '<=' | 'between' | 'dfrom' | 'dto' | 'empty' | 'notempty' | 'list';
export type Transformation = 'none' | 'trim' | 'upper' | 'lower' | 'noaccent';
export type Agregat = 'count' | 'countd' | 'sum' | 'avg' | 'min' | 'max' | 'values';

export type GenreColonneExtraction = 'colonne' | 'calcul' | 'synthese' | 'hierarchie';
export type ModeSynthese = 'count' | 'countd' | 'values' | 'first';
/** Synthèse d'une table liée : table résumée, table présente qui porte la clé (de…) et colonnes de la relation. */
export type SyntheseExtraction = {
    tableId: string;
    deTableId: string;
    deColonne: string;
    versColonne: string;
    mode: ModeSynthese;
    nomColonne: string;
    n: number;
};
export type HierarchieExtraction = { idColonne: string; parentColonne: string; attributs: string[]; profondeur: number };
export type ColonneExtraction = {
    tableId: string;
    nomColonne: string;
    genre?: GenreColonneExtraction;
    formule?: string;
    synthese?: SyntheseExtraction;
    hierarchie?: HierarchieExtraction;
    alias?: string;
    transformation: Transformation;
    agregat?: Agregat;
};
export type FiltreExtraction = {
    tableId: string;
    nomColonne: string;
    op: OperateurFiltre;
    valeur?: string;
    valeur2?: string;
    liste?: string[];
    exclure?: boolean;
};
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
/** Bilan qualité du résultat d'une extraction : lignes et complétude de chaque colonne. */
export type BilanExtraction = { total: number; colonnes: { nom: string; renseignees: number; part: number }[] };
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
    genresColonne: Record<GenreColonneExtraction, string>;
    modesSynthese: Record<ModeSynthese, string>;
};
export type Materialisation = { sourceId: string; nom: string; lignes: number; colonnes: string[] };

/** Les opérateurs qui n'attendent aucune valeur, et celui qui en attend deux. */
export const OPERATEURS_SANS_VALEUR: OperateurFiltre[] = ['empty', 'notempty', 'list'];
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
    /** Hygiène (reprise de l'application classique) : espaces multiples, bouche-trous, casses, valeurs aberrantes. */
    espacesMultiples?: number;
    boucheTrous?: number;
    cassesIncoherentes?: number;
    aberrantes?: number;
    moyenne?: number | null;
    ecartType?: number | null;
};
/** Condition sur les lignes d'une source (même forme que les filtres des recettes) : périmètre d'audit. */
export type FiltreAudit = { col: string; op: OperateurFiltreSource; val: string };
export type GenreAnomalie =
    | 'lignesIdentiques'
    | 'lignesVides'
    | 'espacesParasites'
    | 'espacesMultiples'
    | 'boucheTrous'
    | 'casseIncoherente'
    | 'aberrantes'
    | 'valeursVides';
export type Anomalie = { genre: GenreAnomalie; colonne: string; libelle: string; nombre: number };
export type ProfilSource = {
    sourceId: string;
    sourceNom: string;
    lignes: number;
    colonnes: ProfilColonne[];
    completudeMoyenne: number;
    doublonsExacts: number;
    lignesVides?: number;
    filtres?: FiltreAudit[];
    anomalies?: Anomalie[];
    /** Volume analysé : nombre de premières lignes retenues (absent = toute la source). */
    echantillon?: number;
};
/** Détail d'une colonne (« Analyse Colonnes ») : type sémantique, statistiques, valeurs fréquentes, formats, signaux. */
export type TypeSemantique = 'Numérique' | 'Date/Heure' | 'Email' | 'Téléphone' | 'Texte' | 'Vide';
export type DetailColonne = {
    colonne: string;
    typeSemantique: TypeSemantique;
    profil: ProfilColonne;
    longueurMoyenne: number | null;
    nombres: {
        minimum: number;
        maximum: number;
        somme: number;
        moyenne: number;
        ecartType: number;
        p05: number;
        q1: number;
        mediane: number;
        q3: number;
        p95: number;
    } | null;
    dates: { premiere: string | null; derniere: string | null; futures: number; avant1900: number } | null;
    valeursFrequentes: { valeur: string | null; nombre: number; part: number }[];
    motifs: { motif: string; nombre: number; part: number }[];
    motifsDistincts: number;
    signaux: { cleCandidate: boolean; constante: boolean; faibleCardinalite: boolean; asymetrique: boolean };
};
/** Une page de lignes (50 par page) : lignes d'une anomalie ou lignes en échec d'une règle. */
export type PageLignes = { colonnes: string[]; lignes: unknown[][]; total: number; offset: number };
export type ResultatDoublons = {
    cle: string[];
    groupes: number;
    lignes: number;
    exemples: { valeurs: (string | null)[]; nombre: number }[];
};
export type TypeRegle =
    | 'nonVide'
    | 'unique'
    | 'format'
    | 'dansListe'
    | 'listeValeurs'
    | 'plage'
    | 'longueur'
    | 'dateValide'
    | 'fraicheur'
    | 'reference'
    | 'condition'
    | 'expression'
    | 'sql'
    | 'groupe'
    | TypeRegleSerie;
/** Contrôles sur une série temporelle déclarée (règles de série). */
export type TypeRegleSerie =
    | 'serieTrou'
    | 'serieDoublon'
    | 'seriePlateau'
    | 'serieSaut'
    | 'serieMonotonie'
    | 'serieFraicheur'
    | 'serieSaisonnalite'
    | 'serieCouverture';
export type CreneauSaison = 'heure' | 'jourSemaine' | 'mois';
export type Criticite = 'bloquante' | 'majeure' | 'mineure';
export type OperateurCondition = 'renseigne' | 'vide' | 'dans';
export type AgregatGroupe = 'count' | 'countd' | 'sum' | 'avg' | 'min' | 'max';
export type ParametresRegle = {
    expression?: string;
    valeurs?: string[];
    minimum?: number;
    maximum?: number;
    sourceCibleId?: string;
    colonneCible?: string;
    /** unique : colonnes supplémentaires de la clé composite. */
    colonnes?: string[];
    /** listeValeurs : liste de valeurs de la gouvernance. */
    listeId?: string;
    /** fraicheur : âge maximal en jours. */
    jours?: number;
    /** condition : si (colonne) opérateur [valeurs] alors (alorsColonne) opérateur [valeurs]. */
    siOperateur?: OperateurCondition;
    siValeurs?: string[];
    alorsColonne?: string;
    alorsOperateur?: OperateurCondition;
    alorsValeurs?: string[];
    /** expression : formule booléenne avec [colonnes] ; sql : condition SQL libre. */
    formule?: string;
    condition?: string;
    /** groupe : clé de regroupement, agrégat, comparaison au seuil. */
    colonnesGroupe?: string[];
    agregat?: AgregatGroupe;
    colonneAgregee?: string;
    operateur?: string;
    seuil?: number;
    /** règles de série : la série déclarée et les seuils propres à chaque contrôle. */
    serieId?: string;
    longueurMinimale?: number;
    sautAbsolu?: number;
    sautPourcent?: number;
    sens?: 'croissant' | 'decroissant';
    ageMaximalHeures?: number;
    reference?: 'fichier' | 'maintenant';
    sensibilite?: number;
    creneau?: CreneauSaison;
    couvertureMinimale?: number;
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
    genre: 'profilage' | 'doublons' | 'regles' | 'doublons-approches';
    lanceLe: string;
    lignes: number;
    resume: Record<string, unknown>;
    detail?: unknown;
};
export type ModeAppariement = 'exact' | 'norm' | 'fuzzy';
export type VocabulaireQualite = {
    typesRegle: Record<TypeRegle, string>;
    typesSansColonne: TypeRegle[];
    criticites: Record<Criticite, number>;
    operateursCondition: Record<OperateurCondition, string>;
    agregatsGroupe: Record<AgregatGroupe, string>;
    operateursGroupe: string[];
    genresAnomalie: Record<GenreAnomalie, string>;
    modesAppariement: Record<ModeAppariement, string>;
    typesRegleSerie: Record<TypeRegleSerie, string>;
    creneauxSaison: Record<CreneauSaison, string>;
    /** Pour chaque type de règle : ce qu'elle vérifie (quoi) et comment elle compte les échecs (comment). */
    explications: Record<string, { quoi: string; comment: string }>;
};
/** Résultat d'une règle tel qu'il est mémorisé dans un audit « règles » (photographie d'une exécution). */
export type RegleDansAudit = {
    id: string;
    nom: string;
    type: TypeRegle;
    colonne: string;
    criticite: Criticite;
    total: number;
    echecs: number;
    taux: number;
    executeLe: string;
};
/** Composant d'une clé fonctionnelle : colonne de la table auditée ou d'une table liée (avec condition facultative). */
export type ComposantCle = { table: string; col: string; whereCol: string; whereVal: string; match: ModeAppariement };
export type ProfilCle = { id: string; scope: FiltreAudit[]; parts: ComposantCle[] };
/** Les lignes en double des profils de clé, par type : strictes, normalisées (écritures différentes), paires floues. */
export type TypeDoublon = 'stricte' | 'normalisee' | 'floue';
export type LignesEnDouble = {
    source: string;
    seuil: number;
    colonnes: string[];
    lignes: { profil: string; type: TypeDoublon; groupe: string; cle: string; valeurs: (string | null)[] }[];
    erreurs: string[];
};
export type ResultatProfilCle = {
    profil: ProfilCle;
    totalLignes: number;
    exactes: { groupes: number; lignes: number; exemples: { cle: string; nombre: number }[] };
    proches: { groupes: number; exemples: { cle: string; nombre: number; ecritures: string[] }[] };
    floues: { exemple1: string; exemple2: string; nombre1: number; nombre2: number; similarite: number }[];
    erreur?: string;
};
/** Audit d'un objet métier : profil de la table maître, règles du périmètre, cardinalité 1–1 des facettes. */
export type ResultatFacette = {
    nom: string;
    table: string;
    total: number;
    sansLigne: number;
    plusieurs: number;
    exemples: string[];
    erreur?: string;
};
export type AuditObjet = {
    objet: { id: string; name: string };
    tableMaitre: string;
    profil: ProfilSource;
    regles: ExecutionRegles;
    facettes: ResultatFacette[];
};

// ---- importation (fichiers déposés, Excel, fusion, adresses, livraisons ZIP) ----
/** Un fichier déjà déposé sur le serveur, à transformer en source. */
export type FichierDepose = { nomServeur: string; nomFichier: string; taille?: number; modifieLe?: number; feuille?: string };
export type DifferentielImport = { ajoutees: number; disparues: number; modifiees: number | null; cle: string | null };
export type ResultatImport = { source: Source; lignes: number; colonnesDisparues: string[]; differentiel?: DifferentielImport };
export type GenreAdresse = 'csv' | 'json' | 'parquet' | 'gsheet';
export type ParametresAdresse = {
    adresse: string;
    genre: GenreAdresse;
    nom?: string;
    cheminJson?: string;
    enTeteNom?: string;
    enTeteValeur?: string;
    sourceId?: string;
    colonneCle?: string;
    mode?: 'remplacer' | 'ajouter';
};
export type EntreeLivraisonZip = {
    nom: string;
    dossier: string;
    nomCourt: string;
    taille: number;
    modifieLe: string;
    sourceExistante: string | null;
};
export type ActionEntreeZip = 'importer' | 'mettreAJour' | 'ignorer';
export type BilanZip = { importees: string[]; misesAJour: string[]; ignorees: string[]; erreurs: { nom: string; erreur: string }[] };

/** Paramètres de lecture d'un CSV (mêmes noms que l'application classique). */
export type OptionsLectureCsv = { delim?: string; enc?: string; quote?: string; ignoreErrors?: boolean };
export type VocabulaireImportation = { extensions: string[]; separateurs: Record<string, string>; encodages: Record<string, string> };

// ---- analyse de couverture ----
export type ParametresCouverture = {
    base: string;
    dimensionTable: string;
    dimensionColonne: string;
    dimensionParAnnee: boolean;
    liee: string;
    filtresBase: FiltreAudit[];
    filtresLiee: FiltreAudit[];
    dimension2Table: string;
    dimension2Colonne: string;
};
export type LigneCouverture = { dimension: string; dimension2: string; avec: number; sans: number; total: number };

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

// ---- exploitation : tableaux de bord, comparateur, séries temporelles, rapprochement (format classique) ----
export type GenreTuile = 'bar' | 'line' | 'pie' | 'table' | 'kpi';
export type AgregatTuile = 'count' | 'countd' | 'sum' | 'avg' | 'min' | 'max';
/** Tuile : table, genre, axe (dim), agrégat et colonne agrégée, N premières valeurs ; seuils d'un indicateur. */
export type Tuile = {
    id: string;
    title: string;
    table: string;
    kind: GenreTuile;
    dim: string;
    agg: AgregatTuile;
    aggCol: string;
    topN: number;
    thWarn?: string | number;
    thCrit?: string | number;
    thDir?: 'max' | 'min';
};
export type FiltreTableau = { col: string; op: OperateurFiltreSource; val: string; conn: 'AND' | 'OR' };
export type TableauDeBord = { id: string; name: string; filters: FiltreTableau[]; tiles: Tuile[]; [autre: string]: unknown };
export type ResultatTuile = {
    id: string;
    lignes: { d: string; v: number }[];
    valeur: number | null;
    statut: 'crit' | 'warn' | 'ok' | null;
    erreur?: string;
};
export type Alerte = {
    tableau: string;
    indicateur: string;
    valeur: number | null;
    statut: 'crit' | 'warn' | 'ok' | 'err';
    thWarn?: string;
    thCrit?: string;
    sens: 'max' | 'min';
    erreur?: string;
};
export type ParametresComparaison = {
    tableA: string;
    tableB: string;
    cles: { colA: string; colB: string }[];
    correspondances: { colA: string; colB: string }[];
    ignorerCasse: boolean;
    ignorerEspaces: boolean;
};
export type ResultatComparaison = {
    sourceId: string;
    nom: string;
    total: number;
    identiques: number;
    differentes: number;
    manquantesA: number;
    manquantesB: number;
    colonnes: string[];
    apercu: unknown[][];
};
/** Série temporelle : source, clé de série (keyCols), horodatage (tsCol), mesure (valCol), pas (auto ou secondes). */
export type ConfigurationSerie = {
    id: string;
    name: string;
    table: string;
    keyCols: string[];
    tsCol: string;
    valCol: string;
    step: string;
    tol: number;
    regMin: number;
    [autre: string]: unknown;
};
export type ProfilSerie = Record<string, unknown> & {
    serie: string;
    points: number;
    doublons: number;
    trous: number;
    cadencee: boolean;
    regularite: number;
    couverture: number | null;
    plateau_max: number;
    retard_sec: number;
};
export type AnalyseSerie = {
    maille: 'hour' | 'day' | 'week' | 'month';
    profil: ProfilSerie[];
    calendrier: { serie: string; periode: string; n: number }[];
};
export type MethodeComparaison = 'exact' | 'jw' | 'lev';
/** Rapprochement : sources a et b, clé de blocage (blockA, blockB), comparaisons pondérées, seuils, décisions par paire. */
export type Rapprochement = {
    id: string;
    name: string;
    a: string;
    b: string;
    blockA: string;
    blockB: string;
    compares: { colA: string; colB: string; method: MethodeComparaison; weight: number }[];
    thAuto: number;
    thReview: number;
    decisions: Record<string, 'ok' | 'ko'>;
    [autre: string]: unknown;
};
export type PaireCandidate = {
    ra: number;
    rb: number;
    da: string;
    db: string;
    s: number;
    key: string;
    st: 'auto' | 'review' | 'ok' | 'ko';
};
export type VocabulaireExploitation = {
    genresTuile: Record<GenreTuile, string>;
    agregats: Record<AgregatTuile, string>;
    agregatsStatistiques: Record<AgregatStatistique, string>;
    methodes: Record<MethodeComparaison, string>;
    pas: Record<string, string>;
    mailles: Record<string, string>;
};

// ---- catalogue, surveillance des sources, sauvegarde, analyse d'impact ----
export type TypeCatalogue =
    'bo' | 'attr' | 'term' | 'asset' | 'perimeter' | 'valuelist' | 'rule' | 'report' | 'series' | 'table' | 'view' | 'column' | 'linkage';
export type EntreeCatalogue = {
    type: TypeCatalogue;
    id: string;
    titre: string;
    sousTitre: string;
    description: string;
    domaine: string;
    proprietaire: string;
    qualite: number | null;
    sensibilite: 'perso' | 'conf' | 'non' | null;
    validation: 'ok' | 'pending' | null;
    etiquettes: string[];
    motsCles: string[];
    lien: string;
};
export type Facette = { valeur: string; nombre: number };
export type ResultatCatalogue = {
    resultats: EntreeCatalogue[];
    facettes: Record<'type' | 'domaine' | 'sensibilite' | 'proprietaire', Facette[]>;
    techniquesMasquees: number;
    types: Record<TypeCatalogue, string>;
    total: number;
};
export type FiltresCatalogue = {
    q?: string;
    type?: string[];
    domaine?: string[];
    sensibilite?: string[];
    proprietaire?: string[];
    couche?: 'metier' | 'tout';
};
export type ColonneSchema = { name: string; type: string };
export type Instantane = { ts: number; rows: number; schema: ColonneSchema[] };
export type Contrat = { cols: (ColonneSchema & { required: boolean })[]; at: number };
export type Derive = {
    added: string[];
    removed: string[];
    retyped: string[];
    rowsDelta: number;
    rowsPct: number | null;
    from: number;
    to: number;
    schemaChanged: boolean;
};
export type EtatSurveillance = {
    nom: string;
    id: string;
    fraicheur: Fraicheur;
    dernierInstantane: Instantane | null;
    nombreInstantanes: number;
    derive: Derive | null;
    contrat: Contrat | null;
    donneesFigees: { ts: number; rows: number } | null;
};
export type VerificationContrat = {
    missing: string[];
    extra: string[];
    retyped: string[];
    emptyRequired: { col: string; vides: number }[];
    conforme: boolean;
};
export type ResultatDelta = {
    table: string;
    cle: string;
    at: number;
    snapTs: number;
    added: number;
    removed: number;
    changed: number;
    same: number;
    colonnesComparees: number;
};
export type ResultatReconciliationSources = {
    at: number;
    a: string;
    b: string;
    ta: number;
    tb: number;
    onlyA: number;
    onlyB: number;
    common: number;
};
export type RapportImport = {
    documents: number;
    sources: number;
    tablesConcues: { reconstruites: string[]; erreurs: { table: string; erreur: string }[] };
};
export type ActifImpacte = { id: string; name: string; criticality: string; owner: string };
export type AnalyseImpact = {
    direct: ActifImpacte[];
    viaLineage: ActifImpacte[];
    viaRelations: ActifImpacte[];
    downstream: string[];
    related: string[];
};

// ---- cockpit (accueil) ----
export type PointAttention = { gravite: 'alerte' | 'info'; message: string; lien: string };
export type Cockpit = {
    sources: number;
    lignes: number;
    domaines: number;
    liens: number;
    objetsMetier: number;
    audits: number;
    scoreQualite: number | null;
    dernierAudit: { source: string; date: string; lignes: number; completude: number | null; doublons: number | null } | null;
    pointsAttention: PointAttention[];
    volumetrie: { nom: string; lignes: number; domaine: string }[];
};

// ---- statistiques, explorateur 360°, préparation ----
export type AgregatStatistique = 'count' | 'countd' | 'sum' | 'avg' | 'min' | 'max';
export type ParametresStatistiques = { table: string; dimension: string; agregat: AgregatStatistique; mesure: string; limite: number };
export type ResultatStatistiques = { points: { d: string; v: number }[]; sql: string };
export type Ligne360 = Record<string, unknown>;
export type Voisins360 = { table: string; libelle: string; lignes: Ligne360[] };

export type TypeEtapePreparation = 'filter' | 'clean' | 'normalize' | 'std' | 'enrich' | 'calc' | 'dedup' | 'rename' | 'drop';
export type EtapePreparation = {
    id: string;
    type: TypeEtapePreparation;
    enabled: boolean;
    p: Record<string, string>;
    lastMatch?: number | null;
};
export type RecettePreparation = {
    id: string;
    name: string;
    src: string;
    out: string;
    steps: EtapePreparation[];
    targetId?: string | null;
    lastRows?: number | null;
    lastAt?: number | null;
};
export type VocabulairePreparation = {
    typesEtape: Record<TypeEtapePreparation, string>;
    actionsNettoyage: Record<string, string>;
    formats: Record<string, string>;
    standardisations: Record<string, string>;
    referentiels: Record<string, { label: string; cols: string[] }>;
};
export type ApercuPreparation = { sql: string; colonnes: string[]; lignes: unknown[][]; total: number };
export type ExecutionPreparation = { recette: RecettePreparation; sourceId: string; lignes: number; colonnes: string[] };
export type RelancePreparations = { executees: string[]; erreurs: { preparation: string; erreur: string }[] };
