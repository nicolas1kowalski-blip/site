/**
 * Lecture d'un petit tableau fourni par l'utilisateur — le fichier ou la liste collée du filtre « dans le fichier ».
 *
 * Ce n'est pas une importation : rien n'est chargé en base. On rend simplement un tableau de texte
 * (des en-têtes, des lignes) que l'écran affiche et que la spécification d'extraction emporte avec elle.
 *
 * Le séparateur est deviné (point-virgule, tabulation, virgule, barre verticale) : on ne demande rien à
 * l'utilisateur tant qu'on peut trancher tout seul. Les guillemets sont respectés, y compris quand ils
 * entourent une valeur contenant un retour à la ligne.
 *
 * Fonctions pures : du texte entre, un tableau sort.
 */

/** Séparateurs essayés, dans l'ordre de préférence des fichiers français. */
export const SEPARATEURS_POSSIBLES = [';', '\t', ',', '|'] as const;

/** Un tableau fourni : la première ligne donne les en-têtes, les suivantes les valeurs. */
export type TableauFichier = { colonnes: string[]; lignes: string[][] };

/** Au-delà, ce n'est plus une liste mais une source : mieux vaut la charger comme telle. */
export const LIGNES_LUES_MAXIMUM = 50_000;

/**
 * Le séparateur le plus probable : celui qui découpe la première ligne non vide en le plus de morceaux.
 * À égalité — ou si rien ne découpe — on garde le point-virgule, qui ne coupe alors rien du tout.
 */
export function detecterSeparateur(texte: string): string {
    const premiere = texte.split(/\r?\n/).find(ligne => ligne.trim() !== '') || '';
    let meilleur = ';';
    let morceaux = 1;
    for (const candidat of SEPARATEURS_POSSIBLES) {
        const compte = decouperLigne(premiere, candidat).length;
        if (compte > morceaux) {
            meilleur = candidat;
            morceaux = compte;
        }
    }
    return meilleur;
}

/** Découpe une seule ligne, guillemets compris : sert à comparer les séparateurs candidats. */
export function decouperLigne(ligne: string, separateur: string): string[] {
    const lignes = decouperTexte(ligne, separateur);
    return lignes[0] || [''];
}

/**
 * Découpe un texte entier en cellules. Un guillemet ouvre une valeur protégée : à l'intérieur, le
 * séparateur et les retours à la ligne sont du texte ordinaire, et deux guillemets valent un guillemet.
 */
export function decouperTexte(texte: string, separateur: string): string[][] {
    const lignes: string[][] = [];
    let ligne: string[] = [];
    let cellule = '';
    let protege = false;
    for (let position = 0; position < texte.length; position += 1) {
        const caractere = texte[position];
        if (protege) {
            if (caractere !== '"') cellule += caractere;
            else if (texte[position + 1] === '"') {
                cellule += '"';
                position += 1;
            } else protege = false;
            continue;
        }
        if (caractere === '"') protege = true;
        else if (caractere === separateur) {
            ligne.push(cellule);
            cellule = '';
        } else if (caractere === '\n') {
            ligne.push(cellule);
            lignes.push(ligne);
            ligne = [];
            cellule = '';
        } else if (caractere !== '\r') cellule += caractere;
    }
    ligne.push(cellule);
    lignes.push(ligne);
    return lignes;
}

/**
 * Des en-têtes utilisables : une colonne sans nom devient « Colonne 3 », un nom en double est numéroté.
 * Les écrans s'en servent comme identifiants, ils doivent donc être non vides et distincts.
 */
export function nommerEnTetes(entetes: string[]): string[] {
    const pris = new Set<string>();
    return entetes.map((entete, index) => {
        const propose = entete.trim() || `Colonne ${index + 1}`;
        let nom = propose;
        let suite = 2;
        while (pris.has(nom)) {
            nom = `${propose} (${suite})`;
            suite += 1;
        }
        pris.add(nom);
        return nom;
    });
}

/** Un tableau à partir de lignes déjà découpées (une feuille Excel, par exemple). */
export function tableauDepuisLignes(lignes: string[][]): TableauFichier {
    const utiles = lignes.filter(ligne => ligne.some(cellule => String(cellule ?? '').trim() !== ''));
    if (!utiles.length) return { colonnes: [], lignes: [] };
    const colonnes = nommerEnTetes(utiles[0].map(cellule => String(cellule ?? '')));
    const corps = utiles.slice(1, LIGNES_LUES_MAXIMUM + 1).map(ligne => colonnes.map((_, index) => String(ligne[index] ?? '').trim()));
    return { colonnes, lignes: corps };
}

/**
 * Un tableau à partir d'un texte délimité. Une liste collée sans en-tête reste exploitable : on ne devine
 * rien, la première ligne est toujours l'en-tête — c'est la règle du classique, et l'écran permet de le
 * corriger d'un clic en réintégrant la première ligne.
 */
export function lireTexteDelimite(texte: string, separateur?: string): TableauFichier {
    const retenu = separateur || detecterSeparateur(texte);
    return tableauDepuisLignes(decouperTexte(texte.replace(/^\uFEFF/, ''), retenu));
}
