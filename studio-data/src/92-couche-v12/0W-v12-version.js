        // ======================= V12 : VERSION ET JOURNAL DE LA COUCHE « TOUTE L'APPLICATION » =======================
        // Assemblé uniquement dans StudioDataV12.html (manifest-v12.json), après la couche V11 dont il hérite.
        const V12_VERSION = '12.11.2';
        const V12_CHANGELOG = [
            {
                v: '12.11.2',
                d: '2026-09-10',
                t: 'Extraire : « HTML FileReaders do not support writing »',
                items: [
                    "Quand une requête d'Extraire dépasse la mémoire (transposition ou synthèse sur une grosse table liée), DuckDB voulait écrire un fichier temporaire, ce que le navigateur interdit : « Invalid Error: HTML FileReaders do not support writing ». <b>Compter, prévisualiser, bilan, générer et jeu temporaire relancent désormais la requête en mémoire pure avec une limite relevée</b>, comme les analyses du noyau. Si cela ne suffit toujours pas, le message dit quoi faire : cocher « 500 lignes », ajouter un filtre, réduire le nombre de colonnes transposées, générer en plusieurs fois."
                ]
            },
            {
                v: '12.11.1',
                d: '2026-09-10',
                t: 'Extraire : trois correctifs',
                items: [
                    "<b>Vue graphique</b> : refermée par son bouton, elle ne réapparaît plus à la manipulation suivante (le bouton désactive l'interrupteur, comme la case à cocher).",
                    "<b>Synthèse d'une table liée</b> : le sélecteur « via » propose désormais « 🔀 le lien renseigné, quel qu'il soit », comme l'ajout de colonne. Compter, compter les valeurs uniques, transposer en texte ou en colonnes portent alors sur les lignes de toutes les routes réunies.",
                    '<b>Transposer en colonnes</b> : une seule lecture de la table liée (liste ordonnée) au lieu de n sous-requêtes ; 12 colonnes ne coûtent pas plus que 3. Une erreur contenant une page HTML (réponse réseau inattendue) est affichée en clair au lieu du code brut.'
                ]
            },
            {
                v: '12.11.0',
                d: '2026-09-10',
                t: 'Graphes : les liens ne se superposent plus',
                items: [
                    "<b>Un point d'attache par lien.</b> Les liens d'une même case partaient tous de son centre et se confondaient ; ils sont désormais répartis sur le côté de la case, dans l'ordre vertical de l'autre extrémité, et ne se croisent plus au départ.",
                    "<b>Tracé à angles droits, un couloir par lien</b> : entre deux colonnes, chaque lien a sa propre verticale ; deux liens vers la même case arrivent sur deux points distincts. Les angles sont arrondis, l'étiquette est posée sur le dernier segment avec un halo pour rester lisible sur un trait. Quand on déplace une case, ses liens sont recalculés avec les mêmes règles ; si deux cases se chevauchent, le lien contourne par le haut au lieu de disparaître.",
                    "<b>Mise en avant</b> : au survol d'un lien ou d'une case, le lien (ou tous les liens de la case) passe au-dessus des autres cases, en gras ; pendant un déplacement, les liens de la case suivent en gras. Vaut pour tous les graphes : lineage d'un objet ou d'une information, catalogue, carte des flux, modèle.",
                    "Action de la palette « Graphes : liens courbes / liens à angles droits » pour revenir au tracé d'origine (mémorisé)."
                ]
            },
            {
                v: '12.10.0',
                d: '2026-09-10',
                t: "Lineage : remonter jusqu'au début de la donnée",
                items: [
                    "<b>Tout l'amont, pas seulement le premier niveau.</b> Dans le graphe d'un objet, d'un attribut ou d'une colonne (onglet Objets et fiches du catalogue), chaque élément amont est remonté à son tour : les sources de l'objet dont on reprend un attribut, l'objet d'un attribut d'origine, les fichiers lus par une application et leurs producteurs, les applications qui alimentent une application (carte des flux), les fichiers dont un fichier est construit (table conçue, extraction promue, connecteur), les applications sur lesquelles s'appuie un processus — jusqu'au tout premier maillon, marqué <b>« début de la chaîne »</b>. Chaque élément ajouté indique son niveau (« amont 2 », « amont 3 »…).",
                    "<b>Panneau « Depuis le début »</b> au-dessus du graphe : les chaînes complètes en clair, du point de départ jusqu'à l'élément (« Système tiers ⇢ Gestion des tiers ⇢ Personne ⇢ Contrat »), avec le nombre de chaînes et de points de départ.",
                    "<b>Interrupteur « ⇠ Jusqu'au début »</b> dans la barre du lineage et dans la fiche catalogue : décoché, on revient à la vue à un niveau. Le choix est mémorisé. La synthèse et le repli des groupes tiennent compte des éléments lointains (niveau indiqué dans le rôle)."
                ]
            },
            {
                v: '12.9.0',
                d: '2026-09-09',
                t: 'Finitions : restitutions et origines partout, Extraire avec des jeux temporaires',
                items: [
                    "<b>Catalogue</b> : une restitution apparaît avec le sous-titre « Restitution · fréquence · forme » ; la fiche d'une information affiche « Provient d'un autre objet » et « Réutilisé par », cliquables.",
                    "<b>Export et import en masse</b> : le type « restitution » est exporté et reconnu à l'import. <b>Dossier de gouvernance</b> : sections « Restitutions » (générée par, diffusée à, informations utilisées) et « Informations provenant d'un autre objet ».",
                    '<b>Extraire</b> fonctionne avec des jeux temporaires seuls, sans aucune source chargée : ils sont proposés comme tables de départ et tables liées.'
                ]
            },
            {
                v: '12.8.0',
                d: '2026-09-09',
                t: 'Restitutions et lineage repliable',
                items: [
                    "<b>Nouveau type d'actif : la restitution</b> (📊) — rapport, tableau de bord, fichier réglementaire, extraction livrée, flux. Dans Applications & processus : « + Restitution », puis <b>générée par</b> (application ou processus), <b>objets utilisés</b>, <b>diffusée à</b> (applications, processus ou destinataires externes en clair), fréquence, forme, responsable, domaine, criticité. Dans la fiche d'un attribut, elle se coche comme n'importe quel usage.",
                    "<b>Chaîne complète dans le lineage</b> : source → objet → attribut → restitution → destinataires, avec l'application qui la génère. Visible dans le graphe d'un objet, celui d'un attribut, la synthèse et la carte des flux.",
                    "<b>Lineage repliable</b> : quand un côté compte trop d'éléments d'un même type (4 par défaut, réglable), ils sont regroupés en un nœud « 5 applications en aval » que l'on ouvre d'un clic. Boutons « Réduire » et « Tout développer » dans l'en-tête du lineage ; les liens des éléments regroupés sont fusionnés avec leur nombre."
                ]
            },
            {
                v: '12.7.0',
                d: '2026-09-09',
                t: "Lineage d'un objet : vision synthétique et complète",
                items: [
                    "<b>Plus rien n'est caché.</b> Le graphe d'un objet montre désormais aussi ce qui est rattaché au niveau des attributs : l'application source propre à un attribut, les tables des colonnes rattachées et des composants avec l'application qui les produit, les <b>objets amont</b> dont il reprend des attributs, les <b>objets aval</b> qui reprennent les siens, les objets référencés, et les processus qui lisent ses tables.",
                    "<b>Synthétique</b> : une seule flèche par application ou objet, avec le nombre d'attributs concernés (« produit 3 attribut(s) », « alimente 2 attribut(s) via SEGMENTS », « 1 attribut(s) repris (copie) »). La hauteur du graphe s'adapte au nombre d'éléments.",
                    "<b>Panneau « Synthèse »</b> au-dessus du graphe : compteurs amont (applications, fichiers, objets) et aval (applications, processus, objets, fichiers destinataires), puis la liste « Tout ce qui est relié à l'objet » avec le sens, le type et le rôle de chaque élément.",
                    'La carte des flux (vue globale) reçoit les mêmes rattachements de niveau attribut : application → objet, objet → application consommatrice, table → objet, objet → objet référencé.'
                ]
            },
            {
                v: '12.6.1',
                d: '2026-09-09',
                t: 'Origines : copie, dérivé, agrégé expliqués dans la fiche',
                items: [
                    "Dans « Provient d'un autre objet métier », un guide dépliable <b>« Quelle nature choisir ? »</b> présente les trois natures avec leur logique et un exemple : <b>Copie</b> (1 ligne → 1 ligne, valeur identique), <b>Dérivé</b> (1 ligne → 1 ligne, valeur transformée), <b>Agrégé</b> (N lignes → 1 valeur). Ouvert tant qu'aucune origine n'est déclarée, replié ensuite.",
                    "Les listes déroulantes « nature » affichent la définition au survol ; le lexique de l'aide « ? » contient copie, dérivé, agrégé."
                ]
            },
            {
                v: '12.6.0',
                d: '2026-09-09',
                t: "Gouvernance : un attribut peut provenir d'un autre objet métier, et le lineage suit toute la chaîne",
                items: [
                    "<b>« Provient d'un autre objet métier »</b> dans la fiche de chaque attribut : on choisit l'objet, l'attribut, la nature du lien (<b>copie</b>, <b>dérivé</b> avec sa règle, <b>agrégé</b>). Plusieurs origines possibles. Les boucles sont refusées.",
                    "<b>Provenance héritée</b> : un attribut qui vient d'un autre objet compte comme alimenté même sans colonne technique ; les fiches, la complétude et le catalogue affichent « hérité de Objet › attribut ».",
                    "<b>Lineage de bout en bout</b> : le graphe d'un attribut remonte application → colonne → attribut de l'objet d'origine → cet attribut → usages (flèche « copié de / dérivé de / agrégé de ») et descend vers les attributs qui le reprennent. La vue par attribut gagne une colonne « Objets amont » ; la carte des flux relie les objets entre eux.",
                    "<b>« Réutilisé par »</b> sur l'attribut d'origine : la liste des attributs des autres objets qui en dépendent, à un clic. Les origines suivent les propositions et la validation par domaine comme tout autre changement."
                ]
            },
            {
                v: '12.5.0',
                d: '2026-09-09',
                t: 'Extraire : plus besoin de choisir un « via » quand un seul des liens est renseigné',
                items: [
                    "Quand une table est atteignable par plusieurs chemins (ex. contrat → personne physique → adresse, ou contrat → personne morale → adresse), le sélecteur « via » propose en tête et présélectionne <b>« 🔀 Le lien renseigné, quel qu'il soit »</b> : toutes les routes sont jointes et la valeur est prise sur le premier lien renseigné pour chaque ligne.",
                    "Disponible pour les colonnes en sortie, les filtres et les critères d'agrégat (NB.SI.ENS). Les synthèses, hiérarchies, colonnes calculées et agrégats gardent le choix explicite du chemin, comme avant.",
                    'Le chemin précis reste proposé dans la même liste quand les liens ont des sens différents (souscripteur / bénéficiaire). Le SQL affiché montre le COALESCE entre les routes.'
                ]
            },
            {
                v: '12.4.0',
                d: '2026-09-09',
                t: 'Jeux temporaires : auditer, comparer, analyser un résultat ou un fichier reçu, sans créer de source',
                items: [
                    "<b>Un jeu temporaire</b> est un tableau gardé pour la session : le résultat d'une extraction (« ⏳ Garder comme jeu temporaire » dans Extraire), un fichier reçu (Excel, CSV, texte collé), les écarts d'une comparaison, les lignes en anomalie d'un audit (« ⏳ Garder » à côté de Voir / CSV).",
                    "<b>Utilisable partout</b> : il apparaît dans tous les sélecteurs de table, dans un groupe « ⏳ Jeux temporaires », donc dans Comparer, Qualité & Audit, Statistiques, Explorer, Explorateur 360°, Extraire, Tableaux de bord, Préparation… Il n'apparaît <b>ni dans Sources, ni dans le modèle, ni dans les sauvegardes, ni dans la gouvernance</b>.",
                    '<b>Comparer</b> : « 📄 Fichier extérieur… » sous chaque côté pour comparer avec un fichier reçu, ou deux fichiers entre eux, sans les charger comme sources. Après la comparaison : garder les écarts seulement, ou tout le rapport.',
                    "<b>Panneau ⏳ Jeux</b> en haut : la liste des jeux (origine, lignes, colonnes), renommer, « Utiliser dans » Comparer / Qualité / Statistiques / Explorer / Extraire, exporter en CSV, <b>promouvoir en source</b> (avec son origine dans le lineage) ou supprimer. Les jeux disparaissent à la fermeture ; un rappel s'affiche avant de quitter s'il en reste.",
                    'Enchaînement type : fichier reçu → filtre par liste → extraction → jeu temporaire → audit dessus → anomalies en jeu → comparaison avec le fichier reçu → export. Aucune source créée.'
                ]
            },
            {
                v: '12.3.0',
                d: '2026-09-09',
                t: 'Extraire : filtrer sur une liste fournie, sans créer de source',
                items: [
                    "<b>« 📄 Filtrer sur un fichier »</b> dans les Filtres : déposez un fichier Excel, CSV ou texte (ou collez une liste) et l'extraction ne garde que les lignes qui s'y trouvent. La liste reste en mémoire pour cette extraction : elle n'apparaît ni dans Sources, ni dans le modèle.",
                    '<b>Une ou plusieurs colonnes de correspondance</b> : chaque colonne du fichier est rattachée à une colonne des tables (table de départ ou tables reliées), pré-remplie quand les noms se ressemblent. Avec deux colonnes (client + année, par exemple), une ligne doit correspondre sur les deux.',
                    '<b>Correspondance tolérante</b> : majuscules / minuscules et espaces ignorés par défaut, valeur exacte, ou normalisée (accents, ponctuation, zéros de tête). <b>Garder</b> ou <b>exclure</b> les lignes du fichier.',
                    "<b>Conserver l'ordre du fichier et joindre ses autres colonnes</b> (commentaire, référence interne…) au résultat, option à cocher ; les colonnes clés sont ajoutées en sortie automatiquement.",
                    "<b>Vérifier</b> : combien de valeurs du fichier n'existent pas dans la table, avec les premières manquantes. Le filtre s'affiche en pastille (nom, nombre de lignes, correspondances) avec Modifier / Vérifier / retirer ; il est enregistré avec les paramétrages."
                ]
            },
            {
                v: '12.2.0',
                d: '2026-09-09',
                t: 'Extraire : un plan de travail intuitif, sans étapes',
                items: [
                    "Plus d'onglets ni de « Suivant » : la page se lit de haut en bas comme une recette — <b>Colonnes en sortie</b>, <b>Filtres</b>, <b>Forme du résultat</b> (doublons, regroupement, jointures, volume) — et, à droite, un panneau <b>Résultat</b> qui reste à portée (Compter, Prévisualiser, Bilan qualité, Voir le SQL, Générer, ajouter comme source). Aperçu, bilan et SQL s'affichent en pleine largeur dessous.",
                    "<b>« ＋ Ajouter une colonne »</b> ouvre le sélecteur à la demande (colonne d'une table, synthèse d'une table liée, hiérarchie aplatie, colonne calculée) ; il est ouvert d'office tant qu'aucune colonne n'est choisie.",
                    'Bandeau de synthèse et outils rangés (paramétrages, objet métier, vue graphique, guide) conservés. Aucun formulaire ni comportement du moteur modifié.'
                ]
            },
            {
                v: '12.1.0',
                d: '2026-09-09',
                t: 'Extraire : un espace de travail guidé, toutes les fonctions conservées',
                items: [
                    '<b>Quatre étapes lisibles</b> — ① Colonnes (ce qui sort), ② Filtres (quelles lignes), ③ Options (doublons, agrégats, jointures, limite), ④ Résultat (compter, prévisualiser, bilan qualité, SQL, générer, ajouter comme source) — avec Précédent / Suivant. Compter, Prévisualiser ou Voir le SQL amènent directement au Résultat.',
                    "<b>Bandeau de synthèse</b> en tête : table de départ, objet métier, nombre de colonnes et de filtres, dédoublonnage, regroupement, type de jointure, SQL personnalisé ; chaque pastille mène à l'étape concernée.",
                    "<b>Outils rangés</b> derrière des boutons : 💾 Paramétrages enregistrés (charger, renommer, supprimer, enregistrer), 🏛️ Objet métier, 🗺️ Vue graphique, 🧭 Guide pas à pas. Le bloc graphique s'ouvre avec son interrupteur.",
                    "<b>Ajouter une colonne</b> en onglets : colonne simple, Σ synthèse d'une table liée, 🌳 hiérarchie aplatie, ƒx colonne calculée — un seul formulaire visible à la fois.",
                    "Les formulaires, identifiants et gestionnaires d'événements de l'extraction sont inchangés : le guide pas à pas, le choix du lien quand deux tables sont reliées plusieurs fois, les critères d'agrégats (NB.SI.ENS) et le SQL personnalisé fonctionnent comme avant."
                ]
            },
            {
                v: '12.0.0',
                d: '2026-09-09',
                t: "V12 — l'ergonomie sur toute l'application, pas seulement la gouvernance",
                items: [
                    "<b>Accueil de l'application</b> (à la place du cockpit) : ce que vous avez (sources, modèle, qualité, gouvernance), <b>vos prochaines étapes</b> déduites de l'état réel, points d'attention, fiches récentes, actions rapides.",
                    '<b>Recherche Ctrl+K sur tout</b> : les écrans des quatre phases, les actions (charger un fichier, fusionner, connecter une base, lancer un audit, sauvegarder…), les sources, colonnes, objets, termes, applications.',
                    "<b>Précédent / Suivant et fil d'Ariane sur tous les écrans</b>, pas seulement en gouvernance. Raccourcis G puis S / M / X / Q / R / B / I pour Sources, Modèle, Extraire, Qualité, Règles, Tableaux de bord, Accueil.",
                    "<b>En-têtes de page unifiés</b> : un titre, une phrase, les explications longues repliées derrière « ℹ️ En savoir plus ». <b>Une seule couleur d'action</b> pour les boutons principaux au lieu de sept.",
                    '<b>Sources</b> : vue liste ou cartes, et sur chaque source les actions « Explorer, Auditer, Extraire, Dictionnaire, Objet métier » à un clic.',
                    "<b>Barres d'action collantes</b> : Compter / Prévisualiser / Générer restent visibles dans Extraire, « Lancer l'audit » dans Qualité, quelle que soit la longueur du formulaire.",
                    "<b>Plein écran</b> (⛶) sur les tableaux de données, rapports d'audit, graphes, tableaux de bord, préparations, règles, séries, rapprochements.",
                    "<b>Écrans sans données</b> : un bandeau explique qu'il faut d'abord charger une source, avec le bouton pour le faire. <b>« Et ensuite ? »</b> en bas de chaque écran propose les écrans logiques suivants.",
                    '<b>Moteur de données indisponible</b> : un seul bandeau clair en haut (cause, ce qui reste possible, réessayer) au lieu de messages rouges dispersés.',
                    "Aide « ? » et visite guidée étendues à toute l'application ; lexique complété (source, table conçue, extraction, règle, rapprochement, série, préparation, tableau de bord)."
                ]
            }
        ];
