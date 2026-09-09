        // ======================= V12 : VERSION ET JOURNAL DE LA COUCHE « TOUTE L'APPLICATION » =======================
        // Assemblé uniquement dans StudioDataV12.html (manifest-v12.json), après la couche V11 dont il hérite.
        const V12_VERSION = '12.0.0';
        const V12_CHANGELOG = [
            { v: '12.0.0', d: '2026-09-09', t: 'V12 — l\'ergonomie sur toute l\'application, pas seulement la gouvernance', items: [
                '<b>Accueil de l\'application</b> (à la place du cockpit) : ce que vous avez (sources, modèle, qualité, gouvernance), <b>vos prochaines étapes</b> déduites de l\'état réel, points d\'attention, fiches récentes, actions rapides.',
                '<b>Recherche Ctrl+K sur tout</b> : les écrans des quatre phases, les actions (charger un fichier, fusionner, connecter une base, lancer un audit, sauvegarder…), les sources, colonnes, objets, termes, applications.',
                '<b>Précédent / Suivant et fil d\'Ariane sur tous les écrans</b>, pas seulement en gouvernance. Raccourcis G puis S / M / X / Q / R / B / I pour Sources, Modèle, Extraire, Qualité, Règles, Tableaux de bord, Accueil.',
                '<b>En-têtes de page unifiés</b> : un titre, une phrase, les explications longues repliées derrière « ℹ️ En savoir plus ». <b>Une seule couleur d\'action</b> pour les boutons principaux au lieu de sept.',
                '<b>Sources</b> : vue liste ou cartes, et sur chaque source les actions « Explorer, Auditer, Extraire, Dictionnaire, Objet métier » à un clic.',
                '<b>Barres d\'action collantes</b> : Compter / Prévisualiser / Générer restent visibles dans Extraire, « Lancer l\'audit » dans Qualité, quelle que soit la longueur du formulaire.',
                '<b>Plein écran</b> (⛶) sur les tableaux de données, rapports d\'audit, graphes, tableaux de bord, préparations, règles, séries, rapprochements.',
                '<b>Écrans sans données</b> : un bandeau explique qu\'il faut d\'abord charger une source, avec le bouton pour le faire. <b>« Et ensuite ? »</b> en bas de chaque écran propose les écrans logiques suivants.',
                '<b>Moteur de données indisponible</b> : un seul bandeau clair en haut (cause, ce qui reste possible, réessayer) au lieu de messages rouges dispersés.',
                'Aide « ? » et visite guidée étendues à toute l\'application ; lexique complété (source, table conçue, extraction, règle, rapprochement, série, préparation, tableau de bord).'] },
        ];
