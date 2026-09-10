        // ======================= V14 : VERSION ET JOURNAL DE LA COUCHE « TECHNIQUE » =======================
        // Assemblé uniquement dans StudioDataV14.html (manifest-v14.json), après la couche V13 dont il hérite.
        // La V14 n'ajoute aucune fonctionnalité métier : elle rend le code maintenable et observable.
        const V14_VERSION = '14.1.0';
        const V14_CHANGELOG = [
            {
                v: '14.1.0',
                d: '2026-09-10',
                t: 'Lisibilité : un code lisible ligne à ligne, mesuré et tenu',
                items: [
                    '<b>Mise en forme automatique</b> de tous les fichiers (Prettier, 120 colonnes) : les lignes qui empilaient plusieurs instructions sont découpées, les longues expressions passées à la ligne. 0 ligne à instructions multiples ; les lignes de logique de plus de 160 caractères passent de 2 742 à 11 (des requêtes SQL à expressions).',
                    "<b>Variables locales renommées</b> d'après ce qui les initialise ou ce qu'on lit dessus (analyse de portée ESLint, sans jamais créer de collision) : <code>t</code> → <code>table</code>, <code>g</code> → <code>governance</code>, <code>el('adv-col-tbl')</code> → <code>advColTblElement</code>, <code>r.el</code> → <code>attribute</code>, <code>_v12xyz</code> → <code>base</code>… près de 1 300 renommages ; la part de noms courts passe de 18 % à 14 %, le reste étant des expressions sans inférence sûre.",
                    '<b>Gabarits HTML aérés</b> : un retour à la ligne après chaque bloc (div, tr, td, section…) dans les gabarits longs, sans effet sur le rendu ; les éléments en ligne ne sont jamais séparés.',
                    '<b>Mesure intégrée</b> : <code>tools/lisibilite-mesurer.mjs</code> calcule par fichier les lignes longues, les instructions multiples, les noms courts et les commentaires ; le build embarque ces mesures et le panneau Architecture gagne un onglet <b>Lisibilité</b> (seuils, fichiers à reprendre). Les seuils sont des planchers de non-régression vérifiés par les tests.',
                    "Outils versionnés et rejouables : <code>formater.mjs</code>, <code>renommer-locales.mjs</code>, <code>gabarits-aerer.mjs</code>, <code>lisibilite-mesurer.mjs</code>. En-têtes explicatifs ajoutés aux derniers fichiers qui n'en avaient pas."
                ]
            },
            {
                v: '14.0.0',
                d: '2026-09-10',
                t: 'V14 — version technique : un code maintenable, structuré et vérifié',
                items: [
                    "<b>Sources rangées par domaine</b> : 00-squelette, 10-noyau, 20-gouvernance, 30-lineage-graphes, 40-modele-sources, 50-sensibilite, 60-tableaux-preparation, 70-qualite, 80-extraction-exploration, puis une couche par version (90-couche-v11, 92-couche-v12, 94-couche-v13, 96-couche-v14). Les fichiers livrés sont reconstruits à l'identique.",
                    "<b>Registre d'extensions Studio.extend</b> : les 106 enveloppes ad hoc (« const _x = fn ; fn = function… ») sont remplacées par un mécanisme unique et observable. Pour chaque fonction, on sait quelle couche l'étend, dans quel ordre et pourquoi ; <b>Studio.selfCheck()</b> signale une extension sans base, une fonction déclarée deux fois, une extension non appliquée.",
                    "<b>Panneau « Architecture »</b> (aide « ? » ou palette Ctrl K) : modules par domaine et par couche, fonctions déclarées, chaîne d'extensions de chaque fonction, auto-contrôle, export de l'index de l'API.",
                    '<b>Qualité outillée</b> : configuration ESLint versionnée (globales générées depuis les sources, no-undef, no-func-assign, no-redeclare, clés dupliquées…) — 0 anomalie ; les anomalies réelles trouvées ont été corrigées (deux clés dupliquées, une fonction définie deux fois, vingt et une variables mortes).',
                    '<b>Modèle de données documenté</b> (10-noyau/01-types.js) : sources, liens, objets métier, attributs, actifs, propositions, carte des flux, graphes, extraction — chaque champ avec son sens. <b>ARCHITECTURE.md</b>, <b>CONVENTIONS.md</b> (nommage, extension, tests) et <b>API.md</b> généré par le build.',
                    '<b>Tests versionnés</b> dans studio-data/tests : 46 suites headless et la régression V6/V7, un lanceur par cible (node tests/run.mjs --target v14), assertion de version indépendante de la cible.'
                ]
            }
        ];
