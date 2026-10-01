# 0005 — Redshift se lit avec le pilote PostgreSQL, en lecture seule

*2026-10-01*

## La question

Comment brancher l'application sur l'entrepôt Redshift de l'entreprise, et comment le
montrer sans entrepôt sous la main ?

## Ce qui est décidé

**Le pilote PostgreSQL ordinaire (`pg`).** Redshift parle le protocole de PostgreSQL. Un
pilote spécifique (ou l'API Data d'AWS) ajouterait une dépendance, un format de réponse à
part, et nous priverait des requêtes paramétrées. Nous gardons `pg`.

**Le catalogue n'est lu qu'à travers `information_schema`.** Redshift a bien ses tables
propres (`svv_columns`, `pg_table_def`) mais `information_schema` est commun aux deux
moteurs. Conséquence : les requêtes du catalogue se **prouvent sur PostgreSQL**, donc
ici, dans les tests, sans entrepôt. C'est la raison principale du choix.

**La vérification du certificat ne peut pas être désactivée.** Il n'existe aucun réglage
pour cela. Quand l'autorité de certification d'Amazon n'est pas connue du système, on la
**fournit** (`SD_REDSHIFT_CERTIFICAT_AC`) ; on ne baisse pas la garde. Un réglage
« ignorer le certificat », même présenté comme réservé au développement, finit toujours
en production.

**Le mot de passe arrive de préférence par un fichier**
(`SD_REDSHIFT_MOT_DE_PASSE_FICHIER`), déposé par le coffre de secrets de l'hébergeur. Une
variable d'environnement est acceptée pour un premier essai, mais elle se retrouve dans la
liste des processus, dans les traces et dans les journaux. Rien n'est jamais écrit dans
notre base : conformément à la décision 0003, celle-ci ne range que des **références**.

**L'application ne lit jamais que ce qu'elle a le droit de lire.** Aucune instruction
d'écriture n'existe dans le code du connecteur, et la documentation fait créer un
utilisateur en lecture seule. Deux verrous valent mieux qu'un.

**Les échecs sont traduits.** `ETIMEDOUT` ne dit rien à personne ; « le groupe de sécurité
n'autorise pas votre adresse » dit quoi faire. Ces traductions sont testées, y compris le
fait qu'elles ne recopient ni le mot de passe ni l'utilisateur.

## Ce qui est écarté pour l'instant

**L'API Data de Redshift** (HTTPS, sans connexion persistante) : séduisante pour un
conteneur sans accès au réseau privé, mais elle plafonne la taille des résultats et ne
sait pas tenir une session. À reconsidérer pour les requêtes courtes.

**Les jetons temporaires AWS** (`GetClusterCredentials` ou IAM) : c'est la bonne cible,
elle supprime le mot de passe. Elle demande un rôle et une politique côté AWS, donc une
étape à elle seule. La forme des réglages ne changera pas quand elle arrivera.

## Ce que cela laisse ouvert

Le catalogue d'un entrepôt ne porte presque jamais les **liens entre tables** : les clés
étrangères y sont facultatives, et le plus souvent absentes. `listerLesLiensDeclares`
renvoie donc couramment une liste vide, et c'est normal. Les liens manquants devront être
retrouvés à partir des données puis validés à la main — c'est la prochaine étape, et elle
était demandée explicitement.
