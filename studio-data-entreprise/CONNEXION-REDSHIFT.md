# Se connecter à Redshift

Ce document est à suivre **sur un poste de l'entreprise**, pas ici : l'entrepôt n'est
joignable que depuis votre réseau. À la fin, une commande affiche le catalogue de
l'entrepôt — c'est la preuve que la connexion marche.

## Les cinq renseignements à rassembler

Ils se trouvent dans la console AWS, page Redshift, sur le cluster ou le groupe de travail
(*workgroup*) concerné. Demandez-les à l'équipe qui administre l'entrepôt si vous n'avez
pas accès à la console.

| Renseignement | Où le trouver | Exemple |
|---|---|---|
| Le point d'accès (*endpoint*) | Fiche du cluster, « Point de terminaison ». **Le nom complet**, pas le nom du cluster | `entrepot.abc123.eu-west-3.redshift.amazonaws.com` |
| Le port | Même fiche. 5439 par défaut | `5439` |
| La base | Même fiche, « Base de données » | `dev` |
| Un utilisateur **en lecture seule** | À créer si besoin, voir plus bas | `studio_data_lecteur` |
| Son mot de passe | Donné à la création | — |

Serverless comme provisionné, c'est la même chose : seul le point d'accès diffère.

## L'utilisateur en lecture seule

L'application ne fait que lire. Lui donner un utilisateur qui ne peut QUE lire n'est pas
une précaution de principe : c'est ce qui garantit qu'aucune manipulation ici ne peut
abîmer l'entrepôt, même par erreur, même en cas de faille.

À faire exécuter par un administrateur de l'entrepôt :

```sql
CREATE USER studio_data_lecteur PASSWORD '<un mot de passe long et tiré au hasard>';
GRANT USAGE ON SCHEMA public TO studio_data_lecteur;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO studio_data_lecteur;
-- Pour que les tables créées plus tard soient lisibles elles aussi :
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO studio_data_lecteur;
```

Répétez les trois dernières lignes pour chaque schéma à explorer.

## Le réseau

C'est ici que la première tentative échoue presque toujours, et le message d'erreur le
dira : *« La connexion n'aboutit pas… »*.

Un entrepôt Redshift n'accepte, par défaut, que les adresses inscrites dans son **groupe
de sécurité**. Il faut donc faire ajouter, sur le port 5439, l'adresse d'où part l'appel :
votre poste pour un essai, le réseau du conteneur quand l'application sera déployée.

Si l'entrepôt n'est pas accessible publiquement, l'appel doit partir d'une machine placée
dans le même réseau privé (VPC) — ce sera le cas du conteneur en production.

## Le certificat

Redshift chiffre toujours la liaison, et présente un certificat signé par une autorité
propre à Amazon. **La vérification de ce certificat n'est jamais désactivée** par
l'application ; il n'existe aucun réglage pour le faire. Si cette autorité n'est pas
connue de votre système, téléchargez son fichier et indiquez son chemin :

```bash
curl -O https://s3.amazonaws.com/redshift-downloads/amazon-trust-ca-bundle.crt
```

## Les réglages

Les variables à poser avant de lancer la commande :

| Variable | Obligatoire | Rôle |
|---|---|---|
| `SD_REDSHIFT_HOTE` | oui | le point d'accès complet |
| `SD_REDSHIFT_BASE` | oui | la base |
| `SD_REDSHIFT_UTILISATEUR` | oui | l'utilisateur en lecture seule |
| `SD_REDSHIFT_MOT_DE_PASSE_FICHIER` | — | **la bonne façon** : le chemin d'un fichier contenant le mot de passe |
| `SD_REDSHIFT_MOT_DE_PASSE` | — | acceptable pour un essai, à éviter ensuite |
| `SD_REDSHIFT_PORT` | non | 5439 par défaut |
| `SD_REDSHIFT_CERTIFICAT_AC` | non | le fichier d'autorité téléchargé ci-dessus |
| `SD_REDSHIFT_SCHEMA` | non | le schéma montré en premier, `public` par défaut |

Il faut l'une des deux variables de mot de passe. **Préférez le fichier** : une variable
d'environnement se retrouve dans la liste des processus, dans les traces d'erreur et dans
les journaux de l'hébergeur ; un fichier déposé par le coffre de secrets, non.

Plus tard, il n'y aura plus de mot de passe du tout : le conteneur demandera à AWS un
jeton valable quelques minutes, par son rôle. Les réglages ci-dessus ne changeront pas de
forme pour autant.

## L'essai

```bash
cd studio-data-entreprise/api
npm install

# Le mot de passe dans un fichier, lisible par vous seul.
umask 077 && printf '%s' '<le mot de passe>' > ~/.studio-data-redshift

export SD_REDSHIFT_HOTE=entrepot.abc123.eu-west-3.redshift.amazonaws.com
export SD_REDSHIFT_BASE=dev
export SD_REDSHIFT_UTILISATEUR=studio_data_lecteur
export SD_REDSHIFT_MOT_DE_PASSE_FICHIER=~/.studio-data-redshift
export SD_REDSHIFT_CERTIFICAT_AC=./amazon-trust-ca-bundle.crt

npm run essayer-redshift
```

Ce que vous devez voir :

```
Essai de connexion : studio_data_lecteur@entrepot…:5439/dev · schéma public
✓ Connecté en 412 ms, en liaison chiffrée.
  Moteur     : PostgreSQL 8.0.2 on i686-pc-linux-gnu
  Utilisateur: studio_data_lecteur

Les schémas visibles
────────────────────
  · public
  · entrepot_metier

Le schéma « public »
────────────────────
  12 table(s), 3 vue(s), 184 colonne(s) au total.
  · equipements — 23 colonne(s)
  …

Les liens entre tables
──────────────────────
  Aucun lien déclaré dans le catalogue.

  C'est le cas habituel dans un entrepôt : les clés étrangères y sont facultatives.
  Les liens manquants se retrouveront à partir des données, puis se valideront à la main.

✓ Tout s'est bien passé. Rien n'a été écrit, ni ici, ni dans l'entrepôt.
```

La commande **ne modifie rien** : ni l'entrepôt, ni la base interne. Elle peut être
relancée autant de fois que nécessaire.

## Si ça ne marche pas

Les échecs courants sont traduits en une phrase qui dit quoi faire. Le mot de passe n'est
jamais affiché, et l'utilisateur non plus en cas de refus d'authentification.

| Ce qui s'affiche | Ce qu'il faut faire |
|---|---|
| « L'adresse de l'entrepôt est introuvable » | `SD_REDSHIFT_HOTE` est le nom **complet** du point d'accès, pas le nom du cluster |
| « La connexion n'aboutit pas » | le groupe de sécurité n'autorise pas votre adresse : faites-la ajouter sur le port 5439 |
| « L'entrepôt refuse la connexion sur ce port » | vérifiez `SD_REDSHIFT_PORT` |
| « L'utilisateur ou le mot de passe est refusé » | le fichier de mot de passe contient-il bien le mot de passe, et rien d'autre ? |
| « Le certificat n'a pas pu être vérifié » | renseignez `SD_REDSHIFT_CERTIFICAT_AC` — ne cherchez pas à désactiver la vérification |
| « Aucun schéma visible » | l'utilisateur n'a reçu aucun `GRANT USAGE` |

## Et ce qui marche déjà ici

Sans entrepôt sous la main, la lecture du catalogue est vérifiée sur un vrai moteur
PostgreSQL embarqué — Redshift parle le même protocole et expose le même
`information_schema` :

```bash
npm run tester
```

Ces contrôles prouvent le **code** ; la commande `essayer-redshift` prouve votre
**raccordement**. Les deux sont nécessaires.
