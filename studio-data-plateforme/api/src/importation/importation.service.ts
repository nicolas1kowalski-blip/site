/**
 * Service d'importation : transforme un fichier déposé (ou téléchargé) en source de l'espace — table DuckDB et
 * métadonnées — et couvre les cas repris de l'application classique :
 *   • création d'une source depuis un fichier CSV / TXT / Parquet / JSON / Excel (feuille au choix) ;
 *   • mise à jour d'une source existante par un nouveau fichier (même identifiant : la gouvernance, les règles,
 *     les recettes survivent), avec la liste des colonnes disparues ;
 *   • fusion de plusieurs fichiers et sources en une seule source (colonnes alignées par nom) ;
 *   • import par adresse (CSV, JSON avec chemin, Parquet, Google Sheets) avec différentiel avant mise à jour ;
 *   • livraison ZIP : inventaire des fichiers, puis import ou mise à jour de chacun.
 */
import { Injectable } from '@nestjs/common';
import fsp from 'node:fs/promises';
import { Readable } from 'node:stream';
import { EspaceAvecRole } from '../authentification/contexte-requete';
import { Utilisateur } from '../base-de-donnees/schema';
import { erreurIntrouvable, erreurRequete } from '../commun/erreurs';
import { DepotFichiers } from '../espaces/depot-fichiers';
import { EspacesService } from '../espaces/espaces.service';
import { MoteurDuckDB, identifiantSql, litteralSql } from '../espaces/moteur-duckdb';
import { JournalService } from '../journal/journal.service';
import { DocumentSource, SourcesService } from '../sources/sources.service';
import { EntreeZip, extraireEntreeZip, listerEntreesZip } from './archive-zip';
import { feuilleEnCsv, lireFeuilleExcel, nomsDesFeuilles } from './classeur-excel';
import {
    adresseExportGoogleSheets,
    extensionAcceptee,
    extensionDe,
    OptionsLectureCsv,
    lectureDuckDB,
    lectureSourceExistante,
    nomDepuisAdresse,
    nomTableDuckDB,
    sqlCreationTable,
    sqlFusion,
    tableauJsonAuChemin,
    typeSourceDe
} from './ingestion';

/** Ce que le navigateur sait d'un fichier déjà déposé sous src_<id> (ou sous un nom temporaire). */
export type FichierDepose = { nomServeur: string; nomFichier: string; taille?: number; modifieLe?: number; feuille?: string };

export type ResultatImport = {
    source: DocumentSource;
    lignes: number;
    /** Colonnes présentes avant la mise à jour et absentes après (rien à la création). */
    colonnesDisparues: string[];
    /** Différentiel avant une mise à jour par adresse (clé facultative). */
    differentiel?: { ajoutees: number; disparues: number; modifiees: number | null; cle: string | null };
};

export type GenreAdresse = 'csv' | 'json' | 'parquet' | 'gsheet';
export type ParametresAdresse = {
    adresse: string;
    genre: GenreAdresse;
    nom?: string;
    cheminJson?: string;
    enTeteNom?: string;
    enTeteValeur?: string;
    /** Source à mettre à jour (sinon création). */
    sourceId?: string;
    /** Colonne clé du différentiel (facultative). */
    colonneCle?: string;
    /** « remplacer » (défaut) ou « ajouter » : en mode ajout, seules les nouvelles clés sont insérées. */
    mode?: 'remplacer' | 'ajouter';
};

export type ChoixEntreeZip = { nom: string; action: 'importer' | 'mettreAJour' | 'ignorer'; nomSource?: string };
export type BilanZip = { importees: string[]; misesAJour: string[]; ignorees: string[]; erreurs: { nom: string; erreur: string }[] };

const EXTENSIONS_ZIP = ['csv', 'txt', 'tsv', 'json', 'ndjson', 'parquet', 'xlsx'];
const DELAI_TELECHARGEMENT_MS = 60_000;

@Injectable()
export class ImportationService {
    constructor(
        private readonly espaces: EspacesService,
        private readonly sources: SourcesService,
        private readonly journal: JournalService
    ) {}

    // ---- fichier déposé → source ----
    /** Crée une source (ou la met à jour si `sourceId` est fourni) à partir d'un fichier déjà déposé. */
    async importerFichier(
        espace: EspaceAvecRole,
        utilisateur: Utilisateur,
        fichier: FichierDepose,
        sourceId?: string
    ): Promise<ResultatImport> {
        const extension = extensionDe(fichier.nomFichier);
        if (!extensionAcceptee(extension)) throw erreurRequete(`« ${fichier.nomFichier} » : format .${extension} non pris en charge.`);
        const existante = sourceId ? await this.sources.lire(espace.id, sourceId) : null;
        // Un fichier déposé sous src_<id> (convention du navigateur) donne son identifiant à la nouvelle source.
        const idDuDepot = (/^src_(tb_[A-Za-z0-9_-]+)$/.exec(fichier.nomServeur) || [])[1];
        const id = existante ? String(existante.id) : idDuDepot || 'tb_' + Math.random().toString(36).slice(2, 11);
        if (!existante) await this.verifierNomLibre(espace.id, fichier.nomFichier);
        const { moteur, fichiers } = await this.espaces.ressources(espace);
        const nomServeur = await this.placerFichier(fichiers, fichier.nomServeur, 'src_' + id);
        const lecture = await this.lectureDe(fichiers, nomServeur, extension, fichier.feuille);
        await moteur.executer(sqlCreationTable(id, lecture));
        const source = await this.enregistrerSource(espace, utilisateur, moteur, {
            id,
            existante,
            nom: existante ? existante.name : fichier.nomFichier,
            type: typeSourceDe(extension),
            taille: fichier.taille ?? (await fichiers.decrire(nomServeur)).taille,
            fichier: {
                nom: nomServeur,
                name: fichier.nomFichier,
                size: fichier.taille ?? 0,
                lastModified: fichier.modifieLe ?? Date.now(),
                feuille: fichier.feuille
            }
        });
        return source;
    }

    /** Relit le fichier d'une source avec de nouveaux paramètres de lecture (séparateur, encodage, guillemets, erreurs). */
    async relire(espace: EspaceAvecRole, utilisateur: Utilisateur, sourceId: string, options: OptionsLectureCsv): Promise<ResultatImport> {
        const existante = await this.sources.lire(espace.id, sourceId);
        const fichier = (existante.fichier || {}) as { nom?: string; name?: string; feuille?: string };
        const nomServeur = fichier.nom || 'src_' + existante.id;
        const extension = extensionDe(fichier.name || existante.name);
        if (!extensionAcceptee(extension)) throw erreurRequete(`« ${existante.name} » : format .${extension} non pris en charge.`);
        const { moteur, fichiers } = await this.espaces.ressources(espace);
        await fichiers.decrire(nomServeur).catch(() => {
            throw erreurRequete(
                `Le fichier d'origine de « ${existante.name} » n'est plus sur le serveur : mettez la source à jour avec un nouveau fichier.`
            );
        });
        const lecture =
            extension === 'xlsx'
                ? await this.lectureDe(fichiers, nomServeur, extension, fichier.feuille)
                : lectureDuckDB(nomServeur, extension, options);
        try {
            await moteur.executer(sqlCreationTable(String(existante.id), lecture));
        } catch (erreur) {
            throw erreurRequete(`Lecture impossible avec ces paramètres : ${(erreur as Error).message}`);
        }
        return this.enregistrerSource(espace, utilisateur, moteur, {
            id: String(existante.id),
            existante,
            nom: existante.name,
            type: existante.type || typeSourceDe(extension),
            taille: Number(existante.size) || 0,
            fichier: existante.fichier as Record<string, unknown>,
            config: { ...((existante.config as Record<string, unknown>) || {}), ...options }
        });
    }

    /** Feuilles d'un classeur Excel déposé (pour laisser choisir l'onglet). */
    async feuillesExcel(espace: EspaceAvecRole, nomServeur: string): Promise<string[]> {
        const { fichiers } = await this.espaces.ressources(espace);
        try {
            return nomsDesFeuilles(await fsp.readFile(fichiers.chemin(nomServeur)));
        } catch (erreur) {
            throw erreurRequete(`Classeur illisible : ${(erreur as Error).message}`);
        }
    }

    // ---- fusion ----
    async fusionner(
        espace: EspaceAvecRole,
        utilisateur: Utilisateur,
        parametres: { nom: string; fichiers: FichierDepose[]; sourceIds: string[]; retirerOrigines: boolean }
    ): Promise<ResultatImport> {
        if (!parametres.fichiers.length && parametres.sourceIds.length < 1)
            throw erreurRequete('Fusion : ajoutez au moins un fichier ou une source.');
        await this.verifierNomLibre(espace.id, parametres.nom);
        const id = 'tb_' + Math.random().toString(36).slice(2, 11);
        const { moteur, fichiers } = await this.espaces.ressources(espace);
        const morceaux: { lecture: string; origine: string }[] = [];
        let taille = 0;
        for (const [index, fichier] of parametres.fichiers.entries()) {
            const extension = extensionDe(fichier.nomFichier);
            if (!extensionAcceptee(extension)) throw erreurRequete(`« ${fichier.nomFichier} » : format .${extension} non pris en charge.`);
            const nomServeur = await this.placerFichier(fichiers, fichier.nomServeur, `src_${id}_${index}`);
            morceaux.push({ lecture: await this.lectureDe(fichiers, nomServeur, extension, fichier.feuille), origine: fichier.nomFichier });
            taille += fichier.taille ?? 0;
        }
        const origines: DocumentSource[] = [];
        for (const sourceId of parametres.sourceIds) {
            const source = await this.sources.lire(espace.id, sourceId);
            origines.push(source);
            morceaux.push({ lecture: lectureSourceExistante(String(source.id)), origine: source.name });
            taille += Number(source.size) || 0;
        }
        await moteur.executer(sqlFusion(id, morceaux));
        const resultat = await this.enregistrerSource(espace, utilisateur, moteur, {
            id,
            existante: null,
            nom: parametres.nom,
            type: 'csv',
            taille,
            fichier: null,
            origine: 'fusion',
            fusion: { fichiers: parametres.fichiers.map(fichier => fichier.nomFichier), sources: origines.map(source => source.name) }
        });
        if (parametres.retirerOrigines) for (const source of origines) await this.supprimerSource(espace, String(source.id));
        return resultat;
    }

    // ---- import par adresse ----
    async importerDepuisAdresse(espace: EspaceAvecRole, utilisateur: Utilisateur, parametres: ParametresAdresse): Promise<ResultatImport> {
        const adresse = parametres.genre === 'gsheet' ? adresseExportGoogleSheets(parametres.adresse) : parametres.adresse;
        if (!/^https?:\/\//i.test(adresse)) throw erreurRequete('Adresse invalide : elle doit commencer par http:// ou https://.');
        const existante = parametres.sourceId ? await this.sources.lire(espace.id, parametres.sourceId) : null;
        const nom = existante ? existante.name : (parametres.nom || '').trim() || nomDepuisAdresse(adresse);
        if (!existante) await this.verifierNomLibre(espace.id, nom);
        const id = existante ? String(existante.id) : 'tb_' + Math.random().toString(36).slice(2, 11);
        const extension = parametres.genre === 'parquet' ? 'parquet' : parametres.genre === 'json' ? 'json' : 'csv';
        const { moteur, fichiers } = await this.espaces.ressources(espace);
        const nomServeur = 'src_' + id;
        await this.telecharger(fichiers, adresse, nomServeur, parametres);
        if (parametres.genre === 'json' && (parametres.cheminJson || '').trim()) {
            const texte = await fsp.readFile(fichiers.chemin(nomServeur), 'utf8');
            await fsp.writeFile(fichiers.chemin(nomServeur), JSON.stringify(tableauJsonAuChemin(texte, parametres.cheminJson!)));
        }
        const lecture = lectureDuckDB(nomServeur, extension);
        const differentiel = existante ? await this.differentiel(moteur, id, lecture, existante, parametres.colonneCle) : undefined;
        if (existante && parametres.mode === 'ajouter' && differentiel?.cle)
            await this.ajouterNouvellesCles(moteur, id, lecture, existante, differentiel.cle);
        else await moteur.executer(sqlCreationTable(id, lecture));
        const taille = (await fichiers.decrire(nomServeur)).taille;
        const resultat = await this.enregistrerSource(espace, utilisateur, moteur, {
            id,
            existante,
            nom,
            type: extension,
            taille,
            fichier: { nom: nomServeur, name: nom, size: taille, lastModified: Date.now() },
            origine: 'adresse',
            adresse: {
                adresse: parametres.adresse,
                genre: parametres.genre,
                cheminJson: parametres.cheminJson || '',
                colonneCle: parametres.colonneCle || '',
                mode: parametres.mode || 'remplacer'
            }
        });
        return { ...resultat, differentiel };
    }

    private async telecharger(fichiers: DepotFichiers, adresse: string, nomServeur: string, parametres: ParametresAdresse): Promise<void> {
        const enTetes: Record<string, string> = {};
        if ((parametres.enTeteNom || '').trim() && (parametres.enTeteValeur || '').trim())
            enTetes[parametres.enTeteNom!.trim()] = parametres.enTeteValeur!;
        let reponse: Response;
        try {
            reponse = await fetch(adresse, { headers: enTetes, signal: AbortSignal.timeout(DELAI_TELECHARGEMENT_MS) });
        } catch (erreur) {
            throw erreurRequete(`Téléchargement impossible : ${(erreur as Error).message}`);
        }
        if (!reponse.ok || !reponse.body) throw erreurRequete(`Téléchargement refusé : HTTP ${reponse.status}.`);
        await fichiers.ecrireDepuisFlux(nomServeur, Readable.fromWeb(reponse.body as never));
    }

    /** Ajouts, disparitions et modifications entre la table existante et le nouveau contenu, sur les colonnes communes. */
    private async differentiel(
        moteur: MoteurDuckDB,
        id: string,
        lecture: string,
        existante: DocumentSource,
        colonneCle?: string
    ): Promise<ResultatImport['differentiel']> {
        const nouvellesColonnes = (await moteur.executer(`SELECT * FROM ${lecture} LIMIT 0`)).colonnes.map(colonne => colonne.nom);
        const communes = (existante.headers || []).filter(colonne => nouvellesColonnes.includes(colonne));
        if (!communes.length) throw erreurRequete('Aucune colonne commune avec la source existante : créez plutôt une nouvelle source.');
        const table = identifiantSql(nomTableDuckDB(id));
        const normalisee = (expression: string) => `NULLIF(UPPER(TRIM(CAST(${expression} AS VARCHAR))), '')`;
        const empreinte = (alias: string) =>
            `md5(concat_ws(chr(1), ${communes.map(colonne => `COALESCE(CAST(${alias}${identifiantSql(colonne)} AS VARCHAR), '')`).join(', ')}))`;
        const cle = colonneCle && communes.includes(colonneCle) ? colonneCle : null;
        if (cle) {
            const colonne = identifiantSql(cle);
            const resultat = await moteur.executer(
                `SELECT (SELECT COUNT(*) FROM ${lecture} s WHERE ${normalisee('s.' + colonne)} NOT IN (SELECT ${normalisee(colonne)} FROM ${table} WHERE ${normalisee(colonne)} IS NOT NULL))::BIGINT,
                        (SELECT COUNT(*) FROM ${table} o WHERE ${normalisee('o.' + colonne)} NOT IN (SELECT ${normalisee(colonne)} FROM ${lecture} WHERE ${normalisee(colonne)} IS NOT NULL))::BIGINT,
                        (SELECT COUNT(*) FROM ${lecture} s JOIN ${table} o ON ${normalisee('s.' + colonne)} = ${normalisee('o.' + colonne)} WHERE ${empreinte('s.')} <> ${empreinte('o.')})::BIGINT`
            );
            const [ajoutees, disparues, modifiees] = resultat.lignes[0].map(Number);
            return { ajoutees, disparues, modifiees, cle };
        }
        const resultat = await moteur.executer(
            `SELECT (SELECT COUNT(*) FROM (SELECT ${empreinte('')} AS h FROM ${lecture} EXCEPT ALL SELECT ${empreinte('')} AS h FROM ${table}))::BIGINT,
                    (SELECT COUNT(*) FROM (SELECT ${empreinte('')} AS h FROM ${table} EXCEPT ALL SELECT ${empreinte('')} AS h FROM ${lecture}))::BIGINT`
        );
        const [ajoutees, disparues] = resultat.lignes[0].map(Number);
        return { ajoutees, disparues, modifiees: null, cle: null };
    }

    /** Mode « ajouter » : seules les lignes dont la clé est inconnue sont insérées, l'existant est conservé. */
    private async ajouterNouvellesCles(
        moteur: MoteurDuckDB,
        id: string,
        lecture: string,
        existante: DocumentSource,
        cle: string
    ): Promise<void> {
        const table = identifiantSql(nomTableDuckDB(id));
        const colonne = identifiantSql(cle);
        const normalisee = (expression: string) => `NULLIF(UPPER(TRIM(CAST(${expression} AS VARCHAR))), '')`;
        const nouvellesColonnes = (await moteur.executer(`SELECT * FROM ${lecture} LIMIT 0`)).colonnes.map(candidate => candidate.nom);
        const colonnes = (existante.headers || []).filter(candidate => nouvellesColonnes.includes(candidate));
        await moteur.executer(
            `INSERT INTO ${table} (__rn, ${colonnes.map(identifiantSql).join(', ')})
             SELECT (SELECT COALESCE(MAX(__rn), 0) FROM ${table}) + row_number() OVER (), ${colonnes.map(candidate => 's.' + identifiantSql(candidate)).join(', ')}
             FROM ${lecture} s WHERE ${normalisee('s.' + colonne)} NOT IN (SELECT ${normalisee(colonne)} FROM ${table} WHERE ${normalisee(colonne)} IS NOT NULL)`
        );
    }

    // ---- livraison ZIP ----
    /** Inventaire des fichiers de données d'une archive déposée, avec la source du même nom si elle existe. */
    async inventaireZip(
        espace: EspaceAvecRole,
        nomServeur: string
    ): Promise<{ nom: string; dossier: string; nomCourt: string; taille: number; modifieLe: string; sourceExistante: string | null }[]> {
        const { fichiers } = await this.espaces.ressources(espace);
        const sources = await this.sources.lister(espace.id);
        return this.entreesDeDonnees(await fsp.readFile(fichiers.chemin(nomServeur))).map(entree => ({
            nom: entree.nom,
            dossier: entree.dossier,
            nomCourt: entree.nomCourt,
            taille: entree.tailleReelle,
            modifieLe: entree.modifieLe,
            sourceExistante: sources.find(source => source.name.toLowerCase() === entree.nomCourt.toLowerCase())?.id ?? null
        }));
    }

    async importerZip(espace: EspaceAvecRole, utilisateur: Utilisateur, nomServeur: string, choix: ChoixEntreeZip[]): Promise<BilanZip> {
        const { fichiers } = await this.espaces.ressources(espace);
        const archive = await fsp.readFile(fichiers.chemin(nomServeur));
        const entrees = this.entreesDeDonnees(archive);
        const bilan: BilanZip = { importees: [], misesAJour: [], ignorees: [], erreurs: [] };
        for (const decision of choix) {
            const entree = entrees.find(candidate => candidate.nom === decision.nom);
            if (!entree || decision.action === 'ignorer') {
                bilan.ignorees.push(decision.nom);
                continue;
            }
            try {
                const nomTemporaire = `zip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
                await fsp.writeFile(fichiers.chemin(nomTemporaire), extraireEntreeZip(archive, entree));
                const sources = await this.sources.lister(espace.id);
                const existante =
                    decision.action === 'mettreAJour'
                        ? sources.find(source => source.name.toLowerCase() === (decision.nomSource || entree.nomCourt).toLowerCase())
                        : null;
                const fichier: FichierDepose = {
                    nomServeur: nomTemporaire,
                    nomFichier: decision.nomSource || entree.nomCourt,
                    taille: entree.tailleReelle,
                    modifieLe: Date.parse(entree.modifieLe)
                };
                await this.importerFichier(espace, utilisateur, fichier, existante ? String(existante.id) : undefined);
                (existante ? bilan.misesAJour : bilan.importees).push(entree.nomCourt);
            } catch (erreur) {
                bilan.erreurs.push({ nom: entree.nom, erreur: (erreur as Error).message });
            }
        }
        await fichiers.supprimer(nomServeur);
        return bilan;
    }

    private entreesDeDonnees(archive: Buffer): EntreeZip[] {
        try {
            return listerEntreesZip(archive).filter(
                entree => EXTENSIONS_ZIP.includes(extensionDe(entree.nomCourt)) && !entree.nomCourt.startsWith('.')
            );
        } catch (erreur) {
            throw erreurRequete(`Archive illisible : ${(erreur as Error).message}`);
        }
    }

    // ---- outils communs ----
    private async verifierNomLibre(espaceId: string, nom: string): Promise<void> {
        const sources = await this.sources.lister(espaceId);
        if (sources.some(source => source.name.toLowerCase() === nom.trim().toLowerCase()))
            throw erreurRequete(`Une source nommée « ${nom} » existe déjà : mettez-la à jour, ou choisissez un autre nom.`);
    }

    /** Le fichier déposé prend son nom définitif (src_<id>) s'il a été déposé sous un nom temporaire. */
    private async placerFichier(fichiers: DepotFichiers, nomActuel: string, nomDefinitif: string): Promise<string> {
        await fichiers.decrire(nomActuel).catch(() => {
            throw erreurIntrouvable(`Fichier déposé introuvable : ${nomActuel}`);
        });
        if (nomActuel === nomDefinitif) return nomDefinitif;
        await fsp.rename(fichiers.chemin(nomActuel), fichiers.chemin(nomDefinitif));
        return nomDefinitif;
    }

    /** Expression de lecture ; un classeur Excel est d'abord converti en CSV (fichier src_<id>.csv). */
    private async lectureDe(fichiers: DepotFichiers, nomServeur: string, extension: string, feuille?: string): Promise<string> {
        if (extension !== 'xlsx') return lectureDuckDB(nomServeur, extension);
        try {
            const contenu = lireFeuilleExcel(await fsp.readFile(fichiers.chemin(nomServeur)), feuille);
            const nomCsv = nomServeur + '.csv';
            await fsp.writeFile(fichiers.chemin(nomCsv), '﻿' + feuilleEnCsv(contenu));
            return `read_csv_auto(${litteralSql(nomCsv)}, header=true, all_varchar=true, delim=';')`;
        } catch (erreur) {
            throw erreurRequete(`Classeur Excel : ${(erreur as Error).message}`);
        }
    }

    /** Métadonnées de la source (en-têtes lues dans DuckDB), journal, colonnes disparues si mise à jour. */
    private async enregistrerSource(
        espace: EspaceAvecRole,
        utilisateur: Utilisateur,
        moteur: MoteurDuckDB,
        details: {
            id: string;
            existante: DocumentSource | null;
            nom: string;
            type: string;
            taille: number;
            fichier: Record<string, unknown> | null;
            [autre: string]: unknown;
        }
    ): Promise<ResultatImport> {
        const table = identifiantSql(nomTableDuckDB(details.id));
        const structure = await moteur.executer(`SELECT * FROM ${table} LIMIT 0`);
        const headers = structure.colonnes.map(colonne => colonne.nom).filter(nom => nom !== '__rn');
        const lignes = Number((await moteur.executer(`SELECT COUNT(*)::BIGINT FROM ${table}`)).lignes[0][0]);
        const { id, existante, nom, type, taille, fichier, ...complements } = details;
        const document: DocumentSource = {
            ...(existante || {}),
            ...complements,
            name: nom,
            type,
            storage: 'table',
            size: taille,
            headers,
            optimized: false,
            pqSize: null,
            config: (complements['config'] as Record<string, unknown>) ||
                (existante?.config as Record<string, unknown>) || { delim: '', enc: 'UTF-8' },
            fichier: fichier || existante?.fichier || null,
            srcModified: (fichier?.lastModified as number) || Date.now(),
            derniereMiseAJour: existante ? new Date().toISOString() : undefined
        };
        delete document.id;
        delete document.enregistreLe;
        await this.sources.ecrire(espace.id, id, document);
        const colonnesDisparues = existante ? (existante.headers || []).filter(colonne => !headers.includes(colonne)) : [];
        await this.journal.consigner({
            espaceId: espace.id,
            utilisateurId: utilisateur.id,
            action: existante ? 'source.mise-a-jour' : 'source.ajout',
            cible: nom,
            details: { type, lignes, colonnes: headers.length, colonnesDisparues }
        });
        return { source: await this.sources.lire(espace.id, id), lignes, colonnesDisparues };
    }

    private async supprimerSource(espace: EspaceAvecRole, id: string): Promise<void> {
        const { moteur, fichiers } = await this.espaces.ressources(espace);
        await moteur.abandonner(nomTableDuckDB(id));
        await this.sources.supprimer(espace.id, id);
        await fichiers.supprimerParPrefixe('src_' + id);
        await fichiers.supprimerParPrefixe('pq_' + id + '.');
    }
}
