// Dépôt de fichiers d'un espace de travail : les fichiers sources déposés par le navigateur, les Parquet
// produits par le moteur et les fichiers temporaires d'échange. Un seul dossier plat ; les noms sont
// vérifiés (verifierNomSur) pour interdire toute traversée de répertoire.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { erreurIntrouvable, erreurTropVolumineux, verifierNomSur } from '../erreurs.mjs';

export class DepotFichiers {
    /** @param {string} dossier  Dossier absolu (créé s'il n'existe pas). @param {number} tailleMax  Octets. */
    constructor(dossier, tailleMax) {
        this.dossier = dossier;
        this.tailleMax = tailleMax;
        fs.mkdirSync(dossier, { recursive: true });
    }

    chemin(nom) {
        return path.join(this.dossier, verifierNomSur(nom, 'nom de fichier'));
    }

    /**
     * Écrit le contenu d'un flux (corps de requête) dans le fichier. Au-delà de la taille maximale, l'écriture
     * s'arrête, le reste du corps est vidé (pour que la réponse 413 parte proprement) et rien ne reste sur le disque.
     */
    async ecrireDepuisFlux(nom, flux) {
        const cible = this.chemin(nom);
        const temporaire = cible + '.partiel';
        const sortie = fs.createWriteStream(temporaire);
        let ecrits = 0;
        let depassement = false;
        try {
            for await (const morceau of flux) {
                if (depassement) continue;
                ecrits += morceau.length;
                if (ecrits > this.tailleMax) {
                    depassement = true;
                    continue;
                }
                if (!sortie.write(morceau)) await once(sortie, 'drain');
            }
            await new Promise((resoudre, rejeter) => sortie.end(erreur => (erreur ? rejeter(erreur) : resoudre())));
            if (depassement)
                throw erreurTropVolumineux(
                    `Fichier trop volumineux (limite : ${Math.round(this.tailleMax / 1048576)} Mo).`
                );
            await fsp.rename(temporaire, cible);
        } catch (erreur) {
            sortie.destroy();
            await fsp.rm(temporaire, { force: true });
            throw erreur;
        }
        return { nom, taille: ecrits };
    }

    async ecrire(nom, contenu) {
        const cible = this.chemin(nom);
        await fsp.writeFile(cible, contenu);
        return { nom, taille: contenu.length };
    }

    async decrire(nom) {
        const cible = this.chemin(nom);
        try {
            const infos = await fsp.stat(cible);
            return { nom, taille: infos.size, modifie: infos.mtime.toISOString(), chemin: cible };
        } catch (erreur) {
            if (erreur.code === 'ENOENT') throw erreurIntrouvable(`Fichier introuvable : ${nom}`);
            throw erreur;
        }
    }

    /** Flux de lecture, avec plage d'octets facultative (utilisée pour renifler l'encodage d'un CSV). */
    async lireFlux(nom, plage) {
        const description = await this.decrire(nom);
        const options = {};
        if (plage) {
            options.start = plage.debut;
            options.end = Math.min(plage.fin, description.taille - 1);
        }
        return { flux: fs.createReadStream(description.chemin, options), description };
    }

    async supprimer(nom) {
        await fsp.rm(this.chemin(nom), { force: true });
    }

    async lister() {
        const noms = await fsp.readdir(this.dossier);
        const descriptions = [];
        for (const nom of noms.sort()) {
            if (nom.endsWith('.partiel')) continue;
            const infos = await fsp.stat(path.join(this.dossier, nom));
            if (infos.isFile()) descriptions.push({ nom, taille: infos.size, modifie: infos.mtime.toISOString() });
        }
        return descriptions;
    }

    async tailleTotale() {
        return (await this.lister()).reduce((somme, fichier) => somme + fichier.taille, 0);
    }

    /** Supprime les fichiers dont le nom commence par un préfixe (fichiers d'une table supprimée). */
    async supprimerParPrefixe(prefixe) {
        let supprimes = 0;
        for (const fichier of await this.lister()) {
            if (fichier.nom.startsWith(prefixe)) {
                await this.supprimer(fichier.nom);
                supprimes++;
            }
        }
        return supprimes;
    }
}
