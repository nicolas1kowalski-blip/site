# 0001 — Le code vit dans le dépôt existant, dans son propre dossier

*1er octobre 2026*

## La question

La nouvelle application doit-elle avoir son propre dépôt, ou vivre à côté de la V13 ?

## Ce qui est décidé

Un dossier `studio-data-entreprise/` dans le dépôt existant.

## Pourquoi

Le **référentiel de parité** doit lire les sources de la V13 pour mesurer l'écart entre
les deux applications. Dans un dépôt unique, c'est immédiat ; dans deux dépôts, il faudrait
synchroniser, et la mesure finirait par dater.

Une seule branche, un seul historique : on voit les deux applications avancer ensemble.

## Ce que cela coûte

Le jour où la DSI voudra sa propre chaîne de construction et ses propres droits d'accès,
il faudra extraire le dossier dans un dépôt à lui. C'est une opération connue, qui préserve
l'historique du dossier.

## Quand la revoir

Dès qu'une chaîne de construction d'entreprise est mise en place.
