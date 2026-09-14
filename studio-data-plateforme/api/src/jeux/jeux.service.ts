/**
 * Jeux temporaires : des tableaux gardés pour l'espace de travail, sans devenir des sources.
 *
 * Un jeu temporaire naît du résultat d'une extraction, d'un fichier reçu, des anomalies d'un audit ou des
 * écarts d'une comparaison. Il vit dans le moteur de l'espace comme une table ordinaire, ce qui le rend
 * exploitable partout — comparer, auditer, analyser, extraire — mais il est marqué « temporaire », donc :
 *   • il n'apparaît ni dans l'écran Sources, ni dans le modèle de données, ni dans le catalogue ;
 *   • il n'est pas emporté par les sauvegardes ;
 *   • il se supprime d'un clic, ou se promeut en source quand il mérite de rester.
 *
 * C'est ce qui permet d'auditer un fichier reçu ce matin sans polluer le référentiel de l'espace.
 */
import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { EspaceAvecRole } from '../authentification/contexte-requete';
import { erreurIntrouvable, erreurRequete } from '../commun/erreurs';
import { EspacesService } from '../espaces/espaces.service';
import { identifiantSql, litteralSql } from '../espaces/moteur-duckdb';
import { feuilleEnCsv, lireFeuilleExcel } from '../importation/classeur-excel';
import { OptionsLectureCsv, extensionAcceptee, extensionDe, lectureDuckDB } from '../importation/ingestion';
import { DocumentSource, SourcesService } from '../sources/sources.service';

/** D'où vient un jeu : cela se lit dans le panneau et aide à s'y retrouver quand ils s'accumulent. */
export const ORIGINES_JEU = {
    extraction: "résultat d'une extraction",
    fichier: 'fichier reçu',
    anomalies: "anomalies d'un audit",
    ecarts: "écarts d'une comparaison",
    requete: 'résultat d’une requête'
} as const;
export type OrigineJeu = keyof typeof ORIGINES_JEU;

/** Un jeu temporaire tel que l'écran le présente. */
export type JeuTemporaire = {
    id: string;
    nom: string;
    origine: OrigineJeu;
    lignes: number;
    colonnes: string[];
    creeLe: string;
};

@Injectable()
export class JeuxService {
    constructor(
        private readonly espaces: EspacesService,
        private readonly sources: SourcesService
    ) {}

    async lister(espaceId: string): Promise<JeuTemporaire[]> {
        return (await this.sources.listerLesJeux(espaceId)).map(document => this.fiche(document));
    }

    private fiche(document: DocumentSource): JeuTemporaire {
        return {
            id: String(document.id),
            nom: document.name,
            origine: (document.origineJeu as OrigineJeu) || 'requete',
            lignes: Number(document.lignes) || 0,
            colonnes: document.headers || [],
            creeLe: String(document.enregistreLe || '')
        };
    }

    /**
     * Crée un jeu à partir d'une requête de lecture : le résultat est matérialisé dans une table de l'espace,
     * avec son rang d'origine, comme pour une source. C'est le point d'entrée commun à toutes les origines.
     */
    async creerDepuisRequete(espace: EspaceAvecRole, sql: string, nom: string, origine: OrigineJeu): Promise<JeuTemporaire> {
        const nomPropre = nom.trim();
        if (!nomPropre) throw erreurRequete('Donnez un nom au jeu temporaire.');
        const id = 'tb_' + randomBytes(6).toString('hex');
        const { moteur } = await this.espaces.ressources(espace);
        await moteur.executer(`CREATE TABLE ${identifiantSql('t_' + id)} AS SELECT row_number() OVER () AS __rn, * FROM (\n${sql}\n) jeu`);
        const [structure, total] = await Promise.all([
            moteur.executer(`SELECT * EXCLUDE (__rn) FROM ${identifiantSql('t_' + id)} LIMIT 0`),
            moteur.executer(`SELECT COUNT(*)::BIGINT FROM ${identifiantSql('t_' + id)}`)
        ]);
        const colonnes = structure.colonnes.map(colonne => colonne.nom);
        const lignes = Number(total.lignes[0][0]);
        await this.sources.ecrire(espace.id, id, {
            id,
            name: nomPropre,
            type: 'jeu',
            storage: 'table',
            size: 0,
            headers: colonnes,
            temporaire: true,
            origineJeu: origine,
            lignes
        });
        return { id, nom: nomPropre, origine, lignes, colonnes, creeLe: new Date().toISOString() };
    }

    /**
     * Crée un jeu à partir d'un fichier déposé — c'est le « 📄 Fichier extérieur… » des écrans : on compare ou
     * on audite un fichier reçu ce matin sans le charger comme source. Les classeurs Excel passent par un CSV
     * intermédiaire, comme à l'importation.
     */
    async creerDepuisFichier(
        espace: EspaceAvecRole,
        nomServeur: string,
        nom: string,
        feuille = '',
        options: OptionsLectureCsv = {}
    ): Promise<JeuTemporaire> {
        const extension = extensionDe(nomServeur);
        if (!extensionAcceptee(extension)) throw erreurRequete(`Format .${extension} non pris en charge pour un jeu temporaire.`);
        const { fichiers } = await this.espaces.ressources(espace);
        let lecture = lectureDuckDB(nomServeur, extension, options);
        if (extension === 'xlsx') {
            try {
                const contenu = lireFeuilleExcel(await fsp.readFile(fichiers.chemin(nomServeur)), feuille || undefined);
                const nomCsv = nomServeur + '.csv';
                await fsp.writeFile(fichiers.chemin(nomCsv), '﻿' + feuilleEnCsv(contenu));
                lecture = `read_csv_auto(${litteralSql(nomCsv)}, header=true, all_varchar=true, delim=';')`;
            } catch (erreur) {
                throw erreurRequete(`Classeur Excel : ${(erreur as Error).message}`);
            }
        }
        return this.creerDepuisRequete(espace, `SELECT * FROM ${lecture}`, nom, 'fichier');
    }

    /** Le document d'un jeu, ou une erreur claire si l'identifiant ne désigne pas un jeu temporaire. */
    private async jeu(espaceId: string, id: string): Promise<DocumentSource> {
        const document = (await this.sources.listerLesJeux(espaceId)).find(candidat => String(candidat.id) === id);
        if (!document) throw erreurIntrouvable('Jeu temporaire inconnu.');
        return document;
    }

    async renommer(espaceId: string, id: string, nom: string): Promise<JeuTemporaire> {
        const document = await this.jeu(espaceId, id);
        const nomPropre = nom.trim();
        if (!nomPropre) throw erreurRequete('Donnez un nom au jeu temporaire.');
        await this.sources.ecrire(espaceId, id, { ...document, name: nomPropre });
        return this.fiche({ ...document, name: nomPropre });
    }

    /** Promouvoir : le jeu devient une source ordinaire, visible partout et emportée par les sauvegardes. */
    async promouvoir(espaceId: string, id: string, nom: string): Promise<DocumentSource> {
        const document = await this.jeu(espaceId, id);
        const nomPropre = (nom || document.name).trim();
        const homonyme = (await this.sources.lister(espaceId)).find(candidat => candidat.name === nomPropre);
        if (homonyme) throw erreurRequete(`Une source porte déjà le nom « ${nomPropre} ».`);
        const promu: DocumentSource = { ...document, name: nomPropre, type: 'extraction', origine: 'jeu temporaire' };
        delete promu.temporaire;
        delete promu.origineJeu;
        await this.sources.ecrire(espaceId, id, promu);
        return promu;
    }

    async supprimer(espace: EspaceAvecRole, id: string): Promise<void> {
        await this.jeu(espace.id, id);
        const { moteur } = await this.espaces.ressources(espace);
        await moteur.abandonner('t_' + id);
        await this.sources.supprimer(espace.id, id);
    }

    /** Vide tous les jeux de l'espace : on repart d'un plan de travail propre. */
    async viderTout(espace: EspaceAvecRole): Promise<number> {
        const jeux = await this.sources.listerLesJeux(espace.id);
        for (const jeu of jeux) await this.supprimer(espace, String(jeu.id));
        return jeux.length;
    }
}
