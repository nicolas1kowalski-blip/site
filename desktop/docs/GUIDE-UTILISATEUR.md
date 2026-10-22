# Eyzi — Guide utilisateur

*Une application Windows pour jouer, parler et apprendre avec les yeux, pour les enfants de 4 à 7 ans. Elle se pilote à la commande oculaire (Tobii), au doigt ou à la souris.*

Ce guide s'adresse aux parents et aux accompagnants. La première partie explique l'installation et le premier démarrage, la deuxième ce que l'enfant voit, la troisième les réglages, la dernière ce qu'il faut savoir pour donner l'application à une autre famille.

---

## 1. Installer l'application

### Ce qu'il faut
- Une tablette ou un PC sous **Windows 10 ou 11**.
- Pour la commande oculaire : un capteur **Tobii** (TD I-13, PCEye 5, Tobii 4C / 5) avec son logiciel Tobii installé. Sans capteur, l'application marche au doigt et à la souris.
- Une connexion internet pour l'installation et les mises à jour (ensuite l'application marche hors ligne).

### Les étapes
1. Téléchargez **Eyzi-Setup.exe** depuis la page « Application » du site (ou la page des versions sur GitHub).
2. Ouvrez le fichier. Windows peut afficher un écran bleu « Windows a protégé votre ordinateur » : cliquez sur **Informations complémentaires**, puis **Exécuter quand même**. C'est normal pour une application qui n'est pas encore signée par un certificat payant.
3. L'installeur est en français et ne demande **aucun droit administrateur** : il installe l'application dans le profil de l'utilisateur. Cochez « Lancer au démarrage de Windows » si la tablette est dédiée à l'enfant.
4. À la fin, l'application se lance toute seule. Un raccourci « Eyzi » est sur le bureau et dans le menu Démarrer.

Pour désinstaller : Paramètres Windows → Applications → Eyzi → Désinstaller. Le contenu de la famille (photos, voix, livres) n'est pas supprimé.

## 2. Le premier démarrage

### La licence
Au tout premier lancement, l'application demande un **numéro de licence** de la forme `EYZ-XXXX-XXXX-XXXX-XXXX`. C'est le numéro que l'éditeur vous a donné. Il sert à trois choses :

- il autorise l'application sur cette tablette ;
- il regroupe vos tablettes en une **famille** : toutes les tablettes activées avec le même numéro partagent leurs photos, voix et livres ;
- il dit à l'application si elle reçoit les versions **test** ou seulement les versions **prod**.

Sur le même écran, choisissez un **mot de passe famille** (6 caractères au moins). Tapez le même sur toutes vos tablettes. Il sert à chiffrer vos contenus avant qu'ils ne quittent la tablette : personne d'autre, pas même l'éditeur, ne peut les lire. Notez-le : s'il est perdu, les contenus déjà envoyés ne pourront pas être relus par une nouvelle tablette (ils restent sur les tablettes où ils sont).

La licence est vérifiée en ligne à l'activation, puis au plus une fois par jour. Sans réseau, elle reste valable **30 jours**.

Elle est limitée à un **nombre de tablettes** (deux, en général). Quand elles sont toutes prises, une nouvelle tablette est refusée : sur l'ancienne, réglages → **🚫 Libérer cette tablette** rend la place. Les réglages affichent toujours « tablettes : 1/2 ».

### Le prénom de l'enfant
Juste après, l'application demande le **prénom de l'enfant**. Il est utilisé sur l'accueil (« Bonjour Laura ! ») et dans l'activité « Mon prénom ». On peut le changer plus tard dans les réglages.

### Vos anciens contenus
Si vous utilisiez une version précédente (contenu dans OneDrive, dans Documents ou à côté de l'application), tout est rapatrié automatiquement au premier lancement dans le dossier de l'application. Rien à faire.

## 3. La commande oculaire

### Comment ça marche
L'enfant regarde un bouton ; un petit cercle se remplit autour de son regard ; quand il est plein, le bouton est « cliqué ». C'est la **durée de fixation** (réglable, de très courte à longue). L'application peut aussi **l'ajuster toute seule** : plus l'enfant réussit, plus elle raccourcit.

Pendant que l'application parle, un bouton regardé est quand même pris en compte : il s'enfonce, et son action part dès la fin de la phrase. L'enfant ne croit jamais « avoir cliqué pour rien ».

Ce qui est en train d'être lu reste **surligné en doré** jusqu'à la fin de la phrase.

### Les pilotes
Dans les réglages (bouton **⚙** en haut à droite), « Source du regard » propose :

- **Auto** : l'application choisit le meilleur pilote disponible (conseillé).
- **Moteur Tobii direct** : le même moteur que Grid 3 ; c'est celui qui marche le mieux sur les tablettes TD I-13 et PCEye 5.
- **Regard direct (Tobii Experience)** : pour les capteurs Tobii grand public.
- **Curseur** : marche avec n'importe quelle commande oculaire qui déplace la souris (TD Control, etc.).

Le pilote change à chaud, sans redémarrer.

### Calibrer et vérifier
- **👁 Vérifier la position des yeux** ouvre une fenêtre qui montre les deux yeux : l'enfant doit être bien dans le cadre, ni trop près ni trop loin.
- **🎯 Calibrer la tablette** lance le calibrage du logiciel Tobii installé (sans passer par TD Control).
- **🎯 Régler la précision (étoile)** : un mini-jeu où l'enfant suit une étoile ; l'application corrige un décalage éventuel.
- **Lissage** rend le regard plus stable (plus lent) ou plus réactif ; **Taille du cercle** change la taille de la cible.

## 4. Ce que voit l'enfant

### L'accueil
« Bonjour Laura ! », la date du jour, l'ami du jour (un animal), les étoiles gagnées, une surprise, et un décor qui suit la journée : le soleil le matin, la lune et les étoiles le soir. Regarder le soleil ou la lune les fait parler. La carte **« Dire bonjour »** fait dire bonjour à voix haute (avec votre voix si vous l'avez enregistrée).

### Les onglets
Tout en haut, toujours visibles :

- **📖 Histoires** : les livres fournis et les vôtres (photos de la famille, texte lu à voix haute).
- **🎮 Jeux** : ballons, paires (seul ou à deux), cherche et trouve, le jeu magique…
- **🎓 Éducatif** : par thèmes — *Les lettres* (mon prénom, mot et image, lettres mobiles, rimes, syllabes), *Les nombres* (compter, un de plus, partager, la bande numérique), *La musique*, *L'anglais*, *Découvrir* (les émotions, « Range la maison », les contraires).
- **🎨 Coloriage** : on regarde une zone, elle se colorie.
- **🎵 Musique** : instruments à jouer avec les yeux (le son part dès que le regard se pose), xylophone, « Au clair de la lune » (la lame qui brille est la prochaine note ; rester dessus la rejoue), batterie.
- **📅 Parcours** : une suite d'activités pour la séance du jour.

### Parler, Oui, Non
Les boutons **💬 Parler** (en bas à droite) et **✅ Oui / ✗ Non** (en bas à gauche) sont toujours à l'écran. « Parler » ouvre le tableau de communication : je veux, j'ai mal, j'aime, encore, fini, ma journée, et au niveau 2 « Je fais une phrase ». On peut les cacher dans les réglages.

### Je choisis
Le bouton **🙋 Je choisis** (réglages) affiche 2 à 4 images que vous choisissez (le jus, le gâteau, un livre…). L'enfant regarde celle qu'il veut, l'application la dit. Idéal pour les vrais choix du quotidien.

### Les étoiles, le carnet, la boutique
Chaque réussite donne une étoile. **Mon carnet** montre l'arbre à pommes (une pomme tous les 25 étoiles), les étoiles par domaine, les badges (10, 50, 100 étoiles, 3 jours de suite, Je parle !…). Dans la **Boutique**, l'enfant dépense ses étoiles contre des surprises : le grand feu d'artifice, la fête des ballons, une chanson, une vidéo de sa famille.

### Le niveau
Trois niveaux : 🌱 Petite section (2 choix, nombres jusqu'à 5), 🌿 Moyenne section (3 choix, jusqu'à 7), 🌳 Grande section · CP (4 choix, jusqu'à 10). En **Automatique**, l'application monte d'un niveau après 20 réponses avec 85 % de réussite et redescend sous 40 %. On peut fixer le niveau à la main.

### La pause
Après 10 minutes de jeu (réglable : jamais, 5, 10, 15, 20), l'application demande « on continue encore un peu, ou on fait une petite pause ? ». La pause joue un peu de musique, et on reprend quand on veut.

## 5. Les réglages des parents (bouton ⚙)

- **🔧 Mode administration** met le regard en pause pour que vous puissiez utiliser la souris, et permet d'ajouter, modifier ou supprimer les livres, coloriages et photos.
- **👧 Prénom de l'enfant**.
- **Voix** : voix Windows (hors ligne) avec réglage de hauteur, ou voix naturelle Azure (en ligne, clé à saisir ; repli automatique hors ligne). **🎙 Enregistrer vos voix** : vos « Bravo ! » et « Bonjour ! » remplacent la voix de synthèse aux moments forts.
- **📊 Bilan** : la semaine, les niveaux, les étoiles, les mots dits.
- **📁 Le contenu de la famille** : photos, voix, livres, coloriages et images ajoutées vivent dans `%LocalAppData%\MesPremiersJeux\Contenu`. **📦 Exporter** fabrique un seul fichier (sauvegarde ou copie vers une autre tablette avec **📥 Importer**).
- **☁️ Le nuage** : si l'éditeur a configuré le serveur, le contenu voyage tout seul entre vos tablettes (récupéré au démarrage, envoyé à la fermeture), chiffré avec votre mot de passe famille. Deux boutons pour forcer : **Envoyer maintenant** / **Récupérer maintenant**.
- **🔑 Licence et mises à jour** : la licence active (famille, canal, tablettes utilisées), la version installée, **🔄 Vérifier les mises à jour**, **↩ Version précédente**, **🔑 Changer la licence**, **🚫 Libérer cette tablette** (changement de poste : la place redevient libre, l'application se ferme et redemandera une licence ; le contenu reste sur la tablette).

## 6. Les mises à jour

L'application se met à jour **comme une application du Store** : au démarrage, elle regarde s'il existe une version plus récente de son canal, la télécharge, vérifie son empreinte, l'installe en silence et se relance. Le contenu de la famille et les réglages ne sont jamais touchés.

- Canal **test** : reçoit toutes les versions, dès qu'elles sont compilées. Pour les tablettes qui servent à essayer.
- Canal **prod** : reçoit seulement les versions promues, une fois testées. Pour les tablettes de tous les jours.

Le canal est porté par la licence. **↩ Version précédente** réinstalle la version d'avant (les trois derniers installeurs sont gardés sur la tablette).

## 7. Les données et la sécurité

- Tout est sur la tablette : réglages, contenu, journal, progrès. Rien ne part sans licence activée.
- Vers le nuage ne partent que des fichiers **chiffrés** (AES-256) avec votre mot de passe famille. Le serveur, et l'éditeur, voient un fichier illisible.
- Chaque famille a son espace, cloisonné par le serveur : une tablette d'une famille ne peut pas lire une autre famille.
- Le numéro de licence n'est pas un secret absolu (quelqu'un qui l'a peut activer une tablette de votre famille, dans la limite du nombre autorisé) ; le mot de passe famille, lui, protège vos contenus. Ne les écrivez pas au même endroit.
- L'application envoie à l'éditeur, une fois par jour, des **compteurs d'usage** : par jour et par activité, le nombre d'ouvertures, de réussites et de minutes, avec le nom de la tablette. Rien d'autre : ni le prénom, ni les photos, ni les voix, ni ce qui a été dit. Ils servent à savoir ce qui est utilisé et ce qui ne l'est pas, pour améliorer l'application.
- Le journal (`%LocalAppData%\MesPremiersJeux\journal.txt`) note ce qui se passe (jeux, erreurs). En cas de plantage, un fichier `plantage-<tablette>.txt` est écrit dans le dossier du contenu : envoyez-le à l'éditeur.

## 8. Problèmes fréquents

**L'écran bleu « Windows a protégé votre ordinateur »** : Informations complémentaires → Exécuter quand même.

**Le regard ne fait rien** : vérifiez que le logiciel Tobii voit les yeux (👁 Vérifier la position des yeux), puis essayez « Moteur Tobii direct » dans Source du regard, puis calibrez (🎯).

**Le cercle se remplit trop vite / trop lentement** : Durée de fixation, ou cochez « Ajuster tout seul ».

**La voix parle en retard ou coupe** : avec la voix Azure, vérifiez le réseau ; sinon passez en voix Windows. La phrase en cours se termine toujours avant la suivante.

**« Le serveur de licences n'est pas configuré »** : cette version n'embarque pas encore l'adresse du serveur ; saisissez-la dans ☁️ Le nuage (URL et clé fournies par l'éditeur), ou utilisez une licence maître.

**L'application s'est fermée toute seule** : relancez-la, puis regardez `journal.txt` (lignes `[plantage]`) et envoyez le fichier `plantage-…txt`.

**Je change de tablette** : installez, activez avec le même numéro et le même mot de passe famille ; le contenu descend tout seul (ou 📦 Exporter / 📥 Importer sans réseau).

---

## 9. Pour l'éditeur : donner l'application à une autre famille

1. **Créer une licence** dans le serveur (Supabase → SQL) :
   `select public.create_licence('Famille Martin', 'prod', 2);` — le nom, le canal (`test` ou `prod`), le nombre de tablettes, et une date de fin facultative en 4ᵉ paramètre. La fonction renvoie le numéro `EYZ-…` à transmettre.
2. **Donner** à la famille : le lien de téléchargement, le numéro de licence, ce guide. Elle choisit elle-même son mot de passe famille.
3. **Publier une version** : chaque poussée de code compile une version *test* (pré-version) sur GitHub. Pour la passer en *prod* : GitHub → Releases → Edit → décocher « Set as a pre-release » → cocher « Set as the latest release ». Les tablettes prod la reçoivent au prochain démarrage.
4. **Révoquer** une licence : dans la table `licences`, passer `enabled` à `false` ; la tablette perd l'accès au plus tard 30 jours après (ou à sa prochaine vérification en ligne).
5. **Désactiver une tablette** (perdue, remplacée, prêtée) : `select public.disable_tablet('EYZ-…', 'NOM-DE-LA-TABLETTE');` (même fonction avec `true` en 3ᵉ paramètre pour la réactiver). La vue `tablettes` liste toutes les tablettes par famille, avec leur version et leur dernière connexion. La limite est stricte : une tablette de plus que `max_tablets` est refusée tant qu'une place n'est pas libérée.
6. **Voir ce qui est utilisé**, par famille : la vue `usage_par_famille` (du plus utilisé au moins utilisé : minutes, ouvertures, réussites, jours), `usage_30_jours` (les 30 derniers jours) et `usage_resume` (une ligne par famille : minutes, jours, tablettes, dernière fois). Dans Supabase : Table Editor → choisir la vue, ou SQL : `select * from public.usage_30_jours where famille = 'Famille Martin';`

Les fichiers utiles : `desktop/docs/supabase.sql` (le serveur), `desktop/installer/MesPremiersJeux.iss` (l'installeur), `.github/workflows/build.yml` (la compilation automatique).
