# Lancer Eyzi — toutes les étapes, dans l'ordre

*Checklist pour mettre en ligne le site, le serveur et l'application, puis faire vivre la bêta. Compter une soirée pour A à D, puis une heure par semaine.*

## A. Mettre le code en ligne (10 min)

1. **Fusionner la pull request n° 24** (GitHub → Pull requests → « Eyzi : application native… » → Merge pull request). La branche par défaut du dépôt, celle que Vercel déploie, s'appelle `claude/create-sync-file-fziau` ; il n'y a pas de branche `main`.
2. Vercel déploie la branche par défaut tout seul. Vérifier dans Vercel → Deployments que le dernier est « Ready ».

## B. Le domaine eyzi.fr (10 min, puis attendre jusqu'à 1 h)

3. **OVH → Noms de domaine → eyzi.fr → Zone DNS** :
   - supprimer les enregistrements A et CNAME de « parking » créés par OVH ;
   - ajouter un enregistrement **A**, sous-domaine vide (`@`), cible `76.76.21.21` ;
   - ajouter un enregistrement **CNAME**, sous-domaine `www`, cible `cname.vercel-dns.com.`
4. **Vercel → le projet du site → Settings → Domains** : ajouter `eyzi.fr`, puis `www.eyzi.fr`. Attendre « Valid Configuration » ; le certificat HTTPS se met en place seul.
5. Tester : https://eyzi.fr (accueil), /licence.html, /retours.html, /guide.html, et le bouton « Télécharger » (il donne 404 tant qu'aucune version n'est promue en prod : voir D).

## C. Le serveur Supabase (20 min)

6. **Supabase → le projet déjà utilisé par le site** (celui dont l'URL est dans Vercel → Settings → Environment Variables → `SUPABASE_URL`) → **SQL Editor** → New query → coller tout le fichier `desktop/docs/supabase.sql` → **Run**. Il crée : `licences`, `activations`, `usage`, `licence_requests`, les fonctions, les vues (`tablettes`, `usage_par_famille`, `usage_30_jours`, `usage_resume`) et le bucket `familles`. Vérifier dans Table Editor que les tables sont là.
7. **Récupérer l'URL et la clé anon** : Supabase → Settings → API → « Project URL » et « anon public ». Me les envoyer : je les embarque dans l'application (`Lib/Cloud.cs`) et une nouvelle version sort. En attendant, elles peuvent être saisies dans l'application : réglages → ☁️ Le nuage → URL et clé.
8. **Créer ta propre licence de famille** (la licence maître ne connaît pas le serveur, donc pas de nuage avec elle) : SQL Editor → `select public.create_licence('Famille Kowalski', 'test', 3);` → noter le numéro EYZ-… → sur chaque tablette, réglages → 🔑 Changer la licence → entrer le numéro et le mot de passe famille (le même partout).
9. **Vérifier les variables Vercel** : `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` existent déjà pour les livres ; sinon les ajouter (Settings → Environment Variables), puis « Redeploy ».
10. **Tester le formulaire** : remplir https://eyzi.fr/licence.html avec tes coordonnées → Supabase → Table Editor → `licence_requests` : la ligne est là. Idem pour /retours.html.

## D. Publier la version prod (2 min)

11. GitHub → Releases → la version test la plus récente (après l'étape 7, pour qu'elle contienne le serveur) → **Edit** → décocher « Set as a pre-release » → cocher « Set as the latest release » → Update. Dès lors : le bouton « Télécharger » du site marche, et les tablettes en canal prod se mettent à jour.
12. Ta licence est en canal `test` : tes tablettes reçoivent toutes les versions. Les familles reçoivent la prod.

## E. Traiter une demande de licence (5 min par demande)

13. Supabase → Table Editor → `licence_requests` → filtrer `status = new` et `topic = licence`, par ordre de `created_at`.
14. Créer la licence : SQL Editor → `select public.create_licence('Famille Martin', 'prod', 2);` (nom, canal, nombre de tablettes). Tant que les 10 premières places ne sont pas toutes données, on donne ; après, on laisse en `new` et on prévient que la demande est gardée.
15. Envoyer l'e-mail (modèle ci-dessous), puis dans `licence_requests` : `status` → `done`, `licence_key` → le numéro.
16. Les retours (`topic = retour`) : lire, répondre sous une semaine si un e-mail est donné, noter ce qui va dans la version suivante.

**Modèle d'e-mail**

> Objet : Votre licence Eyzi
>
> Bonjour,
> voici votre numéro de licence Eyzi : **EYZ-XXXX-XXXX-XXXX-XXXX** (valable pour N tablettes).
> 1. Téléchargez l'application sur https://eyzi.fr et installez-la (si Windows affiche « Windows a protégé votre ordinateur » : Informations complémentaires → Exécuter quand même).
> 2. Au premier lancement, entrez ce numéro et choisissez un mot de passe famille, le même sur toutes vos tablettes.
> 3. Le guide complet : https://eyzi.fr/guide.html
> Eyzi est en version bêta et gratuite : vos remarques comptent, https://eyzi.fr/retours.html, ou en répondant à cet e-mail.
> Bonne découverte !

## F. Chaque semaine (30 min)

17. `usage_resume` : qui utilise, combien ; `usage_30_jours` : ce qui marche et ce qui ne sert pas ; `tablettes` : versions installées.
18. GitHub → Actions : les versions test compilent ; promouvoir en prod ce qui a été essayé sur tes tablettes.
19. Les fichiers `plantage-*.txt` et les lignes `[plantage]` du journal que les familles envoient : me les transmettre.

## G. Avant d'ouvrir plus largement

20. **Double authentification** sur GitHub, Supabase, Vercel et OVH : celui qui contrôle ces comptes contrôle ce que les tablettes installent.
21. **Mentions légales** sur le site (obligatoires en France pour un site qui collecte des données) : nom de l'éditeur, adresse de contact, hébergeur (Vercel), ce qu'on fait des données du formulaire. Me donner le nom et l'adresse e-mail à afficher, j'ajoute la page.
22. **Un test sur un Windows neuf** (ou une session Windows vierge) : installation, essai 10 jours, activation d'une licence, mise à jour automatique.
23. **Les premières familles** : 5 à 10 choisies, plus un ou deux thérapeutes. Puis la fiche au Techlab APF France handicap, la communauté GazePlay, les associations, les missions CAA départementales.

## H. Plus tard, quand ce sera le moment

- Déposer la marque Eyzi (INPI, classes 9, 41, 42).
- Signer l'installeur (certificat de signature de code) pour faire disparaître l'écran bleu de Windows.
- Envoi d'e-mail automatique à la réception d'une demande.
- La question de l'iPad.
