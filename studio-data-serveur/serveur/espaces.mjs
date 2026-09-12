// Espace de travail : un moteur DuckDB, un dépôt de fichiers et deux dépôts de documents (état de
// l'application, métadonnées des tables). Un espace par équipe demain ; « defaut » aujourd'hui.
import path from 'node:path';
import { MoteurDuckDB } from './moteur/duckdb.mjs';
import { DepotFichiers } from './stockage/fichiers.mjs';
import { DepotDocuments } from './stockage/documents.mjs';
import { verifierNomSur } from './erreurs.mjs';

export class EspaceDeTravail {
    constructor(nom, dossier, configuration) {
        this.nom = nom;
        this.dossier = dossier;
        this.fichiers = new DepotFichiers(path.join(dossier, 'fichiers'), configuration.tailleMaxFichier);
        this.etat = new DepotDocuments(path.join(dossier, 'etat'));
        this.tables = new DepotDocuments(path.join(dossier, 'tables'));
        this.moteur = new MoteurDuckDB({
            cheminBase: path.join(dossier, 'studio.duckdb'),
            dossierFichiers: this.fichiers.dossier,
            threads: configuration.duckdb.threads,
            memoire: configuration.duckdb.memoire,
            limiteLignes: configuration.limiteLignesParReponse
        });
    }

    async ouvrir() {
        await this.moteur.ouvrir();
        return this;
    }

    async fermer() {
        await this.moteur.fermer();
    }
}

export class Espaces {
    constructor(configuration) {
        this.configuration = configuration;
        this.ouverts = new Map();
    }

    /** Ouvre (une seule fois) l'espace demandé ; les ouvertures concurrentes partagent la même promesse. */
    obtenir(nom) {
        verifierNomSur(nom, "nom d'espace");
        if (!this.ouverts.has(nom)) {
            const dossier = path.join(this.configuration.dossierDonnees, 'espaces', nom);
            const espace = new EspaceDeTravail(nom, dossier, this.configuration);
            this.ouverts.set(nom, espace.ouvrir());
        }
        return this.ouverts.get(nom);
    }

    async fermerTout() {
        for (const promesse of this.ouverts.values()) {
            try {
                await (await promesse).fermer();
            } catch (erreur) {
                /* fermeture au mieux */
            }
        }
        this.ouverts.clear();
    }
}
