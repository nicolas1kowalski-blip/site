# 0004 — Fastify, des fonctions, et pas de magie

*1er octobre 2026*

## La question

Quel cadre pour la couche back ?

## Ce qui est décidé

**Fastify**, TypeScript en mode strict, des **fonctions ordinaires** et un câblage
explicite. Pas de décorateurs, pas d'injection de dépendances automatique, pas de
génération de code.

Les migrations sont des **fichiers SQL numérotés**, pas un outil qui les fabrique.

## Pourquoi

La demande est explicite : du code très lisible par un humain. Un cadre à décorateurs
déplace une partie du comportement hors du code que l'on lit — ce qui s'exécute n'est plus
ce qui est écrit. Pour une application que plusieurs personnes reprendront, et qu'une revue
de sécurité parcourra, la lisibilité prime sur la concision.

Fastify est par ailleurs le serveur qui se trouve sous la plupart des cadres plus gros :
on garde la même base technique sans la couche qui masque.

## Ce que cela coûte

Un peu plus de câblage à écrire soi-même. En échange, il n'y a rien à deviner.

## Quand la revoir

Si la DSI imposait un cadre précis.
