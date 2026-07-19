# Sécurité — Studio Data

Studio Data est une application **locale** : les données ne quittent jamais le poste
(aucune télémétrie, aucun envoi vers un serveur ; le seul appel réseau sortant est celui
des sources « API » que l'utilisateur configure lui-même). Ce document liste les risques
identifiés lors de l'audit et l'état des corrections.

## ✅ Corrigé

### 1. Injections HTML (XSS) via les données
**Risque** : un fichier tiers dont un en-tête de colonne ou une valeur contient du code HTML
(`<img src=x onerror=...>`) aurait pu exécuter du JavaScript à l'affichage.
**Correction** : toutes les valeurs de cellules, en-têtes, libellés et segments de clé sont
échappés aux points de rendu ; les messages (toasts, bannière d'erreur) passent désormais par
`textContent` et ne sont plus jamais interprétés comme du HTML. Test de non-régression : une
charge malveillante est rendue comme texte, aucun script ne s'exécute.

### 2. Chaîne d'approvisionnement (CDN)
**Risque** : bibliothèques chargées depuis des CDN publics en versions « flottantes »
(`g6@4`, `lucide@latest`) sans contrôle d'intégrité — un CDN compromis aurait pu injecter du
code arbitraire.
**Correction** : versions **épinglées** et attribut **`integrity` (SRI)** sur `xlsx`, `@antv/g6`,
`chart.js` et `lucide` (+ `crossorigin`/`referrerpolicy`). Le navigateur refuse d'exécuter un
fichier dont les octets ne correspondent pas à l'empreinte.

### 3. Politique de sécurité du contenu (CSP)
**Correction** : une CSP (`<meta http-equiv>`) interdit les plugins (`object-src 'none'`), le
détournement de `<base>` (`base-uri 'self'`) et les formulaires (`form-action 'none'`), et
restreint le chargement de scripts/styles aux seules origines connues (jsDelivr, Tailwind).
Les gestionnaires inline, les workers `blob:` (moteur DuckDB) et le WebAssembly restent
autorisés car l'application repose dessus.

### 4. Données en clair sur le poste
**Risque** : les données restaient stockées non chiffrées (IndexedDB **et** fichiers OPFS) même
après « réinitialisation », qui ne vidait qu'IndexedDB.
**Correction** :
- « 🧹 Effacer toutes les données locales » purge maintenant **IndexedDB et les fichiers OPFS**
  (base DuckDB, WAL, temp) — utile avant de rendre un poste partagé ;
- nouveau **mode « sans persistance »** (Gouvernance ▸ Sauvegarde) : rien n'est écrit sur le
  poste, tout disparaît à la fermeture de l'onglet ; l'activer purge aussi l'existant.

## ⚠️ Limites connues / à encadrer

- **Tailwind via « Play CDN »** : pratique mais déconseillé en production par son éditeur.
  Le passer en CSS **précompilé** (et hors-ligne) est un chantier à mener avec une recette de
  vérification visuelle — non fait pour ne prendre aucun risque de régression de style.
- **Fonctionnement hors-ligne complet** : le moteur DuckDB-Wasm télécharge son WebAssembly
  depuis le CDN au premier chargement. Une version 100 % embarquée (≈ +30 Mo) est possible mais
  représente un développement dédié.
- **`connect-src` large** : la CSP n'interdit pas les connexions sortantes, car les sources
  « API » sont des URL arbitraires saisies par l'utilisateur. En cas de besoin fort, restreindre
  cette directive à une liste blanche d'hôtes autorisés.
- **Anti-« clickjacking »** : `frame-ancestors` n'est effectif qu'en **en-tête HTTP** (ignoré en
  `<meta>`). Si l'application est servie par un serveur, ajouter l'en-tête
  `Content-Security-Policy: frame-ancestors 'none'` (ou `X-Frame-Options: DENY`).
- **Outil local mono-utilisateur** : pas d'authentification ni de journal d'audit
  multi-utilisateurs ; les exports (CSV/bundles) sortent des données brutes (enjeu DLP à
  encadrer par l'usage). La réponse « multi-utilisateurs » serait une version serveur/bureau.

## Recommandations de déploiement en entreprise

1. Postes avec chiffrement disque (BitLocker/FileVault) — standard.
2. Utiliser le **mode sans persistance** pour les données sensibles, ou purger en fin de session.
3. Si l'app est hébergée (intranet), servir en HTTPS avec les en-têtes
   `Content-Security-Policy: frame-ancestors 'none'` et `X-Content-Type-Options: nosniff`.
4. Encadrer par une charte les données autorisées à être chargées et exportées.
