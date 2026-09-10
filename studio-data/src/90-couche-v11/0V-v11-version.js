        // ======================= V11 : VERSION ET JOURNAL DE LA COUCHE ERGONOMIQUE =======================
        // Ce fichier n'est assemblé que dans StudioDataV11.html (manifest-v11.json). Il est chargé avant
        // le noyau : 1A-noyau-version-changelog.js reprend V11_VERSION et place V11_CHANGELOG en tête.
        const V11_VERSION = '11.1.0';
        const V11_CHANGELOG = [
            { v: '11.1.0', d: '2026-09-08', t: 'Troisième passe : moins à lire, moins de clics, plus de repères', items: [
                '<b>Glossaire et applications en maître / détail</b> : une liste de lignes compactes avec filtre, une seule fiche ouverte à la fois (clic sur une ligne). Fini les pages de cartes empilées. Le bloc « Analyse d\'impact » se replie.',
                '<b>Définition et sensibilité des attributs modifiables sur place</b> dans le tableau de la fiche objet, sans ouvrir le formulaire.',
                '<b>Mode concentration</b> : pendant la modification d\'un objet, la liste des objets et les bandeaux disparaissent, la barre « Modification » reste visible en haut. Un filtre apparaît sur la liste des objets dès qu\'ils sont nombreux.',
                '<b>Reprendre où vous en étiez</b> : les fiches récemment consultées sur l\'accueil et en tête de la recherche Ctrl+K. Fil d\'Ariane jusqu\'au terme ou à l\'application ouverte.',
                '<b>Suppression sûre</b> : confirmation avant de supprimer un objet, un terme ou une application, puis notification avec « ⟲ Annuler ».',
                'Fiche du catalogue : bouton <b>« Fiche complète »</b> qui ouvre la fiche en lecture ; un attribut ouvert depuis la recherche ou une fiche arrive directement sur son formulaire.'] },
            { v: '11.0.1', d: '2026-09-08', t: 'Deuxième passe V11', items: [
                'Fiche objet : le <b>lineage s\'affiche dans la fiche</b> en lecture (bouton 🕸), l\'audit ouvre bien le formulaire, le fil d\'Ariane reste cliquable en consultation et en présentation.',
                'En <b>consultation</b> ou en <b>présentation</b>, les fiches sont toujours en lecture : plus de bouton Modifier, Dupliquer ni Actions groupées, valeurs non éditables ; le menu ne se replie qu\'en modification ou en plein écran.',
                'Le <b>dictionnaire par objet</b> s\'ouvre en lecture (champs remplacés par leurs valeurs) avec « Modifier ». Libellés des barres de modification corrigés (« Modification de l\'application… »).',
                '« Modifier dans l\'objet » depuis le catalogue ouvre le formulaire. Annulation : rien n\'est empilé avant la fin de la restauration de session. Le mode présentation se déclenche par Maj+P (plus par P seul).'] },
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
