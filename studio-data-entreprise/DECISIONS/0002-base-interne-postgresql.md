# 0002 — La base interne est PostgreSQL

*1er octobre 2026*

## La question

Où ranger ce qui appartient à l'application : comptes, espaces, rôles, déclarations de
sources, gouvernance, journal d'audit ?

## Ce qui est décidé

PostgreSQL, en recette et en production. En développement et pour les tests, une base
**embarquée** qui parle le même langage, de façon qu'il n'y ait rien à installer pour
lancer le projet ni pour exécuter les contrôles.

Le SQL écrit dans l'application est le même dans les deux cas.

## Pourquoi

C'est une base relationnelle éprouvée, que toute DSI sait exploiter, sauvegarder et
chiffrer. Les données qu'elle contient sont relationnelles par nature : des personnes, des
espaces, des rôles, des liens entre eux.

Elle ne contient **aucune donnée métier de l'entreprise** : celles-ci restent dans
l'entrepôt et dans le lac.

## Ce que cela coûte

Une base à administrer. En contrepartie, les sauvegardes, le chiffrement et la
redondance sont des services que l'hébergeur rend déjà.

## Quand la revoir

Si la gouvernance devenait massivement documentaire plutôt que relationnelle — ce qui
n'est pas le cas aujourd'hui.
