/**
 * Dépôt de fichiers d'un espace : fichiers sources déposés par le navigateur, Parquet produits par le moteur,
 * fichiers d'échange. Un dossier plat par espace ; les noms sont vérifiés (verifierNomSur) pour interdire
 * toute traversée de répertoire.
 */
import { once } from 'node:events';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { erreurIntrouvable, erreurTropVolumineux, verifierNomSur } from '../commun/erreurs';

export type DescriptionFichier = { nom: string; taille: number; modifie: string };

export class DepotFichiers {
    constructor(
        readonly dossier: string,
        private readonly tailleMax: number
    ) {
        fs.mkdirSync(dossier, { recursive: true });
    }

    chemin(nom: string): string {
        return path.join(this.dossier, verifierNomSur(nom, 'nom de fichier'));
    }

    /**
     * Écrit un flux (corps de requête) dans le fichier. Au-delà de la taille maximale, l'écriture s'arrête, le
     * reste du corps est vidé pour que la réponse 413 parte proprement, et rien ne reste sur le disque.
     */
    async ecrireDepuisFlux(nom: string, flux: Readable): Promise<{ nom: string; taille: number }> {
        const cible = this.chemin(nom);
        const temporaire = cible + '.partiel';
        const sortie = fs.createWriteStream(temporaire);
        let ecrits = 0;
        let depassement = false;
        try {
            for await (const morceau of flux) {
                if (depassement) continue;
                ecrits += (morceau as Buffer).length;
                if (ecrits > this.tailleMax) {
                    depassement = true;
                    continue;
                }
                if (!sortie.write(morceau)) await once(sortie, 'drain');
            }
            await new Promise<void>((resoudre, rejeter) => sortie.end((erreur?: Error | null) => (erreur ? rejeter(erreur) : resoudre())));
            if (depassement) throw erreurTropVolumineux(`Fichier trop volumineux (limite : ${Math.round(this.tailleMax / 1048576)} Mo).`);
            await fsp.rename(temporaire, cible);
        } catch (erreur) {
            sortie.destroy();
            await fsp.rm(temporaire, { force: true });
            throw erreur;
        }
        return { nom, taille: ecrits };
    }

    async decrire(nom: string): Promise<DescriptionFichier & { chemin: string }> {
        const cible = this.chemin(nom);
        try {
            const infos = await fsp.stat(cible);
            return { nom, taille: infos.size, modifie: infos.mtime.toISOString(), chemin: cible };
        } catch (erreur) {
            if ((erreur as { code?: string }).code === 'ENOENT') throw erreurIntrouvable(`Fichier introuvable : ${nom}`);
            throw erreur;
        }
    }

    /** Flux de lecture, avec plage d'octets facultative (reniflage d'encodage d'un CSV). */
    async lireFlux(nom: string, plage?: { debut: number; fin: number } | null) {
        const description = await this.decrire(nom);
        const options: { start?: number; end?: number } = {};
        if (plage) {
            options.start = plage.debut;
            options.end = Math.min(plage.fin, description.taille - 1);
        }
        return { flux: fs.createReadStream(description.chemin, options), description };
    }

    async supprimer(nom: string): Promise<void> {
        await fsp.rm(this.chemin(nom), { force: true });
    }

    async lister(): Promise<DescriptionFichier[]> {
        const noms = (await fsp.readdir(this.dossier)).sort();
        const descriptions: DescriptionFichier[] = [];
        for (const nom of noms) {
            if (nom.endsWith('.partiel')) continue;
            const infos = await fsp.stat(path.join(this.dossier, nom));
            if (infos.isFile()) descriptions.push({ nom, taille: infos.size, modifie: infos.mtime.toISOString() });
        }
        return descriptions;
    }

    async supprimerParPrefixe(prefixe: string): Promise<number> {
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
