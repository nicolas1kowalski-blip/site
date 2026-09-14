/**
 * Les variantes d'un objet métier, le nombre de valeurs d'une information, et les colonnes répétées —
 * repris de la V13 de l'application classique.
 *
 * Trois choses que la fiche d'un objet doit savoir dire, et que l'écran déclaratif seul ne dit pas :
 *
 *   • **une variante** (le mot technique est « facette ») : une même table porte souvent plusieurs choses.
 *     Un fichier de contacts contient les contacts commerciaux et les contacts techniques ; un fichier de
 *     mouvements contient les entrées et les sorties. Une variante est une **vue filtrée** de cette table —
 *     son nom, sa cardinalité avec l'objet, ses filtres de portée, et ses propres informations ;
 *
 *   • **le nombre de valeurs** qu'une information peut prendre pour une occurrence de l'objet : une seule
 *     (un SIRET), ou plusieurs (des adresses électroniques). Cela se déclare, ou se devine ;
 *
 *   • **les colonnes répétées** : adresse_1, adresse_2, adresse_3 ne sont pas trois informations mais une
 *     seule, à trois valeurs. On les replie, et le nombre de valeurs se déduit du plus grand numéro.
 *
 * Fonctions pures : elles ne connaissent que les objets, jamais l'écran.
 */
import type { AttributObjetMetier, FiltreDePortee, InformationDeVariante, VarianteObjet } from '../../coeur/modeles';

// Les trois formes sont décrites une seule fois, avec le reste des modèles ; on les redonne ici pour que
// tout ce qui touche aux variantes se lise depuis ce fichier.
export type { FiltreDePortee, InformationDeVariante, VarianteObjet };

/** Les cardinalités possibles entre l'objet et sa variante, comme dans le classique. */
export const CARDINALITES_VARIANTE = ['1–1', '1–N', 'N–1', 'N–N'];

/** Les opérateurs d'un filtre de portée, et ce qu'ils disent en clair. */
export const OPERATEURS_PORTEE: Record<string, string> = {
    '=': '=',
    '!=': '≠',
    contains: 'contient',
    empty: 'est vide',
    notempty: 'n’est pas vide'
};

/**
 * Le groupe se répète-t-il ? C'est une propriété de la variante, pas de chacune de ses informations :
 * une cardinalité qui finit par N veut dire plusieurs occurrences du groupe pour un objet.
 */
export function groupeRepetable(variante: VarianteObjet): boolean {
    return /[–-]\s*N$/.test(variante.cardinality || '1–N');
}

/** Un filtre de portée, écrit en clair : « type = "technique" ». */
export function libelleDuFiltre(filtre: FiltreDePortee): string {
    const operateur = OPERATEURS_PORTEE[filtre.op] || filtre.op;
    const sansValeur = filtre.op === 'empty' || filtre.op === 'notempty';
    return `${filtre.col} ${operateur}${sansValeur ? '' : ` « ${filtre.val ?? ''} »`}`;
}

/** Ce que la variante délimite, en une ligne : ses filtres, ou toute la table. */
export function porteeDeLaVariante(variante: VarianteObjet): string {
    const filtres = variante.scope || [];
    if (!filtres.length) return 'toute la table';
    return filtres.map(libelleDuFiltre).join(' et ');
}

/** Le résumé affiché en tête d'une variante : d'où elle vient, ce qu'elle garde, à quelle condition. */
export function resumeDeLaVariante(variante: VarianteObjet): string {
    const applique = (variante.applies || []).length ? ` — si ${(variante.applies || []).map(libelleDuFiltre).join(' et ')}` : '';
    return `vue de ${variante.table} · ${porteeDeLaVariante(variante)}${applique}`;
}

/** Une variante neuve sur une table : une information par colonne, rien de filtré au départ. */
export function varianteNeuve(
    table: string,
    nom: string,
    colonnes: string[],
    identifiant: (prefixe: string) => string,
    cardinalite = '1–N'
): VarianteObjet {
    return {
        id: identifiant('st_'),
        name: nom.trim() || table,
        table,
        cardinality: cardinalite,
        scope: [],
        applies: [],
        elements: colonnes.map(colonne => ({
            id: identifiant('fe_'),
            name: colonne,
            definition: '',
            owner: '',
            col: colonne,
            mappings: [{ table, col: colonne }],
            usedBy: []
        }))
    };
}

/** Une information neuve dans une variante : la première colonne de la table, à renommer ensuite. */
export function informationDeVarianteNeuve(
    variante: VarianteObjet,
    colonne: string,
    identifiant: (prefixe: string) => string
): InformationDeVariante {
    return {
        id: identifiant('fe_'),
        name: colonne || 'Nouvelle information',
        definition: '',
        owner: '',
        col: colonne,
        mappings: colonne ? [{ table: variante.table, col: colonne }] : [],
        usedBy: []
    };
}

// ---- nombre de valeurs ----

/**
 * Normalise ce qui a été déclaré comme nombre de valeurs. On accepte ce que les gens écrivent : « n »,
 * « plusieurs », « multi », « oui » valent n ; « 1 », « unique », « non » valent une seule ; un nombre reste
 * ce nombre. Le reste est ignoré plutôt que deviné.
 */
export function nombreDeValeursDeclare(valeur: unknown): string {
    const texte = String(valeur ?? '')
        .trim()
        .toLowerCase();
    if (!texte) return '';
    if (['n', '*', 'oui', 'plusieurs', 'multi', 'multivalué', 'n valeurs'].includes(texte)) return 'n';
    if (['1', 'non', 'unique', 'mono', '1 valeur'].includes(texte)) return '1';
    const nombre = Number.parseInt(texte, 10);
    if (Number.isFinite(nombre) && nombre >= 1 && nombre <= 999 && String(nombre) === texte.replace(/\s/g, '')) return String(nombre);
    return '';
}

/** Ce que l'on affiche comme nombre de valeurs, et d'où on le tient : déclaré, ou déduit des colonnes. */
export type NombreDeValeurs = { plusieurs: boolean; maximum: number; origine: 'déclaré' | 'déduit' | '' };

/** Le nombre de valeurs d'un groupe d'informations : ce qui est déclaré l'emporte sur ce qui est déduit. */
export function nombreDeValeurs(declare: unknown, repetitions: number): NombreDeValeurs {
    const valeur = nombreDeValeursDeclare(declare);
    if (valeur === 'n') return { plusieurs: true, maximum: 0, origine: 'déclaré' };
    if (valeur === '1') return { plusieurs: false, maximum: 1, origine: 'déclaré' };
    if (valeur) return { plusieurs: true, maximum: Number.parseInt(valeur, 10), origine: 'déclaré' };
    if (repetitions > 1) return { plusieurs: true, maximum: repetitions, origine: 'déduit' };
    return { plusieurs: false, maximum: 0, origine: '' };
}

/** Le badge du nombre de valeurs, dans les mots du classique : « 1 valeur », « 1 à 3 valeurs », « plusieurs valeurs ». */
export function libelleDuNombreDeValeurs(compte: NombreDeValeurs): string {
    if (!compte.plusieurs) return '1 valeur';
    return compte.maximum > 1 ? `1 à ${compte.maximum} valeurs` : 'plusieurs valeurs';
}

/**
 * Pourquoi ce nombre de valeurs — la phrase montrée en infobulle. On dit toujours d'où vient la réponse :
 * une déclaration du métier, une déduction faite sur les colonnes, ou l'absence des deux.
 */
export function pourquoiCeNombreDeValeurs(compte: NombreDeValeurs, colonnes: string[]): string {
    if (compte.origine === 'déclaré') return 'Déclaré sur l’objet métier.';
    if (compte.origine === 'déduit')
        return `Déduit de la structure technique : ${colonnes.length} colonnes numérotées${colonnes.length ? ` (${colonnes.join(', ')})` : ''}.`;
    return 'Aucune déclaration et aucune répétition détectée : une seule valeur.';
}

/**
 * Ce que l'on propose dans la liste « combien de valeurs », comme dans le classique : « déduit » laisse
 * parler les colonnes, les autres choix tranchent.
 */
export const OPTIONS_NOMBRE_DE_VALEURS: { valeur: string; libelle: string }[] = [
    { valeur: '', libelle: '— déduit —' },
    { valeur: '1', libelle: '1 valeur' },
    { valeur: 'n', libelle: 'plusieurs, sans limite' },
    ...[2, 3, 4, 5, 6, 8, 10, 12, 20].map(nombre => ({ valeur: String(nombre), libelle: `jusqu’à ${nombre}` }))
];

// ---- colonnes répétées ----

/**
 * Découpe un nom de colonne numéroté : « adresse_2 » donne { base: 'adresse', rang: 2 }. On refuse ce qui
 * n'est visiblement pas une répétition — « V1_2 », « CA_2024 » : la base ne doit pas finir par un chiffre,
 * et doit valoir plus d'une lettre.
 */
export function decouperColonneRepetee(nom: string): { base: string; rang: number } | null {
    const texte = String(nom || '').trim();
    const correspondance = texte.match(/^(.*?)[ _\-.]*\(?(\d{1,2})\)?$/);
    if (!correspondance) return null;
    const base = correspondance[1].replace(/[ _\-.]+$/, '').trim();
    if (base.length < 2 || /\d$/.test(base)) return null;
    const rang = Number.parseInt(correspondance[2], 10);
    if (!Number.isFinite(rang) || rang < 1) return null;
    return { base, rang };
}

/** Un groupe d'informations : une seule, ou plusieurs colonnes répétées vues comme une même information. */
export type GroupeDInformations = {
    /** Le nom montré : celui de l'information, ou la base commune des colonnes répétées. */
    base: string;
    /** Vrai quand le groupe replie plusieurs colonnes numérotées. */
    replie: boolean;
    informations: AttributObjetMetier[];
    /** Les numéros trouvés (1, 2, 3…) ; vide hors repli. */
    rangs: number[];
};

/**
 * Replie les colonnes répétées d'une liste d'informations. Une colonne numérotée toute seule n'est pas une
 * répétition : elle est rendue telle quelle.
 */
export function replierLesRepetitions(informations: AttributObjetMetier[]): GroupeDInformations[] {
    const groupes: GroupeDInformations[] = [];
    const parBase = new Map<string, GroupeDInformations>();
    for (const information of informations) {
        const decoupe = decouperColonneRepetee(information.name);
        if (!decoupe) {
            groupes.push({ base: information.name, replie: false, informations: [information], rangs: [] });
            continue;
        }
        const cle = decoupe.base.toLowerCase();
        let groupe = parBase.get(cle);
        if (!groupe) {
            groupe = { base: decoupe.base, replie: true, informations: [], rangs: [] };
            parBase.set(cle, groupe);
            groupes.push(groupe);
        }
        groupe.informations.push(information);
        groupe.rangs.push(decoupe.rang);
    }
    return groupes.map(groupe =>
        groupe.replie && groupe.informations.length < 2
            ? { base: groupe.informations[0].name, replie: false, informations: groupe.informations, rangs: [] }
            : groupe
    );
}

/**
 * Combien de fois l'information est répétée : le plus grand numéro rencontré, jamais moins que le nombre de
 * colonnes repliées — une numérotation trouée (adresse_1, adresse_3) reste trois valeurs possibles.
 */
export function repetitionsDuGroupe(groupe: GroupeDInformations): number {
    return groupe.replie ? Math.max(groupe.informations.length, ...groupe.rangs) : 0;
}

/** Les colonnes que recouvre un groupe, écrites « table.colonne » : c'est ce qui justifie le nombre déduit. */
export function colonnesDuGroupe(groupe: GroupeDInformations): string[] {
    return groupe.informations.flatMap(information => (information.mappings || []).map(lien => `${lien.table}.${lien.col}`));
}

/** La valeur d'un champ pour le groupe : la première renseignée parmi ses colonnes repliées. */
export function valeurDuGroupe(groupe: GroupeDInformations, champ: string): string {
    for (const information of groupe.informations) {
        const valeur = information[champ];
        if (valeur) return String(valeur);
    }
    return '';
}

/**
 * Écrire sur un groupe replié, c'est écrire sur **toutes** les colonnes qu'il recouvre : une seule saisie,
 * et aucune divergence possible entre adresse_1 et adresse_2.
 */
export function ecrireSurLeGroupe(groupe: GroupeDInformations, champ: string, valeur: unknown): void {
    for (const information of groupe.informations) information[champ] = valeur;
}

/** Renommer un groupe replié renomme chaque colonne en lui conservant son numéro : « courriel_2 ». */
export function renommerLeGroupe(groupe: GroupeDInformations, nom: string): void {
    const nouveau = String(nom || '').trim();
    if (!nouveau) return;
    for (const information of groupe.informations) {
        const decoupe = decouperColonneRepetee(information.name);
        information.name = decoupe ? nouveau + information.name.slice(decoupe.base.length) : nouveau;
    }
    groupe.base = nouveau;
}
