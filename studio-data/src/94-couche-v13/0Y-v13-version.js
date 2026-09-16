        // ======================= V13 : VERSION ET JOURNAL DE LA COUCHE « GOUVERNANCE SIMPLE » =======================
        // Assemblé uniquement dans StudioDataV13.html (manifest-v13.json), après la couche V12 dont il hérite.
        const V13_VERSION = '13.7.0';
        const V13_CHANGELOG = [
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
