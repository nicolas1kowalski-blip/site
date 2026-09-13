/**
 * Tirages pseudo-aléatoires reproductibles (générateur « mulberry32 », 32 bits) : à graine égale, le jeu de
 * démonstration est toujours identique. La documentation, les captures d'écran et les tests parlent donc
 * exactement des mêmes lignes, et l'on peut régénérer le jeu sans que la démonstration change.
 */

/** Crée un tirage : nombres réels, entiers, probabilités, choix dans une liste, choix pondéré, mélange, loi normale. */
export function creerTirage(graine) {
    let etat = graine >>> 0;
    // Suite de nombres dans [0, 1[ : chaque appel fait avancer l'état d'un pas.
    const prochainReel = () => {
        etat = (etat + 0x6d2b79f5) >>> 0;
        let melange = Math.imul(etat ^ (etat >>> 15), 1 | etat);
        melange = (melange + Math.imul(melange ^ (melange >>> 7), 61 | melange)) ^ melange;
        return ((melange ^ (melange >>> 14)) >>> 0) / 4294967296;
    };
    return {
        reel: (minimum, maximum) => minimum + prochainReel() * (maximum - minimum),
        entier: (minimum, maximum) => Math.floor(minimum + prochainReel() * (maximum - minimum + 1)),
        /** Vrai avec la probabilité donnée : à 0 jamais, à 1 toujours. C'est ce tirage qui sème les défauts. */
        chance: probabilite => prochainReel() < probabilite,
        choisir: liste => liste[Math.floor(prochainReel() * liste.length)],
        /** Choix pondéré parmi des entrées { valeur, poids } : les poids n'ont pas besoin de faire 1. */
        choisirSelonPoids(entrees) {
            const total = entrees.reduce((somme, entree) => somme + entree.poids, 0);
            let seuil = prochainReel() * total;
            for (const entree of entrees) {
                seuil -= entree.poids;
                if (seuil <= 0) return entree.valeur;
            }
            return entrees[entrees.length - 1].valeur;
        },
        /** Copie mélangée d'une liste (mélange de Fisher-Yates). */
        melanger(liste) {
            const copie = [...liste];
            for (let position = copie.length - 1; position > 0; position--) {
                const autre = Math.floor(prochainReel() * (position + 1));
                [copie[position], copie[autre]] = [copie[autre], copie[position]];
            }
            return copie;
        },
        /** Loi normale (méthode de Box-Muller), bornée à trois écarts-types pour éviter les valeurs absurdes. */
        normale(moyenne, ecartType) {
            const premier = Math.max(prochainReel(), 1e-9);
            const second = prochainReel();
            const centre = Math.sqrt(-2 * Math.log(premier)) * Math.cos(2 * Math.PI * second);
            return moyenne + ecartType * Math.max(-3, Math.min(3, centre));
        }
    };
}
