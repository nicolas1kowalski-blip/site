/**
 * Propositions de modification soumises à validation (circuit contributeur → propriétaire de l'application
 * classique, module 2C). Une proposition vise un élément (objet métier, attribut, terme, actif, fiche ou colonne
 * du dictionnaire) et un champ ; l'accepter applique la valeur proposée, la refuser la laisse sans effet.
 * Dans les deux cas, l'élément visé garde une trace dans son historique.
 *
 * Fonctions pures sur l'état : testables sans base.
 */
import { z } from 'zod';
import { ElementGouvernance, EtatApplication } from './gouvernance.service';

export const GENRES_PROPOSITION = {
    attr: 'attribut d’un objet métier',
    bo: 'objet métier',
    term: 'terme du glossaire',
    asset: 'application ou processus',
    dict: 'fiche du dictionnaire',
    dictcol: 'colonne du dictionnaire'
} as const;
export type GenreProposition = keyof typeof GENRES_PROPOSITION;

export const LIBELLES_CHAMP: Record<string, string> = {
    definition: 'Définition',
    examples: 'Exemples',
    sensitivity: 'Sensibilité',
    owner: 'Propriétaire',
    multi: 'Nombre de valeurs',
    name: 'Nom',
    globalOwner: 'Propriétaire global',
    domain: 'Domaine métier',
    col: 'Colonne',
    description: 'Description',
    steward: 'Référent',
    sourceSystem: 'Système source',
    status: 'Statut',
    term: 'Terme',
    contributors: 'Contributeurs',
    criticality: 'Criticité'
};

export const schemaProposition = z.object({
    kind: z.enum(['attr', 'bo', 'term', 'asset', 'dict', 'dictcol']),
    field: z.string().min(1, 'champ requis'),
    /** Cible : { boId, elId, stId? } | { boId } | { termId } | { assetId } | { tn } | { tn, col }. */
    target: z.record(z.string(), z.string()),
    label: z.string().trim().min(1, 'libellé requis'),
    before: z.string().default(''),
    after: z.string().default(''),
    /** Valeur brute à appliquer quand « after » n'est qu'un affichage (tableau, booléen…). */
    raw: z.unknown().optional(),
    domain: z.string().trim().default('')
});
export type DefinitionProposition = z.infer<typeof schemaProposition>;

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

export class ErreurProposition extends Error {}

function chercher(liste: ElementGouvernance[], id: string | undefined, quoi: string): ElementGouvernance {
    const element = liste.find(candidat => candidat.id === id);
    if (!element) throw new ErreurProposition(`${quoi} introuvable : la proposition ne peut plus être appliquée.`);
    return element;
}

/** Élément (objet, terme, actif, fiche) visé par une proposition, ou null s'il a disparu. */
export function elementVise(etat: EtatApplication, proposition: DefinitionProposition): Record<string, unknown> | null {
    const gouvernance = etat.governance;
    const cible = proposition.target;
    switch (proposition.kind) {
        case 'attr':
        case 'bo':
            return gouvernance.businessObjects.find(candidat => candidat.id === cible['boId']) || null;
        case 'term':
            return gouvernance.glossary.find(candidat => candidat.id === cible['termId']) || null;
        case 'asset':
            return gouvernance.assets.find(candidat => candidat.id === cible['assetId']) || null;
        case 'dict':
        case 'dictcol':
            return gouvernance.dictionary[cible['tn']] || null;
    }
}

/** Attribut visé : dans les attributs de l'objet, ou dans une facette (stId) de sa structure. */
function attributVise(objet: ElementGouvernance, cible: Record<string, string>): Record<string, unknown> {
    const facetteId = cible['stId'];
    let attributs = (objet['elements'] as Record<string, unknown>[]) || [];
    if (facetteId) {
        const facette = ((objet['structure'] as Record<string, unknown>[]) || []).find(candidat => candidat['id'] === facetteId);
        if (!facette) throw new ErreurProposition('Facette introuvable : la proposition ne peut plus être appliquée.');
        attributs = (facette['elements'] as Record<string, unknown>[]) || [];
    }
    const attribut = attributs.find(candidat => candidat['id'] === cible['elId']);
    if (!attribut) throw new ErreurProposition('Attribut introuvable : la proposition ne peut plus être appliquée.');
    return attribut;
}

/** Applique la valeur proposée à l'élément visé (mutation de l'état). */
export function appliquerProposition(etat: EtatApplication, proposition: DefinitionProposition): void {
    const gouvernance = etat.governance;
    const cible = proposition.target;
    const valeur = proposition.raw !== undefined ? proposition.raw : proposition.after;
    switch (proposition.kind) {
        case 'attr':
            attributVise(chercher(gouvernance.businessObjects, cible['boId'], 'Objet métier'), cible)[proposition.field] = valeur;
            return;
        case 'bo':
            chercher(gouvernance.businessObjects, cible['boId'], 'Objet métier')[proposition.field] = valeur;
            return;
        case 'term':
            chercher(gouvernance.glossary, cible['termId'], 'Terme')[proposition.field] = valeur;
            return;
        case 'asset':
            chercher(gouvernance.assets, cible['assetId'], 'Actif')[proposition.field] = valeur;
            return;
        case 'dict': {
            const fiche = (gouvernance.dictionary[cible['tn']] = gouvernance.dictionary[cible['tn']] || {});
            fiche[proposition.field] = valeur;
            return;
        }
        case 'dictcol': {
            const fiche = (gouvernance.dictionary[cible['tn']] = gouvernance.dictionary[cible['tn']] || {});
            const colonnes = (fiche.columns = fiche.columns || {});
            const colonne = (colonnes[cible['col']] = colonnes[cible['col']] || {});
            colonne[proposition.field] = valeur;
            return;
        }
    }
}

/** Ajoute la décision à l'historique de l'élément visé (100 entrées au plus), comme l'application classique. */
export function tracerDecision(etat: EtatApplication, proposition: Proposition, verdict: 'accepted' | 'rejected'): void {
    const element = elementVise(etat, proposition);
    if (!element) return;
    const historique = (element['history'] = Array.isArray(element['history']) ? (element['history'] as unknown[]) : []);
    historique.push({
        at: new Date().toISOString(),
        from: 'Proposé',
        to: verdict === 'accepted' ? 'Validé' : 'Refusé',
        by: proposition.decidedBy || '',
        comment: `${proposition.label} — proposé par ${proposition.byName || proposition.by}${proposition.comment ? ' · ' + proposition.comment : ''}`
    });
    if (historique.length > 100) element['history'] = historique.slice(-100);
}
