# Comment on écrit le code ici

Une règle au-dessus des autres : **le code doit se lire comme une explication**. Quelqu'un
qui n'a pas écrit ce fichier doit comprendre ce qu'il fait en le parcourant, sans deviner.

## Les noms

**En français, entiers, sans abréviation.**

| On écrit | On n'écrit pas | Pourquoi |
|---|---|---|
| `reglages` | `cfg`, `conf` | Trois lettres gagnées, une question posée à chaque lecture |
| `lireLesReglages()` | `loadCfg()` | Le nom dit ce qui se passe |
| `referenceDuSecret` | `secretRef` | Le mot complet lève l'ambiguïté : c'est la référence, pas le secret |
| `baseInterne` | `db` | « db » ne dit pas laquelle |
| `pour (const ligne of lignes)` | `for (const l of ls)` | Une lettre n'est pas un nom |

Seules exceptions : `id` quand c'est un identifiant, et les mots imposés par un outil
(`req`, `reply` chez Fastify quand on ne peut pas les renommer — sinon on les renomme en
`requete` et `reponse`).

**Une fonction dit ce qu'elle fait, pas comment.** `inscrireAuJournal` et non
`insertLogRow`. Le nom décrit l'intention métier ; le corps montre la mécanique.

## Les fichiers

**Chaque fichier commence par expliquer son rôle**, en quelques lignes, et dit *pourquoi*
il est écrit ainsi quand ce n'est pas évident. Un commentaire qui répète le code est
inutile ; un commentaire qui explique une décision vaut de l'or six mois plus tard.

**Un fichier, un sujet.** Au-delà de deux cents lignes ou de deux responsabilités, on coupe.

**Les dossiers portent le nom du domaine**, pas de la technique : `securite/`,
`base-de-donnees/`, `sources/` — et non `utils/`, `helpers/`, `common/`. Un dossier
« divers » attire tout ce qu'on ne veut pas ranger.

## Les fonctions

- **Moins de soixante lignes.** Au-delà, elle fait plusieurs choses : on la coupe.
- **Un seul niveau d'abstraction par fonction.** Une fonction qui orchestre n'ouvre pas
  de connexion ; une fonction qui ouvre une connexion n'orchestre rien.
- **Pas de paramètre booléen sans nom.** `construire(vrai)` ne veut rien dire ; on passe
  un objet nommé ou deux fonctions distinctes.
- **On s'arrête tôt.** Les cas impossibles en premier, le cas normal ensuite, sans
  imbrication profonde.

## Ce qu'on ne fait pas

- **Pas de magie.** Pas de génération de code, pas de décorateurs maison, pas de
  configuration qui modifie le comportement à distance. Ce qui s'exécute doit se lire.
- **Pas d'abréviation inventée.** Si un mot est long, il reste long.
- **Pas de code mort.** Ce qui ne sert plus se supprime ; l'historique garde la trace.
- **Pas d'anglais au milieu du français.** `genre`, pas `type` ; `emplacement`, pas
  `location`. Sauf les mots imposés par un outil.

## Les messages à l'utilisateur

**En français, et ils disent quoi faire.** « Réglages invalides, le serveur ne démarre
pas : SD_PORT doit être un nombre » plutôt que « configuration error ». Une erreur qui
n'indique pas la sortie oblige à lire le code.

## Les tests

**Un test porte le nom de ce qu'il prouve**, en une phrase lisible :

```
test('le journal d’audit ne peut être ni modifié ni supprimé — la base le refuse', …)
```

Et non `test('journal update throws')`. Quand un test échoue, son nom doit suffire à
comprendre ce qui est cassé.

**Chaque promesse de sécurité a son test.** Une protection écrite en commentaire mais que
rien ne vérifie finit toujours par disparaître à la faveur d'une correction pressée.

## La vérification

```bash
cd api
npm run verifier   # les types, sans rien produire
npm run tester     # construit puis exécute les contrôles
```

Les deux doivent passer avant toute livraison.
