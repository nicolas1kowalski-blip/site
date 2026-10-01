# Studio Data entreprise

La version de Studio Data faite pour une entreprise : annuaire, sécurité, entrepôt de
données et lac. Elle se construit **écran par écran**, en mesurant à chaque étape l'écart
avec la **V13**, qui reste la référence et continue d'évoluer à côté.

## Où en est-on

| | État |
|---|---|
| Socle du back : réglages, base interne, migrations, sécurité, journal d'audit, route de santé | **fait** |
| Lecture de l'entrepôt Redshift : connexion chiffrée, catalogue, essai en une commande | **fait** |
| Déclarer les liens que le catalogue de l'entrepôt ne porte pas | à venir |
| Couche front | à venir |
| Écran Sources : lac et fichiers | à venir |

## Démarrer

```bash
cd api
npm install
npm run tester      # vingt-cinq contrôles, sans rien installer d'autre
npm run construire && npm run demarrer
```

En développement, la base interne est **embarquée** : il n'y a pas de PostgreSQL à
installer. En production, `SD_ADRESSE_POSTGRESQL` est obligatoire et le serveur refuse de
démarrer sans elle.

## Se brancher sur l'entrepôt Redshift

```bash
cd api && npm run essayer-redshift
```

La commande se connecte, lit le catalogue de l'entrepôt et affiche ce qu'elle a trouvé :
les schémas, les tables, les colonnes, les liens déclarés. Elle **n'écrit rien**, ni dans
l'entrepôt, ni dans notre base.

Les quelques réglages à faire — point d'accès, utilisateur en lecture seule, ouverture du
groupe de sécurité, autorité de certification d'Amazon — sont décrits pas à pas dans
**[CONNEXION-REDSHIFT.md](CONNEXION-REDSHIFT.md)**, avec la liste des messages d'erreur
possibles et ce qu'il faut faire pour chacun.

## Comment c'est rangé

```
studio-data-entreprise/
├── CONVENTIONS.md        comment on écrit le code ici
├── DECISIONS/            une décision par fichier, datée et motivée
└── api/                  la couche back
    ├── migrations/       des fichiers SQL numérotés, appliqués une fois chacun
    ├── src/
    │   ├── configuration/   les réglages, vérifiés au démarrage
    │   ├── base-de-donnees/ la connexion et les migrations
    │   ├── securite/        les en-têtes du navigateur, le journal d'audit
    │   ├── sources/          la connexion à l'entrepôt et la lecture de son catalogue
    │   ├── sante/           la route que l'hébergeur interroge
    │   └── serveur.ts
    └── tests/
```

La couche **front** vivra dans `web/`, séparée du back : elles se parlent par l'API et
rien d'autre.

## Les garanties, et leurs tests

Chaque promesse de sécurité est vérifiée par un contrôle, pas seulement écrite :

- les réglages manquants **arrêtent** le serveur au lieu de le laisser démarrer à moitié ;
- la table des comptes n'a **aucune colonne de mot de passe** ;
- une source déclarée range la **référence** du secret, jamais le secret ;
- le journal d'audit **ne peut être ni modifié ni supprimé** — la base elle-même le refuse ;
- rien de secret n'entre dans le journal, **même si on le lui passe** ;
- les valeurs passent en paramètres : une apostrophe n'injecte rien ;
- chaque réponse porte les protections du navigateur ;
- une erreur inattendue ne révèle pas l'intérieur de l'application ;
- la liaison avec l'entrepôt est **chiffrée et son certificat vérifié** — aucun réglage ne
  permet de désactiver cette vérification ;
- le mot de passe de l'entrepôt **n'apparaît jamais** dans ce qui est affiché ou journalisé,
  pas même quand l'entrepôt refuse l'authentification ;
- la lecture du catalogue **n'écrit rien** dans l'entrepôt.

La lecture du catalogue est vérifiée sur un vrai moteur PostgreSQL embarqué : Redshift
parle le même protocole et expose le même `information_schema`, et les requêtes n'emploient
que ce dernier. Les tests prouvent le **code** ; `essayer-redshift` prouve votre
**raccordement**.
