/**
 * Carte des flux (lineage) : nœuds (tables, applications, objets métier) et liens (alimente, lit, écrit,
 * compose, diffuse, représente, produit, consommé par) dans governance.flow, au format de l'application classique.
 *
 * Deux idées reprises telles quelles :
 *   • la carte est DÉRIVÉE des données déjà saisies (tables conçues, applications, dictionnaire, objets
 *     métier) par « synchroniserFlux » ; les nœuds et liens dérivés portent derived: true et sont purgés
 *     quand la déclaration disparaît ; les ajouts manuels sont préservés ;
 *   • le RÔLE d'une table est déduit de la topologie : sans alimentation entrante = maître (ou source si une
 *     application la produit), deux alimentations ou plus = référentiel (consolidation), sinon consommateur.
 * Fonctions pures : testables sans base.
 */
import { randomBytes } from 'node:crypto';

export type NoeudFlux = {
    id: string;
    name: string;
    kind?: 'table' | 'app' | 'object';
    tableName?: string;
    assetId?: string;
    boId?: string;
    origine?: string;
    domain?: string;
    derived?: boolean;
    producer?: boolean;
    [champ: string]: unknown;
};
export type PaireAttributs = { id: string; src: string; tgt: string; xform?: { kind: string; fn?: string; op?: string; param?: string } };
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
    [champ: string]: unknown;
};
export type ResultatReconciliation = {
    at: number;
    rows: number;
    missing: number;
    distAny: number;
    rate: number;
    worstRate: number;
    pairs: { src: string; tgt: string; dist: number; rate: number; samples: string[][] }[];
};
export type Flux = {
    nodes: NoeudFlux[];
    edges: LienFlux[];
    threshold: number;
    showObjects: boolean;
    hideSources: boolean;
    grain: 'bo' | 'table';
};

export const RELATIONS_LIEN = {
    feeds: 'Alimente',
    consolidates: 'Consolide',
    transforms: 'Transforme',
    reads: 'Lecture',
    writes: 'Écrit',
    composes: 'Compose',
    diffuses: 'Diffuse',
    represents: 'Représente',
    produces: 'Produit',
    consumes: 'Consommé par'
} as const;
export const ROLES_NOEUD = {
    master: 'Maître',
    source: 'Source',
    reference: 'Référentiel',
    consumer: 'Consommateur',
    app: 'Application',
    object: 'Objet métier'
} as const;
export const NATURES_ALIMENTATION = { recopie: 'Recopie', complement: 'Complément', correction: 'Correction' } as const;
const RELATIONS_OBJET = new Set(['composes', 'diffuses', 'represents', 'produces', 'consumes']);

/** Ce que la synchronisation lit : les données déclarées ailleurs dans l'espace. */
export type ContexteFlux = {
    /** Noms des sources chargées. */
    nomsSources: string[];
    /** Tables conçues : nom et sources contributrices / d'enrichissement. */
    tablesConcues: { name: string; sourcesContributrices: string[] }[];
    /** Système source de chaque table (dictionnaire). */
    systemeSourceDe: (nomTable: string) => string;
    actifs: {
        id: string;
        name: string;
        kind?: string;
        domain?: string;
        sources?: string[];
        tables?: string[];
        columns?: { table: string }[];
    }[];
    objetsMetier: {
        id: string;
        name: string;
        domain?: string;
        appId?: string;
        sources?: { table: string; role: string }[];
        producedBy?: string[];
        consumedBy?: string[];
    }[];
};

const identifiant = (prefixe: string) => prefixe + '_' + randomBytes(5).toString('hex');
const minuscules = (texte: unknown) =>
    String(texte || '')
        .trim()
        .toLowerCase();

/** Garantit la structure du flux (valeurs par défaut de l'application classique). */
export function normaliserFlux(brut: Partial<Flux> | undefined): Flux {
    const flux = (brut || {}) as Partial<Flux>;
    return {
        nodes: Array.isArray(flux.nodes) ? flux.nodes : [],
        edges: Array.isArray(flux.edges) ? flux.edges : [],
        threshold: typeof flux.threshold === 'number' ? flux.threshold : 1.0,
        showObjects: typeof flux.showObjects === 'boolean' ? flux.showObjects : true,
        hideSources: typeof flux.hideSources === 'boolean' ? flux.hideSources : true,
        grain: flux.grain === 'table' ? 'table' : 'bo'
    };
}

export const genreNoeud = (noeud: NoeudFlux | undefined): 'table' | 'app' | 'object' => (noeud && noeud.kind) || 'table';

/** Nature d'un lien : explicite, sinon déduite des nœuds (application en source = écrit, en cible = lit). */
export function relationLien(flux: Flux, lien: LienFlux): string {
    if (lien.rel) return lien.rel;
    const source = flux.nodes.find(noeud => noeud.id === lien.source);
    const cible = flux.nodes.find(noeud => noeud.id === lien.target);
    const sourceApplication = genreNoeud(source) === 'app';
    const cibleApplication = genreNoeud(cible) === 'app';
    if (sourceApplication && !cibleApplication) return 'writes';
    if (cibleApplication && !sourceApplication) return 'reads';
    return 'feeds';
}

/** Alimentations entrantes (feeds seulement) : les lectures et écritures d'applications ne comptent pas. */
function alimentationsEntrantes(flux: Flux, idNoeud: string): number {
    return flux.edges.filter(lien => lien.target === idNoeud && lien.source !== idNoeud && relationLien(flux, lien) === 'feeds').length;
}

/** Application productrice d'une table (lien « écrit » app → table), ou null. */
export function producteurDe(flux: Flux, idNoeud: string): NoeudFlux | null {
    for (const lien of flux.edges)
        if (lien.target === idNoeud && relationLien(flux, lien) === 'writes') {
            const source = flux.nodes.find(noeud => noeud.id === lien.source);
            if (source && genreNoeud(source) === 'app') return source;
        }
    return null;
}

export function roleNoeud(flux: Flux, noeud: NoeudFlux): keyof typeof ROLES_NOEUD {
    const genre = genreNoeud(noeud);
    if (genre === 'app') return 'app';
    if (genre === 'object') return 'object';
    const entrantes = alimentationsEntrantes(flux, noeud.id);
    if (entrantes >= 2) return 'reference';
    if (entrantes === 1) return 'consumer';
    return producteurDe(flux, noeud.id) ? 'source' : 'master';
}

/** Type affiché d'un lien : une alimentation vers une table à deux entrants ou plus est une consolidation. */
export function typeLien(flux: Flux, lien: LienFlux): keyof typeof RELATIONS_LIEN {
    const relation = relationLien(flux, lien);
    if (relation in RELATIONS_LIEN && relation !== 'feeds' && relation !== 'consolidates') return relation as keyof typeof RELATIONS_LIEN;
    const cible = flux.nodes.find(noeud => noeud.id === lien.target);
    return cible && genreNoeud(cible) === 'table' && alimentationsEntrantes(flux, cible.id) >= 2 ? 'consolidates' : 'feeds';
}

/** Compte rendu d'une synchronisation, tel que l'application classique le résume. */
export type BilanSynchronisation = {
    noeudsAjoutes: number;
    liensAjoutes: number;
    originesRenseignees: number;
    liensRetires: number;
    noeudsRetires: number;
};

function lienDerive(source: string, target: string, rel: string, complement: Partial<LienFlux> = {}): LienFlux {
    return {
        id: identifiant('le'),
        source,
        target,
        type: 'feeds',
        rel,
        srcKey: '',
        tgtKey: '',
        attrPairs: [],
        slaHours: 24,
        transformation: '',
        lastRun: null,
        derived: true,
        ...complement
    };
}

/** Aides de synchronisation : trouver ou créer les nœuds de table, d'application et d'objet. */
class Synchronisation {
    readonly bilan: BilanSynchronisation = { noeudsAjoutes: 0, liensAjoutes: 0, originesRenseignees: 0, liensRetires: 0, noeudsRetires: 0 };
    /** Usages « lit »/« écrit » souhaités (rel:idApplication:idTable) : les liens dérivés absents de cette liste sont purgés. */
    readonly usagesSouhaites = new Set<string>();
    /** Liens d'objet souhaités (rel:source:cible). */
    readonly liensObjetSouhaites = new Set<string>();

    constructor(
        readonly flux: Flux,
        readonly contexte: ContexteFlux
    ) {}

    noeudDeTable(nomTable: string): NoeudFlux {
        let noeud =
            this.flux.nodes.find(candidat => candidat.tableName === nomTable) ||
            this.flux.nodes.find(candidat => !candidat.tableName && minuscules(candidat.name) === minuscules(nomTable));
        if (!noeud) {
            noeud = { id: identifiant('ln'), name: nomTable, origine: '', domain: '', tableName: nomTable, derived: true };
            this.flux.nodes.push(noeud);
            this.bilan.noeudsAjoutes++;
        }
        if (!noeud.tableName) noeud.tableName = nomTable;
        if (!noeud.origine) {
            const systeme = this.contexte.systemeSourceDe(nomTable);
            if (systeme) {
                noeud.origine = systeme;
                this.bilan.originesRenseignees++;
            }
        }
        return noeud;
    }

    noeudDApplication(actif: { id: string; name: string; domain?: string }): NoeudFlux {
        let noeud =
            this.flux.nodes.find(candidat => candidat.assetId === actif.id) ||
            this.flux.nodes.find(candidat => genreNoeud(candidat) === 'app' && minuscules(candidat.name) === minuscules(actif.name));
        if (!noeud) {
            noeud = { id: identifiant('ln'), name: actif.name, kind: 'app', assetId: actif.id, domain: actif.domain || '', derived: true };
            this.flux.nodes.push(noeud);
            this.bilan.noeudsAjoutes++;
        }
        noeud.kind = 'app';
        if (!noeud.assetId) noeud.assetId = actif.id;
        return noeud;
    }

    /** L'origine (système amont) d'un fichier devient un nœud application producteur, relié à l'actif homonyme s'il existe. */
    noeudDOrigine(origine: string): NoeudFlux {
        const actif = this.contexte.actifs.find(candidat => minuscules(candidat.name) === minuscules(origine));
        let noeud =
            (actif && this.flux.nodes.find(candidat => candidat.assetId === actif.id)) ||
            this.flux.nodes.find(candidat => genreNoeud(candidat) === 'app' && minuscules(candidat.name) === minuscules(origine));
        if (!noeud) {
            noeud = { id: identifiant('ln'), name: origine, kind: 'app', assetId: actif?.id, producer: true, derived: true };
            this.flux.nodes.push(noeud);
            this.bilan.noeudsAjoutes++;
        } else {
            noeud.kind = 'app';
            noeud.producer = true;
            if (actif && !noeud.assetId) noeud.assetId = actif.id;
        }
        return noeud;
    }

    noeudDObjet(objet: { id: string; name: string; domain?: string }): NoeudFlux {
        let noeud =
            this.flux.nodes.find(candidat => candidat.boId === objet.id) ||
            this.flux.nodes.find(candidat => genreNoeud(candidat) === 'object' && minuscules(candidat.name) === minuscules(objet.name));
        if (!noeud) {
            noeud = {
                id: identifiant('ln'),
                name: objet.name || 'Objet',
                kind: 'object',
                boId: objet.id,
                domain: objet.domain || '',
                derived: true
            };
            this.flux.nodes.push(noeud);
            this.bilan.noeudsAjoutes++;
        }
        noeud.kind = 'object';
        if (!noeud.boId) noeud.boId = objet.id;
        return noeud;
    }

    /** Ajoute un lien s'il n'existe pas déjà entre ces deux nœuds (un lien existant est préservé tel quel). */
    assurerLien(source: NoeudFlux, cible: NoeudFlux, rel: string, complement: Partial<LienFlux> = {}, memeRelation = false): void {
        if (source.id === cible.id) return;
        const existe = this.flux.edges.some(
            lien => lien.source === source.id && lien.target === cible.id && (!memeRelation || relationLien(this.flux, lien) === rel)
        );
        if (existe) return;
        this.flux.edges.push(lienDerive(source.id, cible.id, rel, complement));
        this.bilan.liensAjoutes++;
    }
}

/** Alimentations table → table : les sources d'une table conçue l'alimentent. */
function synchroniserTablesConcues(synchronisation: Synchronisation): void {
    for (const table of synchronisation.contexte.tablesConcues)
        for (const nomSource of new Set(table.sourcesContributrices)) {
            if (!synchronisation.contexte.nomsSources.includes(nomSource)) continue;
            synchronisation.assurerLien(synchronisation.noeudDeTable(nomSource), synchronisation.noeudDeTable(table.name), 'feeds');
        }
}

/** Couche application : « lit » = tables et colonnes utilisées ; « écrit » = tables produites ou dont l'actif est le système source. */
function synchroniserApplications(synchronisation: Synchronisation): void {
    const { contexte } = synchronisation;
    for (const actif of contexte.actifs) {
        const lectures = new Set([...(actif.tables || []), ...(actif.columns || []).map(colonne => colonne.table).filter(Boolean)]);
        const ecritures = new Set(
            [
                ...(actif.sources || []),
                ...contexte.nomsSources.filter(nom => minuscules(contexte.systemeSourceDe(nom)) === minuscules(actif.name))
            ].filter(nom => contexte.nomsSources.includes(nom))
        );
        if (!lectures.size && !ecritures.size) continue;
        const application = synchronisation.noeudDApplication(actif);
        for (const nomTable of lectures) {
            if (!contexte.nomsSources.includes(nomTable)) continue;
            const table = synchronisation.noeudDeTable(nomTable);
            synchronisation.usagesSouhaites.add('reads:' + application.id + ':' + table.id);
            synchronisation.assurerLien(table, application, 'reads');
        }
        for (const nomTable of ecritures) {
            const table = synchronisation.noeudDeTable(nomTable);
            synchronisation.usagesSouhaites.add('writes:' + application.id + ':' + table.id);
            synchronisation.assurerLien(application, table, 'writes');
        }
    }
    // Producteur = maître : l'origine d'un fichier est l'application qui l'écrit.
    for (const noeudTable of synchronisation.flux.nodes
        .filter(noeud => genreNoeud(noeud) !== 'app' && noeud.origine && noeud.tableName)
        .slice()) {
        const producteur = synchronisation.noeudDOrigine(String(noeudTable.origine));
        if (producteur.id === noeudTable.id) continue;
        synchronisation.usagesSouhaites.add('writes:' + producteur.id + ':' + noeudTable.id);
        synchronisation.assurerLien(producteur, noeudTable, 'writes', { produced: true });
    }
}

/** Objets métier : leurs sources les composent (ou les diffusent), leur application les représente, leurs actifs les produisent ou les consomment. */
function synchroniserObjetsMetier(synchronisation: Synchronisation): void {
    const { contexte, flux } = synchronisation;
    if (!flux.showObjects) return;
    for (const objet of contexte.objetsMetier) {
        const noeudObjet = synchronisation.noeudDObjet(objet);
        for (const source of objet.sources || []) {
            if (!source?.table || !contexte.nomsSources.includes(source.table)) continue;
            const noeudTable = synchronisation.noeudDeTable(source.table);
            if (source.role === 'destinataire') {
                synchronisation.liensObjetSouhaites.add('diffuses:' + noeudObjet.id + ':' + noeudTable.id);
                synchronisation.assurerLien(noeudObjet, noeudTable, 'diffuses');
            } else {
                synchronisation.liensObjetSouhaites.add('composes:' + noeudTable.id + ':' + noeudObjet.id);
                synchronisation.assurerLien(noeudTable, noeudObjet, 'composes');
            }
        }
        const representant = objet.appId ? contexte.actifs.find(actif => actif.id === objet.appId) : undefined;
        if (representant) {
            const application = synchronisation.noeudDApplication(representant);
            synchronisation.liensObjetSouhaites.add('represents:' + application.id + ':' + noeudObjet.id);
            synchronisation.assurerLien(application, noeudObjet, 'represents', {}, true);
        }
        for (const [liste, rel] of [
            [objet.producedBy || [], 'produces'],
            [objet.consumedBy || [], 'consumes']
        ] as [string[], string][])
            for (const idActif of liste) {
                const actif = contexte.actifs.find(candidat => candidat.id === idActif);
                if (!actif) continue;
                const application = synchronisation.noeudDApplication(actif);
                const [source, cible] = rel === 'produces' ? [application, noeudObjet] : [noeudObjet, application];
                synchronisation.liensObjetSouhaites.add(rel + ':' + source.id + ':' + cible.id);
                synchronisation.assurerLien(source, cible, rel, {}, true);
            }
    }
}

/** Purge des liens dérivés obsolètes et des nœuds application / objet dérivés devenus orphelins. */
function purger(synchronisation: Synchronisation): void {
    const { flux } = synchronisation;
    const noeud = (id: string) => flux.nodes.find(candidat => candidat.id === id);
    flux.edges = flux.edges.filter(lien => {
        if (!lien.derived) return true;
        const rel = relationLien(flux, lien);
        if (RELATIONS_OBJET.has(rel)) {
            if (flux.showObjects && synchronisation.liensObjetSouhaites.has(rel + ':' + lien.source + ':' + lien.target)) return true;
            synchronisation.bilan.liensRetires++;
            return false;
        }
        if (rel !== 'reads' && rel !== 'writes') return true;
        const application = noeud(rel === 'writes' ? lien.source : lien.target);
        const table = noeud(rel === 'writes' ? lien.target : lien.source);
        if (!application || genreNoeud(application) !== 'app' || !(application.assetId || application.producer) || !table) return true;
        if (synchronisation.usagesSouhaites.has(rel + ':' + application.id + ':' + table.id)) return true;
        synchronisation.bilan.liensRetires++;
        return false;
    });
    flux.nodes = flux.nodes.filter(candidat => {
        const genre = genreNoeud(candidat);
        if (!candidat.derived || (genre !== 'app' && genre !== 'object')) return true;
        if (genre === 'object' && !flux.showObjects) {
            synchronisation.bilan.noeudsRetires++;
            return false;
        }
        if (flux.edges.some(lien => lien.source === candidat.id || lien.target === candidat.id)) return true;
        synchronisation.bilan.noeudsRetires++;
        return false;
    });
}

/** Synchronise la carte depuis les données (mutation du flux) ; renvoie le bilan. */
export function synchroniserFlux(flux: Flux, contexte: ContexteFlux): BilanSynchronisation {
    if (flux.grain === 'bo' && !flux.showObjects) flux.showObjects = true;
    const synchronisation = new Synchronisation(flux, contexte);
    synchroniserTablesConcues(synchronisation);
    synchroniserApplications(synchronisation);
    synchroniserObjetsMetier(synchronisation);
    purger(synchronisation);
    return synchronisation.bilan;
}

export type ControleModele = { severite: 'error' | 'warn'; categorie: string; message: string };

/** Cohérence du modèle : la maîtrise se calcule d'une seule façon et les contradictions sont signalées. */
export function controlerModele(flux: Flux, contexte: ContexteFlux): ControleModele[] {
    const controles: ControleModele[] = [];
    const noeud = (id: string) => flux.nodes.find(candidat => candidat.id === id);
    for (const table of flux.nodes.filter(candidat => genreNoeud(candidat) === 'table')) {
        const proprietaires = [
            ...new Set(
                flux.edges.filter(lien => lien.target === table.id && relationLien(flux, lien) === 'writes').map(lien => lien.source)
            )
        ]
            .map(noeud)
            .filter(candidat => candidat && genreNoeud(candidat) === 'app') as NoeudFlux[];
        if (proprietaires.length >= 2)
            controles.push({
                severite: 'error',
                categorie: 'proprietaire',
                message: `${table.name} a ${proprietaires.length} applications propriétaires (${proprietaires.map(candidat => candidat.name).join(', ')}) — une table appartient à une seule application.`
            });
        if (
            table.tableName &&
            !producteurDe(flux, table.id) &&
            flux.edges.some(lien => lien.source === table.id && relationLien(flux, lien) === 'feeds')
        )
            controles.push({
                severite: 'warn',
                categorie: 'proprietaire',
                message: `${table.name} alimente d'autres tables mais n'a pas d'application propriétaire — renseignez son système source (dictionnaire) ou son origine.`
            });
    }
    for (const objet of contexte.objetsMetier) {
        const maitres = (objet.sources || []).filter(source => source.role === 'maitre');
        if (maitres.length >= 2)
            controles.push({
                severite: 'error',
                categorie: 'maitrise',
                message: `Objet ${objet.name} : ${maitres.length} sources « maître » (${maitres.map(source => source.table).join(', ')}).`
            });
        if ((objet.sources || []).length && !maitres.length)
            controles.push({ severite: 'warn', categorie: 'objet', message: `Objet ${objet.name} : aucune source « maître » désignée.` });
        for (const source of objet.sources || []) {
            const possedee =
                contexte.actifs.some(actif => (actif.sources || []).includes(source.table)) || !!contexte.systemeSourceDe(source.table);
            if (contexte.nomsSources.includes(source.table) && !possedee)
                controles.push({
                    severite: 'warn',
                    categorie: 'application',
                    message: `Objet ${objet.name} : la source ${source.table} n'appartient à aucune application — rattachez-la à son application (c'est elle le maître, pas le fichier).`
                });
        }
    }
    return controles;
}

// ---- fraîcheur et santé ----

/** Fréquence de mise à jour (texte libre du dictionnaire) → âge maximal toléré, en jours ; null si inconnue. */
export function joursMaximum(frequence: string | undefined): number | null {
    // « Mise à jour hebdomadaire » contient « jour » : on retire l'expression « mise à jour » avant de lire la fréquence.
    const texte = String(frequence || '')
        .toLowerCase()
        .replace(/mise?s?\s+[àa]\s+jour/g, ' ');
    if (/temps\s?r|réel|reel|continu/.test(texte)) return 0.2;
    if (/heure|hour|horaire/.test(texte)) return 0.5;
    if (/quotid|jour|daily|journ|nuit/.test(texte)) return 1.5;
    if (/hebdo|semain|week/.test(texte)) return 8;
    if (/mensuel|mois|month/.test(texte)) return 33;
    if (/trimestr|quarter/.test(texte)) return 95;
    if (/annuel|an\b|year/.test(texte)) return 370;
    return null;
}

export type Fraicheur = {
    status: 'ok' | 'warn' | 'bad' | 'none';
    ageJours?: number;
    joursMaximum?: number | null;
    frequence?: string;
    source?: 'lien' | 'dictionnaire';
    herite?: boolean;
};

/** Fraîcheur d'une table : âge du dernier chargement jugé contre la fréquence attendue (80 % = avertissement). */
export function fraicheurTable(dernierChargement: number | null, frequence: string | undefined, maintenant = Date.now()): Fraicheur {
    const maximum = joursMaximum(frequence);
    if (!dernierChargement) return { status: 'none', joursMaximum: maximum, frequence };
    const ageJours = (maintenant - dernierChargement) / 864e5;
    if (maximum == null) return { status: 'none', ageJours, frequence };
    return {
        status: ageJours > maximum ? 'bad' : ageJours > 0.8 * maximum ? 'warn' : 'ok',
        ageJours,
        joursMaximum: maximum,
        frequence,
        source: 'dictionnaire'
    };
}

/** Fraîcheur d'une alimentation : jugée contre le SLA du lien (heures) s'il est déclaré, sinon contre le dictionnaire. */
export function fraicheurLien(
    lien: LienFlux,
    dernierChargementCible: number | null,
    frequenceCible: string | undefined,
    maintenant = Date.now()
): Fraicheur {
    const sla = lien.slaHours != null && Number.isFinite(Number(lien.slaHours)) && Number(lien.slaHours) > 0 ? Number(lien.slaHours) : null;
    if (sla != null && dernierChargementCible) {
        const ageJours = (maintenant - dernierChargementCible) / 864e5;
        const slaJours = sla / 24;
        return {
            status: ageJours > slaJours ? 'bad' : ageJours > 0.8 * slaJours ? 'warn' : 'ok',
            ageJours,
            joursMaximum: slaJours,
            source: 'lien'
        };
    }
    return fraicheurTable(dernierChargementCible, frequenceCible, maintenant);
}

const RANG = { none: 0, ok: 1, warn: 2, bad: 3 };

/** Distorsion d'un lien d'après sa dernière réconciliation, jugée contre le seuil (%) de la carte. */
export function statutDistorsion(lien: LienFlux, seuil: number): Fraicheur['status'] {
    if (!lien.lastRun || lien.lastRun.rate == null) return 'none';
    if (lien.lastRun.rate > seuil) return 'bad';
    if (lien.lastRun.rate > 0.8 * seuil) return 'warn';
    return 'ok';
}

/** Santé d'un lien : le pire de la fraîcheur et de la distorsion ; sans mesure, présumé sain. */
export function santeLien(fraicheur: Fraicheur['status'], distorsion: Fraicheur['status']): 'ok' | 'warn' | 'bad' {
    const pire = RANG[fraicheur] >= RANG[distorsion] ? fraicheur : distorsion;
    return pire === 'none' ? 'ok' : pire;
}
