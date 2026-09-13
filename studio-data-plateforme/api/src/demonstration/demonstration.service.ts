/**
 * Mode démonstration : installer, en une fois, un espace de travail entièrement prêt.
 *
 * Charger douze fichiers à la main puis déclarer les liens, les listes de valeurs, les règles et les tableaux de
 * bord prend une demi-heure ; ce service le fait en quelques secondes. Il lit les fichiers du jeu de
 * démonstration (`donnees-demo/fichiers`, voir son README), les ingère dans DuckDB comme n'importe quel fichier
 * déposé, puis écrit dans PostgreSQL tout ce qui fait qu'une application de gouvernance est vivante : sources et
 * leurs domaines, dictionnaire, modèle de données, listes de valeurs, objet métier, séries, tableaux de bord,
 * règles de qualité, et un premier audit pour que les écrans aient déjà une histoire.
 *
 * L'installation vise un espace dédié (« demo » par défaut) : rien n'est touché dans les espaces de travail.
 */
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { EspaceAvecRole } from '../authentification/contexte-requete';
import { BASE_DE_DONNEES, BaseDeDonnees } from '../base-de-donnees/connexion';
import { Utilisateur, auditsQualite, documents, reglesQualite } from '../base-de-donnees/schema';
import { erreurRequete } from '../commun/erreurs';
import { CONFIGURATION, Configuration } from '../configuration/configuration';
import { EspacesService } from '../espaces/espaces.service';
import { GouvernanceService } from '../gouvernance/gouvernance.service';
import { ImportationService } from '../importation/importation.service';
import { JournalService } from '../journal/journal.service';
import { QualiteService } from '../qualite/qualite.service';
import { SourcesService } from '../sources/sources.service';
import {
    APPLICATIONS,
    FICHIERS,
    GLOSSAIRE,
    LIENS,
    LISTES_DE_VALEURS,
    OBJET_METIER_CLIENT,
    PERSONNES,
    PROFIL_CLE_CONTACTS,
    REGLES,
    SENSIBILITE,
    SERIE_RELEVES,
    TABLEAUX_DE_BORD
} from './catalogue-demonstration';

export type EtatDemonstration = {
    /** Le dossier où le service va chercher les fichiers, et ce qu'il y trouve. */
    dossier: string;
    fichiersPresents: string[];
    fichiersManquants: string[];
    pretAInstaller: boolean;
    /** L'espace de démonstration, s'il existe déjà. */
    espace: { code: string; nom: string; sources: number; installeLe: string | null } | null;
};

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
        private readonly qualite: QualiteService,
        private readonly journal: JournalService
    ) {}

    /** Le dossier des fichiers du jeu : celui de la configuration, sinon `donnees-demo/fichiers` du dépôt. */
    get dossier(): string {
        return this.configuration.dossierDemonstration;
    }

    /** Ce que l'écran d'administration a besoin de savoir avant de proposer l'interrupteur. */
    async etat(code: string): Promise<EtatDemonstration> {
        const presents = FICHIERS.filter(entree => fs.existsSync(path.join(this.dossier, entree.fichier)));
        const espace = (await this.espaces.lister()).find(candidat => candidat.code === code) || null;
        const installation = espace
            ? await this.base
                  .select()
                  .from(documents)
                  .where(and(eq(documents.espaceId, espace.id), eq(documents.cle, CLE_INSTALLATION)))
                  .limit(1)
            : [];
        return {
            dossier: this.dossier,
            fichiersPresents: presents.map(entree => entree.fichier),
            fichiersManquants: FICHIERS.filter(entree => !presents.includes(entree)).map(entree => entree.fichier),
            pretAInstaller: presents.length === FICHIERS.length,
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

    /** Installe (ou réinstalle) la démonstration : fichiers, gouvernance, règles, premier audit. */
    async installer(utilisateur: Utilisateur, options: { code: string; nom: string; remplacer: boolean }): Promise<RapportInstallation> {
        const debut = Date.now();
        const manquants = FICHIERS.filter(entree => !fs.existsSync(path.join(this.dossier, entree.fichier)));
        if (manquants.length)
            throw erreurRequete(
                `Fichiers du jeu de démonstration introuvables dans ${this.dossier} : ${manquants.map(entree => entree.fichier).join(', ')}. Lancez « npm run demo » pour les produire.`
            );
        const espace = await this.espaceDeDemonstration(utilisateur, options);
        if (options.remplacer) await this.vider(espace);
        else if ((await this.sources.lister(espace.id)).length)
            throw erreurRequete(`L'espace « ${espace.code} » contient déjà des sources : cochez « remplacer » pour le réinstaller.`);
        const sources = await this.chargerLesFichiers(espace, utilisateur);
        await this.installerLaGouvernance(espace, utilisateur);
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

    /** Copie chaque fichier dans le dépôt de l'espace, l'ingère, puis pose son domaine. */
    private async chargerLesFichiers(espace: EspaceAvecRole, utilisateur: Utilisateur): Promise<RapportInstallation['sources']> {
        const { fichiers } = await this.espaces.ressources(espace);
        const rapport: RapportInstallation['sources'] = [];
        for (const entree of FICHIERS) {
            const chemin = path.join(this.dossier, entree.fichier);
            const taille = (await fsp.stat(chemin)).size;
            await fichiers.ecrireDepuisFlux('src_' + entree.id, fs.createReadStream(chemin));
            const importe = await this.importation.importerFichier(espace, utilisateur, {
                nomServeur: 'src_' + entree.id,
                nomFichier: entree.fichier,
                taille
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
        etat.governance.businessObjects = [OBJET_METIER_CLIENT];
        etat.governance.assets = APPLICATIONS;
        etat.governance.glossary = GLOSSAIRE;
        etat.governance.people = PERSONNES;
        etat.governance.domainList = [...new Set(FICHIERS.map(entree => entree.domaine))];
        etat.governance.dictionary = this.dictionnaire();
        etat.governance.privacy = { levels: SENSIBILITE, actions: etat.governance.privacy.actions };
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
