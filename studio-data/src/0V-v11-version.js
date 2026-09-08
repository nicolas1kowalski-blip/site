        // ======================= V11 : VERSION ET JOURNAL DE LA COUCHE ERGONOMIQUE =======================
        // Ce fichier n'est assemblé que dans StudioDataV11.html (manifest-v11.json). Il est chargé avant
        // le noyau : 1A-noyau-version-changelog.js reprend V11_VERSION et place V11_CHANGELOG en tête.
        const V11_VERSION = '11.0.0';
        const V11_CHANGELOG = [
            { v: '11.0.0', d: '2026-09-08', t: 'V11 — l\'ergonomie d\'abord : fiches lisibles, recherche, plein écran, accueil', items: [
                '<b>Fiches en mode lecture</b> : objets, termes, applications et sources s\'ouvrent d\'abord comme une carte propre (en-tête, définition, propriétaire, domaine, sources, applications, termes, attributs), sans champ de saisie. Un bouton « Modifier » ouvre le formulaire complet ; un clic sur une valeur la modifie en place (Entrée valide, Échap annule).',
                '<b>Mise en page unifiée</b> des quatre types de fiches : même en-tête, mêmes sections, mêmes actions (Modifier, Dupliquer, Plein écran, Imprimer, Lineage).',
                '<b>Plein écran</b> (⛶) sur chaque fiche, chaque tableau d\'attributs et chaque graphe ; Échap pour revenir. Le menu se replie de lui-même quand une fiche est ouverte (réglable).',
                '<b>Recherche globale Ctrl+K</b> : objets, attributs, termes, applications, tables, colonnes et écrans, ouverture directe de la fiche.',
                '<b>Accueil de la gouvernance</b> : ce qui vous attend (propositions à valider, fiches incomplètes), derniers changements, vos objets, actions rapides, chiffres clés.',
                '<b>Menu regroupé en trois familles</b> : Explorer, Décrire, Piloter. <b>Fil d\'Ariane cliquable</b> et boutons <b>Précédent / Suivant</b> (Alt+← / Alt+→).',
                '<b>Notifications unifiées</b> en haut à droite, une à la fois, message court (cliquer pour le détail). Indicateur « Enregistré » et <b>Annuler la dernière modification</b> (Ctrl+Z).',
                '<b>Tableaux</b> : tri par colonne d\'un clic, lignes alternées, densité confortable ou compacte, valeurs vides affichées « — ».',
                '<b>Vocabulaire unifié</b> : « Propriétaire », « Domaine métier », « Application source » partout. Infobulles sur les termes techniques (facette, source maître, lineage…).',
                '<b>Assistant de création d\'objet</b> en trois étapes (nom et domaine, source et attributs, propriétaire). <b>Actions groupées</b> sur plusieurs attributs (sensibilité, terme, propriétaire, usage). <b>Glisser-déposer</b> une colonne sur un attribut. <b>Dupliquer</b> un objet, un terme, une application.',
                '<b>Visite guidée</b> au premier lancement (réactivable), <b>aide « ? »</b> avec raccourcis clavier et lexique, états vides avec exemple chargeable.',
                '<b>Préférences mémorisées</b> par écran (vue, filtres, densité, replis), <b>impression / PDF</b> d\'une fiche, <b>mode présentation</b> (grandes polices, menu masqué, lecture seule).'] },
        ];
