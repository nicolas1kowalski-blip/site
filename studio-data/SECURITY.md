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
**Correction** : versions **épinglées** et attribut **`integrity` (SRI)** sur `xlsx`, `chart.js` et
`lucide` ; **G6 a été entièrement supprimé** (tous les graphes sont rendus par un moteur SVG maison,
sans dépendance) (+ `crossorigin`/`referrerpolicy`). Le navigateur refuse d'exécuter un
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

## Node.js et Brotli : ce que l'application contient, et ce qu'elle ne contient pas

Question posée par les équipes sécurité dès qu'un avis vise une version de **Node.js** ou la
bibliothèque **Brotli** (par exemple « Node2Shell », CVSS 9.2, 23 octobre 2026). Réponse
vérifiable, point par point.

**L'application livrée ne contient ni Node.js, ni la bibliothèque Brotli.**

- `StudioData.html` et `StudioDataV13-hors-ligne.html` sont des fichiers **HTML exécutés par le
  navigateur**. Aucun moteur Node.js n'y est embarqué, aucun processus serveur n'est démarré,
  aucun port n'est ouvert.
- La compression des ressources embarquées dans la version hors ligne utilise **gzip** —
  `zlib.gzipSync` à la construction, `DecompressionStream('gzip')` dans le navigateur. **Pas
  Brotli.**
- Le moteur **DuckDB-WASM** embarqué ne contient **aucun symbole de la bibliothèque Brotli**
  (`BrotliDecoderDecompress`, `BROTLI_*`, `libbrotli`). Le mot « brotli » n'y figure qu'une fois,
  comme **nom** de codec Parquet reconnu, à côté de « snappy », « gzip » et « zstd ».
- Les chaînes `node_modules` que l'on peut trouver en cherchant dans le fichier hors ligne sont
  les **scripts npm du paquet duckdb-wasm**, recopiés comme texte inerte dans son bundle : rien
  n'est exécuté.

Comment le revérifier soi-même, sur le fichier livré :

```bash
grep -c -i brotli StudioDataV13-hors-ligne.html          # 0
strings -a hors-ligne/ressources/duckdb-moteur.wasm | grep -i -E "BrotliDecoder|BROTLI_|libbrotli"   # aucune
```

**Node.js ne sert qu'à CONSTRUIRE l'application** (`build.mjs`, les formateurs,
`tools/hors-ligne.mjs`) et à lancer les tests. Il tourne sur le poste de développement — jamais
chez l'utilisateur, jamais en production. Le poste qui construit doit donc utiliser une version
non vulnérable : au minimum **22.23.4**, **24.22.1** ou **26.12.1** selon la branche (seuils de
l'avis d'octobre 2026). Une version antérieure ne change rien au fichier produit, mais expose le
poste de construction.

## Recommandations de déploiement en entreprise

1. Postes avec chiffrement disque (BitLocker/FileVault) — standard.
2. Utiliser le **mode sans persistance** pour les données sensibles, ou purger en fin de session.
3. Si l'app est hébergée (intranet), servir en HTTPS avec les en-têtes
   `Content-Security-Policy: frame-ancestors 'none'` et `X-Content-Type-Options: nosniff`.
4. Encadrer par une charte les données autorisées à être chargées et exportées.
