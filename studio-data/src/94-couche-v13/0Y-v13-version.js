        // ======================= V13 : VERSION ET JOURNAL DE LA COUCHE « GOUVERNANCE SIMPLE » =======================
        // Assemblé uniquement dans StudioDataV13.html (manifest-v13.json), après la couche V12 dont il hérite.
        const V13_VERSION = '13.12.1';
        const V13_CHANGELOG = [
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
