/**
 * Le diagramme du modèle d'objets — repris de la V13 (renderObjectModelDiagram).
 *
 * L'écran « Modèle de données » de la famille Patrimoine ne montre pas les fichiers, mais le **sens** :
 * les objets métier, ce qui les compose, et ce qui les relie. Trois traits, et rien d'autre :
 *
 *   • **🏛️ l'objet** — une carte portant son propriétaire et ses premières informations ; encadrée en
 *     vert plus sombre quand l'objet porte une hiérarchie ;
 *   • **◆ la composition** — chaque variante devient une carte reliée à l'objet, avec sa cardinalité et,
 *     s'il y en a, la condition sous laquelle elle s'applique. Le losange est du côté du tout, comme en UML ;
 *   • **→ la référence** — un trait pointillé d'un objet vers un autre, avec sa cardinalité.
 *
 * Fonctions pures : elles transforment des objets métier en nœuds et en liens, sans rien dessiner.
 */
import type { ObjetMetier, VarianteObjet } from '../../coeur/modeles';

/** Un nœud du diagramme, dans la forme que le composant de graphe attend. */
export type NoeudDuModele = {
    id: string;
    titre: string;
    lignes: string[];
    fondEnTete: string;
    couleurTitre: string;
    bordure: string;
};

/** Un lien du diagramme : composition, référence, ou hiérarchie. */
export type LienDuModele = { id: string; source: string; target: string; libelle: string; couleur: string; pointille: boolean };

/** Les couleurs du classique : vert pour les objets, vert clair pour les compositions, sarcelle pour les références. */
export const COULEURS_DU_MODELE = {
    objet: { fond: '#dcfce7', titre: '#14532d', bordure: '#16a34a' },
    objetAvecHierarchie: { fond: '#dcfce7', titre: '#14532d', bordure: '#059669' },
    composition: { fond: '#f0fdf4', titre: '#166534', bordure: '#86efac' },
    lienDeComposition: '#16a34a',
    lienDeReference: '#0d9488'
};

/** Combien d'informations la carte d'un objet montre avant de dire « … et N autres ». */
export const INFORMATIONS_MONTREES = 6;
/** Combien d'informations la carte d'une variante en montre. */
export const INFORMATIONS_DE_VARIANTE_MONTREES = 4;

/** Un filtre de portée écrit en clair, comme sur la fiche de l'objet. */
export function texteDUnFiltre(filtre: { col: string; op: string; val?: string }): string {
    const sansValeur = filtre.op === 'empty' || filtre.op === 'notempty';
    const operateurs: Record<string, string> = { '=': '=', '!=': '≠', contains: 'contient', empty: 'est vide', notempty: 'n’est pas vide' };
    const operateur = operateurs[filtre.op] || filtre.op;
    return `${filtre.col} ${operateur}${sansValeur ? '' : ` « ${filtre.val ?? ''} »`}`;
}

/** Ce que la variante garde de sa table, en une ligne. */
export function porteeEnClair(variante: VarianteObjet): string {
    const filtres = variante.scope || [];
    return filtres.length ? filtres.map(texteDUnFiltre).join(' · ') : 'toute la table';
}

/** Les lignes de la carte d'un objet : son propriétaire d'abord — son absence est ce qui saute aux yeux. */
export function lignesDeLObjet(objet: ObjetMetier): string[] {
    const informations = objet.elements || [];
    const lignes = [objet.globalOwner ? `👤 ${objet.globalOwner}` : '⚠️ sans propriétaire'];
    for (const information of informations.slice(0, INFORMATIONS_MONTREES)) lignes.push(`· ${information.name}`);
    if (informations.length > INFORMATIONS_MONTREES)
        lignes.push(`… ${informations.length - INFORMATIONS_MONTREES} autre(s) information(s)`);
    return lignes;
}

/** Les lignes de la carte d'une variante : d'où elle vient, ce qu'elle garde, puis ses informations. */
export function lignesDeLaVariante(variante: VarianteObjet): string[] {
    const informations = variante.elements || [];
    const lignes = [`📄 vue de ${variante.table}`, `⚗ ${porteeEnClair(variante)}`];
    for (const information of informations.slice(0, INFORMATIONS_DE_VARIANTE_MONTREES)) lignes.push(`· ${information.name}`);
    if (informations.length > INFORMATIONS_DE_VARIANTE_MONTREES)
        lignes.push(`… ${informations.length - INFORMATIONS_DE_VARIANTE_MONTREES} autre(s)`);
    return lignes;
}

/** Le titre d'une variante : son nom métier, ou sa table quand elle n'en porte pas d'autre. */
export function titreDeLaVariante(variante: VarianteObjet): string {
    return variante.name && variante.name !== variante.table ? variante.name : variante.table;
}

/** Ce qui est écrit sur le trait d'une composition : la cardinalité, et la condition d'application. */
export function libelleDeLaComposition(variante: VarianteObjet): string {
    const conditions = variante.applies || [];
    const application = conditions.length ? ` [si ${conditions.map(texteDUnFiltre).join(' et ')}]` : '';
    return `${variante.cardinality || ''}${application}`.trim();
}

/**
 * Le diagramme entier : un nœud par objet, un nœud par variante, un trait de composition vers chacune, et
 * un trait pointillé par référence — mais seulement vers les objets qui existent encore.
 */
export function diagrammeDesObjets(objets: ObjetMetier[]): { noeuds: NoeudDuModele[]; liens: LienDuModele[] } {
    const noeuds: NoeudDuModele[] = [];
    const liens: LienDuModele[] = [];
    const existants = new Set(objets.map(objet => objet.id));
    for (const objet of objets) {
        const avecHierarchie = ((objet['hierarchies'] as unknown[]) || []).length > 0;
        const couleurs = avecHierarchie ? COULEURS_DU_MODELE.objetAvecHierarchie : COULEURS_DU_MODELE.objet;
        noeuds.push({
            id: `bo:${objet.id}`,
            titre: `${avecHierarchie ? '🌳 ' : ''}🏛️ ${objet.name || '(sans nom)'}`,
            lignes: lignesDeLObjet(objet),
            fondEnTete: couleurs.fond,
            couleurTitre: couleurs.titre,
            bordure: couleurs.bordure
        });
        (objet.structure || []).forEach((variante, rang) => {
            const identifiant = `cmp:${objet.id}:${rang}`;
            noeuds.push({
                id: identifiant,
                titre: `◆ ${titreDeLaVariante(variante)}`,
                lignes: lignesDeLaVariante(variante),
                fondEnTete: COULEURS_DU_MODELE.composition.fond,
                couleurTitre: COULEURS_DU_MODELE.composition.titre,
                bordure: COULEURS_DU_MODELE.composition.bordure
            });
            liens.push({
                id: `e${identifiant}`,
                source: `bo:${objet.id}`,
                target: identifiant,
                libelle: libelleDeLaComposition(variante),
                couleur: COULEURS_DU_MODELE.lienDeComposition,
                pointille: false
            });
        });
        (objet.references || []).forEach((reference, rang) => {
            // Une référence vers un objet supprimé ne se dessine pas : elle ne mènerait nulle part.
            if (!existants.has(reference.boId)) return;
            liens.push({
                id: `ref:${objet.id}:${rang}`,
                source: `bo:${objet.id}`,
                target: `bo:${reference.boId}`,
                libelle: `→ ${reference.cardinality || ''}`.trim(),
                couleur: COULEURS_DU_MODELE.lienDeReference,
                pointille: true
            });
        });
    }
    return { noeuds, liens };
}

/** Ce que le diagramme apprend d'un coup d'œil, écrit en une phrase sous le dessin. */
export function resumeDuModele(objets: ObjetMetier[]): string {
    const compositions = objets.reduce((total, objet) => total + (objet.structure || []).length, 0);
    const existants = new Set(objets.map(objet => objet.id));
    const references = objets.reduce(
        (total, objet) => total + (objet.references || []).filter(reference => existants.has(reference.boId)).length,
        0
    );
    const sansProprietaire = objets.filter(objet => !objet.globalOwner).length;
    const morceaux = [`${objets.length} objet(s)`, `${compositions} composition(s)`, `${references} référence(s)`];
    if (sansProprietaire) morceaux.push(`${sansProprietaire} sans propriétaire`);
    return morceaux.join(' · ');
}
