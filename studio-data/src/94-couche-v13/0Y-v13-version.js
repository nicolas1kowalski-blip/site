        // ======================= V13 : VERSION ET JOURNAL DE LA COUCHE « GOUVERNANCE SIMPLE » =======================
        // Assemblé uniquement dans StudioDataV13.html (manifest-v13.json), après la couche V12 dont il hérite.
        const V13_VERSION = '13.3.2';
        const V13_CHANGELOG = [
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
