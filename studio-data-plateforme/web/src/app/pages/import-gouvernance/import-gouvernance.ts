/**
 * Remplir la gouvernance depuis un fichier — repris de la V13 de l'application classique.
 *
 * Une gouvernance se remplit rarement écran par écran : les définitions arrivent d'un tableur, les usages
 * d'un inventaire applicatif, le glossaire d'un document Word recopié. Cet import prend un fichier tel qu'il
 * est, laisse dire quelle colonne veut dire quoi, montre ce qui va être écrit, puis fusionne — mise à jour
 * de ce qui existe, création du reste.
 *
 * Trois principes, tenus d'un bout à l'autre :
 *   • **on ne devine pas** : une sensibilité inconnue, un terme absent du glossaire, un nombre de valeurs
 *     illisible sont signalés plutôt qu'enregistrés ; la ligne est ignorée et on dit pourquoi ;
 *   • **on ne détruit pas** : une colonne non associée n'est pas touchée, une valeur identique n'est pas
 *     réécrite, et un renommage ne se fait que s'il est demandé explicitement ;
 *   • **on rend compte** : créés, mis à jour, ignorés, avec le motif de chaque écart et des exemples.
 *
 * Fonctions pures : elles travaillent sur une gouvernance donnée en mémoire, et disent ce qui a changé.
 * L'écran s'occupe de lire le fichier et d'écrire le résultat ; ce fichier-ci n'appelle rien.
 */
import type { Actif, AttributObjetMetier, FicheDictionnaire, ObjetMetier, TermeGlossaire } from '../../coeur/modeles';

/**
 * Ce dont l'import a besoin du reste de l'application, et qu'il ne fabrique pas lui-même : de quoi nommer
 * ce qu'il crée, et de quoi comprendre un nombre de valeurs. Les recevoir plutôt que les chercher garde ce
 * fichier sans attache — c'est ce qui permet de l'éprouver seul.
 */
export type OutilsDeLImport = {
    identifiant: (prefixe: string) => string;
    /** Rend « 1 », « n » ou un nombre ; rend une chaîne vide quand ce qui est écrit ne se comprend pas. */
    comprendreLeNombreDeValeurs: (ecrit: string) => string;
};

/** Un champ importable : sa clé interne, ce qu'on en dit à l'écran, et s'il identifie la ligne. */
export type ChampImportable = { champ: string; libelle: string; cle: boolean };

/** Une cible d'import : ce que l'on veut remplir, et les champs que l'on sait y mettre. */
export type CibleImport = { cle: string; libelle: string; champs: ChampImportable[] };

/** Raccourci d'écriture des champs d'une cible. */
const champ = (cle: string, libelle: string, estCle = false): ChampImportable => ({ champ: cle, libelle, cle: estCle });

/** Les sept cibles de la V13, dans le même ordre et avec les mêmes champs. */
export const CIBLES_IMPORT: CibleImport[] = [
    {
        cle: 'dictionnaire',
        libelle: '📚 Dictionnaire des colonnes',
        champs: [
            champ('table', 'Table (clé)', true),
            champ('col', 'Colonne (clé)', true),
            champ('definition', 'Définition'),
            champ('type', 'Type attendu'),
            champ('sensitivity', 'Sensibilité'),
            champ('term', 'Terme de glossaire')
        ]
    },
    {
        cle: 'glossaire',
        libelle: '📖 Glossaire',
        champs: [
            champ('term', 'Terme (clé)', true),
            champ('definition', 'Définition'),
            champ('domain', 'Domaine métier'),
            champ('owner', 'Responsable')
        ]
    },
    {
        cle: 'actifs',
        libelle: '🖥 Applications & processus',
        champs: [
            champ('name', 'Nom (clé)', true),
            champ('kind', 'Type (application / processus / restitution)'),
            champ('criticality', 'Criticité'),
            champ('description', 'Description'),
            champ('owner', 'Responsable'),
            champ('domain', 'Domaine métier')
        ]
    },
    {
        cle: 'informations',
        libelle: '🏷 Informations des objets métier',
        champs: [
            champ('bo', 'Objet métier (clé)', true),
            champ('attr', 'Information (clé)', true),
            champ('definition', 'Définition'),
            champ('examples', 'Exemples'),
            champ('sensitivity', 'Sensibilité'),
            champ('term', 'Terme de glossaire'),
            champ('owner', 'Propriétaire'),
            champ('multi', 'Nombre de valeurs (1 / n / un nombre)'),
            champ('rename', 'Renommer en')
        ]
    },
    {
        cle: 'usages',
        libelle: '🔌 Usages information ↔ application',
        champs: [champ('bo', 'Objet métier (clé)', true), champ('attr', 'Information (clé)', true), champ('app', 'Application (clé)', true)]
    },
    {
        cle: 'objets',
        libelle: '🏛 Objets métier',
        champs: [
            champ('boname', 'Objet métier (clé)', true),
            champ('definition', 'Définition'),
            champ('owner', 'Propriétaire'),
            champ('domain', 'Domaine métier'),
            champ('attrs', 'Informations (séparées par ;)'),
            champ('srctable', 'Table source maître')
        ]
    },
    {
        cle: 'objets-actifs',
        libelle: '🏛 ↔ 🖥 Applications par objet métier',
        champs: [
            champ('bo', 'Objet métier (clé)', true),
            champ('app', 'Application (clé)', true),
            champ('role', 'Rôle (utilise / produit)')
        ]
    }
];

/** La cible nommée, ou la première : l'écran n'est jamais sans cible. */
export function cibleParCle(cle: string): CibleImport {
    return CIBLES_IMPORT.find(cible => cible.cle === cle) || CIBLES_IMPORT[0];
}

/**
 * Compare deux libellés comme le ferait quelqu'un qui lit : sans accents, sans casse, sans ponctuation ni
 * espaces. « Définition », « definition » et « DEFINITION » sont le même mot.
 */
export function normaliser(texte: unknown): string {
    return String(texte ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

/** Les mots qui, dans un en-tête de fichier, désignent chaque champ. Le premier qui colle gagne. */
const INDICES: Record<string, string[]> = {
    table: ['table', 'source'],
    col: ['colonne', 'col', 'column', 'champ'],
    definition: ['definition', 'description', 'def'],
    type: ['type', 'format'],
    sensitivity: ['sensibilite', 'sensitivity', 'rgpd', 'confidentialite'],
    term: ['terme', 'term', 'glossaire'],
    name: ['nom', 'name', 'application', 'appli', 'processus'],
    kind: ['type', 'kind', 'nature', 'genre'],
    criticality: ['criticite', 'criticality'],
    description: ['description', 'commentaire'],
    bo: ['objetmetier', 'objet', 'bo', 'entite'],
    attr: ['information', 'attribut', 'attr', 'element', 'champ'],
    app: ['application', 'appli', 'app', 'processus', 'systeme'],
    owner: ['responsable', 'proprietaire', 'owner'],
    domain: ['domaine', 'domain'],
    examples: ['exemples', 'examples', 'exemple', 'valeursexemples'],
    multi: ['nombredevaleurs', 'multi', 'multiplicite', 'cardinalite'],
    rename: ['renommeren', 'renommer', 'nouveaunom', 'rename'],
    boname: ['objetmetier', 'objet', 'bo', 'nomobjet', 'nom', 'entite'],
    attrs: ['informations', 'attributs', 'attrs', 'elements', 'champs'],
    srctable: ['tablesourcemaitre', 'tablesource', 'tablemaitre', 'source', 'table'],
    role: ['role', 'sens', 'nature']
};

/** Quelle colonne du fichier va sur quel champ : d'abord l'égalité exacte, puis le simple voisinage. */
export function correspondanceAutomatique(cible: CibleImport, colonnes: string[]): Record<string, string> {
    const correspondance: Record<string, string> = {};
    for (const { champ: nom } of cible.champs) {
        const indices = INDICES[nom] || [nom];
        const exacte = colonnes.find(colonne => indices.some(indice => normaliser(colonne) === normaliser(indice)));
        const voisine = colonnes.find(colonne => indices.some(indice => normaliser(colonne).includes(normaliser(indice))));
        const trouvee = exacte || voisine;
        if (trouvee) correspondance[nom] = trouvee;
    }
    return correspondance;
}

/** La valeur d'un champ dans une ligne du fichier, à travers la correspondance choisie. */
export function valeurDuChamp(ligne: Record<string, string>, correspondance: Record<string, string>, nom: string): string {
    const colonne = correspondance[nom];
    return colonne ? String(ligne[colonne] ?? '').trim() : '';
}

/** Les champs clés qu'aucune colonne n'alimente : sans eux, on ne sait pas de quelle ligne on parle. */
export function clesManquantes(cible: CibleImport, correspondance: Record<string, string>): ChampImportable[] {
    return cible.champs.filter(champDeLaCible => champDeLaCible.cle && !correspondance[champDeLaCible.champ]);
}

// ---- le compte rendu ----

/** Un motif d'écart, et quelques exemples pour le reconnaître dans son fichier. */
export type EcartDImport = { motif: string; nombre: number; exemples: string[] };

/** Ce qu'a donné l'import : ce qui est entré, ce qui a changé, et tout ce qui a été laissé de côté. */
export type BilanImport = { crees: number; misAJour: number; ignores: number; ecarts: EcartDImport[] };

/** Combien d'exemples on garde par motif : assez pour comprendre, pas assez pour noyer. */
const EXEMPLES_PAR_ECART = 5;

/** Le bilan vide, que l'import remplit au fil des lignes. */
export function bilanVide(): BilanImport {
    return { crees: 0, misAJour: 0, ignores: 0, ecarts: [] };
}

/** Note une ligne laissée de côté, avec son motif et de quoi la retrouver. */
export function noterUnEcart(bilan: BilanImport, motif: string, exemple = ''): void {
    bilan.ignores++;
    let ecart = bilan.ecarts.find(candidat => candidat.motif === motif);
    if (!ecart) {
        ecart = { motif, nombre: 0, exemples: [] };
        bilan.ecarts.push(ecart);
    }
    ecart.nombre++;
    const texte = exemple.trim();
    if (texte && ecart.exemples.length < EXEMPLES_PAR_ECART && !ecart.exemples.includes(texte)) ecart.exemples.push(texte);
}

/** Le bilan en une phrase. */
export function phraseDuBilan(bilan: BilanImport): string {
    return `${bilan.crees} créé(s) · ${bilan.misAJour} mis à jour · ${bilan.ignores} ignoré(s).`;
}

/** Les motifs d'écart, du plus fréquent au plus rare : on regarde d'abord ce qui arrive souvent. */
export function ecartsParFrequence(bilan: BilanImport): EcartDImport[] {
    return [...bilan.ecarts].sort((premier, second) => second.nombre - premier.nombre);
}

// ---- la fusion ----

/** La gouvernance telle que l'import la lit et la modifie ; l'écran l'a chargée, et la réécrira. */
export type GouvernanceEnMemoire = {
    dictionnaire: Record<string, FicheDictionnaire>;
    glossaire: TermeGlossaire[];
    actifs: Actif[];
    objets: ObjetMetier[];
};

/** Ce qu'il faudra réécrire, par famille : seulement ce que l'import a touché. */
export type AReecrire = { dictionnaire: string[]; glossaire: string[]; actifs: string[]; objets: string[] };

/** Rien à réécrire, au départ. */
function reecritureVide(): AReecrire {
    return { dictionnaire: [], glossaire: [], actifs: [], objets: [] };
}

/** Retient qu'un élément est à réécrire, une seule fois. */
function aReecrire(liste: string[], identifiant: string): void {
    if (!liste.includes(identifiant)) liste.push(identifiant);
}

/** Écrit une valeur non vide si elle change vraiment ; dit si quelque chose a bougé. */
function ecrireSiChange(cible: Record<string, unknown>, nom: string, valeur: string): boolean {
    if (!valeur || String(cible[nom] ?? '') === valeur) return false;
    cible[nom] = valeur;
    return true;
}

/** Retrouve un élément par son nom, à l'orthographe près (accents, casse, ponctuation). */
function parLeNom<T>(liste: T[], nom: (element: T) => string, recherche: string): T | undefined {
    return liste.find(element => normaliser(nom(element)) === normaliser(recherche));
}

/** Toutes les informations d'un objet : celles du cœur, puis celles de chaque variante. */
function informationsDeLObjet(objet: ObjetMetier): AttributObjetMetier[] {
    const informations: AttributObjetMetier[] = [...(objet.elements || [])];
    for (const variante of objet.structure || []) informations.push(...(variante.elements || []));
    return informations;
}

/** Les sensibilités que l'on sait interpréter ; le reste est signalé plutôt qu'enregistré. */
export const SENSIBILITES_ADMISES = ['Publique', 'Interne', 'Confidentielle', 'Personnelle', 'Sensible'];

/** Le genre d'actif désigné par le mot du fichier : processus, restitution, ou application par défaut. */
export function genreDActif(mot: string): 'app' | 'process' | 'report' {
    if (/proc/i.test(mot)) return 'process';
    if (/restit|rapport|report|tableau/i.test(mot)) return 'report';
    return 'app';
}

/** Le contexte d'une ligne : ce qu'il faut pour l'écrire, et de quoi fabriquer des identifiants. */
export type ContexteImport = {
    gouvernance: GouvernanceEnMemoire;
    outils: OutilsDeLImport;
    bilan: BilanImport;
    reecriture: AReecrire;
};

/** Une ligne du dictionnaire : la définition, le type, la sensibilité et le terme d'une colonne. */
function importerUneColonne(ligne: Record<string, string>, correspondance: Record<string, string>, contexte: ContexteImport): void {
    const table = valeurDuChamp(ligne, correspondance, 'table');
    const colonne = valeurDuChamp(ligne, correspondance, 'col');
    if (!table || !colonne) return noterUnEcart(contexte.bilan, 'Table ou colonne vide dans le fichier');
    const fiche = (contexte.gouvernance.dictionnaire[table] ||= {});
    const colonnes = (fiche.columns ||= {});
    const ancienne = colonnes[colonne];
    const fichier = (colonnes[colonne] ||= {});
    const neuve = !ancienne || (!ancienne.description && !ancienne.term);
    let change = false;
    change = ecrireSiChange(fichier, 'description', valeurDuChamp(ligne, correspondance, 'definition')) || change;
    change = ecrireSiChange(fichier, 'technicalType', valeurDuChamp(ligne, correspondance, 'type')) || change;
    change = ecrireSiChange(fichier, 'sensitivity', valeurDuChamp(ligne, correspondance, 'sensitivity')) || change;
    change = ecrireSiChange(fichier, 'term', valeurDuChamp(ligne, correspondance, 'term')) || change;
    if (!change) return noterUnEcart(contexte.bilan, 'Déjà identique — aucune valeur à changer', `${table}.${colonne}`);
    aReecrire(contexte.reecriture.dictionnaire, table);
    if (neuve) contexte.bilan.crees++;
    else contexte.bilan.misAJour++;
}

/** Une ligne du glossaire : le terme, sa définition, son domaine, son responsable. */
function importerUnTerme(ligne: Record<string, string>, correspondance: Record<string, string>, contexte: ContexteImport): void {
    const terme = valeurDuChamp(ligne, correspondance, 'term');
    if (!terme) return noterUnEcart(contexte.bilan, 'Terme vide dans le fichier');
    let entree = parLeNom(contexte.gouvernance.glossaire, candidat => candidat.term, terme);
    if (!entree) {
        entree = { id: contexte.outils.identifiant('gl_'), term: terme, definition: '' };
        contexte.gouvernance.glossaire.push(entree);
        contexte.bilan.crees++;
    } else contexte.bilan.misAJour++;
    const champs = entree as unknown as Record<string, unknown>;
    ecrireSiChange(champs, 'definition', valeurDuChamp(ligne, correspondance, 'definition'));
    ecrireSiChange(champs, 'domain', valeurDuChamp(ligne, correspondance, 'domain'));
    ecrireSiChange(champs, 'owner', valeurDuChamp(ligne, correspondance, 'owner'));
    aReecrire(contexte.reecriture.glossaire, entree.id);
}

/** Une ligne d'applications et processus : son nom, son genre, sa criticité, son responsable. */
function importerUnActif(ligne: Record<string, string>, correspondance: Record<string, string>, contexte: ContexteImport): void {
    const nom = valeurDuChamp(ligne, correspondance, 'name');
    if (!nom) return noterUnEcart(contexte.bilan, 'Nom vide dans le fichier');
    const genreEcrit = valeurDuChamp(ligne, correspondance, 'kind');
    let actif = parLeNom(contexte.gouvernance.actifs, candidat => candidat.name, nom);
    if (!actif) {
        actif = {
            id: contexte.outils.identifiant('as_'),
            name: nom,
            kind: genreDActif(genreEcrit),
            description: '',
            owner: '',
            domain: '',
            criticality: ''
        } as Actif;
        contexte.gouvernance.actifs.push(actif);
        contexte.bilan.crees++;
    } else contexte.bilan.misAJour++;
    if (genreEcrit) actif.kind = genreDActif(genreEcrit);
    const champs = actif as unknown as Record<string, unknown>;
    ecrireSiChange(champs, 'criticality', valeurDuChamp(ligne, correspondance, 'criticality'));
    ecrireSiChange(champs, 'description', valeurDuChamp(ligne, correspondance, 'description'));
    ecrireSiChange(champs, 'owner', valeurDuChamp(ligne, correspondance, 'owner'));
    ecrireSiChange(champs, 'domain', valeurDuChamp(ligne, correspondance, 'domain'));
    aReecrire(contexte.reecriture.actifs, actif.id);
}

/** Retrouve l'objet nommé, ou note pourquoi la ligne est laissée de côté. */
function objetDeLaLigne(nom: string, contexte: ContexteImport): ObjetMetier | null {
    const objet = parLeNom(contexte.gouvernance.objets, candidat => candidat.name, nom);
    if (objet) return objet;
    noterUnEcart(contexte.bilan, 'Objet métier introuvable — créez-le d’abord (cible « 🏛 Objets métier »)', nom);
    return null;
}

/** Une ligne d'informations : définition, exemples, sensibilité, terme, propriétaire, nombre de valeurs. */
function importerUneInformation(ligne: Record<string, string>, correspondance: Record<string, string>, contexte: ContexteImport): void {
    const nomObjet = valeurDuChamp(ligne, correspondance, 'bo');
    const nomInformation = valeurDuChamp(ligne, correspondance, 'attr');
    if (!nomObjet || !nomInformation) return noterUnEcart(contexte.bilan, 'Objet métier ou information vide dans le fichier');
    const objet = objetDeLaLigne(nomObjet, contexte);
    if (!objet) return;
    const repere = `${nomObjet} · ${nomInformation}`;
    const information = parLeNom(informationsDeLObjet(objet), candidat => candidat.name, nomInformation);
    if (!information) return noterUnEcart(contexte.bilan, 'Information introuvable dans cet objet métier', repere);
    const neuve = !information.definition && !information.examples && !information.sensitivity && !information.term;
    const champs = information as unknown as Record<string, unknown>;
    let change = false;
    change = ecrireSiChange(champs, 'definition', valeurDuChamp(ligne, correspondance, 'definition')) || change;
    change = ecrireSiChange(champs, 'examples', valeurDuChamp(ligne, correspondance, 'examples')) || change;
    change = ecrireSiChange(champs, 'owner', valeurDuChamp(ligne, correspondance, 'owner')) || change;
    // Une sensibilité hors de la liste connue ne serait plus interprétable par personne : on le dit.
    const sensibilite = valeurDuChamp(ligne, correspondance, 'sensitivity');
    if (sensibilite) {
        const admise = SENSIBILITES_ADMISES.find(candidate => normaliser(candidate) === normaliser(sensibilite));
        if (admise) change = ecrireSiChange(champs, 'sensitivity', admise) || change;
        else
            noterUnEcart(
                contexte.bilan,
                `Sensibilité inconnue — valeurs admises : ${SENSIBILITES_ADMISES.join(', ')}`,
                `${repere} → ${sensibilite}`
            );
    }
    // Le terme est écrit en clair dans le fichier ; on le résout vers le glossaire, ou on le signale.
    const terme = valeurDuChamp(ligne, correspondance, 'term');
    if (terme) {
        const connu = parLeNom(contexte.gouvernance.glossaire, candidat => candidat.term, terme);
        if (connu) change = ecrireSiChange(champs, 'term', connu.id) || change;
        else
            noterUnEcart(
                contexte.bilan,
                'Terme de glossaire introuvable — ajoutez-le d’abord (cible « 📖 Glossaire »)',
                `${repere} → ${terme}`
            );
    }
    // Un nombre de valeurs illisible resterait une multiplicité fantôme : on préfère le dire.
    const valeurs = valeurDuChamp(ligne, correspondance, 'multi');
    if (valeurs) {
        const compris = contexte.outils.comprendreLeNombreDeValeurs(valeurs);
        if (compris) change = ecrireSiChange(champs, 'multi', compris) || change;
        else noterUnEcart(contexte.bilan, 'Nombre de valeurs non reconnu — attendu « 1 », « n » ou un nombre', `${repere} → ${valeurs}`);
    }
    // Un renommage ne se fait jamais tout seul : il casserait les rattachements sans prévenir.
    const nouveauNom = valeurDuChamp(ligne, correspondance, 'rename');
    if (nouveauNom && normaliser(nouveauNom) !== normaliser(information.name)) {
        information.name = nouveauNom;
        change = true;
    }
    if (!change) return noterUnEcart(contexte.bilan, 'Déjà identique — aucune valeur à changer', repere);
    aReecrire(contexte.reecriture.objets, objet.id);
    if (neuve) contexte.bilan.crees++;
    else contexte.bilan.misAJour++;
}

/** L'actif nommé ; s'il n'existe pas encore, il est créé — un usage vaut déclaration d'existence. */
function actifDeLaLigne(nom: string, contexte: ContexteImport): Actif {
    const connu = parLeNom(contexte.gouvernance.actifs, candidat => candidat.name, nom);
    if (connu) return connu;
    const actif = {
        id: contexte.outils.identifiant('as_'),
        name: nom,
        kind: 'app',
        description: '',
        owner: '',
        domain: '',
        criticality: ''
    } as Actif;
    contexte.gouvernance.actifs.push(actif);
    aReecrire(contexte.reecriture.actifs, actif.id);
    contexte.bilan.crees++;
    return actif;
}

/** Une ligne d'usages : telle application se sert de telle information de tel objet. */
function importerUnUsage(ligne: Record<string, string>, correspondance: Record<string, string>, contexte: ContexteImport): void {
    const nomObjet = valeurDuChamp(ligne, correspondance, 'bo');
    const nomInformation = valeurDuChamp(ligne, correspondance, 'attr');
    const nomActif = valeurDuChamp(ligne, correspondance, 'app');
    if (!nomObjet || !nomInformation || !nomActif)
        return noterUnEcart(contexte.bilan, 'Clé obligatoire vide (objet métier, information ou application)');
    const objet = objetDeLaLigne(nomObjet, contexte);
    if (!objet) return;
    const repere = `${nomObjet} · ${nomInformation}`;
    const information = parLeNom(informationsDeLObjet(objet), candidat => candidat.name, nomInformation);
    if (!information) return noterUnEcart(contexte.bilan, 'Information introuvable dans cet objet métier', repere);
    const actif = actifDeLaLigne(nomActif, contexte);
    const usages = (information.usedBy ||= []);
    if (usages.includes(actif.id))
        return noterUnEcart(contexte.bilan, 'Usage déjà enregistré (aucun changement)', `${repere} → ${nomActif}`);
    usages.push(actif.id);
    aReecrire(contexte.reecriture.objets, objet.id);
    contexte.bilan.misAJour++;
}

/** Une ligne d'objets métier : son nom, sa définition, son propriétaire, ses informations, sa source maître. */
function importerUnObjet(ligne: Record<string, string>, correspondance: Record<string, string>, contexte: ContexteImport): void {
    const nom = valeurDuChamp(ligne, correspondance, 'boname');
    if (!nom) return noterUnEcart(contexte.bilan, 'Nom d’objet métier vide dans le fichier');
    let objet = parLeNom(contexte.gouvernance.objets, candidat => candidat.name, nom);
    if (!objet) {
        objet = {
            id: contexte.outils.identifiant('bo_'),
            name: nom,
            definition: '',
            domain: '',
            globalOwner: '',
            contributors: [],
            status: 'Brouillon',
            elements: [],
            sources: [],
            producedBy: [],
            consumedBy: [],
            references: []
        };
        contexte.gouvernance.objets.push(objet);
        contexte.bilan.crees++;
    } else contexte.bilan.misAJour++;
    const champs = objet as unknown as Record<string, unknown>;
    ecrireSiChange(champs, 'definition', valeurDuChamp(ligne, correspondance, 'definition'));
    ecrireSiChange(champs, 'globalOwner', valeurDuChamp(ligne, correspondance, 'owner'));
    ecrireSiChange(champs, 'domain', valeurDuChamp(ligne, correspondance, 'domain'));
    for (const nomInformation of listeSeparee(valeurDuChamp(ligne, correspondance, 'attrs')))
        if (!parLeNom(objet.elements, candidat => candidat.name, nomInformation))
            objet.elements.push({
                id: contexte.outils.identifiant('be_'),
                name: nomInformation,
                definition: '',
                owner: '',
                mappings: [],
                usedBy: []
            });
    const table = valeurDuChamp(ligne, correspondance, 'srctable');
    if (table && !objet.sources.some(source => normaliser(source.table) === normaliser(table)))
        objet.sources.push({ table, role: 'maitre' });
    aReecrire(contexte.reecriture.objets, objet.id);
}

/** Une ligne de liens objet ↔ application : qui produit l'objet, qui le consomme. */
function importerUnLienDObjet(ligne: Record<string, string>, correspondance: Record<string, string>, contexte: ContexteImport): void {
    const nomObjet = valeurDuChamp(ligne, correspondance, 'bo');
    const nomActif = valeurDuChamp(ligne, correspondance, 'app');
    if (!nomObjet || !nomActif) return noterUnEcart(contexte.bilan, 'Clé obligatoire vide (objet métier ou application)');
    const objet = objetDeLaLigne(nomObjet, contexte);
    if (!objet) return;
    const actif = actifDeLaLigne(nomActif, contexte);
    const producteur = /produ/i.test(valeurDuChamp(ligne, correspondance, 'role'));
    const liens = producteur ? objet.producedBy : objet.consumedBy;
    if (liens.includes(actif.id))
        return noterUnEcart(contexte.bilan, 'Lien déjà enregistré (aucun changement)', `${nomObjet} → ${nomActif}`);
    liens.push(actif.id);
    aReecrire(contexte.reecriture.objets, objet.id);
    contexte.bilan.misAJour++;
}

/** Ce qu'il faut faire d'une ligne, selon la cible choisie. */
const IMPORTS: Record<string, (ligne: Record<string, string>, correspondance: Record<string, string>, contexte: ContexteImport) => void> = {
    dictionnaire: importerUneColonne,
    glossaire: importerUnTerme,
    actifs: importerUnActif,
    informations: importerUneInformation,
    usages: importerUnUsage,
    objets: importerUnObjet,
    'objets-actifs': importerUnLienDObjet
};

/**
 * Fusionne tout un fichier dans la gouvernance donnée : elle est modifiée sur place, et l'on récupère le
 * bilan de ce qui s'est passé avec la liste de ce qu'il reste à réécrire.
 */
export function appliquerLImport(
    gouvernance: GouvernanceEnMemoire,
    cible: CibleImport,
    lignes: Record<string, string>[],
    correspondance: Record<string, string>,
    outils: OutilsDeLImport
): { bilan: BilanImport; reecriture: AReecrire } {
    const contexte: ContexteImport = { gouvernance, outils, bilan: bilanVide(), reecriture: reecritureVide() };
    const importerUneLigne = IMPORTS[cible.cle];
    if (importerUneLigne) for (const ligne of lignes) importerUneLigne(ligne, correspondance, contexte);
    return { bilan: contexte.bilan, reecriture: contexte.reecriture };
}

/** Découpe une liste écrite dans une seule case : « nom ; prénom ; âge ». */
export function listeSeparee(texte: string): string[] {
    return String(texte || '')
        .split(';')
        .map(morceau => morceau.trim())
        .filter(Boolean);
}
