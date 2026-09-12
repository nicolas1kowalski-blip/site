/**
 * Service de lineage : la carte des flux (governance.flow) enrichie des rôles, de la fraîcheur et de la santé ;
 * la synchronisation depuis les données ; la réconciliation d'une alimentation dans DuckDB ; le parcours d'un
 * attribut d'objet métier (applications sources → colonnes → attribut → consommateurs) ; l'amont et l'aval
 * d'une table.
 */
import { Injectable } from '@nestjs/common';
import { EspaceAvecRole } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { erreurIntrouvable, erreurRequete } from '../commun/erreurs';
import { EspacesService } from '../espaces/espaces.service';
import { EtatApplication, GouvernanceService } from '../gouvernance/gouvernance.service';
import { nombre } from '../qualite/profilage';
import { DocumentSource, SourcesService } from '../sources/sources.service';
import {
    BilanSynchronisation,
    ContexteFlux,
    ControleModele,
    Flux,
    Fraicheur,
    LienFlux,
    NoeudFlux,
    ResultatReconciliation,
    controlerModele,
    fraicheurLien,
    fraicheurTable,
    genreNoeud,
    normaliserFlux,
    roleNoeud,
    santeLien,
    statutDistorsion,
    synchroniserFlux,
    typeLien
} from './flux';
import { sqlReconciliation } from './reconciliation';

export type NoeudEnrichi = NoeudFlux & { role: string; fraicheur: Fraicheur };
export type LienEnrichi = LienFlux & { type: string; fraicheur: Fraicheur; distorsion: string; sante: 'ok' | 'warn' | 'bad' };
export type CarteFlux = { flux: Flux; noeuds: NoeudEnrichi[]; liens: LienEnrichi[]; controles: ControleModele[] };

/** Graphe simple (nœuds et liens libellés) pour les vues « parcours » et « table ». */
export type NoeudGraphe = {
    id: string;
    titre: string;
    detail?: string;
    genre: 'app' | 'table' | 'colonne' | 'attribut' | 'objet' | 'alerte';
};
export type LienGraphe = { source: string; target: string; libelle?: string };
export type Graphe = { noeuds: NoeudGraphe[]; liens: LienGraphe[] };

type Attribut = { id: string; name: string; mappings?: { table: string; col: string }[]; usedBy?: string[]; sourceApp?: string };
type ObjetMetier = {
    id: string;
    name: string;
    domain?: string;
    appId?: string;
    sources?: { table: string; role: string }[];
    producedBy?: string[];
    consumedBy?: string[];
    elements?: Attribut[];
};
type Actif = {
    id: string;
    name: string;
    kind?: string;
    domain?: string;
    sources?: string[];
    tables?: string[];
    columns?: { table: string }[];
};

@Injectable()
export class LineageService {
    constructor(
        private readonly gouvernance: GouvernanceService,
        private readonly sources: SourcesService,
        private readonly espaces: EspacesService
    ) {}

    /** Carte complète : flux brut + nœuds et liens enrichis + contrôles de cohérence. */
    async carte(espaceId: string): Promise<CarteFlux> {
        const [etat, sources] = await Promise.all([this.gouvernance.etat(espaceId), this.sources.lister(espaceId)]);
        const flux = this.fluxDe(etat);
        const contexte = this.contexte(etat, sources);
        const dernierChargement = (noeud: NoeudFlux | undefined) => {
            const source = noeud?.tableName ? sources.find(candidat => candidat.name === noeud.tableName) : undefined;
            if (!source) return null;
            const horodatage = Number(source.srcModified) || Date.parse(String(source.enregistreLe || ''));
            return Number.isFinite(horodatage) && horodatage > 0 ? horodatage : null;
        };
        const frequence = (noeud: NoeudFlux | undefined) =>
            (noeud?.tableName ? etat.governance.dictionary[noeud.tableName]?.['updateFrequency'] : undefined) as string | undefined;
        const fraicheurNoeud = (noeud: NoeudFlux): Fraicheur => {
            if (genreNoeud(noeud) !== 'app') return fraicheurTable(dernierChargement(noeud), frequence(noeud));
            // Application : fraîcheur héritée = la pire des tables qu'elle lit.
            let pire: Fraicheur = { status: 'none' };
            const rangs = { none: 0, ok: 1, warn: 2, bad: 3 };
            for (const lien of flux.edges.filter(candidat => candidat.target === noeud.id && candidat.rel === 'reads')) {
                const table = flux.nodes.find(candidat => candidat.id === lien.source);
                const fraicheur = table ? fraicheurTable(dernierChargement(table), frequence(table)) : { status: 'none' as const };
                if (rangs[fraicheur.status] > rangs[pire.status]) pire = { ...fraicheur, herite: true };
            }
            return pire;
        };
        const noeuds = flux.nodes.map(noeud => ({ ...noeud, role: roleNoeud(flux, noeud), fraicheur: fraicheurNoeud(noeud) }));
        const liens = flux.edges.map(lien => {
            const cible = flux.nodes.find(candidat => candidat.id === lien.target);
            const fraicheur = fraicheurLien(lien, dernierChargement(cible), frequence(cible));
            const distorsion = statutDistorsion(lien, flux.threshold);
            return { ...lien, type: typeLien(flux, lien), fraicheur, distorsion, sante: santeLien(fraicheur.status, distorsion) };
        });
        return { flux, noeuds, liens, controles: controlerModele(flux, contexte) };
    }

    async synchroniser(espace: EspaceAvecRole, utilisateur: Utilisateur): Promise<BilanSynchronisation> {
        const [etat, sources] = await Promise.all([this.gouvernance.etat(espace.id), this.sources.lister(espace.id)]);
        const flux = this.fluxDe(etat);
        const contexte = this.contexte(etat, sources);
        if (!contexte.tablesConcues.length && !contexte.actifs.length && !contexte.objetsMetier.length)
            throw erreurRequete(
                'Rien à dériver : concevez une table, déclarez des applications ou des objets métier, ou construisez le flux à la main.'
            );
        const bilan = synchroniserFlux(flux, contexte);
        await this.gouvernance.enregistrer(
            espace,
            utilisateur,
            etat,
            'lineage.synchronisation',
            `${bilan.noeudsAjoutes} nœud(s), ${bilan.liensAjoutes} lien(s)`
        );
        return bilan;
    }

    async definirOptions(
        espace: EspaceAvecRole,
        utilisateur: Utilisateur,
        options: Partial<Pick<Flux, 'threshold' | 'showObjects' | 'hideSources' | 'grain'>>
    ): Promise<Flux> {
        const etat = await this.gouvernance.etat(espace.id);
        const flux = this.fluxDe(etat);
        Object.assign(flux, options);
        await this.gouvernance.enregistrer(espace, utilisateur, etat, 'lineage.options', JSON.stringify(options));
        return flux;
    }

    async ecrireNoeud(espace: EspaceAvecRole, utilisateur: Utilisateur, id: string, corps: Partial<NoeudFlux>): Promise<NoeudFlux> {
        const etat = await this.gouvernance.etat(espace.id);
        const flux = this.fluxDe(etat);
        const position = flux.nodes.findIndex(candidat => candidat.id === id);
        const noeud: NoeudFlux = {
            ...(position >= 0 ? flux.nodes[position] : { derived: false }),
            ...corps,
            id,
            name: String(corps.name || flux.nodes[position]?.name || '')
        };
        if (!noeud.name.trim()) throw erreurRequete('Nom de nœud requis.');
        if (position >= 0) flux.nodes[position] = noeud;
        else flux.nodes.push(noeud);
        await this.gouvernance.enregistrer(espace, utilisateur, etat, 'lineage.noeud', noeud.name);
        return noeud;
    }

    async supprimerNoeud(espace: EspaceAvecRole, utilisateur: Utilisateur, id: string): Promise<void> {
        const etat = await this.gouvernance.etat(espace.id);
        const flux = this.fluxDe(etat);
        const noeud = flux.nodes.find(candidat => candidat.id === id);
        if (!noeud) throw erreurIntrouvable('Nœud inconnu.');
        flux.nodes = flux.nodes.filter(candidat => candidat.id !== id);
        flux.edges = flux.edges.filter(lien => lien.source !== id && lien.target !== id);
        await this.gouvernance.enregistrer(espace, utilisateur, etat, 'lineage.noeud.suppression', noeud.name);
    }

    async ecrireLien(espace: EspaceAvecRole, utilisateur: Utilisateur, id: string, corps: Partial<LienFlux>): Promise<LienFlux> {
        const etat = await this.gouvernance.etat(espace.id);
        const flux = this.fluxDe(etat);
        const position = flux.edges.findIndex(candidat => candidat.id === id);
        const existant = position >= 0 ? flux.edges[position] : undefined;
        const lien: LienFlux = {
            attrPairs: [],
            slaHours: 24,
            transformation: '',
            lastRun: null,
            ...(existant || { derived: false }),
            ...corps,
            id,
            source: String(corps.source ?? existant?.source ?? ''),
            target: String(corps.target ?? existant?.target ?? '')
        };
        if (!lien.source || !lien.target || lien.source === lien.target) throw erreurRequete('Un lien relie deux nœuds distincts.');
        if (!flux.nodes.some(candidat => candidat.id === lien.source) || !flux.nodes.some(candidat => candidat.id === lien.target))
            throw erreurRequete('Nœud source ou cible inconnu.');
        if (position >= 0) flux.edges[position] = lien;
        else flux.edges.push(lien);
        await this.gouvernance.enregistrer(espace, utilisateur, etat, 'lineage.lien', `${lien.source} → ${lien.target}`);
        return lien;
    }

    async supprimerLien(espace: EspaceAvecRole, utilisateur: Utilisateur, id: string): Promise<void> {
        const etat = await this.gouvernance.etat(espace.id);
        const flux = this.fluxDe(etat);
        if (!flux.edges.some(candidat => candidat.id === id)) throw erreurIntrouvable('Lien inconnu.');
        flux.edges = flux.edges.filter(candidat => candidat.id !== id);
        await this.gouvernance.enregistrer(espace, utilisateur, etat, 'lineage.lien.suppression', id);
    }

    /** Réconcilie une alimentation : compare, clé par clé, les attributs contrôlés entre la source et la cible. */
    async reconcilier(espace: EspaceAvecRole, utilisateur: Utilisateur, idLien: string): Promise<ResultatReconciliation> {
        const [etat, sources] = await Promise.all([this.gouvernance.etat(espace.id), this.sources.lister(espace.id)]);
        const flux = this.fluxDe(etat);
        const lien = flux.edges.find(candidat => candidat.id === idLien);
        if (!lien) throw erreurIntrouvable('Lien inconnu.');
        const sourceDe = (idNoeud: string) => {
            const noeud = flux.nodes.find(candidat => candidat.id === idNoeud);
            return noeud?.tableName ? sources.find(candidat => candidat.name === noeud.tableName) : undefined;
        };
        const tableSource = sourceDe(lien.source);
        const tableCible = sourceDe(lien.target);
        if (!tableSource || !tableCible) throw erreurRequete('Reliez la source et la cible à des sources chargées.');
        if (!lien.srcKey || !lien.tgtKey) throw erreurRequete('Renseignez la clé (source et cible).');
        if (!(tableSource.headers || []).includes(lien.srcKey))
            throw erreurRequete(`La colonne clé source « ${lien.srcKey} » est absente de « ${tableSource.name} ».`);
        if (!(tableCible.headers || []).includes(lien.tgtKey))
            throw erreurRequete(`La colonne clé cible « ${lien.tgtKey} » est absente de « ${tableCible.name} ».`);
        const paires = (lien.attrPairs || []).filter(
            paire =>
                paire.src && paire.tgt && (tableSource.headers || []).includes(paire.src) && (tableCible.headers || []).includes(paire.tgt)
        );
        if (!paires.length) throw erreurRequete('Ajoutez au moins un attribut contrôlé (colonnes présentes des deux côtés).');
        const resultat = await this.executerReconciliation('t_' + tableSource.id, 't_' + tableCible.id, lien, paires, espace);
        lien.lastRun = resultat;
        await this.gouvernance.enregistrer(espace, utilisateur, etat, 'lineage.reconciliation', `${tableSource.name} → ${tableCible.name}`);
        return resultat;
    }

    private async executerReconciliation(
        nomTableSource: string,
        nomTableCible: string,
        lien: LienFlux,
        paires: NonNullable<LienFlux['attrPairs']>,
        espace: EspaceAvecRole
    ): Promise<ResultatReconciliation> {
        const requetes = sqlReconciliation(nomTableSource, nomTableCible, lien.srcKey!, lien.tgtKey!, paires);
        const { moteur } = await this.espaces.ressources(espace);
        const [synthese, manquants] = await Promise.all([moteur.executer(requetes.synthese), moteur.executer(requetes.manquants)]);
        const ligne = synthese.lignes[0];
        const lignes = nombre(ligne[0]);
        const ecartsToutesPaires = nombre(ligne[ligne.length - 1]);
        const resultats: ResultatReconciliation['pairs'] = [];
        for (let position = 0; position < paires.length; position++) {
            const ecarts = nombre(ligne[1 + position]);
            const exemples = ecarts > 0 ? (await moteur.executer(requetes.exemples(position))).lignes : [];
            resultats.push({
                src: paires[position].src,
                tgt: paires[position].tgt,
                dist: ecarts,
                rate: lignes ? (100 * ecarts) / lignes : 0,
                samples: exemples.map(exemple => exemple.map(valeur => (valeur == null ? '(vide)' : String(valeur))))
            });
        }
        return {
            at: Date.now(),
            rows: lignes,
            missing: nombre(manquants.lignes[0][0]),
            distAny: ecartsToutesPaires,
            rate: lignes ? (100 * ecartsToutesPaires) / lignes : 0,
            worstRate: resultats.reduce((maximum, resultat) => Math.max(maximum, resultat.rate), 0),
            pairs: resultats
        };
    }

    /** Parcours d'un attribut : applications sources → colonnes techniques → attribut → consommateurs. */
    async parcoursAttribut(espaceId: string, boId: string, elId: string): Promise<Graphe> {
        const etat = await this.gouvernance.etat(espaceId);
        const objet = (etat.governance.businessObjects as unknown as ObjetMetier[]).find(candidat => candidat.id === boId);
        const attribut = objet?.elements?.find(candidat => candidat.id === elId);
        if (!objet || !attribut) throw erreurIntrouvable('Attribut inconnu.');
        const actifs = etat.governance.assets as unknown as Actif[];
        const graphe: Graphe = { noeuds: [], liens: [] };
        const idAttribut = 'attr:' + attribut.id;
        graphe.noeuds.push({ id: idAttribut, titre: attribut.name, detail: objet.name, genre: 'attribut' });
        this.ajouterAmontAttribut(graphe, idAttribut, objet, attribut, actifs, etat);
        this.ajouterAvalAttribut(graphe, idAttribut, attribut, actifs);
        return graphe;
    }

    /** Amont : une colonne technique par correspondance, produite par l'application propriétaire de sa table. */
    private ajouterAmontAttribut(
        graphe: Graphe,
        idAttribut: string,
        objet: ObjetMetier,
        attribut: Attribut,
        actifs: Actif[],
        etat: EtatApplication
    ): void {
        const actifDe = (id: string | undefined) => (id ? actifs.find(candidat => candidat.id === id) : undefined);
        const applicationObjet = actifDe(attribut.sourceApp) || actifDe((objet.producedBy || [])[0]);
        const applicationsSources = new Map<string, { actif: Actif; via: string[] }>();
        for (const correspondance of attribut.mappings || []) {
            const systemeSource = String(etat.governance.dictionary[correspondance.table]?.sourceSystem || '')
                .trim()
                .toLowerCase();
            // Application source : propriétaire déclarée de la table, sinon son système source, sinon celle de l'objet.
            const proprietaire =
                actifs.find(actif => actif.kind === 'app' && (actif.sources || []).includes(correspondance.table)) ||
                actifs.find(actif => actif.kind === 'app' && actif.name.trim().toLowerCase() === systemeSource) ||
                applicationObjet;
            const idColonne = 'col:' + correspondance.table + '.' + correspondance.col;
            graphe.noeuds.push({ id: idColonne, titre: correspondance.col, detail: correspondance.table, genre: 'colonne' });
            graphe.liens.push({ source: idColonne, target: idAttribut, libelle: 'alimente' });
            if (!proprietaire) continue;
            if (!applicationsSources.has(proprietaire.id)) applicationsSources.set(proprietaire.id, { actif: proprietaire, via: [] });
            applicationsSources.get(proprietaire.id)!.via.push(correspondance.table);
            graphe.liens.push({ source: 'as:' + proprietaire.id, target: idColonne, libelle: 'produit' });
        }
        if (!applicationsSources.size && applicationObjet) {
            applicationsSources.set(applicationObjet.id, { actif: applicationObjet, via: [] });
            graphe.liens.push({ source: 'as:' + applicationObjet.id, target: idAttribut, libelle: 'produit' });
        }
        for (const { actif, via } of applicationsSources.values())
            graphe.noeuds.push({
                id: 'as:' + actif.id,
                titre: actif.name,
                detail: via.length ? 'via ' + [...new Set(via)].join(', ') : "source de l'objet",
                genre: 'app'
            });
        if (!applicationsSources.size) {
            graphe.noeuds.push({
                id: 'nosrc',
                titre: 'aucune application source',
                detail: (attribut.mappings || []).length ? '' : 'attribut non alimenté',
                genre: 'alerte'
            });
            graphe.liens.push({ source: 'nosrc', target: idAttribut });
        }
    }

    /** Aval : les actifs déclarés comme utilisateurs de l'attribut. */
    private ajouterAvalAttribut(graphe: Graphe, idAttribut: string, attribut: Attribut, actifs: Actif[]): void {
        const genres: Record<string, string> = { process: 'processus', report: 'restitution' };
        for (const idActif of attribut.usedBy || []) {
            const consommateur = actifs.find(candidat => candidat.id === idActif);
            if (!consommateur) continue;
            graphe.noeuds.push({
                id: 'use:' + consommateur.id,
                titre: consommateur.name,
                detail: genres[consommateur.kind || ''] || 'application',
                genre: 'app'
            });
            graphe.liens.push({ source: idAttribut, target: 'use:' + consommateur.id, libelle: 'consommé par' });
        }
        if (!(attribut.usedBy || []).length) {
            graphe.noeuds.push({ id: 'nouse', titre: 'aucun consommateur déclaré', genre: 'alerte' });
            graphe.liens.push({ source: idAttribut, target: 'nouse' });
        }
    }

    /** Amont et aval d'une table dans la carte des flux (nœuds atteignables par les liens, dans les deux sens). */
    async lineageTable(espaceId: string, nomTable: string): Promise<Graphe> {
        const carte = await this.carte(espaceId);
        const depart = carte.noeuds.find(noeud => noeud.tableName === nomTable || noeud.name === nomTable);
        if (!depart) return { noeuds: [], liens: [] };
        const retenus = new Set<string>([depart.id]);
        const parcourir = (sens: 'amont' | 'aval') => {
            const file = [depart.id];
            while (file.length) {
                const courant = file.shift()!;
                for (const lien of carte.liens) {
                    const voisin =
                        sens === 'amont' ? (lien.target === courant ? lien.source : null) : lien.source === courant ? lien.target : null;
                    if (voisin && !retenus.has(voisin)) {
                        retenus.add(voisin);
                        file.push(voisin);
                    }
                }
            }
        };
        parcourir('amont');
        parcourir('aval');
        const genreDe = (noeud: NoeudEnrichi): NoeudGraphe['genre'] =>
            genreNoeud(noeud) === 'app' ? 'app' : genreNoeud(noeud) === 'object' ? 'objet' : 'table';
        return {
            noeuds: carte.noeuds
                .filter(noeud => retenus.has(noeud.id))
                .map(noeud => ({ id: noeud.id, titre: noeud.name, detail: noeud.role, genre: genreDe(noeud) })),
            liens: carte.liens
                .filter(lien => retenus.has(lien.source) && retenus.has(lien.target))
                .map(lien => ({ source: lien.source, target: lien.target, libelle: lien.type }))
        };
    }

    private fluxDe(etat: EtatApplication): Flux {
        const flux = normaliserFlux(etat.governance['flow'] as Partial<Flux> | undefined);
        etat.governance['flow'] = flux;
        return flux;
    }

    private contexte(etat: EtatApplication, sources: DocumentSource[]): ContexteFlux {
        const tablesConcues = sources
            .filter(source => source.type === 'designed' && source['design'])
            .map(source => {
                const recette = source['design'] as { sources?: { src: string }[]; joins?: { src?: string; viaSrc?: string }[] };
                return {
                    name: source.name,
                    sourcesContributrices: [
                        ...(recette.sources || []).map(contributrice => contributrice.src),
                        ...(recette.joins || []).flatMap(jointure => [jointure.src, jointure.viaSrc])
                    ].filter((nom): nom is string => !!nom)
                };
            });
        return {
            nomsSources: sources.map(source => source.name),
            tablesConcues,
            systemeSourceDe: nomTable => String(etat.governance.dictionary[nomTable]?.sourceSystem || ''),
            actifs: etat.governance.assets as unknown as Actif[],
            objetsMetier: etat.governance.businessObjects as unknown as ObjetMetier[]
        };
    }
}
