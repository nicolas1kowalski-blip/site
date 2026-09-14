/**
 * Mode démonstration : installer, en une fois, un espace de travail entièrement prêt.
 *
 * Charger douze fichiers à la main puis déclarer les liens, les listes de valeurs, les règles et les tableaux de
 * bord prend une demi-heure ; ce service le fait en quelques secondes.
 *
 * Le jeu de démonstration vit dans PostgreSQL : chaque fichier y est rangé compressé, une fois pour toutes
 * (table `jeu_demonstration`). L'installation n'a donc besoin d'aucun fichier sur le disque du serveur — le jeu
 * suit la base, donc les sauvegardes et les réplications. Le dossier `donnees-demo/fichiers` ne sert plus qu'à
 * garnir la base la première fois, automatiquement s'il est là.
 *
 * L'installation ingère ensuite ces contenus dans DuckDB comme n'importe quel fichier déposé, puis écrit dans
 * PostgreSQL tout ce qui fait qu'une application de gouvernance est vivante : sources et leurs domaines,
 * dictionnaire, modèle de données, listes de valeurs, objet métier, séries, tableaux de bord, règles de
 * qualité, et un premier audit pour que les écrans aient déjà une histoire.
 *
 * L'installation vise un espace dédié (« demo » par défaut) : rien n'est touché dans les espaces de travail.
 */
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { gunzipSync, gzipSync } from 'node:zlib';
import { EspaceAvecRole } from '../authentification/contexte-requete';
import { BASE_DE_DONNEES, BaseDeDonnees } from '../base-de-donnees/connexion';
import { Utilisateur, auditsQualite, documents, jeuDemonstration, reglesQualite } from '../base-de-donnees/schema';
import { erreurRequete } from '../commun/erreurs';
import { CONFIGURATION, Configuration } from '../configuration/configuration';
import { EspacesService } from '../espaces/espaces.service';
import { GouvernanceService } from '../gouvernance/gouvernance.service';
import { ImportationService } from '../importation/importation.service';
import { JournalService } from '../journal/journal.service';
import { LineageService } from '../lineage/lineage.service';
import { QualiteService } from '../qualite/qualite.service';
import { SourcesService } from '../sources/sources.service';
import {
    FICHIERS,
    LIENS,
    LISTES_DE_VALEURS,
    PROFIL_CLE_CONTACTS,
    REGLES,
    SERIE_RELEVES,
    TABLEAUX_DE_BORD
} from './catalogue-demonstration';
import { ACTIFS, CONFIDENTIALITE, GLOSSAIRE, OBJETS_METIER, PERIMETRES, PERSONNES, PROPOSITIONS } from './gouvernance-demonstration';

export type EtatDemonstration = {
    /** Le jeu tel qu'il est rangé dans la base : c'est lui qui sert à installer. */
    jeuEnBase: { fichiers: number; octets: number; octetsCompresses: number; chargeLe: string | null };
    /** Le dossier de garnissage (donnees-demo/fichiers) et ce qu'il contient encore, s'il est là. */
    dossier: string;
    fichiersSurDisque: string[];
    fichiersManquants: string[];
    pretAInstaller: boolean;
    /** L'espace de démonstration, s'il existe déjà. */
    espace: { code: string; nom: string; sources: number; installeLe: string | null } | null;
};

/** Compte rendu du garnissage de la base à partir des fichiers du dossier. */
export type RapportChargement = { fichiers: number; octets: number; octetsCompresses: number };

export type RapportInstallation = {
    espace: { code: string; nom: string };
    sources: { nom: string; lignes: number; colonnes: number }[];
    liens: number;
    regles: number;
    tableaux: number;
    score: number | null;
    dureeMs: number;
};

/** Clé du document qui garde la trace de l'installation (date, version du jeu). */
const CLE_INSTALLATION = 'demonstration';

@Injectable()
export class DemonstrationService {
    constructor(
        @Inject(BASE_DE_DONNEES) private readonly base: BaseDeDonnees,
        @Inject(CONFIGURATION) private readonly configuration: Configuration,
        private readonly espaces: EspacesService,
        private readonly sources: SourcesService,
        private readonly importation: ImportationService,
        private readonly gouvernance: GouvernanceService,
        private readonly lineage: LineageService,
        private readonly qualite: QualiteService,
        private readonly journal: JournalService
    ) {}

    /** Le dossier des fichiers du jeu : celui de la configuration, sinon `donnees-demo/fichiers` du dépôt. */
    get dossier(): string {
        return this.configuration.dossierDemonstration;
    }

    /** Ce que l'écran d'administration a besoin de savoir avant de proposer l'interrupteur. */
    async etat(code: string): Promise<EtatDemonstration> {
        const enBase = await this.jeuEnBase();
        const surDisque = FICHIERS.filter(entree => fs.existsSync(path.join(this.dossier, entree.fichier)));
        const espace = (await this.espaces.lister()).find(candidat => candidat.code === code) || null;
        const installation = espace
            ? await this.base
                  .select()
                  .from(documents)
                  .where(and(eq(documents.espaceId, espace.id), eq(documents.cle, CLE_INSTALLATION)))
                  .limit(1)
            : [];
        const nomsEnBase = new Set(enBase.map(fichier => fichier.nom));
        return {
            jeuEnBase: {
                fichiers: enBase.length,
                octets: enBase.reduce((somme, fichier) => somme + fichier.tailleOctets, 0),
                octetsCompresses: enBase.reduce((somme, fichier) => somme + fichier.tailleCompresseeOctets, 0),
                chargeLe: enBase.length ? enBase[0].chargeLe.toISOString() : null
            },
            dossier: this.dossier,
            fichiersSurDisque: surDisque.map(entree => entree.fichier),
            fichiersManquants: FICHIERS.filter(entree => !nomsEnBase.has(entree.fichier) && !surDisque.includes(entree)).map(
                entree => entree.fichier
            ),
            pretAInstaller: FICHIERS.every(entree => nomsEnBase.has(entree.fichier) || surDisque.includes(entree)),
            espace: espace
                ? {
                      code: espace.code,
                      nom: espace.nom,
                      sources: (await this.sources.lister(espace.id)).length,
                      installeLe: installation.length ? ((installation[0].valeur as { installeLe?: string }).installeLe ?? null) : null
                  }
                : null
        };
    }

    /** Les fichiers du jeu rangés dans la base, sans leur contenu (la liste sert à l'écran et aux contrôles). */
    async jeuEnBase(): Promise<{ nom: string; tailleOctets: number; tailleCompresseeOctets: number; chargeLe: Date }[]> {
        return this.base
            .select({
                nom: jeuDemonstration.nom,
                tailleOctets: jeuDemonstration.tailleOctets,
                tailleCompresseeOctets: jeuDemonstration.tailleCompresseeOctets,
                chargeLe: jeuDemonstration.chargeLe
            })
            .from(jeuDemonstration)
            .orderBy(jeuDemonstration.nom);
    }

    /**
     * Range le jeu dans la base à partir du dossier : chaque fichier est compressé puis enregistré. Une fois
     * fait, les fichiers du disque ne servent plus à rien — l'installation lit la base.
     */
    async chargerLeJeuEnBase(): Promise<RapportChargement> {
        const manquants = FICHIERS.filter(entree => !fs.existsSync(path.join(this.dossier, entree.fichier)));
        if (manquants.length)
            throw erreurRequete(
                `Fichiers introuvables dans ${this.dossier} : ${manquants.map(entree => entree.fichier).join(', ')}. Lancez « npm run demo » pour les produire.`
            );
        let octets = 0;
        let octetsCompresses = 0;
        for (const entree of FICHIERS) {
            const contenu = await fsp.readFile(path.join(this.dossier, entree.fichier));
            const comprime = gzipSync(contenu, { level: 9 });
            octets += contenu.length;
            octetsCompresses += comprime.length;
            const valeurs = {
                nom: entree.fichier,
                tailleOctets: contenu.length,
                contenu: comprime,
                tailleCompresseeOctets: comprime.length,
                chargeLe: new Date()
            };
            await this.base.insert(jeuDemonstration).values(valeurs).onConflictDoUpdate({ target: jeuDemonstration.nom, set: valeurs });
        }
        return { fichiers: FICHIERS.length, octets, octetsCompresses };
    }

    /** Retire le jeu de la base (l'espace déjà installé, lui, n'est pas touché). */
    async viderLeJeuEnBase(): Promise<number> {
        const enBase = await this.jeuEnBase();
        await this.base.delete(jeuDemonstration);
        return enBase.length;
    }

    /** Le contenu d'un fichier du jeu, décompressé, tel qu'il a été chargé. */
    private async contenuDuFichier(nom: string): Promise<Buffer> {
        const ligne = (await this.base.select().from(jeuDemonstration).where(eq(jeuDemonstration.nom, nom)).limit(1))[0];
        if (!ligne) throw erreurRequete(`Le fichier « ${nom} » n'est pas dans le jeu de démonstration de la base.`);
        return gunzipSync(ligne.contenu);
    }

    /** Installe (ou réinstalle) la démonstration : fichiers, gouvernance, règles, premier audit. */
    async installer(utilisateur: Utilisateur, options: { code: string; nom: string; remplacer: boolean }): Promise<RapportInstallation> {
        const debut = Date.now();
        // Le jeu vit dans la base ; s'il n'y est pas encore, on l'y range depuis le dossier de garnissage.
        const nomsEnBase = new Set((await this.jeuEnBase()).map(fichier => fichier.nom));
        if (!FICHIERS.every(entree => nomsEnBase.has(entree.fichier))) await this.chargerLeJeuEnBase();
        const espace = await this.espaceDeDemonstration(utilisateur, options);
        if (options.remplacer) await this.vider(espace);
        else if ((await this.sources.lister(espace.id)).length)
            throw erreurRequete(`L'espace « ${espace.code} » contient déjà des sources : cochez « remplacer » pour le réinstaller.`);
        const sources = await this.chargerLesFichiers(espace, utilisateur);
        await this.installerLaGouvernance(espace, utilisateur);
        // La carte des flux se déduit de ce qui vient d'être déclaré (applications productrices, objets
        // métier, tables conçues) : on emploie le même calcul que le bouton « Synchroniser » de l'écran.
        await this.lineage.synchroniser(espace, utilisateur);
        await this.installerLesRegles(espace);
        const score = await this.premierAudit(espace, utilisateur);
        await this.base
            .insert(documents)
            .values({
                espaceId: espace.id,
                cle: CLE_INSTALLATION,
                valeur: { installeLe: new Date().toISOString(), fichiers: FICHIERS.length },
                modifieParId: utilisateur.id
            })
            .onConflictDoUpdate({
                target: [documents.espaceId, documents.cle],
                set: {
                    valeur: { installeLe: new Date().toISOString(), fichiers: FICHIERS.length },
                    modifieParId: utilisateur.id,
                    modifieLe: new Date()
                }
            });
        await this.journal.consigner({
            espaceId: espace.id,
            utilisateurId: utilisateur.id,
            action: 'demonstration.installation',
            cible: espace.code,
            details: { sources: sources.length, regles: REGLES.length }
        });
        return {
            espace: { code: espace.code, nom: espace.nom },
            sources,
            liens: LIENS.length,
            regles: REGLES.length,
            tableaux: TABLEAUX_DE_BORD.length,
            score,
            dureeMs: Date.now() - debut
        };
    }

    /** Vide l'espace de démonstration : tables DuckDB, fichiers, sources, documents, règles et audits. */
    async vider(espace: EspaceAvecRole): Promise<number> {
        const { moteur, fichiers } = await this.espaces.ressources(espace);
        const sources = await this.sources.lister(espace.id);
        for (const source of sources) {
            await moteur.abandonner('t_' + source.id);
            await fichiers.supprimerParPrefixe('src_' + source.id);
            await this.sources.supprimer(espace.id, String(source.id));
        }
        await this.base.delete(reglesQualite).where(eq(reglesQualite.espaceId, espace.id));
        await this.base.delete(auditsQualite).where(eq(auditsQualite.espaceId, espace.id));
        await this.base.delete(documents).where(and(eq(documents.espaceId, espace.id), eq(documents.cle, 'appState')));
        return sources.length;
    }

    /** L'espace dédié : créé au besoin, et l'utilisateur qui installe en devient administrateur. */
    private async espaceDeDemonstration(utilisateur: Utilisateur, options: { code: string; nom: string }): Promise<EspaceAvecRole> {
        const existant = (await this.espaces.lister()).find(candidat => candidat.code === options.code);
        const espace = existant || (await this.espaces.creer(options.code, options.nom, utilisateur.id));
        if (existant) await this.espaces.definirMembre(espace.id, utilisateur.identifiant, 'administrateur');
        return { ...espace, role: 'administrateur' };
    }

    /** Sort chaque fichier de la base, le pose dans le dépôt de l'espace, l'ingère, puis lui donne son domaine. */
    private async chargerLesFichiers(espace: EspaceAvecRole, utilisateur: Utilisateur): Promise<RapportInstallation['sources']> {
        const { fichiers } = await this.espaces.ressources(espace);
        const rapport: RapportInstallation['sources'] = [];
        for (const entree of FICHIERS) {
            const contenu = await this.contenuDuFichier(entree.fichier);
            await fichiers.ecrireDepuisFlux('src_' + entree.id, Readable.from(contenu));
            const importe = await this.importation.importerFichier(espace, utilisateur, {
                nomServeur: 'src_' + entree.id,
                nomFichier: entree.fichier,
                taille: contenu.length
            });
            const source = await this.sources.lire(espace.id, entree.id);
            await this.sources.ecrire(espace.id, entree.id, { ...source, theme: entree.domaine });
            rapport.push({ nom: entree.fichier, lignes: importe.lignes, colonnes: (source.headers || []).length });
        }
        return rapport;
    }

    /** Écrit en une fois tout le référentiel : modèle, dictionnaire, listes, objet métier, séries, tableaux. */
    private async installerLaGouvernance(espace: EspaceAvecRole, utilisateur: Utilisateur): Promise<void> {
        const etat = await this.gouvernance.etat(espace.id);
        etat.relations = LIENS.map(lien => ({ kind: '', measured: null, ...lien }));
        etat.governance.valueLists = LISTES_DE_VALEURS;
        etat.governance.businessObjects = OBJETS_METIER;
        etat.governance.assets = ACTIFS;
        etat.governance.glossary = GLOSSAIRE;
        etat.governance.people = PERSONNES;
        etat.governance.perimeters = PERIMETRES;
        etat.governance.proposals = PROPOSITIONS;
        etat.governance.domainList = [...new Set(FICHIERS.map(entree => entree.domaine))];
        etat.governance.dictionary = this.dictionnaire();
        etat.governance.privacy = { levels: CONFIDENTIALITE, actions: etat.governance.privacy.actions };
        (etat.governance as Record<string, unknown>)['series'] = [SERIE_RELEVES];
        (etat as Record<string, unknown>)['dashboards'] = TABLEAUX_DE_BORD;
        await this.gouvernance.enregistrer(espace, utilisateur, etat, 'demonstration.gouvernance', espace.code);
    }

    /** Le dictionnaire : une fiche par source, avec son domaine, sa description et ses colonnes commentées. */
    private dictionnaire(): Record<string, Record<string, unknown>> {
        const fiches: Record<string, Record<string, unknown>> = {};
        for (const entree of FICHIERS) {
            const colonnes: Record<string, unknown> = {};
            for (const [colonne, description] of Object.entries(entree.colonnes || {})) colonnes[colonne] = { description };
            fiches[entree.fichier] = {
                description: entree.description,
                domain: entree.domaine,
                owner: 'Direction des données',
                updateFrequency: 'quotidienne',
                columns: colonnes
            };
        }
        (fiches['contacts.csv'] as Record<string, unknown>)['keyProfiles'] = [PROFIL_CLE_CONTACTS];
        return fiches;
    }

    /** Les règles de qualité, posées directement dans PostgreSQL (elles ne vivent pas dans le document partagé). */
    private async installerLesRegles(espace: EspaceAvecRole): Promise<void> {
        await this.base.insert(reglesQualite).values(
            REGLES.map(regle => ({
                espaceId: espace.id,
                nom: regle.nom,
                sourceId: regle.source,
                colonne: regle.colonne || '',
                type: regle.type,
                parametres: regle.parametres,
                criticite: regle.criticite,
                active: true
            }))
        );
    }

    /**
     * Un premier passage pour que les écrans ne soient pas vides à l'ouverture : profilage des deux tables les
     * plus parlantes, puis exécution des règles (score, dettes qualité, historique).
     */
    private async premierAudit(espace: EspaceAvecRole, utilisateur: Utilisateur): Promise<number | null> {
        for (const sourceId of ['tb_clients', 'tb_contacts']) {
            try {
                await this.qualite.profiler(espace, sourceId, utilisateur.id);
            } catch {
                // Un profilage qui échoue ne doit pas faire échouer l'installation : les données sont déjà chargées.
            }
        }
        try {
            return (await this.qualite.executerRegles(espace, undefined, utilisateur.id)).score;
        } catch {
            return null;
        }
    }
}
