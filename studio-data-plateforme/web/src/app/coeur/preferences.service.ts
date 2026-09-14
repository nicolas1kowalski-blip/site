/**
 * Préférences d'affichage mémorisées par écran : repli d'un détail, vue liste ou cartes, filtres retenus,
 * densité. Elles vivent dans le navigateur de la personne (localStorage) et ne partent jamais au serveur :
 * ce sont des habitudes de travail, pas des données de l'espace.
 *
 * Le stockage local peut être refusé (navigation privée, réglage du navigateur) : dans ce cas, la préférence
 * vaut pour la session en cours et rien n'échoue.
 */
import { Injectable } from '@angular/core';

/** Préfixe commun, pour ne pas marcher sur les clés d'une autre application du même domaine. */
const PREFIXE = 'studio-data.';

@Injectable({ providedIn: 'root' })
export class PreferencesService {
    /** Valeurs de la session, utilisées quand le navigateur refuse le stockage local. */
    private readonly enMemoire = new Map<string, string>();

    lire(cle: string, defaut = ''): string {
        try {
            const valeur = localStorage.getItem(PREFIXE + cle);
            if (valeur !== null) return valeur;
        } catch {
            // Stockage indisponible : on retombe sur la mémoire de la session.
        }
        return this.enMemoire.get(cle) ?? defaut;
    }

    lireBooleen(cle: string, defaut = false): boolean {
        const valeur = this.lire(cle, defaut ? 'oui' : 'non');
        return valeur === 'oui' || valeur === 'true';
    }

    ecrire(cle: string, valeur: string | boolean): void {
        const texte = typeof valeur === 'boolean' ? (valeur ? 'oui' : 'non') : valeur;
        this.enMemoire.set(cle, texte);
        try {
            localStorage.setItem(PREFIXE + cle, texte);
        } catch {
            // Stockage indisponible : la préférence ne survivra pas à la fermeture de l'onglet.
        }
    }

    oublier(cle: string): void {
        this.enMemoire.delete(cle);
        try {
            localStorage.removeItem(PREFIXE + cle);
        } catch {
            // Rien à faire : la clé n'a jamais été écrite.
        }
    }
}
