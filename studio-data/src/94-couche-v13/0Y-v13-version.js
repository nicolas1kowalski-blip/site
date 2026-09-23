        // ======================= V13 : VERSION ET JOURNAL DE LA COUCHE « GOUVERNANCE SIMPLE » =======================
        // Assemblé uniquement dans StudioDataV13.html (manifest-v13.json), après la couche V12 dont il hérite.
        const V13_VERSION = '13.33.0';
        const V13_CHANGELOG = [
            {
                v: '13.33.0',
                d: '2026-09-23',
                t: 'La bulle d’un trait parle, elle aussi, les mots du métier',
                items: [
                    'La bulle d’un trait est du texte pur : la traduction des écrans, qui travaille sur ce qui est affiché, ne la voyait pas. Elle disait donc encore « 3 attribut(s) ». Elle dit maintenant <b>« 3 information(s) »</b>, comme partout ailleurs en V13.'
                ]
            },
            {
                v: '13.32.0',
                d: '2026-09-23',
                t: 'Au survol d’un trait, ce qui y circule — y compris là où l’on ne peut pas cliquer',
                items: [
                    'La <b>carte des flux</b> dessine ses liens elle-même, sous un calque rendu <b>transparent à la souris</b> : ses traits ne pouvaient pas être cliqués, et ne le pourront pas sans refaire le dessin de l’écran. C’est sans doute là que le clic vous échappait.',
                    'Chaque trait <b>dit maintenant au survol ce qui y circule</b> : « GMAO Orion → Équipement · produit (maître) — 3 information(s) : Description, Famille, Repère ». La bulle est écrite dans le schéma lui-même, elle marche donc <b>sur tous les schémas</b>, carte des flux comprise, et survit au déplacement des cases.',
                    'Sur la carte des flux, les traits reçoivent en plus un <b>trait invisible de 14 pixels</b> pour qu’on puisse les survoler : un trait dessiné en fait deux. Le reste du calque laisse toujours passer la souris vers les cases.',
                    'Quand un trait ne porte aucune information, la bulle le dit plutôt que de s’afficher vide.',
                    'Au passage : le remplacement des émojis par des icônes <b>n’entre plus dans les schémas</b>. Il croyait déjà les éviter, mais la comparaison des noms de balise ne tenait pas compte des minuscules ; il déposait donc des icônes dans les bulles, ce qui semait des tracés parasites dans le dessin.'
                ]
            },
            {
                v: '13.31.0',
                d: '2026-09-22',
                t: 'Les derniers écrans de gouvernance parlent enfin la même langue',
                items: [
                    'La <b>phrase d’accueil</b> d’un écran se posait avant la barre de liste. Sur le <b>glossaire</b>, cette barre vient après le titre, l’explication et le bouton : la phrase tombait donc au milieu de l’écran, alors qu’elle est là pour accueillir. Elle est maintenant <b>toujours en tête</b>.',
                    '<b>« Surveillance des sources » n’avait aucune phrase d’accueil</b> : c’était le seul écran de gouvernance sans. Elle est écrite.',
                    'Trois explications étaient rédigées en jargon et sont réécrites en français : « fraîcheur, dérive, conformité au schéma attendu » devient <b>« sont-ils à jour, et ressemblent-ils à ceux d’hier ? »</b> ; « n’est plus jugé sur la rareté de ses valeurs mais sur leur appartenance au référentiel » devient <b>« l’audit signale ce qui n’est pas dans votre liste »</b> ; « pseudonymisation stable grâce à un sel de session » devient <b>« un même nom devient toujours le même code à l’intérieur d’un export »</b>, le terme savant restant au survol.',
                    'Le <b>vocabulaire métier s’applique désormais au milieu des phrases</b>, et plus seulement aux mots isolés : « Attributs désignés » devient « Informations désignées », « Tables techniques (2) » devient « Fichiers (2) », « pseudonymisation (jeton stable salé) » devient « remplacé par un code », « Prendre un instantané » devient « Prendre une photo ». Les tournures sont écrites entières et déjà accordées — remplacer mot à mot donnerait « un information ».'
                ]
            },
            {
                v: '13.30.0',
                d: '2026-09-22',
                t: 'Parcours : les traits répondent aussi dans l’écran « Lineage », et le plein écran laisse passer',
                items: [
                    'Dans l’écran <b>Lineage</b>, les traits ne répondaient pas : le clic n’y avait jamais été branché — il l’était dans le parcours d’un objet et dans celui du catalogue, pas là. C’est fait : <b>un clic sur un trait</b> ouvre le panneau de ce qui y passe.',
                    'Sur cet écran, le clic simple sur une case sert déjà à <b>éclairer toute la chaîne</b> : on ne le lui prend pas. C’est le <b>double clic</b> qui ouvre la fiche. La légende sous le schéma le dit.',
                    'En <b>plein écran</b>, ouvrir une fiche ou un panneau ne se voyait pas : le schéma occupe seul l’écran, et tout s’affichait derrière. On restait devant le même schéma en se demandant pourquoi rien ne se passait. L’application <b>quitte maintenant le plein écran</b> avant de vous emmener ailleurs.'
                ]
            },
            {
                v: '13.29.0',
                d: '2026-09-22',
                t: 'La planche d’un schéma reste claire, thème sombre compris',
                items: [
                    'La 13.28 faisait basculer la planche en <b>sombre</b> quand l’application était en thème sombre. Mauvaise idée : un schéma se lit comme un <b>document</b> — il s’imprime, il se colle dans une présentation, il se montre en réunion — et les cases sont peintes en teintes pâles (vert, bleu, ambre) qui s’éteignent sur un fond sombre. La planche est donc <b>toujours claire</b>.',
                    'Deux règles du thème sombre repeignaient le schéma par-dessus, avec priorité : le fond du cadre, et les <b>étiquettes des liens</b> — texte pâle sur halo sombre, qui formait des pâtés noirs sur la planche blanche. Les deux sont neutralisées en plein écran : fond blanc, encre ardoise, halo blanc.',
                    'Un test s’exécutait sur un conteneur de dépannage, sans style, et passait donc à tort. Il porte désormais sur le vrai cadre du schéma, avec ses classes — c’est lui qui a révélé les deux règles ci-dessus.'
                ]
            },
            {
                v: '13.28.0',
                d: '2026-09-22',
                t: 'Plein écran d’un schéma : une planche à dessin, plus un fond gris',
                items: [
                    'En plein écran, les schémas s’affichaient sur un <b>gris terne</b> où les couleurs des cases se noyaient. La cause : ces cadres sont <b>translucides</b> (un blanc à 50 %), et le navigateur pose du <b>noir</b> derrière un élément en plein écran — blanc à moitié transparent sur noir donne du gris.',
                    'Le schéma occupe maintenant l’écran sur un <b>fond plein</b>, avec une <b>trame de points fine</b> qui aide l’œil à situer les cases et à mesurer les distances, et de l’air tout autour. Le cadre et les coins arrondis, qui n’ont plus de sens quand on occupe l’écran entier, disparaissent.',
                    'La règle vaut pour <b>tous les schémas</b> : parcours d’un objet, parcours du catalogue, carte des flux, modèle de données, graphe de l’extraction.'
                ]
            },
            {
                v: '13.27.0',
                d: '2026-09-22',
                t: 'Parcours de la donnée : tout s’ouvre au clic, y compris les traits',
                items: [
                    'Le clic sur une case ne marchait que pour les objets métier. Il vaut maintenant pour <b>tout ce qui est dessiné</b> : une <b>application</b> ou un <b>processus</b> ouvre sa carte dans « Applications & processus », amenée sous les yeux et surlignée ; un <b>attribut</b> ouvre la fiche de l’objet qui le porte ; un <b>fichier</b> ouvre sa fiche du catalogue, colonne par colonne. La case « Application non déclarée » dit quoi faire au lieu d’ouvrir le vide.',
                    '<b>Un clic sur un trait dit ce qui y passe.</b> Le schéma disait « cette application alimente cet objet » ; il ne disait pas QUOI. Un panneau s’ouvre au-dessus du schéma et liste chaque information qui transite, avec l’objet métier auquel elle appartient et <b>d’où elle vient</b> — « SEGMENTS · CODE », « repris de Personne », « application source de cet attribut », « utilisé par Reporting ». Tout est déduit des rattachements déjà saisis : rien à ressaisir.',
                    'Et quand un trait ne porte encore aucune information, il le dit franchement plutôt que de laisser croire à un panneau vide.',
                    'Côté schéma, un <b>trait invisible de 14 pixels</b> est posé sur chaque lien : viser un trait d’un pixel à la souris était impossible. Déplacer le schéma en partant d’un trait n’ouvre pas le panneau — le clic ne compte que s’il n’y a pas eu de geste.'
                ]
            },
            {
                v: '13.26.0',
                d: '2026-09-22',
                t: 'Parcours de la donnée : plus de fichiers quand on n’en veut pas, et un clic ouvre la fiche',
                items: [
                    '<b>« 📄 Afficher les fichiers » décochée, des fichiers apparaissaient quand même</b> — une case bleue « ▦ NOMFICHIER » au milieu d’un graphe censé n’en montrer aucune. La règle n’était appliquée que si une <i>application</i> était déclarée pour le fichier ; sans application, le fichier restait dessiné. C’est pourtant le cas le plus courant : un fichier reçu que personne n’a encore rattaché.',
                    'Avant d’effacer un fichier du graphe, l’application <b>regarde ce qu’il y a derrière</b> : un fichier sans application est souvent construit à partir d’un autre, lui-même produit par une application — c’est elle qui s’affiche alors, « via LE_FICHIER ». Sans cette remontée, décocher la case aurait coupé la chaîne au lieu de la simplifier.',
                    'Et quand il n’y a vraiment rien derrière, les fichiers sont portés par une case unique <b>« ❔ Application non déclarée »</b> qui les cite tous. La lecture reste application → objet, rien n’est perdu, et le trou de gouvernance se voit au lieu d’être caché derrière une case bleue de plus. Les <b>quatre</b> endroits qui fabriquaient ces cases partagent désormais la même règle : sources amont, tables destinataires, tables des attributs, et la remontée « tout l’amont ».',
                    '<b>Cliquer sur un objet métier dans le schéma ouvre sa fiche</b>, dans l’onglet Objets, tiroir du catalogue refermé. Lire un parcours donnait envie d’ouvrir ce qu’on y voyait, et il fallait ressortir, retrouver l’onglet, rechercher le nom. Une invite le dit à côté du titre — sans elle, personne n’essaie.'
                ]
            },
            {
                v: '13.25.0',
                d: '2026-09-21',
                t: 'Un fichier Windows / ANSI se charge, même sur un moteur qui ne sait pas le lire',
                items: [
                    'Choisir l’encodage <b>« Windows / ANSI (Latin-1) »</b> ou <b>« UTF-16 »</b> faisait échouer la lecture sur <b>« Binder Error: Invalid named parameter "encoding" »</b>. L’option <i>encoding</i> n’existe que dans les moteurs récents, et les trois replis prévus échouaient tous pareillement puisqu’ils repassaient la même option.',
                    'L’application fait désormais le travail elle-même quand le moteur ne sait pas : le fichier est <b>relu dans son encodage d’origine et réécrit en UTF-8</b>, par tranches de 8 Mo, puis remis au moteur qui n’a plus qu’à lire de l’UTF-8. Le décodage travaille en flux, donc un caractère coupé entre deux tranches est recollé au lieu d’être perdu — y compris un pictogramme, écrit sur deux unités.',
                    'Le rattrapage vaut pour une source d’un seul fichier comme pour une source <b>découpée en plusieurs fichiers</b>.',
                    'Au-delà de 300 Mo, la conversion est refusée <b>avec une phrase claire</b> — « enregistrez-le en UTF-8 avant de le charger » — plutôt qu’un plantage : le fichier converti devrait tenir entier dans la mémoire du navigateur.'
                ]
            },
            {
                v: '13.24.0',
                d: '2026-09-21',
                t: 'Le même défaut de mémoire touchait aussi le chargement d’une SOURCE',
                items: [
                    'La 13.23 avait corrigé le chargement d’un fichier déposé comme jeu temporaire. Le chargement d’une <b>source</b> passait par un troisième chemin, écrit à l’identique, et tombait donc de la même façon.',
                    'La correction est maintenant écrite <b>une seule fois, dans le cœur</b> : les trois chemins — une source, un fichier déposé, la liste d’entrée de l’extraction — déposent leurs lignes par la même fonction. Plus de copie à maintenir en trois endroits.',
                    'Mêmes garanties, vérifiées sur un vrai moteur pour les deux formes de lignes qui existent : celles d’un fichier déposé (un tableau de valeurs) et celles d’une source (un objet nommé par colonne).'
                ]
            },
            {
                v: '13.23.0',
                d: '2026-09-21',
                t: 'Charger un gros fichier ne fait plus tomber le moteur',
                items: [
                    'Déposer un fichier volumineux s’arrêtait sur <b>« Impossible de charger le fichier dans le moteur : memory access out of bounds »</b>.',
                    'Le tableau était remis au moteur en <b>JSON</b>, avec le <b>nom de chaque colonne répété à chaque ligne</b>, le tout assemblé en une seule chaîne de texte avant d’être recopié. Sur 450 000 lignes et vingt colonnes : 218 Mo de JSON, soit 437 Mo une fois en mémoire comme texte, puis une troisième copie dans le moteur. Il n’y avait pas la place.',
                    'Le tableau est maintenant écrit en <b>CSV, directement en octets et par paquets de 20 000 lignes</b> : 130 Mo, sans chaîne géante intermédiaire. Sur ces mêmes données, <b>cinq fois moins de mémoire</b> traverse le navigateur.',
                    'Rien ne se perd au passage : virgules, points-virgules, guillemets, sauts de ligne, tabulations et accents sont préservés, une valeur absente reste absente et une chaîne vide reste une chaîne vide. Une lettre témoin devant chaque valeur garantit qu’aucune donnée réelle ne peut être confondue avec la marque d’absence — tout cela vérifié sur un vrai moteur.',
                    'La même correction s’applique à la <b>liste d’entrée</b> de l’extraction, qui chargeait ses lignes de la même façon.'
                ]
            },
            {
                v: '13.22.0',
                d: '2026-09-18',
                t: 'Codification : « Tous les cas à revoir » tient sur une vraie liste',
                items: [
                    '« Tous les cas à revoir » s’arrêtait sur <b>« la mémoire du navigateur n’a pas suffi »</b>. Le bouton demandait les deux cent mille libellés d’un coup : le moteur devait tenir en même temps la table codée entière et tout le rapprochement refait par-dessus.',
                    'Deux corrections. D’abord le <b>classement des propositions</b> : il obligeait à ranger l’intégralité des couples notés — des dizaines de millions — avant d’en jeter la quasi-totalité. Les meilleures sont désormais retenues <b>au passage</b> : la mémoire ne dépend plus que du nombre de libellés. Mesuré sur 450 000 lignes et 120 000 libellés à trancher, dans 1,4 Go et sans écriture disque : l’ancien plan s’arrête, le nouveau sort les 455 998 propositions en 4 secondes.',
                    'Ensuite un <b>repli par paquets</b> de 5 000 libellés, quand même cela ne suffit pas : chaque morceau est écrit avant que le suivant ne commence, et l’écran affiche l’avancement. C’est trois fois plus lent, alors on ne s’y résout qu’après avoir manqué de place. Un test prouve que les paquets rendent exactement ce que l’export d’un coup rendait, sans jamais servir un libellé deux fois.',
                    'Et cet export s’exécute maintenant, comme la codification, en <b>mémoire pure</b> : ce navigateur ne peut pas écrire sur le disque, inutile de laisser le moteur chercher un fichier temporaire qui n’existe pas.'
                ]
            },
            {
                v: '13.21.0',
                d: '2026-09-18',
                t: 'Codification : voir, retirer et vider ce que l’on a décidé',
                items: [
                    'Les décisions prises à la revue s’accumulaient <b>sans aucun écran pour les relire</b>. On ne savait ni ce qui était retenu, ni comment revenir sur un choix : la seule trace était un « (N libellé(s) appris) » au milieu d’une phrase.',
                    'Un bloc <b>⑤ Ce que vous avez décidé</b> les rassemble : un tableau des libellés appris — le libellé, le code retenu, par qui, quand — et, en dessous, les libellés écartés. Le <b>✕</b> oublie un choix (le libellé redevient une question à la prochaine codification), le <b>↺</b> remet un libellé écarté en question.',
                    '<b>Exporter en CSV</b> emporte la liste pour la relire ailleurs ou la faire valider. <b>Tout vider</b> efface les choix appris, après confirmation — c’est une perte de travail, elle ne peut pas se faire par mégarde.',
                    'Retirer un libellé appris retire aussi la décision attachée à la ligne qui l’avait produite : plus rien ne survit en silence.'
                ]
            },
            {
                v: '13.20.0',
                d: '2026-09-17',
                t: 'Codification : les codes du résultat deviennent lisibles',
                items: [
                    'La colonne <b>Chemin dans l’arbre</b> restait vide sur toutes les lignes sans code retenu — c’est-à-dire précisément celles que l’on doit examiner. Elle donne maintenant le chemin complet de la <b>proposition faite dans la famille</b> : « J01 › Thermique chauffage › … › Disconnecteur BA zpr-ctr. ».',
                    'Le code trouvé <b>hors famille</b> s’affichait seul : « 37010909.D » ne dit rien tant qu’on n’a pas ouvert la nomenclature en face. Deux colonnes le rendent lisible à leur tour — <b>Libellé de ce code</b> et <b>Chemin dans l’arbre de ce code</b>, ce dernier partant de la famille où ce code-là a réellement été trouvé.',
                    'Le fichier résultat se lit donc de bout en bout sans rouvrir l’arborescence : pour chaque ligne, ce que l’on propose dans sa famille, d’où cela vient, et ce que l’on a vu ailleurs.'
                ]
            },
            {
                v: '13.19.0',
                d: '2026-09-17',
                t: 'Codification : la proposition de la famille s’imprime dans le résultat',
                items: [
                    'Le fichier résultat n’avait <b>aucune colonne</b> pour la proposition faite dans la famille de la ligne. Il n’imprimait que le code trouvé <i>ailleurs</i> dans l’arbre. Une ligne « Disconnecteur CES » en J01, notée 0,333 contre un disconnecteur de sa propre famille, ressortait avec un code de la famille K04 en face d’elle : on lisait que la machine « avait choisi K04 », alors qu’elle n’avait rien choisi et avait bel et bien regardé la famille en premier.',
                    'Le résultat porte maintenant trois colonnes de plus : <b>Proposition dans sa famille</b>, <b>Libellé de cette proposition</b> et <b>Confiance de cette proposition</b>. Le code trouvé hors famille reste imprimé à côté — il ne la remplace plus.',
                    'Le cas du terrain est couvert par un test : un même code rangé sous deux familles est proposé sous celle de la ligne, avec son libellé, et non sous l’autre.'
                ]
            },
            {
                v: '13.18.0',
                d: '2026-09-17',
                t: 'Codification : l’application dit quelle colonne de famille choisir',
                items: [
                    'Quand les familles de la liste ne se retrouvent pas dans la nomenclature, <b>aucune ligne ne peut recevoir de proposition de sa famille</b> : l’application le signalait, mais laissait chercher laquelle des deux colonnes n’était pas la bonne.',
                    'Elle <b>essaie maintenant chaque colonne</b> des deux fichiers et compte, pour chacune, la part de ses valeurs que l’autre fichier reconnaît. Quand une colonne fait nettement mieux que celle qui est déclarée, elle est nommée : « Dans « equipements.csv », la colonne « NIV1 » reconnaît 100 % de ces valeurs, contre 0 % pour « GENRE ». C’est sans doute elle qu’il faut choisir. »',
                    'Le conseil ne s’affiche que s’il est sûr : la colonne proposée doit reconnaître au moins la moitié des valeurs, et faire au moins 20 points de mieux que celle qui est déclarée. Sinon l’application se tait plutôt que d’envoyer sur une fausse piste.'
                ]
            },
            {
                v: '13.17.0',
                d: '2026-09-17',
                t: 'Codification : la famille d’abord, vraiment',
                items: [
                    'Le rapprochement était <b>aveugle à la famille</b>. Il choisissait les mots sur lesquels chercher d’après leur rareté dans TOUT l’arbre : « CHAUDIERE », porté par des centaines de types, était jugé trop courant et écarté. La ligne n’examinait donc jamais les chaudières de sa propre famille. Mesuré : « Chaudière 2 » en J01 ne recevait qu’une proposition de sa famille — <b>une vanne</b> — plus une chaudière d’une autre famille.',
                    'La rareté d’un mot se mesure désormais <b>aussi famille par famille</b>. Dans la famille J01, « CHAUDIERE » n’est porté que par trois types : c’est précisément lui qui distingue, et il est retenu. On cherche donc d’abord dans la famille de la ligne, puis dans le reste de l’arbre — et la seconde étape n’enlève jamais rien à la première.',
                    'Même cas après correction : les <b>trois chaudières J01</b> arrivent en tête, puis la vanne, puis l’élargissement.',
                    'Mesuré sur le volume : 20 000 lignes contre 3 000 types répartis en 30 familles, dans 512 Mo et sans écriture disque, en 0,2 seconde. Chercher d’abord dans la famille ne coûte rien.'
                ]
            },
            {
                v: '13.16.0',
                d: '2026-09-17',
                t: 'Codification : une proposition faible n’est pas une absence',
                items: [
                    '<b>Des lignes ressortaient « non trouvées » avec un score de 0 alors que des types de leur famille partageaient un mot avec elles.</b> « Disconnecteur CES Le Vigneret » contre « Disconnecteur BA zpr-ctr. » vaut 25 % : le couple était bien retenu et bien noté, mais le seuil « à revoir » de 0,45 le jetait — et avec lui toute trace de son existence.',
                    'Le seuil ne décide plus de ce que l’on GARDE, seulement du statut que l’on donne. Nouveau statut <b>« Proposition faible »</b> : un type de la bonne famille a été trouvé, mais il ressemble trop peu pour qu’on décide. Le vrai score est affiché, plus zéro.',
                    'Ces lignes arrivent désormais à la revue et dans « Tous les cas à revoir », au lieu d’être perdues. « Non trouvé » ne veut plus dire que ce qu’il dit : aucun type ne partage le moindre mot avec cette ligne.',
                    'Le bilan les compte à part, et l’écran dit quoi en faire : les regarder, baisser le seuil « à revoir », ou ajouter un synonyme.'
                ]
            },
            {
                v: '13.15.0',
                d: '2026-09-17',
                t: 'Codification : la vue complète des cas à revoir',
                items: [
                    'Mise au point sur les plafonds, parce que le doute était légitime. <b>Le résultat codé part en entier</b> : « → Utiliser le résultat » envoie les 450 000 lignes, pas un échantillon. Seul le tableau de l’écran n’en montre que 200, et il le dit désormais.',
                    'En revanche la revue, elle, plafonnait bien : <b>cinquante questions</b>, les libellés les plus fréquents d’abord. C’est ce qu’on peut trancher à la main sans se perdre, mais cela ne donne aucune vision d’ensemble.',
                    'Nouveau bouton <b>« → Tous les cas à revoir »</b> : tous les libellés à trancher, sans plafond, une ligne par proposition — le libellé, sa famille, le nombre de lignes qu’il couvre, le code proposé, son chemin, son score, et s’il vient de la bonne famille. De quoi juger de l’ensemble dans un tableur, repérer les gros volumes et les libellés sans proposition de leur famille.',
                    'Et la revue annonce son plafond quand elle l’atteint, au lieu de laisser croire qu’il n’y a que cinquante cas.'
                ]
            },
            {
                v: '13.14.0',
                d: '2026-09-17',
                t: 'Codification : pourquoi aucune proposition de ma famille ?',
                items: [
                    '« 0 proposition dans la famille de la ligne » ne disait pas POURQUOI. Il n’y a que deux raisons, et il fallait pouvoir les distinguer : ou bien la famille de la ligne n’existe pas dans la nomenclature — c’est alors la colonne de branche qu’il faut revoir —, ou bien elle existe mais aucun de ses types ne partage de mot avec ce libellé.',
                    '<b>Un contrôle de la colonne de branche</b> est joué après chaque codification : il compte les lignes par famille et dit lesquelles la nomenclature ignore. Si AUCUNE ne se retrouve, il le dit franchement : les deux colonnes ne parlent pas de la même chose, et il faut vérifier laquelle a été choisie de chaque côté.',
                    'Et chaque cas de la revue sans proposition de sa famille nomme la raison qui s’applique à lui.'
                ]
            },
            {
                v: '13.13.0',
                d: '2026-09-17',
                t: 'Codification : la famille de la ligne servie la première, et largement',
                items: [
                    'La revue ne montrait que <b>trois</b> propositions en tout. Dès qu’un type d’une autre famille se gliçait dans le lot, il prenait la place d’un candidat légitime : on se retrouvait à choisir entre deux types de la bonne famille alors qu’elle en offrait six.',
                    'La famille de la ligne a désormais <b>son propre quota, servi en premier</b> : huit propositions par défaut, réglables jusqu’à vingt à côté des seuils. L’élargissement aux autres familles vient <b>ensuite</b>, borné à trois, et jamais à la place : trois propositions de plus, pas trois de moins.',
                    'Chaque cas de la revue annonce la répartition — combien viennent de la famille de la ligne, combien d’ailleurs dans l’arbre.'
                ]
            },
            {
                v: '13.12.1',
                d: '2026-09-17',
                t: 'Codification : un code appartient souvent à plusieurs familles',
                items: [
                    'Le contrôle de branche livré en 13.12.0 comparait la famille de la ligne à <b>une seule</b> occurrence du code dans l’arbre, prise au hasard. Or un même code de type figure presque toujours sous plusieurs familles : une ligne parfaitement correcte était signalée à tort, et le chemin affiché était celui d’une autre famille.',
                    'La question posée est désormais la bonne : <b>ce code existe-t-il sous la famille de la ligne ?</b> Si oui, rien à signaler, et le chemin affiché est celui de SA famille. Si non, on nomme <b>toutes</b> les familles où ce code existe, pas une au hasard.',
                    'Et une phrase sous le résultat dit ce qui cloche, ligne par ligne : d’où vient le code — code déjà fourni, règle, libellé appris, ressemblance —, la famille portée par la ligne, et celles où ce code vit réellement. De quoi décider si c’est la famille de la liste qui est fausse, ou l’arborescence qui est incomplète.'
                ]
            },
            {
                v: '13.12.0',
                d: '2026-09-17',
                t: 'Codification : le pluriel ne sépare plus deux mots identiques, et la branche est vérifiée partout',
                items: [
                    '<b>« POMPES » et « POMPE » étaient deux mots étrangers l’un à l’autre.</b> Ils ne se rapprochaient pas, et ne comptaient pas comme retrouvés. Mesuré sur un vocabulaire d’équipements français où chaque ligne partage un mot avec son type : <b>18 lignes rapprochées sur 36</b>. Les mots de plus de trois lettres sont désormais ramenés au singulier des deux côtés, avant les synonymes : <b>36 sur 36</b>.',
                    '<b>La branche est vérifiée quelle que soit l’origine du code.</b> Le contrôle ne portait que sur la ressemblance : un code déjà fourni dans la liste, une règle de mots-clés ou un libellé appris passaient sans contrôle, et la ligne ressortait codée d’office avec un chemin qui commençait par une autre famille que la sienne. Ces lignes passent en « Autre branche », le code est conservé, et la branche du type est affichée à côté.'
                ]
            },
            {
                v: '13.11.0',
                d: '2026-09-17',
                t: 'Codification : une question par libellé, pas une par ligne',
                items: [
                    'Le même libellé revient des centaines de fois dans une liste reçue. La revue posait la question ligne à ligne : on répondait cinquante fois à la même chose, et les cinquante places disponibles partaient en doublons d’une poignée de libellés. <b>La revue regroupe désormais par libellé</b>, les plus fréquents servis d’abord.',
                    'Chaque question annonce combien de lignes elle couvre, et votre choix les code toutes d’un seul coup — y compris celles qui s’écrivent autrement, puisque la décision est rangée sous le libellé ramené aux mots retenus.',
                    '<b>« Aucun ne convient » est enfin mémorisé.</b> Ce libellé n’est plus reproposé à chaque exécution ; il suffit de le recoder pour revenir dessus.'
                ]
            },
            {
                v: '13.10.0',
                d: '2026-09-17',
                t: 'Codification : ne plus trancher à la place de l’humain quand il n’y a pas de quoi trancher',
                items: [
                    '<b>La bonne branche se dit, au lieu de se taire.</b> Une ligne dont la famille ne mène à aucun type de l’arbre était rangée « non trouvée », sans un mot — alors que son libellé désignait un type parfaitement identifiable, rangé sous une AUTRE branche. Nouveau statut « Autre branche », avec le code trouvé et la branche où il se trouve : c’est une contradiction entre votre liste et la nomenclature, et elle doit se voir.',
                    '<b>Les ex æquo ne sont plus tirés au sort.</b> « Moteur asynchrone » et « Moteur synchrone » se ressemblent assez pour obtenir le MÊME score : l’un des deux était retenu d’office, au hasard. Désormais, quand deux types arrivent à égalité en tête, la ligne part à la revue avec ses deux propositions. C’est à vous de trancher, et vous avez de nouveau de quoi le faire.',
                    'La revue montre aussi ce qui a été trouvé hors branche, marqué comme tel et rangé après les propositions de la bonne branche : vous voyez d’un coup d’œil si c’est la famille de la ligne qui est fausse, ou la colonne de branche que vous avez choisie.',
                    'Le bilan compte ces lignes à part, et l’écran dit quoi faire d’elles en priorité.'
                ]
            },
            {
                v: '13.9.0',
                d: '2026-09-17',
                t: 'Codification : une ligne reçue, une ligne rendue — et un résultat que l’on peut emporter',
                items: [
                    '<b>La démultiplication est corrigée.</b> 450 000 lignes en entrée en rendaient 1 437 576. En cause, la recherche du chemin dans l’arbre : un même code de type figure presque toujours à plusieurs endroits de l’arborescence, et la ligne codée ressortait autant de fois. Le chemin est désormais lu sur une seule ligne par code. Un libellé appris deux fois ne dédouble plus rien non plus.',
                    'Le résultat annonce désormais les lignes reçues et les lignes rendues, côte à côte. S’ils diffèrent, l’écran le dit en rouge au lieu de laisser croire au total.',
                    '<b>« → Utiliser le résultat »</b> : les lignes codées partent dans un jeu, d’où elles s’extraient, s’exportent en CSV, s’auditent, et peuvent être promues en vraie source.',
                    '<b>Les paramétrages de codification sont enfin sauvegardés.</b> Ils étaient perdus à chaque rechargement — d’où l’impression que les choix de mapping avaient disparu. Ils reviennent maintenant avec le reste de la configuration, sous le nom que vous leur donnez.',
                    'Et un <b>récapitulatif</b> en haut de l’écran, toujours visible : ce que l’on code, contre quoi, ce que l’on compare, la branche, le chemin de l’arbre, les synonymes et les règles actives — sans rien avoir à rouvrir.'
                ]
            },
            {
                v: '13.8.0',
                d: '2026-09-17',
                t: 'Tables conçues : fin de « Maximum call stack size exceeded »',
                items: [
                    'Construire une table avec beaucoup d’enrichissements s’arrêtait sur « Construction impossible : Maximum call stack size exceeded ». Chaque enrichissement ouvrait sa propre requête imbriquée, même quand il ne dépendait d’aucun autre ; au-delà d’une trentaine, le moteur du navigateur s’arrêtait net sur la profondeur.',
                    'Les enrichissements sont désormais posés par COUCHES : tous ceux qui s’accrochent à ce qui existe déjà entrent dans la même couche, côte à côte. Seul celui qui s’accroche à un attribut ramené par un autre — le chaînage — attend la couche suivante. Mesuré sur le vrai moteur du navigateur : 150 enrichissements indépendants passent, là où 40 échouaient.',
                    'Le chaînage lui-même reste borné à trente niveaux, et le dit en français avant de lancer la requête : construisez une première table avec le début de la chaîne, puis une seconde qui part de celle-là.',
                    'Et si le moteur s’arrête tout de même sur un plantage de pile, le message ne recopie plus son jargon : il nomme la cause probable et dit quoi faire.'
                ]
            },
            {
                v: '13.7.2',
                d: '2026-09-17',
                t: 'Codification : la vraie cause du manque de mémoire',
                items: [
                    'La 13.7.1 relançait la codification en mémoire pure ; cela ne suffisait pas, parce que le travail demandé était tout simplement trop grand. Mesuré sur une nomenclature ordinaire : le rapprochement retenait plus de mille types pour CHAQUE ligne, soit 22 millions de couples à comparer.',
                    'Deux causes. Les mots étaient rapprochés sur leurs quatre premières lettres, ce qui confond « VANNE » et « VANNAGE » ou « MOTEUR » et « MOTOPOMPE » : on compare maintenant sur six lettres. Et rien ne bornait le nombre de candidats : on en examine désormais 200 au plus par ligne, les mots les plus rares servis les premiers, donc les meilleurs candidats d’abord.',
                    'Les libellés sont aussi mis en majuscules, privés d’accents, ramenés aux mots retenus et découpés en mots UNE fois par ligne, et non plus à chaque couple examiné — c’était des millions de fois le même calcul.',
                    'Mesuré : 20 000 lignes contre 3 000 types, dans 512 Mo et sans aucune écriture sur le disque, là où la version précédente s’arrêtait faute de mémoire. Et sur une nomenclature où chaque type a un mot bien à lui, les 20 000 lignes retrouvent toutes leur code exact : le plafond ne perd rien.'
                ]
            },
            {
                v: '13.7.1',
                d: '2026-09-17',
                t: 'Codification : plus de « HTML FileReaders do not support writing »',
                items: [
                    'Sur une vraie liste, la codification s’arrêtait sur « Invalid Error: HTML FileReaders do not support writing ». En clair : DuckDB voulait écrire un fichier temporaire, ce que le navigateur interdit. La codification se relance désormais en mémoire pure avec une limite relevée, exactement comme les actions d’Extraire depuis la 13.3.2.',
                    'Le découpage des libellés en mots n’est plus refait à chaque fois qu’il est relu : il est calculé une seule fois, ce qui divise d’autant la mémoire demandée.',
                    'Et si la mémoire ne suffit toujours pas, le message ne parle plus de fichiers temporaires mais de ce que vous pouvez faire : renseigner « Chercher dans la bonne branche », retirer une comparaison, ou coder la liste en plusieurs morceaux.'
                ]
            },
            {
                v: '13.7.0',
                d: '2026-09-16',
                t: 'Codification : tenir sur de vrais volumes',
                items: [
                    'La codification d’une liste de plusieurs milliers de lignes ne tourne plus sans fin. Chaque ligne était comparée à CHAQUE type de la nomenclature, et le score était même calculé deux fois par couple : 4 000 lignes contre 800 types faisaient plus de trois millions de comparaisons.',
                    'On ne compare désormais que les couples qui partagent un mot RARE — un mot présent partout, comme « POMPE » dans une nomenclature de pompes, ne rapproche de rien. Une ligne dont tous les mots sont courants garde tout de même le moins courant d’entre eux : on n’en perd aucune.',
                    'Le résultat est déposé dans une table avant d’être relu : l’aperçu, le bilan et les cas à revoir ne recodent plus la liste chacun de leur côté. Mesuré : 4 000 lignes contre 800 types en 0,2 seconde.'
                ]
            },
            {
                v: '13.6.0',
                d: '2026-09-16',
                t: 'Codification : choisir ce que l’on compare, des deux côtés',
                items: [
                    'Le rapprochement ne porte plus forcément sur le libellé : déclarez la colonne de la liste et celle de la nomenclature à confronter — une désignation technique contre un libellé de codification, une marque contre un fabricant.',
                    'Plusieurs comparaisons à la fois, chacune avec son poids et, si besoin, sa propre mesure : le score est leur moyenne pondérée. Sans rien de déclaré, c’est le libellé contre le libellé, comme avant.'
                ]
            },
            {
                v: '13.5.0',
                d: '2026-09-16',
                t: 'Codification : retrouver le code du référentiel sur chaque ligne d’une liste reçue',
                items: [
                    'Nouvel écran Codification, sous Exploitation. Une liste d’équipements aux libellés écrits à la main, une nomenclature en arbre, et le code du type retrouvé ligne à ligne — par le code déjà fourni, par la table de correspondance, par des règles de mots-clés, puis par la ressemblance du libellé.',
                    'Les mots qui en valent d’autres : déclarez qu’une motopompe est une pompe, qu’une électrovanne est une vanne, que « centrif » veut dire « centrifuge ». Les variantes sont ramenées au mot retenu des deux côtés avant de comparer, même écrites en plusieurs mots, et même mal orthographiées si vous l’autorisez.',
                    'Recherche enfermée dans la bonne branche de l’arbre quand la famille est connue : une vanne ne peut plus être codée en pompe parce que les libellés se ressemblent.',
                    'Chaque ligne repart avec son code, par quelle règle il a été trouvé, avec quelle confiance, et le chemin complet famille › système › sous-système › type. Les cas douteux passent par la revue ; un clic tranche, et la décision descend dans la table de correspondance — à la livraison suivante, ce libellé est codé tout seul.'
                ]
            },
            {
                v: '13.4.0',
                d: '2026-09-16',
                t: 'Une ligne qui revient plusieurs fois : la clé du lien, et le contrôle qui prévient',
                items: [
                    "Modèle de données : la « Clé du lien » peut porter plusieurs colonnes. Un élément rangé dans plusieurs groupes ne revient plus autant de fois qu'il a de groupes : on ajoute le groupe à la clé, et toutes les extractions qui empruntent ce lien en profitent.",
                    "Extraire : bouton « 🧮 Contrôler les tables liées » — on mesure sur les données ce que chaque table jointe fait au nombre de lignes, et l'on dit laquelle multiplie. Le contrôle se déclenche aussi tout seul après un aperçu, parce que personne ne vérifie une multiplication qu'il ne soupçonne pas."
                ]
            },
            {
                v: '13.3.2',
                d: '2026-09-10',
                t: 'Extraire : requêtes volumineuses sans fichier temporaire (V12.11.2)',
                items: [
                    "Plus d'erreur « HTML FileReaders do not support writing » : les actions d'Extraire relancent la requête en mémoire pure, et expliquent quoi faire si la mémoire ne suffit pas."
                ]
            },
            {
                v: '13.3.1',
                d: '2026-09-10',
                t: 'Extraire : correctifs de la V12.11.1',
                items: [
                    "Vue graphique refermée durablement par son bouton ; « l'un ou l'autre lien » pour les synthèses d'une table liée ; transposition en colonnes plus robuste ; erreurs HTML lisibles."
                ]
            },
            {
                v: '13.3.0',
                d: '2026-09-10',
                t: 'Parcours de la donnée : des liens qui ne se superposent plus',
                items: [
                    "Reprend la V12.11 : un point d'attache par lien, tracé à angles droits avec un couloir par lien, mise en avant au survol et pendant le déplacement d'une case — dans tous les graphes."
                ]
            },
            {
                v: '13.2.0',
                d: '2026-09-10',
                t: "Parcours de la donnée : jusqu'au début",
                items: [
                    "Reprend la V12.10 : le parcours d'un objet, d'une information ou d'une colonne remonte tout l'amont connu jusqu'au premier maillon, avec le panneau « Depuis le début » et l'interrupteur « ⇠ Jusqu'au début » (onglet Objets et catalogue).",
                    'La phrase de résumé en tête du parcours cite aussi les points de départ : « … tout au début : Système tiers ».'
                ]
            },
            {
                v: '13.1.0',
                d: '2026-09-09',
                t: "Le vocabulaire métier jusque dans l'impression et le dossier",
                items: [
                    "La fiche imprimée (⎙) et le dossier de gouvernance exporté utilisent les mêmes mots que l'écran : information, variante, parcours de la donnée, colonne du fichier, confidentialité.",
                    'Reprend aussi les finitions de la V12.9 : restitutions et origines dans le catalogue, les exports et le dossier ; Extraire avec des jeux temporaires seuls.'
                ]
            },
            {
                v: '13.0.0',
                d: '2026-09-09',
                t: 'V13 — la gouvernance en langage métier, pour les non-initiés',
                items: [
                    "<b>Un mot d'ordre</b> : on décrit sa donnée comme on l'expliquerait à un nouveau collègue, en trois questions — c'est quoi, d'où ça vient, qui s'en sert. Tout le reste se déduit ou se propose.",
                    "<b>Vocabulaire métier</b> partout dans la gouvernance : « information » au lieu d'attribut, « variante » au lieu de facette, « parcours de la donnée » au lieu de lineage, « colonne du fichier » au lieu de mapping ; le mot technique reste au survol. <b>Une phrase d'aide</b> en tête de chaque écran dit ce qu'on y fait et pourquoi.",
                    "<b>La fiche d'une information en trois questions</b> : ① C'est quoi ? ② D'où ça vient ? ③ Qui s'en sert ? Les réglages avancés passent sous « En dire plus ». Une <b>jauge « fiche complète à 75 % »</b> indique la prochaine question à remplir. Les exemples de valeurs s'affichent d'office dans les fiches.",
                    "<b>Proposer avant de demander</b> : « Décrire un objet à partir d'un fichier » propose le nom de l'objet, ses informations, des définitions devinées d'après les colonnes, des exemples réels et l'application source ; on valide ou on corrige. <b>Modèles</b> prêts à l'emploi (Client, Contrat, Produit, Fournisseur, Facture, Salarié, Sinistre). Une définition déjà écrite ailleurs pour la même information est <b>suggérée</b>.",
                    "<b>« Posez votre question »</b> sur l'accueil : « qui est responsable de l'adresse client ? », « où va la prime ? », « qu'est-ce qu'un sinistre ? ». La réponse tient en une carte : définition, responsable, parcours en une phrase, fiche et graphe à un clic. Le même <b>résumé en une phrase</b> ouvre chaque lineage.",
                    "<b>Mon domaine</b> : un sélecteur en haut ne montre que les objets, informations, applications et termes de son domaine. <b>Mes tâches</b> sur l'accueil : informations sans définition, objets sans responsable, propositions à valider. <b>Feux tricolores</b> sur chaque objet : vert documenté, orange incomplet, rouge sans responsable.",
                    "<b>Contribuer sans risque</b> : « 💬 Proposer une correction » sur toute fiche en lecture — on écrit ce qui ne va pas, le propriétaire valide. <b>Mode première fois</b> : quand rien n'est décrit, l'accueil ne montre que trois boutons. <b>Les mots du métier</b> (glossaire) en premier sur l'accueil, avec « voir les données concernées »."
                ]
            }
        ];
