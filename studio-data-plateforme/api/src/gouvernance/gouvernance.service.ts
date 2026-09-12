/**
 * Accès au référentiel de gouvernance de l'espace : le document « appState » (partagé avec l'application
 * classique), section « governance ». Ce service garantit la présence de chaque section, offre les opérations
 * génériques sur les collections (lister, écrire par identifiant, supprimer) et enregistre le document.
 *
 * Les champs gardent les noms de l'application classique (businessObjects, assets, people…) pour que les deux
 * interfaces lisent les mêmes données ; le vocabulaire français est dans les types ci-dessous.
 */
import { Injectable } from '@nestjs/common';
import { EspaceAvecRole } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { erreurIntrouvable } from '../commun/erreurs';
import { DocumentsService } from '../documents/documents.service';
import { JournalService } from '../journal/journal.service';

/** Élément d'une collection de gouvernance : toujours identifié, le reste libre (format classique). */
export type ElementGouvernance = { id: string; [champ: string]: unknown };

export type FicheDictionnaire = {
    description?: string;
    owner?: string;
    domain?: string;
    sourceSystem?: string;
    sensitivity?: string;
    columns?: Record<string, Record<string, unknown>>;
    [champ: string]: unknown;
};

export type Confidentialite = {
    /** Niveau par table puis par colonne : public, interne, confidentiel, personnel. */
    levels: Record<string, Record<string, string>>;
    /** Action d'anonymisation par niveau : none, mask, pseudo, generalize, drop. */
    actions: Record<string, string>;
};

export type SectionGouvernance = {
    businessObjects: ElementGouvernance[];
    assets: ElementGouvernance[];
    glossary: ElementGouvernance[];
    perimeters: ElementGouvernance[];
    valueLists: ElementGouvernance[];
    people: ElementGouvernance[];
    proposals: ElementGouvernance[];
    domainList: string[];
    dictionary: Record<string, FicheDictionnaire>;
    privacy: Confidentialite;
    [section: string]: unknown;
};

export type EtatApplication = { governance: SectionGouvernance; savedAt?: string; [champ: string]: unknown };

/** Collections de gouvernance manipulées par identifiant. */
export const COLLECTIONS = {
    businessObjects: 'objet métier',
    assets: 'actif',
    glossary: 'terme',
    perimeters: 'périmètre',
    valueLists: 'liste de valeurs',
    people: 'personne',
    proposals: 'proposition'
} as const;
export type NomCollection = keyof typeof COLLECTIONS;

const ACTIONS_PAR_DEFAUT = { personnel: 'pseudo', confidentiel: 'mask', interne: 'none', public: 'none' };

@Injectable()
export class GouvernanceService {
    constructor(
        private readonly documents: DocumentsService,
        private readonly journal: JournalService
    ) {}

    /** Lit l'état de l'application en garantissant la présence de chaque section de gouvernance. */
    async etat(espaceId: string): Promise<EtatApplication> {
        const etat = ((await this.documents.lire<EtatApplication>(espaceId, 'appState')) || {}) as EtatApplication;
        const gouvernance = (etat.governance || {}) as SectionGouvernance;
        for (const collection of Object.keys(COLLECTIONS) as NomCollection[])
            if (!Array.isArray(gouvernance[collection])) gouvernance[collection] = [];
        if (!Array.isArray(gouvernance.domainList)) gouvernance.domainList = [];
        if (!gouvernance.dictionary || typeof gouvernance.dictionary !== 'object') gouvernance.dictionary = {};
        const confidentialite = (gouvernance.privacy || {}) as Partial<Confidentialite>;
        gouvernance.privacy = {
            levels: confidentialite.levels && typeof confidentialite.levels === 'object' ? confidentialite.levels : {},
            actions: { ...ACTIONS_PAR_DEFAUT, ...(confidentialite.actions || {}) }
        };
        etat.governance = gouvernance;
        return etat;
    }

    /** Enregistre l'état complet et consigne l'action dans le journal. */
    async enregistrer(
        espace: EspaceAvecRole,
        utilisateur: Utilisateur,
        etat: EtatApplication,
        action: string,
        cible: string
    ): Promise<void> {
        etat.savedAt = new Date().toISOString();
        await this.documents.ecrire(espace.id, 'appState', etat, utilisateur.id);
        await this.journal.consigner({ espaceId: espace.id, utilisateurId: utilisateur.id, action, cible });
    }

    async lister(espaceId: string, collection: NomCollection): Promise<ElementGouvernance[]> {
        return (await this.etat(espaceId)).governance[collection];
    }

    async lire(espaceId: string, collection: NomCollection, id: string): Promise<ElementGouvernance> {
        const element = (await this.lister(espaceId, collection)).find(candidat => candidat.id === id);
        if (!element) throw erreurIntrouvable(`${COLLECTIONS[collection]} inconnu(e) : ${id}`);
        return element;
    }

    /** Crée ou remplace un élément (les champs non fournis d'un élément existant sont conservés). */
    async ecrire(
        espace: EspaceAvecRole,
        utilisateur: Utilisateur,
        collection: NomCollection,
        id: string,
        corps: Record<string, unknown>,
        action: string
    ): Promise<ElementGouvernance> {
        const etat = await this.etat(espace.id);
        const liste = etat.governance[collection];
        const position = liste.findIndex(candidat => candidat.id === id);
        const element: ElementGouvernance = { ...(position >= 0 ? liste[position] : {}), ...corps, id };
        if (position >= 0) liste[position] = element;
        else liste.push(element);
        await this.enregistrer(espace, utilisateur, etat, action, String(element['name'] ?? element['term'] ?? id));
        return element;
    }

    async supprimer(
        espace: EspaceAvecRole,
        utilisateur: Utilisateur,
        collection: NomCollection,
        id: string,
        action: string
    ): Promise<void> {
        const etat = await this.etat(espace.id);
        const liste = etat.governance[collection];
        const position = liste.findIndex(candidat => candidat.id === id);
        if (position < 0) throw erreurIntrouvable(`${COLLECTIONS[collection]} inconnu(e) : ${id}`);
        const [supprime] = liste.splice(position, 1);
        await this.enregistrer(espace, utilisateur, etat, action, String(supprime['name'] ?? supprime['term'] ?? id));
    }

    /** Fiche de dictionnaire d'une source, créée vide si absente (avec sa section « columns »). */
    ficheDictionnaire(etat: EtatApplication, nomSource: string): FicheDictionnaire & { columns: Record<string, Record<string, unknown>> } {
        const dictionnaire = etat.governance.dictionary;
        const fiche = (dictionnaire[nomSource] = dictionnaire[nomSource] || {});
        if (!fiche.columns || typeof fiche.columns !== 'object') fiche.columns = {};
        return fiche as FicheDictionnaire & { columns: Record<string, Record<string, unknown>> };
    }

    /**
     * Domaines métier connus : liste déclarée + domaines cités par les objets, actifs, termes, périmètres et rôles.
     * Même règle que l'application classique (govDomains), triés.
     */
    domaines(gouvernance: SectionGouvernance): string[] {
        const domaines = new Set<string>(gouvernance.domainList);
        const ajouter = (valeur: unknown) => {
            const texte = String(valeur || '').trim();
            if (texte) domaines.add(texte);
        };
        for (const collection of ['businessObjects', 'assets', 'glossary', 'perimeters'] as NomCollection[])
            for (const element of gouvernance[collection]) ajouter(element['domain']);
        for (const personne of gouvernance.people)
            for (const role of (personne['roles'] as { domain?: string }[]) || []) ajouter(role.domain);
        return [...domaines].sort((premier, second) => premier.localeCompare(second, 'fr'));
    }
}
