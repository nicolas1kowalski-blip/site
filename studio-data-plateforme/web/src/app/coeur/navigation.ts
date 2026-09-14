/**
 * Navigation de l'application : les écrans rangés par phase, les actions rapides et les raccourcis clavier.
 *
 * Cette définition est partagée par le rail de gauche et par la palette de commandes (Ctrl+K) : les deux
 * proposent exactement les mêmes écrans, et un écran ajouté ici apparaît des deux côtés sans autre geste.
 */

/** Un écran du menu. « administrateur » réserve l'entrée aux administrateurs de la plateforme. */
export type Lien = { chemin: string; libelle: string; icone: string; administrateur?: boolean };
export type GroupeNavigation = { titre: string; liens: Lien[] };

/** Même découpage que l'application classique : Données & Modèle, Exploitation, Qualité & Audit, Gouvernance. */
export const GROUPES_NAVIGATION: GroupeNavigation[] = [
    {
        titre: 'Données & Modèle',
        liens: [
            { chemin: '/', libelle: 'Cockpit', icone: '⌂' },
            { chemin: '/sources', libelle: 'Sources', icone: '▤' },
            { chemin: '/tables-concues', libelle: 'Tables conçues', icone: '🧱' },
            { chemin: '/modele', libelle: 'Modèle de données', icone: '⇄' },
            { chemin: '/couverture', libelle: 'Couverture', icone: '◐' },
            { chemin: '/series-temporelles', libelle: 'Séries temporelles', icone: '∿' }
        ]
    },
    {
        titre: 'Exploitation',
        liens: [
            { chemin: '/extraction', libelle: 'Extraire', icone: '⤓' },
            { chemin: '/jeux', libelle: 'Jeux temporaires', icone: '⏳' },
            { chemin: '/preparation', libelle: 'Préparation', icone: '🧹' },
            { chemin: '/tableaux-de-bord', libelle: 'Tableaux de bord', icone: '▤' },
            { chemin: '/comparateur', libelle: 'Comparer', icone: '⇆' },
            { chemin: '/navigateur', libelle: 'Explorer', icone: '⌕' },
            { chemin: '/explorateur', libelle: 'Explorer (SQL)', icone: '⌗' },
            { chemin: '/statistiques', libelle: 'Statistiques', icone: '📊' },
            { chemin: '/explorateur-360', libelle: 'Explorateur 360°', icone: '🕸' }
        ]
    },
    {
        titre: 'Qualité & Audit',
        liens: [
            { chemin: '/qualite', libelle: 'Qualité & Audit', icone: '✓' },
            { chemin: '/qualite/regles', libelle: 'Règles & score', icone: '📏' },
            { chemin: '/rapprochement', libelle: 'Rapprochement', icone: '⚭' },
            { chemin: '/surveillance', libelle: 'Surveillance des sources', icone: '⌚' }
        ]
    },
    {
        titre: 'Gouvernance',
        liens: [
            { chemin: '/catalogue', libelle: 'Catalogue', icone: '🧭' },
            { chemin: '/dictionnaire', libelle: 'Dictionnaire', icone: '☰' },
            { chemin: '/actifs', libelle: 'Applications & processus', icone: '⚙' },
            { chemin: '/personnes', libelle: 'Personnes & rôles', icone: '☺' },
            { chemin: '/objets-metier', libelle: 'Objets métier', icone: '🏛' },
            { chemin: '/glossaire', libelle: 'Glossaire', icone: '✎' },
            { chemin: '/listes-de-valeurs', libelle: 'Listes de valeurs', icone: '≡' },
            { chemin: '/perimetres', libelle: 'Périmètres', icone: '◫' },
            { chemin: '/sensibilite', libelle: 'Sensibilité', icone: '🛡' },
            { chemin: '/lineage', libelle: 'Lineage', icone: '⇢' },
            { chemin: '/propositions', libelle: 'À valider', icone: '✔' },
            { chemin: '/journal', libelle: 'Historique', icone: '⏱' }
        ]
    },
    { titre: 'Application complète', liens: [{ chemin: '/classique', libelle: 'Tous les écrans (classique)', icone: '⧉' }] },
    {
        titre: 'Administration',
        liens: [
            { chemin: '/sauvegarde', libelle: 'Sauvegarde et partage', icone: '⇩' },
            { chemin: '/espaces', libelle: 'Espaces et membres', icone: '⬚' },
            { chemin: '/utilisateurs', libelle: 'Utilisateurs', icone: '☺', administrateur: true },
            { chemin: '/demonstration', libelle: 'Mode démonstration', icone: '✨', administrateur: true }
        ]
    }
];

/**
 * Actions rapides de la palette : ce que l'on veut faire, pas l'écran où cela se trouve. Chacune mène à un
 * écran, parfois avec un paramètre qui ouvre directement le bon panneau.
 */
export type ActionRapide = { libelle: string; chemin: string; parametres?: Record<string, string>; icone: string };
export const ACTIONS_RAPIDES: ActionRapide[] = [
    { libelle: 'Charger un fichier', chemin: '/sources', parametres: { action: 'charger' }, icone: '⬆' },
    { libelle: 'Fusionner des fichiers', chemin: '/sources', parametres: { action: 'fusionner' }, icone: '⊕' },
    { libelle: 'Importer depuis une adresse', chemin: '/sources', parametres: { action: 'adresse' }, icone: '🔗' },
    { libelle: 'Relier deux tables', chemin: '/modele', icone: '⇄' },
    { libelle: 'Lancer un audit qualité', chemin: '/qualite', icone: '✓' },
    { libelle: 'Composer une extraction', chemin: '/extraction', icone: '⤓' },
    { libelle: 'Comparer deux tables', chemin: '/comparateur', icone: '⇆' },
    { libelle: 'Sauvegarder l’espace', chemin: '/sauvegarde', icone: '⇩' },
    { libelle: 'Voir les jeux temporaires', chemin: '/jeux', icone: '⏳' }
];

/**
 * Raccourcis « G puis une lettre », repris de l'application classique : on tape G, puis la lettre de l'écran.
 * Ils ne se déclenchent pas pendant une saisie.
 */
export const RACCOURCIS_ECRAN: Record<string, string> = {
    s: '/sources',
    m: '/modele',
    x: '/extraction',
    q: '/qualite',
    r: '/qualite/regles',
    b: '/tableaux-de-bord',
    i: '/'
};

/** Tous les écrans à plat, pour la recherche. */
export function tousLesEcrans(): { lien: Lien; groupe: string }[] {
    return GROUPES_NAVIGATION.flatMap(groupe => groupe.liens.map(lien => ({ lien, groupe: groupe.titre })));
}
