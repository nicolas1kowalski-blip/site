/**
 * Lire le fichier d'un import de gouvernance, et fabriquer le modèle d'alimentation à remplir.
 *
 * Deux gestes, l'un en face de l'autre :
 *   • **lire** un CSV tel qu'il sort d'un tableur — séparé par des points-virgules ou des virgules, avec
 *     des guillemets autour des valeurs qui en contiennent, et des retours à la ligne au milieu ;
 *   • **écrire** le modèle pré-rempli : les clés internes y sont déjà (les tables et leurs colonnes, les
 *     objets et leurs informations, les applications déclarées), avec ce que l'on sait déjà. Il ne reste
 *     que les cases vides à compléter dans le tableur, et le fichier revient tel quel : les colonnes sont
 *     alors reconnues toutes seules.
 *
 * Fonctions pures : elles ne lisent aucun fichier et n'en écrivent aucun — elles transforment du texte.
 */
import type { Actif, ObjetMetier, Source, TermeGlossaire } from '../../coeur/modeles';
import type { CibleImport, GouvernanceEnMemoire } from './import-gouvernance';

/** Ce qu'un fichier donne une fois lu : ses en-têtes, et une ligne par élément à importer. */
export type FichierLu = { colonnes: string[]; lignes: Record<string, string>[] };

/**
 * Le séparateur d'un CSV : celui, parmi le point-virgule et la virgule, qui découpe la première ligne en
 * le plus de morceaux. Les tableurs français écrivent des points-virgules, les autres des virgules.
 */
export function separateurDe(premiereLigne: string): string {
    const pointsVirgules = (premiereLigne.match(/;/g) || []).length;
    const virgules = (premiereLigne.match(/,/g) || []).length;
    return pointsVirgules >= virgules ? ';' : ',';
}

/**
 * Découpe un CSV en tableau de cases. On avance caractère par caractère plutôt que de couper sur le
 * séparateur : c'est le seul moyen de respecter les guillemets, qui peuvent contenir le séparateur
 * lui-même, un retour à la ligne, ou un guillemet doublé.
 */
export function casesDuCsv(texte: string, separateur: string): string[][] {
    const lignes: string[][] = [];
    let ligne: string[] = [];
    let case_ = '';
    let entreGuillemets = false;
    const contenu = texte.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    for (let position = 0; position < contenu.length; position++) {
        const caractere = contenu[position];
        if (entreGuillemets) {
            if (caractere !== '"') case_ += caractere;
            else if (contenu[position + 1] === '"') {
                case_ += '"';
                position++;
            } else entreGuillemets = false;
            continue;
        }
        if (caractere === '"') entreGuillemets = true;
        else if (caractere === separateur) {
            ligne.push(case_);
            case_ = '';
        } else if (caractere === '\n') {
            ligne.push(case_);
            lignes.push(ligne);
            ligne = [];
            case_ = '';
        } else case_ += caractere;
    }
    if (case_ || ligne.length) {
        ligne.push(case_);
        lignes.push(ligne);
    }
    return lignes.filter(une => une.some(valeur => valeur.trim() !== ''));
}

/** Lit un CSV : la première ligne nomme les colonnes, les suivantes portent les valeurs. */
export function lireLeCsv(texte: string): FichierLu {
    const premiere = texte.split(/\r?\n/)[0] || '';
    const cases = casesDuCsv(texte, separateurDe(premiere));
    if (!cases.length) return { colonnes: [], lignes: [] };
    // Une colonne sans nom reste utilisable : on lui en donne un plutôt que de perdre ses valeurs.
    const colonnes = cases[0].map((nom, rang) => nom.trim() || `Colonne ${rang + 1}`);
    const lignes = cases.slice(1).map(valeurs => {
        const ligne: Record<string, string> = {};
        colonnes.forEach((colonne, rang) => (ligne[colonne] = (valeurs[rang] ?? '').trim()));
        return ligne;
    });
    return { colonnes, lignes };
}

// ---- le modèle d'alimentation ----

/** Le modèle d'une cible : sa première ligne nomme les colonnes, les suivantes portent les clés connues. */
export type ModeleDAlimentation = { colonnes: string[]; lignes: string[][] };

/** Les en-têtes du modèle : les libellés de la cible, débarrassés de la mention « (clé) ». */
export function enTetesDuModele(cible: CibleImport): string[] {
    return cible.champs.map(champ => champ.libelle.replace(/\s*\(clé\)\s*$/, ''));
}

/** Les informations d'un objet, cœur et variantes réunis — le modèle doit toutes les proposer. */
function informationsDe(objet: ObjetMetier): { nom: string; definition: string; exemples: string; proprietaire: string }[] {
    const toutes = [...(objet.elements || []), ...(objet.structure || []).flatMap(variante => variante.elements || [])];
    return toutes.map(information => ({
        nom: information.name,
        definition: information.definition || '',
        exemples: String(information.examples || ''),
        proprietaire: String(information.owner || '')
    }));
}

/** Le nom d'un terme de glossaire par son identifiant : le fichier parle en clair, jamais en identifiants. */
function nomDuTerme(glossaire: TermeGlossaire[], identifiant: unknown): string {
    return glossaire.find(terme => terme.id === identifiant)?.term || '';
}

/** Ce que l'on sait déjà d'une colonne du dictionnaire, prêt à être relu dans un tableur. */
function lignesDuDictionnaire(gouvernance: GouvernanceEnMemoire, sources: Source[]): string[][] {
    const lignes: string[][] = [];
    for (const source of sources)
        for (const colonne of source.headers || []) {
            const connue = gouvernance.dictionnaire[source.name]?.columns?.[colonne] || {};
            lignes.push([
                source.name,
                colonne,
                connue.description || '',
                connue.technicalType || '',
                connue.sensitivity || '',
                nomDuTerme(gouvernance.glossaire, connue.term)
            ]);
        }
    return lignes;
}

/** Le genre d'un actif, écrit dans les mots du fichier plutôt qu'en code interne. */
function motDuGenre(actif: Actif): string {
    if (actif.kind === 'process') return 'processus';
    if (actif.kind === 'report') return 'restitution';
    return 'application';
}

/**
 * Le modèle pré-rempli d'une cible : autant de lignes que de clés internes réelles, avec les valeurs déjà
 * connues. Pour les cibles qui déclarent des liens (usages, applications par objet), on ne pré-remplit que
 * ce qui identifie — c'est à la personne de dire quels liens existent.
 */
export function modeleDAlimentation(cible: CibleImport, gouvernance: GouvernanceEnMemoire, sources: Source[]): ModeleDAlimentation {
    const colonnes = enTetesDuModele(cible);
    if (cible.cle === 'dictionnaire') return { colonnes, lignes: lignesDuDictionnaire(gouvernance, sources) };
    if (cible.cle === 'glossaire')
        return {
            colonnes,
            lignes: gouvernance.glossaire.map(terme => [
                terme.term,
                terme.definition || '',
                String(terme['domain'] || ''),
                String(terme['owner'] || '')
            ])
        };
    if (cible.cle === 'actifs')
        return {
            colonnes,
            lignes: gouvernance.actifs.map(actif => [
                actif.name,
                motDuGenre(actif),
                actif.criticality || '',
                actif.description || '',
                actif.owner || '',
                actif.domain || ''
            ])
        };
    if (cible.cle === 'informations')
        return {
            colonnes,
            lignes: gouvernance.objets.flatMap(objet =>
                informationsDe(objet).map(information => [
                    objet.name,
                    information.nom,
                    information.definition,
                    information.exemples,
                    '',
                    '',
                    information.proprietaire,
                    '',
                    ''
                ])
            )
        };
    if (cible.cle === 'usages')
        return {
            colonnes,
            lignes: gouvernance.objets.flatMap(objet => informationsDe(objet).map(information => [objet.name, information.nom, '']))
        };
    if (cible.cle === 'objets')
        return {
            colonnes,
            lignes: gouvernance.objets.map(objet => [
                objet.name,
                objet.definition || '',
                objet.globalOwner || '',
                objet.domain || '',
                '',
                objet.sources.find(source => source.role === 'maitre')?.table || ''
            ])
        };
    return { colonnes, lignes: gouvernance.objets.map(objet => [objet.name, '', '']) };
}

/** Combien de clés le modèle apporte déjà : c'est ce que l'on annonce avant de le télécharger. */
export function clesDuModele(modele: ModeleDAlimentation): number {
    return modele.lignes.length;
}
