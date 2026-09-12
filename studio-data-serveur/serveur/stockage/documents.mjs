// Dépôt de documents JSON : un fichier par clé, écrit de façon atomique (fichier temporaire puis renommage).
// Il remplace le magasin « meta » d'IndexedDB (configuration, gouvernance, sauvegardes de secours) et porte
// aussi les métadonnées des tables. Volontairement simple : lisible et sauvegardable avec un simple rsync.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { verifierNomSur } from '../erreurs.mjs';

export class DepotDocuments {
    constructor(dossier) {
        this.dossier = dossier;
        fs.mkdirSync(dossier, { recursive: true });
    }

    chemin(cle) {
        return path.join(this.dossier, verifierNomSur(cle, 'clé') + '.json');
    }

    async lire(cle) {
        try {
            return JSON.parse(await fsp.readFile(this.chemin(cle), 'utf8'));
        } catch (erreur) {
            if (erreur.code === 'ENOENT') return undefined;
            throw erreur;
        }
    }

    async ecrire(cle, valeur) {
        const cible = this.chemin(cle);
        const temporaire = cible + '.partiel';
        await fsp.writeFile(temporaire, JSON.stringify(valeur));
        await fsp.rename(temporaire, cible);
    }

    async supprimer(cle) {
        await fsp.rm(this.chemin(cle), { force: true });
    }

    async cles() {
        const noms = await fsp.readdir(this.dossier);
        return noms
            .filter(nom => nom.endsWith('.json'))
            .map(nom => nom.slice(0, -5))
            .sort();
    }

    async tout() {
        const documents = [];
        for (const cle of await this.cles()) {
            const valeur = await this.lire(cle);
            if (valeur !== undefined) documents.push(valeur);
        }
        return documents;
    }

    async vider() {
        for (const cle of await this.cles()) await this.supprimer(cle);
    }
}
