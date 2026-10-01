# 0003 — L'application ne détient aucun secret

*1er octobre 2026*

## La question

Comment l'application s'authentifie-t-elle auprès de l'entrepôt et des autres sources ?

## Ce qui est décidé

**Rien n'est stocké.** Le conteneur porte un rôle, demande à l'hébergeur un jeton valable
quelques minutes, l'utilise, le jette. Quand un mot de passe est inévitable, il vit dans le
coffre de secrets de l'hébergeur et l'application le lit au démarrage grâce à son rôle.

La base interne ne range que la **référence** d'un secret — son nom dans le coffre —
jamais sa valeur. La table `sources` n'a volontairement aucune colonne qui pourrait en
accueillir une, et un test le vérifie.

La table `comptes` n'a aucune colonne de mot de passe : c'est l'annuaire de l'entreprise
qui authentifie les personnes.

## Pourquoi

Une revue de sécurité commence par « où sont les secrets ? ». La seule réponse qui ne
demande aucune précaution supplémentaire est « nulle part chez nous ». Ce qui n'est pas
détenu ne peut être ni volé, ni oublié dans un fichier de configuration, ni retrouvé dans
un journal.

## Ce que cela coûte

Une dépendance au fournisseur d'hébergement pour la délivrance des jetons. En
développement, on travaille sans entrepôt distant, donc sans secret.

## Quand la revoir

Jamais à la baisse.
