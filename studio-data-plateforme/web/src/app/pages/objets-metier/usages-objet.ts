/**
 * Qui se sert de quoi, information par information — repris de la V13 de l'application classique.
 *
 * Déclarer qu'une application « utilise l'objet Client » ne dit presque rien : au moment de changer une
 * colonne, la seule question utile est « qui lit **cette** information ? ». La V13 y répond par une matrice
 * information × application, et par une vue « par application » qui va plus vite quand elles sont nombreuses.
 *
 * Ce fichier tient aussi le compte de ce qui n'est déclaré nulle part : une information dont personne ne dit
 * se servir est soit inutile, soit mal connue — dans les deux cas, c'est bon à savoir.
 *
 * Fonctions pures : elles ne connaissent que les objets, jamais l'écran.
 */
import type { Actif, AttributObjetMetier, ObjetMetier } from '../../coeur/modeles';

/** Les deux façons de regarder les usages, comme dans le classique. */
export const VUES_DES_USAGES: { cle: string; libelle: string }[] = [
    { cle: 'application', libelle: '🖥 Par application' },
    { cle: 'matrice', libelle: '▦ Matrice complète' }
];

/** Au-delà de ce nombre d'applications, la matrice devient illisible : on ouvre sur la vue par application. */
export const APPLICATIONS_AVANT_LA_VUE_PAR_APPLICATION = 6;

/** La vue à ouvrir en premier : la matrice tant qu'elle tient à l'écran, sinon l'autre. */
export function vueDouverture(nombreDActifs: number): string {
    return nombreDActifs > APPLICATIONS_AVANT_LA_VUE_PAR_APPLICATION ? 'application' : 'matrice';
}

/**
 * Une ligne de la matrice : une information, et la variante d'où elle vient quand elle n'est pas au cœur de
 * l'objet. Le nom de la variante est montré pour qu'on sache de quelle « adresse » on parle.
 */
export type LigneDUsage = { information: AttributObjetMetier; variante: string };

/** Toutes les informations de l'objet, celles du cœur puis celles de chaque variante. */
export function lignesDUsage(objet: ObjetMetier): LigneDUsage[] {
    const lignes: LigneDUsage[] = (objet.elements || []).map(information => ({ information, variante: '' }));
    for (const variante of objet.structure || [])
        for (const information of variante.elements || []) lignes.push({ information, variante: variante.name });
    return lignes;
}

/** Vrai quand cette information est déclarée utilisée par cet actif. */
export function utiliseePar(information: AttributObjetMetier, actifId: string): boolean {
    return (information.usedBy || []).includes(actifId);
}

/** Déclare, ou retire, l'usage d'une information par un actif. */
export function poserLUsage(information: AttributObjetMetier, actifId: string, utilise: boolean): void {
    const usages = information.usedBy || [];
    if (utilise) {
        if (!usages.includes(actifId)) usages.push(actifId);
    } else {
        const position = usages.indexOf(actifId);
        if (position >= 0) usages.splice(position, 1);
    }
    information.usedBy = usages;
}

/**
 * Le même geste sur toutes les informations à la fois — « ✔ Tout cocher » d'une colonne de la matrice.
 * Renvoie le nombre de lignes réellement changées : c'est ce que l'on annonce ensuite.
 */
export function poserLUsagePourToutes(lignes: LigneDUsage[], actifId: string, utilise: boolean): number {
    let changees = 0;
    for (const ligne of lignes) {
        if (utiliseePar(ligne.information, actifId) === utilise) continue;
        poserLUsage(ligne.information, actifId, utilise);
        changees++;
    }
    return changees;
}

/** Les actifs qui se servent de cette information, hormis celui que l'on regarde. */
export function autresUsages(information: AttributObjetMetier, actifId: string, actifs: Actif[]): Actif[] {
    return (information.usedBy || [])
        .filter(identifiant => identifiant !== actifId)
        .map(identifiant => actifs.find(actif => actif.id === identifiant))
        .filter((actif): actif is Actif => !!actif);
}

/**
 * L'application d'où vient cette information, quand elle diffère de celle qui produit l'objet. C'est le
 * signal qu'une information a une histoire à elle : elle mérite d'être vue.
 */
export function sourceDifferente(information: AttributObjetMetier, sourceDeLObjet: string): boolean {
    const source = String(information['sourceApp'] || '');
    return !!source && source !== sourceDeLObjet;
}

/** Ce que la matrice apprend d'un coup d'œil : combien d'informations personne ne lit, combien ont leur propre source. */
export function bilanDesUsages(lignes: LigneDUsage[], sourceDeLObjet: string): { sansUsage: number; sourcesPropres: number } {
    return {
        sansUsage: lignes.filter(ligne => !(ligne.information.usedBy || []).length).length,
        sourcesPropres: lignes.filter(ligne => sourceDifferente(ligne.information, sourceDeLObjet)).length
    };
}

/** Le compte affiché au-dessus d'une colonne : « 3/12 information(s) cochée(s) ». */
export function compteDesUsages(lignes: LigneDUsage[], actifId: string): string {
    const coches = lignes.filter(ligne => utiliseePar(ligne.information, actifId)).length;
    return `${coches}/${lignes.length} information(s) cochée(s)`;
}

// ---- exemples de valeurs pris dans les données ----

/**
 * Faut-il aller chercher des exemples pour cette information ? Jamais quand quelqu'un les a écrits à la
 * main : remplacer un travail humain par un tirage automatique serait le détruire. Le drapeau
 * `examplesAuto` dit que les exemples présents viennent déjà d'un échantillonnage, donc remplaçables.
 */
export function aEchantillonner(information: AttributObjetMetier): boolean {
    if (!(information.mappings || []).length) return false;
    return !information.examples || !!information['examplesAuto'];
}

/** Ce qu'a donné un échantillonnage de toutes les informations : de quoi en rendre compte honnêtement. */
export type BilanEchantillonnage = { completees: number; gardees: number; sansColonne: number; sansValeur: number };

/** Le bilan vide, à remplir au fur et à mesure des colonnes lues. */
export function bilanNeuf(): BilanEchantillonnage {
    return { completees: 0, gardees: 0, sansColonne: 0, sansValeur: 0 };
}

/** Range une information dans la bonne case du bilan, avant même d'avoir lu la moindre valeur. */
export function classerAvantEchantillonnage(information: AttributObjetMetier, bilan: BilanEchantillonnage): boolean {
    if (!(information.mappings || []).length) {
        bilan.sansColonne++;
        return false;
    }
    if (!aEchantillonner(information)) {
        bilan.gardees++;
        return false;
    }
    return true;
}

/** Pose des exemples venus des données sur une information, et le dit : ils pourront être remplacés. */
export function poserDesExemples(information: AttributObjetMetier, valeurs: string[]): void {
    information.examples = valeurs.join(' ; ');
    information['examplesAuto'] = true;
}

/** Le bilan en une phrase — on ne tait ni ce qui a été laissé de côté, ni pourquoi. */
export function phraseDuBilan(bilan: BilanEchantillonnage): string {
    const morceaux = [`${bilan.completees} information(s) complétée(s)`];
    if (bilan.gardees) morceaux.push(`${bilan.gardees} laissée(s) intacte(s) car saisie(s) à la main`);
    if (bilan.sansColonne) morceaux.push(`${bilan.sansColonne} sans colonne rattachée`);
    if (bilan.sansValeur) morceaux.push(`${bilan.sansValeur} sans valeur dans le fichier`);
    return morceaux.join(' · ') + '.';
}
