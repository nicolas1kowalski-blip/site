/**
 * Navigation de l'application : les écrans rangés par phase, les actions rapides et les raccourcis clavier.
 *
 * Cette définition est partagée par le rail de gauche et par la palette de commandes (Ctrl+K) : les deux
 * proposent exactement les mêmes écrans, et un écran ajouté ici apparaît des deux côtés sans autre geste.
 */

/**
 * Un écran du menu. « administrateur » réserve l'entrée aux administrateurs de la plateforme ;
 * « famille » range l'écran sous un intertitre à l'intérieur de son groupe, comme la V13 le fait pour
 * la gouvernance (Découvrir, Patrimoine, Acteurs, Sens métier, Lineage, Contrôle).
 */
export type Lien = { chemin: string; libelle: string; icone: string; famille?: string; administrateur?: boolean };
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
            { chemin: '/rapprochement', libelle: 'Rapprochement', icone: '⚭' }
        ]
    },
    {
        // Ordre, libellés, icônes et familles repris tels quels de la V13 : on commence par chercher la
        // donnée disponible (Découvrir), puis on descend vers le patrimoine, les acteurs, le sens métier.
        titre: 'Gouvernance',
        liens: [
            { chemin: '/catalogue', libelle: 'Catalogue', icone: '🧭', famille: 'Découvrir' },
            { chemin: '/dictionnaire', libelle: 'Dictionnaire', icone: '📚', famille: 'Patrimoine' },
            { chemin: '/modele-objets', libelle: 'Modèle de données', icone: '🧬', famille: 'Patrimoine' },
            { chemin: '/actifs', libelle: 'Applications & processus', icone: '🖥', famille: 'Acteurs' },
            { chemin: '/personnes', libelle: 'Personnes & rôles', icone: '👥', famille: 'Acteurs' },
            { chemin: '/objets-metier', libelle: 'Objets métier', icone: '🏛️', famille: 'Sens métier' },
            { chemin: '/glossaire', libelle: 'Glossaire', icone: '📖', famille: 'Sens métier' },
            { chemin: '/listes-de-valeurs', libelle: 'Listes de valeurs', icone: '🎚️', famille: 'Sens métier' },
            { chemin: '/perimetres', libelle: 'Périmètres', icone: '🧩', famille: 'Sens métier' },
            { chemin: '/sensibilite', libelle: 'Sensibilité', icone: '🔐', famille: 'Sens métier' },
            { chemin: '/lineage', libelle: 'Lineage', icone: '🕸️', famille: 'Lineage' },
            { chemin: '/surveillance', libelle: 'Surveillance des sources', icone: '🛰️', famille: 'Contrôle' },
            { chemin: '/propositions', libelle: 'À valider', icone: '✅', famille: 'Contrôle' },
            { chemin: '/journal', libelle: 'Historique', icone: '📈', famille: 'Contrôle' }
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

/**
 * « Et ensuite ? » (V12) : ce que l'on fait logiquement après chaque écran. Une fois les sources chargées on
 * décrit le modèle, une fois le modèle posé on extrait, une fois l'extraction faite on la compare ou on la
 * garde de côté. Ce n'est pas un parcours obligatoire : c'est la suite la plus fréquente, à un clic.
 */
export const SUITES_ECRAN: Record<string, string[]> = {
    '/': ['/sources', '/qualite', '/extraction'],
    '/sources': ['/modele', '/qualite', '/extraction'],
    '/tables-concues': ['/qualite', '/extraction', '/tableaux-de-bord'],
    '/modele': ['/extraction', '/lineage', '/qualite'],
    '/couverture': ['/qualite', '/extraction'],
    '/series-temporelles': ['/qualite/regles', '/tableaux-de-bord'],
    '/extraction': ['/jeux', '/comparateur', '/tableaux-de-bord'],
    '/jeux': ['/comparateur', '/qualite', '/extraction'],
    '/preparation': ['/qualite', '/extraction'],
    '/tableaux-de-bord': ['/statistiques', '/qualite'],
    '/comparateur': ['/jeux', '/qualite', '/rapprochement'],
    '/navigateur': ['/extraction', '/qualite'],
    '/explorateur': ['/extraction', '/jeux'],
    '/statistiques': ['/tableaux-de-bord', '/extraction'],
    '/explorateur-360': ['/lineage', '/catalogue'],
    '/qualite': ['/qualite/regles', '/jeux', '/objets-metier'],
    '/qualite/regles': ['/tableaux-de-bord', '/surveillance'],
    '/rapprochement': ['/qualite', '/comparateur'],
    '/surveillance': ['/qualite', '/sources'],
    '/catalogue': ['/objets-metier', '/dictionnaire', '/lineage'],
    '/dictionnaire': ['/objets-metier', '/glossaire'],
    '/objets-metier': ['/qualite', '/catalogue', '/lineage'],
    '/glossaire': ['/dictionnaire', '/catalogue'],
    '/lineage': ['/catalogue', '/actifs'],
    '/propositions': ['/objets-metier', '/catalogue']
};

/**
 * Les écrans qui ne servent à rien tant qu'aucune source n'est chargée (V12) : on y affiche un bandeau qui
 * le dit, avec le bouton pour charger un fichier, au lieu de listes vides sans explication.
 */
export const ECRANS_AVEC_DONNEES = [
    '/tables-concues',
    '/modele',
    '/couverture',
    '/series-temporelles',
    '/extraction',
    '/preparation',
    '/tableaux-de-bord',
    '/comparateur',
    '/navigateur',
    '/explorateur',
    '/statistiques',
    '/explorateur-360',
    '/qualite',
    '/qualite/regles',
    '/rapprochement',
    '/surveillance'
];

/** Vrai quand cet écran a besoin d'au moins une source pour montrer quoi que ce soit. */
export function demandeDesDonnees(adresse: string): boolean {
    return ECRANS_AVEC_DONNEES.includes(cheminNormalise(adresse));
}

/** Les écrans qui suivent celui-ci, avec leur libellé et leur icône ; vide quand aucune suite n'est prévue. */
export function suitesDe(chemin: string): Lien[] {
    const tous = new Map(tousLesEcrans().map(entree => [entree.lien.chemin, entree.lien]));
    return (SUITES_ECRAN[cheminNormalise(chemin)] || []).map(suite => tous.get(suite)).filter((lien): lien is Lien => Boolean(lien));
}

/** L'adresse d'un écran sans ses paramètres ni son fragment : « /qualite?source=3 » devient « /qualite ». */
export function cheminNormalise(adresse: string): string {
    const chemin = String(adresse || '/').split(/[?#]/)[0];
    if (chemin.length > 1 && chemin.endsWith('/')) return chemin.slice(0, -1);
    return chemin || '/';
}
