# Jeu de données de démonstration

Une base complète et volontairement imparfaite, faite pour montrer **toutes** les fonctions de Studio Data sur
des données qui ressemblent à celles d'une vraie entreprise : un distributeur de fournitures et d'équipements
avec un réseau d'agences, des clients professionnels et particuliers répartis sur toute la France, leurs
établissements, leurs contacts, trois ans de commandes, les factures qui vont avec, le support client et les
relevés horaires de consommation de trois bâtiments.

> **Données fictives.** Les entreprises, les personnes, les adresses électroniques, les SIRET et les montants
> sont inventés de bout en bout. Seules les **communes** sont réelles (nom, code INSEE, code postal,
> département, région), avec des coordonnées et des populations approchées, pour que les regroupements
> géographiques aient du sens.

Les fichiers sont dans `fichiers/`. Ils sont produits par `generer.mjs` à partir d'une graine fixe : la même
commande redonne exactement les mêmes fichiers, et `fichiers/manifeste.json` publie le compte exact des défauts
semés.

---

## 1. Ce que contient le jeu

| Fichier | Lignes | Ce qu'il apporte à la démonstration |
| --- | ---: | --- |
| `communes.csv` | 105 | Référentiel géographique (code INSEE, code postal, département, région, latitude, longitude, population). Sert de table de contrôle : listes de valeurs, couverture, jointures. |
| `agences.csv` | 12 | Le réseau commercial, une agence par région. |
| `commerciaux.csv` | 60 | Les vendeurs, avec `id_responsable` : une **hiérarchie sur trois niveaux** (direction → agence → conseiller) pour l'aplatissement des hiérarchies dans l'extraction. |
| `produits.csv` | 180 | Catalogue : famille, sous-famille, prix, TVA, référence codée `EMB-0001`. |
| `clients.csv` | 2 542 | 2 500 clients (professionnels et particuliers) situés dans les communes, plus 30 lignes dupliquées et 12 lignes vides. **Le fichier le plus sale du jeu.** |
| `sites.csv` | 3 139 | Les établissements des clients professionnels, avec coordonnées : de quoi montrer les cardinalités 1–N et la géographie. |
| `contacts.csv` | 8 880 | Les personnes chez les clients. **Le fichier des doublons** : stricts, normalisés et flous. |
| `commandes.csv` | 24 000 | Trois ans de commandes avec une vraie saisonnalité (creux d'août, pointe de fin d'année, week-ends calmes, croissance d'environ 8 % par an). |
| `lignes_commande.csv` | 59 424 | Le détail des commandes : produit, quantité, prix, remise. C'est le fichier volumineux du jeu. |
| `factures.csv` | 22 727 | Une facture par commande livrée ou expédiée, avec des écarts volontaires : c'est la matière du **rapprochement**. |
| `tickets_support.csv` | 6 000 | Le support client : ouverture, clôture, délai, satisfaction de 1 à 5. |
| `releves_consommation.csv` | 26 088 | Un an de relevés **horaires** pour trois bâtiments : profil de journée, creux du week-end, saison de chauffe — et des trous, des plateaux et des sauts. |
| `clients-mise-a-jour.csv` | 1 700 | Le même fichier clients quelques semaines plus tard : valeurs corrigées, 50 clients nouveaux, **une colonne en moins**. |
| `livraison-mensuelle.zip` | 2 fichiers | Un arrivage : clients et contacts nouveaux, dont certains font déjà doublon. |
| `catalogue-produits.xlsx` | 2 feuilles | Le catalogue au format Excel (Produits, Familles), pour l'import de classeur. |

Volume total : environ 14 Mo, soit 154 843 lignes.

### Comment les tables se relient

```
communes ──< clients ──< sites ──< releves_consommation
                │  │        │
                │  └──< contacts ──< tickets_support
                │                        │
                └──< commandes ──< lignes_commande >── produits
                        │  │
                        │  └──< factures
                        └── commerciaux ──< agences ──> communes
```

Les liens à déclarer dans **Modèle de données** (le bouton « Détecter les liens » en propose la plupart) :

| Table (côté N) | Colonne | Table (côté 1) | Colonne |
| --- | --- | --- | --- |
| `clients` | `code_insee` | `communes` | `code_insee` |
| `clients` | `id_commercial` | `commerciaux` | `id_commercial` |
| `sites` | `id_client` | `clients` | `id_client` |
| `contacts` | `id_client` | `clients` | `id_client` |
| `commandes` | `id_client` | `clients` | `id_client` |
| `commandes` | `id_site` | `sites` | `id_site` |
| `lignes_commande` | `id_commande` | `commandes` | `id_commande` |
| `lignes_commande` | `id_produit` | `produits` | `id_produit` |
| `factures` | `id_commande` | `commandes` | `id_commande` |
| `tickets_support` | `id_client` | `clients` | `id_client` |
| `releves_consommation` | `id_site` | `sites` | `id_site` |
| `commerciaux` | `id_agence` | `agences` | `id_agence` |

---

## 2. Charger le jeu

Trois entrées possibles, selon ce que l'on veut montrer :

1. **Les fichiers un par un** — écran **Sources**, glisser-déposer les CSV de `fichiers/`. C'est le chemin
   normal ; commencez par `communes.csv`, `clients.csv`, `contacts.csv`, `commandes.csv`.
2. **La livraison ZIP** — écran **Sources → Livraison ZIP**, déposer `livraison-mensuelle.zip` : l'inventaire
   de l'archive s'affiche, puis chaque fichier est importé ou vient mettre à jour une source existante.
3. **Le classeur Excel** — déposer `catalogue-produits.xlsx` : la feuille est choisie à l'import.

Pour la démonstration de mise à jour, gardez `clients-mise-a-jour.csv` de côté : il se dépose depuis le bouton
**Mettre à jour** de la ligne `clients.csv`, dans l'écran Sources.

---

## 3. Les défauts semés, et l'écran qui les révèle

Tous sont **volontaires** et comptés dans `fichiers/manifeste.json`. Les nombres ci-dessous valent pour la
taille par défaut (`--taille demo`).

### Clients — profilage, anomalies, règles

| Défaut | Nombre | Où on le voit |
| --- | ---: | --- |
| Lignes entièrement vides | 12 | Qualité → Profilage → anomalie « lignes vides » |
| Lignes strictement dupliquées | 30 | Profilage → « doublons exacts » |
| Ville écrite en trois casses (`PARIS`, `paris`, `Paris`) | 197 | Anomalie « casse incohérente », et Préparation pour la corriger |
| Espaces parasites dans la raison sociale | 55 | Anomalie « espaces multiples » |
| SIRET manquant sur un professionnel | 143 | Règle « si type = PRO alors SIRET renseigné » (type *condition*) |
| SIRET bouche-trous (`N/A`, `-`, `?`, `NC`) | 21 | Anomalie « bouche-trous » |
| Statut hors liste (`ACTIVE`, `EN COURS`…) | 36 | Règle *liste de valeurs* sur `statut` |
| Code postal incohérent avec le département | 46 | Règle *cohérence entre colonnes* ou *SQL* |
| Adresse électronique invalide | 111 | Règle *format* (expression régulière) |
| Date de mise à jour vieille de plus de deux ans | 131 | Règle *fraîcheur* |
| Date de mise à jour dans le futur | 10 | Analyse d'une colonne → « dans le futur » |
| Chiffre d'affaires négatif / aberrant | 7 / 5 | Règle *plage*, anomalie « valeurs aberrantes » |
| Téléphones écrits de quatre façons | ~25 % | Analyse d'une colonne → « formats détectés » |

### Contacts — dédoublonnage

| Famille de doublons | Nombre | Ce qui change | Rapprochement qui les trouve |
| --- | ---: | --- | --- |
| Stricts | 240 | rien : la ligne est là deux fois | *strict* |
| Normalisés | 280 | casse, accents, espaces, adresse en majuscules | *normalisé* (casse et accents tolérés) |
| Flous | 240 | faute de frappe sur le nom, prénom abrégé (`J.`), adresse électronique voisine | *ressemblance* (Jaro-Winkler) |
| Contacts sans client existant | 120 | `id_client` inconnu | Règle *référence* / clé étrangère |

Clé fonctionnelle à composer pour la démonstration : **prénom + nom + ville**, en mode « ressemblance tolérée »
sur le nom. Les trois familles ressortent alors séparément, et les exports (CSV des clés, CSV des lignes,
classeur Excel à trois onglets) donnent la liste complète à retravailler.

### Ventes — cohérence, formats, rapprochement

| Défaut | Nombre | Où on le voit |
| --- | ---: | --- |
| Commandes dont le client n'existe pas | 149 | Modèle → mesure du lien (orphelins), règle *référence* |
| Références de commande en double | 96 | Règle *unicité* |
| Dates écrites à la française au milieu des dates ISO | 717 | Analyse d'une colonne → deux formats détectés |
| Statut hors liste (`LIVREE`, `en cours`) | 234 | Règle *liste de valeurs* |
| Montant négatif / aberrant (×100) | 75 / 23 | Règle *plage*, anomalie « valeurs aberrantes » |
| Livraison antérieure à la commande | 269 | Règle *cohérence* `[date_livraison_reelle] >= [date_commande]` |
| Ligne de commande dont le total ne tombe pas juste | 589 | Règle *SQL* : `montant_ligne ≠ quantité × prix × (1 − remise)` |
| Quantité nulle ou négative | 168 | Règle *plage* |
| Facture sans commande | 268 | Rapprochement / clé étrangère |
| Facture dont le montant s'écarte de la commande | 446 | Comparateur, Rapprochement, règle *SQL* |

### Établissements, support et relevés

| Défaut | Nombre | Où on le voit |
| --- | ---: | --- |
| Sites sans coordonnées | 15 | Profilage → complétude |
| Site fermé avant d'être ouvert | 20 | Règle *cohérence* de période |
| Ticket clos avant d'être ouvert | 40 | Règle *cohérence* |
| Priorité hors liste, satisfaction hors bornes | 44 / 33 | Règles *liste de valeurs* et *plage* |
| Journées entières sans relevé | 6 | Règle de série *trou* |
| Heures manquantes isolées | 106 | Règle de série *trou*, analyse de couverture |
| Valeur figée huit heures d'affilée (plateau) | 24 | Règle de série *plateau* |
| Saut brutal (×8) | 34 | Règle de série *saut* |
| Horodatages en double | 51 | Règle de série *doublon* |

---

## 4. Un scénario de démonstration en douze temps

Compter environ trente minutes. Chaque étape s'appuie sur la précédente.

1. **Charger** `communes.csv`, `clients.csv`, `contacts.csv`, `sites.csv`, `commandes.csv`,
   `lignes_commande.csv`, `factures.csv`, `produits.csv`, `commerciaux.csv`, `agences.csv` (écran Sources).
   Montrer au passage la recherche, le domaine par source et le nombre de lignes.
2. **Modèle de données** : « Détecter les liens », les accepter, puis « Mesurer sur les données » sur
   `commandes → clients` — la cardinalité constatée et les 151 orphelines apparaissent.
3. **Cockpit** : les points d'attention se remplissent (sources anciennes, tables hors modèle).
4. **Qualité → Profilage** de `clients.csv` : complétude, formats, anomalies. Ouvrir le **détail de la colonne
   `ville`** (casse incohérente), puis celui de `chiffre_affaires` (quartiles, valeurs aberrantes).
5. **Inspecteur d'anomalies** : voir les 12 lignes vides, puis exporter les lignes concernées en CSV.
6. **Qualité → Clé fonctionnelle** sur `contacts.csv` : composer prénom + nom + ville, lancer l'analyse,
   commenter les trois familles de doublons, exporter le classeur Excel à trois onglets.
7. **Qualité → Règles & score** : créer quatre règles (SIRET si PRO, statut dans la liste, courriel au format,
   fraîcheur de `date_maj`), exécuter, montrer le score, les **dettes qualité** et la **tendance**.
8. **Extraction** : partir de `clients`, joindre `commandes`, ajouter une synthèse « nombre de commandes » et
   une colonne calculée, filtrer sur une liste de villes, faire le **bilan qualité** du résultat, puis
   l'enregistrer comme source.
9. **Tables conçues** : consolider `clients` et `clients-mise-a-jour` en une table propre (formats, clé,
   enrichissement du montant depuis `commandes` avec l'**assistant pas à pas**), puis regarder le rapport
   d'écarts entre sources.
10. **Exploitation** : un tableau de bord (chiffre d'affaires par mois, par région, top produits), les
    **statistiques** (histogramme des montants), l'**explorateur 360°** autour d'un client, et le
    **rapprochement** commandes ↔ factures.
11. **Séries temporelles** : déclarer la série `releves_consommation` (horodatage, énergie, par site), lancer
    les contrôles — trous, plateaux, sauts et doublons remontent ; l'analyse de couverture montre les journées
    incomplètes.
12. **Gouvernance** : objet métier « Client » (table maître `clients`, facettes `contacts`, `sites`,
    `commandes`), dictionnaire, sensibilité (détection RGPD sur les contacts), lineage, catalogue, puis
    **mise à jour** de `clients.csv` par `clients-mise-a-jour.csv` — la colonne disparue et son impact sont
    signalés.

---

## 5. Régénérer le jeu

```bash
npm run demo                                    # taille « demo » (par défaut) dans donnees-demo/fichiers
node donnees-demo/generer.mjs --taille petite   # jeu léger, pour essayer vite
node donnees-demo/generer.mjs --taille grande   # 20 000 clients, 250 000 commandes, deux ans de relevés
node donnees-demo/generer.mjs --dossier /tmp/jeu --graine 7 --date-reference 2027-01-31
```

| Option | Défaut | Effet |
| --- | --- | --- |
| `--taille` | `demo` | `petite`, `demo` ou `grande` |
| `--dossier` | `donnees-demo/fichiers` | où écrire les fichiers |
| `--graine` | `20260910` | change le tirage ; à graine égale, fichiers identiques |
| `--date-reference` | `2026-09-10` | le « aujourd'hui » du jeu : toutes les dates s'y rapportent |
| `--silencieux` | — | n'affiche pas le résumé |

La date de référence compte : les règles de **fraîcheur** et les tableaux de bord parlent du présent. Si la
démonstration a lieu longtemps après, régénérez le jeu avec `--date-reference` à la date du jour.

Les tests du générateur vérifient que le tirage est reproductible et, surtout, que les défauts annoncés sont
réellement dans les fichiers :

```bash
npm run tester:demo
```

## 6. Comment c'est fait

| Fichier | Rôle |
| --- | --- |
| `generer.mjs` | orchestration, options, écriture, manifeste, résumé |
| `aleatoire.mjs` | tirages reproductibles (mulberry32) : entiers, probabilités, choix pondérés, loi normale |
| `calendrier.mjs` | dates en temps universel et leurs trois écritures |
| `referentiels.mjs` | communes, prénoms, noms, familles de produits, vocabulaire commercial |
| `deformations.mjs` | les défauts semés (casse, accents, espaces, bouche-trous, fautes de frappe) et leur compteur |
| `ecriture.mjs` | CSV, archive ZIP et classeur Excel, sans dépendance |
| `generateur-referentiel.mjs` | communes, agences, commerciaux, produits |
| `generateur-clients.mjs` | clients, établissements, contacts et leurs doublons |
| `generateur-ventes.mjs` | commandes, lignes, factures et leur saisonnalité |
| `generateur-exploitation.mjs` | tickets du support, relevés horaires |
| `generateur-livraisons.mjs` | mise à jour, livraison ZIP, catalogue Excel |
