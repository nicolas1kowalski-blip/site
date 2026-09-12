/**
 * Types partagés par le front : ce que l'API renvoie (voir api/src). Les noms de champs sont ceux de l'API.
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
