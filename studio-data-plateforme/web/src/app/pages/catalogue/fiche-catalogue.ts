/**
 * La fiche d'un résultat du catalogue — reprise point pour point de la V13.
 *
 * Trouver la donnée ne suffit pas : il faut pouvoir décider si on lui fait confiance et comprendre comment
 * s'en servir, sans quitter le catalogue. La V13 ouvre donc un panneau latéral qui répond, dans cet ordre,
 * aux questions que l'on se pose vraiment :
 *
 *   • **à quoi ça sert** — la description, ou l'aveu qu'elle manque et où l'écrire ;
 *   • **fiche d'identité** — volume, fraîcheur, propriétaire, domaine ;
 *   • **traçabilité** — combien de sources en amont, combien d'usages en aval ;
 *   • puis, selon ce que l'on regarde : à quel objet l'information appartient, quelles colonnes
 *     l'alimentent, qui s'en sert, quels mots du glossaire la nomment, la chaîne d'un objet métier,
 *     ce qu'un terme désigne — et enfin les actifs voisins du même domaine.
 *
 * Chaque ligne de ces sections est **cliquable** : elle ouvre la fiche de ce qu'elle nomme. C'est ce qui
 * fait du catalogue un écran où l'on circule, et non une liste où l'on retombe toujours au même endroit.
 *
 * Fonctions pures : elles ne connaissent que ce qu'on leur donne.
 */
import type { Actif, EntreeCatalogue, FicheDictionnaire, ObjetMetier, Source, TermeGlossaire } from '../../coeur/modeles';

/** Ce qu'une ligne de section désigne, et que l'on peut rouvrir en fiche. */
export type CibleDeFiche = { type: string; id: string };

/** Une ligne cliquable d'une section : un pictogramme, un nom, une précision, et où elle mène. */
export type LigneDeFiche = { pictogramme: string; libelle: string; precision: string; cible: CibleDeFiche | null };

/** Une section du panneau : soit des lignes à suivre, soit des champs à lire, soit une phrase. */
export type SectionDeFiche =
    | { genre: 'lignes'; titre: string; lignes: LigneDeFiche[]; siVide: string }
    | { genre: 'champs'; titre: string; champs: { cle: string; valeur: string }[] };

/** Ce que le panneau affiche, une fois la fiche composée. */
export type FicheDuCatalogue = {
    /** Le sous-titre du panneau : « Attribut métier · Domaine Ventes · propriétaire Alice ». */
    sousTitre: string;
    /** La description, ou l'invitation à l'écrire quand elle manque. */
    aQuoiCaSert: string;
    /** Vrai quand la description manque : l'écran l'écrit alors en gris et en italique. */
    aQuoiCaSertAbsent: boolean;
    identite: { cle: string; valeur: string }[];
    tracabilite: { amont: number; aval: number };
    sections: SectionDeFiche[];
    /** Les boutons du pied, dans l'ordre du classique. */
    actions: { cle: 'lineage' | 'objet' | 'utiliser'; libelle: string }[];
};

/** Tout ce que la fiche va chercher ailleurs dans la gouvernance. */
export type ReferentielDeFiche = {
    objets: ObjetMetier[];
    termes: TermeGlossaire[];
    actifs: Actif[];
    sources: Source[];
    fiches: Record<string, FicheDictionnaire>;
    /** Les liens du parcours de la donnée, réduits aux noms de tables : c'est ce qui donne amont et aval. */
    liensDuParcours: { de: string; vers: string }[];
    /** Le volume de chaque table, pour la ligne « Lignes » de la fiche d'identité. */
    volumetrie: { nom: string; lignes: number }[];
    /** Les autres résultats de la recherche en cours : ils fournissent les « actifs liés ». */
    voisins: EntreeCatalogue[];
};

/** Le texte affiché quand personne n'a encore décrit la donnée. */
export const RIEN_DE_DOCUMENTE =
    'Pas encore documenté — ajoutez une description dans le dictionnaire (ou via ⬆ Import en masse) pour aider les consommateurs de cette donnée.';

/** Le nom lisible de chaque type, tel que le sous-titre du panneau l'annonce. */
const NOMS_DE_TYPE: Record<string, string> = {
    bo: 'Objet métier',
    attr: 'Attribut métier',
    term: 'Terme',
    asset: 'Appli / processus',
    perimeter: 'Périmètre',
    valuelist: 'Liste de valeurs',
    rule: 'Règle qualité',
    report: 'Tableau de bord',
    series: 'Série temporelle',
    table: 'Table',
    view: 'Vue dérivée',
    column: 'Colonne',
    linkage: 'Rapprochement'
};

/** « Attribut métier · Domaine Ventes · propriétaire Alice » — ce que le panneau écrit sous le nom. */
export function sousTitreDeLaFiche(entree: EntreeCatalogue): string {
    const morceaux = [NOMS_DE_TYPE[entree.type] || entree.type];
    if (entree.domaine && entree.domaine !== '—') morceaux.push('Domaine ' + entree.domaine);
    if (entree.proprietaire) morceaux.push('propriétaire ' + entree.proprietaire);
    return morceaux.join(' · ');
}

/**
 * Combien de sources alimentent cette donnée, et combien d'usages en descendent. On raisonne sur la table
 * concernée : celle de la colonne, ou celle qui porte l'objet. Sans table, il n'y a rien à compter.
 */
export function tracabiliteDe(table: string, liens: { de: string; vers: string }[]): { amont: number; aval: number } {
    if (!table) return { amont: 0, aval: 0 };
    return {
        amont: new Set(liens.filter(lien => lien.vers === table).map(lien => lien.de)).size,
        aval: new Set(liens.filter(lien => lien.de === table).map(lien => lien.vers)).size
    };
}

/** La table que la fiche concerne : celle de la colonne, la table maître d'un objet, ou rien. */
export function tableDeLaFiche(entree: EntreeCatalogue, referentiel: ReferentielDeFiche): string {
    if (entree.type === 'table' || entree.type === 'view')
        return referentiel.sources.find(source => source.id === entree.id)?.name || entree.titre;
    if (entree.type === 'column') return entree.sousTitre.replace(/^dans /, '');
    const objet = objetDeLaFiche(entree, referentiel);
    if (!objet) return '';
    return (objet.sources.find(source => source.role === 'maitre') || objet.sources[0])?.table || '';
}

/** L'objet métier que la fiche concerne : lui-même, ou celui dont l'information fait partie. */
export function objetDeLaFiche(entree: EntreeCatalogue, referentiel: ReferentielDeFiche): ObjetMetier | null {
    if (entree.type === 'bo') return referentiel.objets.find(objet => objet.id === entree.id) || null;
    if (entree.type === 'attr') return referentiel.objets.find(objet => objet.id === entree.id.split('.')[0]) || null;
    return null;
}

/** L'information (attribut) que la fiche concerne, quand c'en est une. */
export function informationDeLaFiche(entree: EntreeCatalogue, referentiel: ReferentielDeFiche) {
    if (entree.type !== 'attr') return null;
    const objet = objetDeLaFiche(entree, referentiel);
    const identifiant = entree.id.split('.').slice(1).join('.');
    return (objet?.elements || []).find(information => information.id === identifiant) || null;
}

/** Le nom d'un mot du glossaire, à partir de son identifiant. */
function nomDuTerme(identifiant: string, termes: TermeGlossaire[]): string {
    return termes.find(terme => terme.id === identifiant)?.term || '';
}

/** Une ligne cliquable, écrite d'un trait. */
function ligne(pictogramme: string, libelle: string, precision: string, cible: CibleDeFiche | null): LigneDeFiche {
    return { pictogramme, libelle, precision, cible };
}

/** Les sections propres à une information : d'où elle vient, qui s'en sert, comment on la nomme. */
function sectionsDUneInformation(entree: EntreeCatalogue, referentiel: ReferentielDeFiche): SectionDeFiche[] {
    const objet = objetDeLaFiche(entree, referentiel);
    const information = informationDeLaFiche(entree, referentiel);
    if (!objet || !information) return [];
    const champsLibres = information as unknown as Record<string, unknown>;
    const champs = [
        { cle: 'Nombre de valeurs', valeur: String(champsLibres['multi'] || '1 valeur') },
        { cle: 'Sensibilité', valeur: String(information.sensitivity || '—') }
    ];
    if (champsLibres['examples']) champs.push({ cle: 'Exemples', valeur: String(champsLibres['examples']) });
    const colonnes = information.mappings || [];
    const usages = (information.usedBy || [])
        .map(identifiant => referentiel.actifs.find(actif => actif.id === identifiant))
        .filter((actif): actif is Actif => !!actif);
    const terme = nomDuTerme(String(information.term || ''), referentiel.termes);
    return [
        {
            genre: 'lignes',
            titre: 'Appartient à',
            lignes: [ligne('🏛️', objet.name, 'objet métier', { type: 'bo', id: objet.id })],
            siVide: ''
        },
        { genre: 'champs', titre: "Détail de l'attribut", champs },
        {
            genre: 'lignes',
            titre: 'Termes du glossaire',
            lignes: terme ? [ligne('📖', terme, 'mot du métier', null)] : [],
            siVide: 'Aucun mot du glossaire posé sur cette information.'
        },
        {
            genre: 'lignes',
            titre: 'Alimenté par (provenance technique)',
            lignes: colonnes.map(correspondance => ligne('▦', `${correspondance.table}.${correspondance.col}`, 'colonne technique', null)),
            siVide: '⚠ non alimenté — aucune colonne technique rattachée'
        },
        {
            genre: 'lignes',
            titre: 'Utilisé par',
            lignes: usages.map(actif =>
                ligne(actif.kind === 'process' ? '⚙️' : '🖥', actif.name, actif.kind === 'process' ? 'processus' : 'application', {
                    type: 'asset',
                    id: actif.id
                })
            ),
            siVide: 'Aucun usage déclaré.'
        }
    ];
}

/** La chaîne d'un objet métier : qui le produit, de quelles tables il vient, qui le consomme. */
function sectionsDUnObjet(entree: EntreeCatalogue, referentiel: ReferentielDeFiche): SectionDeFiche[] {
    const objet = objetDeLaFiche(entree, referentiel);
    if (!objet) return [];
    const nomDuRole: Record<string, string> = { maitre: 'maître', contributeur: 'contributeur', destinataire: 'destinataire' };
    const actifsPar = (identifiants: string[]) =>
        identifiants
            .map(identifiant => referentiel.actifs.find(actif => actif.id === identifiant))
            .filter((actif): actif is Actif => !!actif);
    const lignesDeLaChaine = [
        ...actifsPar(objet.producedBy || []).map(actif =>
            ligne(actif.kind === 'process' ? '⚙️' : '🖥', actif.name, "produit l'objet", { type: 'asset', id: actif.id })
        ),
        ...objet.sources.map(source =>
            ligne('▦', source.table, `source ${nomDuRole[source.role] || source.role} (donnée technique)`, null)
        ),
        ...actifsPar(objet.consumedBy || []).map(actif =>
            ligne(actif.kind === 'process' ? '⚙️' : '🖥', actif.name, "consomme l'objet", { type: 'asset', id: actif.id })
        )
    ];
    return [
        {
            genre: 'lignes',
            titre: `Attributs et leurs termes (${(objet.elements || []).length})`,
            lignes: (objet.elements || []).map(information =>
                ligne('🔹', information.name, nomDuTerme(String(information.term || ''), referentiel.termes) || 'sans terme', {
                    type: 'attr',
                    id: `${objet.id}.${information.id}`
                })
            ),
            siVide: 'Aucun attribut.'
        },
        {
            genre: 'lignes',
            titre: "Chaîne de l'objet",
            lignes: lignesDeLaChaine,
            siVide: 'Aucune source ni application rattachée. Complétez la fiche de l’objet (onglet Sources) pour voir sa chaîne amont → aval.'
        }
    ];
}

/** Ce qu'une colonne technique alimente : l'information métier qui porte son sens. */
function sectionsDUneColonne(entree: EntreeCatalogue, referentiel: ReferentielDeFiche): SectionDeFiche[] {
    const table = tableDeLaFiche(entree, referentiel);
    const alimentees: LigneDeFiche[] = [];
    for (const objet of referentiel.objets)
        for (const information of objet.elements || [])
            if ((information.mappings || []).some(correspondance => correspondance.table === table && correspondance.col === entree.titre))
                alimentees.push(
                    ligne('🔹', information.name, 'attribut de ' + objet.name, { type: 'attr', id: `${objet.id}.${information.id}` })
                );
    const champs = (referentiel.fiches[table]?.columns || {})[entree.titre] || {};
    return [
        {
            genre: 'champs',
            titre: "Détail de l'attribut",
            champs: [
                { cle: 'Type déclaré', valeur: String(champs.technicalType || '—') },
                { cle: 'Colonne dans', valeur: table || '—' }
            ]
        },
        {
            genre: 'lignes',
            titre: "Alimente l'attribut métier",
            lignes: alimentees,
            siVide: "Cette colonne n'alimente aucun attribut d'objet métier. Rattachez-la à un attribut (fiche de l’objet ▸ Attributs & composition) pour lui donner un nom métier."
        }
    ];
}

/** Ce qu'un mot du glossaire désigne réellement dans la gouvernance. */
function sectionsDUnTerme(entree: EntreeCatalogue, referentiel: ReferentielDeFiche): SectionDeFiche[] {
    const designees: LigneDeFiche[] = [];
    for (const objet of referentiel.objets)
        for (const information of objet.elements || [])
            if (String(information.term || '') === entree.id)
                designees.push(
                    ligne('🔹', information.name, 'attribut de ' + objet.name, { type: 'attr', id: `${objet.id}.${information.id}` })
                );
    return [
        {
            genre: 'lignes',
            titre: `Ce terme désigne (${designees.length})`,
            lignes: designees,
            siVide: 'Aucune donnée pour l’instant. Reliez-le depuis le Glossaire, ou en choisissant ce terme dans la colonne « Terme » du Dictionnaire.'
        }
    ];
}

/** Les trois voisins du même domaine : de quoi rebondir sans repasser par la recherche. */
export function actifsLies(entree: EntreeCatalogue, voisins: EntreeCatalogue[]): LigneDeFiche[] {
    if (!entree.domaine || entree.domaine === '—') return [];
    return voisins
        .filter(
            candidat =>
                candidat.domaine === entree.domaine &&
                !(candidat.type === entree.type && candidat.id === entree.id) &&
                ['table', 'view', 'bo'].includes(candidat.type)
        )
        .slice(0, 3)
        .map(candidat =>
            ligne('•', candidat.titre, NOMS_DE_TYPE[candidat.type] || candidat.type, { type: candidat.type, id: candidat.id })
        );
}

/** Les boutons du pied : « Modifier dans l'objet » n'apparaît que là où il veut dire quelque chose. */
export function actionsDeLaFiche(entree: EntreeCatalogue): FicheDuCatalogue['actions'] {
    const actions: FicheDuCatalogue['actions'] = [{ cle: 'lineage', libelle: '🕸️ Voir le lineage' }];
    if (entree.type === 'attr' || entree.type === 'bo') actions.push({ cle: 'objet', libelle: "✎ Modifier dans l'objet" });
    actions.push({ cle: 'utiliser', libelle: '➜ Utiliser cette donnée' });
    return actions;
}

/** La fiche complète d'un résultat : c'est tout ce que le panneau latéral a besoin de savoir. */
export function ficheDuCatalogue(entree: EntreeCatalogue, referentiel: ReferentielDeFiche): FicheDuCatalogue {
    const table = tableDeLaFiche(entree, referentiel);
    const volume = referentiel.volumetrie.find(mesure => mesure.nom === table);
    const identite: { cle: string; valeur: string }[] = [];
    if (volume) identite.push({ cle: 'Lignes', valeur: volume.lignes.toLocaleString('fr-FR') });
    identite.push({
        cle: 'Fraîcheur',
        valeur: entree.fraicheur ? '↻ ' + new Date(entree.fraicheur).toLocaleDateString('fr-FR') : '↻ —'
    });
    identite.push({ cle: 'Propriétaire', valeur: entree.proprietaire || '⚠ à désigner' });
    identite.push({ cle: 'Domaine', valeur: entree.domaine || '—' });

    const parType: Record<string, SectionDeFiche[]> = {
        attr: sectionsDUneInformation(entree, referentiel),
        bo: sectionsDUnObjet(entree, referentiel),
        column: sectionsDUneColonne(entree, referentiel),
        term: sectionsDUnTerme(entree, referentiel)
    };
    const sections = [...(parType[entree.type] || [])];
    const voisins = actifsLies(entree, referentiel.voisins);
    if (voisins.length) sections.push({ genre: 'lignes', titre: `Actifs liés (${entree.domaine})`, lignes: voisins, siVide: '' });

    return {
        sousTitre: sousTitreDeLaFiche(entree),
        aQuoiCaSert: entree.description || RIEN_DE_DOCUMENTE,
        aQuoiCaSertAbsent: !entree.description,
        identite,
        tracabilite: tracabiliteDe(table, referentiel.liensDuParcours),
        sections,
        actions: actionsDeLaFiche(entree)
    };
}
