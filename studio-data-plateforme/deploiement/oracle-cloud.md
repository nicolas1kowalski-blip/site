# Déployer gratuitement sur Oracle Cloud (Free Tier)

Une machine ARM « Ampere A1 » (jusqu'à 4 cœurs, 24 Go de mémoire, 200 Go de disque) est incluse sans limite de
durée dans l'offre gratuite. C'est largement suffisant pour la plateforme, PostgreSQL et DuckDB. Compter une
heure la première fois, dont une bonne partie d'attente (création du compte, construction de l'image).

Ce qu'il faut avant de commencer :
- un compte Oracle Cloud (carte bancaire demandée pour vérification, sans débit dans l'offre gratuite) ;
- une clé SSH sur votre poste (`ssh-keygen -t ed25519` si vous n'en avez pas ; la clé publique est `~/.ssh/id_ed25519.pub`) ;
- un nom de domaine, ou un sous-domaine gratuit (DuckDNS, par exemple `studio-data.duckdns.org`) : Caddy obtient
  le certificat HTTPS tout seul dès que le nom pointe vers la machine.

## 1. Créer la machine

1. Sur cloud.oracle.com, choisir une région proche (Paris, Francfort, Marseille…). La région d'origine ne se
   change plus ensuite ; si la création de la machine échoue avec « Out of capacity », réessayer plus tard (souvent
   tôt le matin) ou avec moins de cœurs (2 OCPU / 12 Go suffisent).
2. Menu → Compute → Instances → **Créer une instance** :
   - image : **Canonical Ubuntu 24.04**, puis choisir la forme **VM.Standard.A1.Flex** (Ampere, ARM) ;
   - 4 OCPU et 24 Go de mémoire (ou 2 / 12 si la capacité manque) ;
   - volume de démarrage : 200 Go (le maximum gratuit) ;
   - réseau : laisser créer le VCN et le sous-réseau public, **adresse IPv4 publique attribuée** ;
   - coller votre clé SSH publique.
3. Ouvrir les ports web dans le cloud : Networking → Virtual cloud networks → votre VCN → Security Lists →
   Default Security List → **Add Ingress Rules** : source `0.0.0.0/0`, protocole TCP, port de destination `80` ;
   puis la même règle pour `443`.
4. Se connecter et ouvrir aussi le pare-feu du système (Oracle le livre fermé) :
   ```bash
   ssh ubuntu@ADRESSE_PUBLIQUE
   sudo iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```
5. Nom de domaine : créer un enregistrement **A** qui pointe vers l'adresse publique (sur DuckDNS : coller
   l'adresse dans le champ « current ip »). Vérifier depuis votre poste : `ping votre-domaine` doit répondre
   avec l'adresse de la machine.

## 2. Installer Docker et la plateforme

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
sudo usermod -aG docker $USER && newgrp docker
docker run --rm hello-world                        # doit afficher « Hello from Docker! »

git clone --branch claude/studio-data-v3 https://github.com/nicolas1kowalski-blip/site.git site
cd site/studio-data-plateforme
cp .env.exemple .env
nano .env
```

Dans `.env`, trois lignes à renseigner (les autres peuvent rester telles quelles) :

| Variable | Valeur |
|---|---|
| `POSTGRES_PASSWORD` | un mot de passe long pour la base (jamais réutilisé ailleurs) |
| `SD_ADMIN_MOT_DE_PASSE` | le mot de passe de l'administrateur `admin` au premier démarrage |
| `SD_DOMAINE` | votre nom de domaine, sans `https://` (ex. `studio-data.duckdns.org`) |

Puis :

```bash
docker compose up -d --build           # première construction : 5 à 10 minutes sur ARM
docker compose logs -f api             # attendre « API à l'écoute », puis Ctrl+C
docker compose ps                      # les trois services (postgres, api, caddy) en « running (healthy) »
curl -s https://votre-domaine/api/sante  # {"ok":true,...} : base, DuckDB et volumes en état
```

Ouvrir https://votre-domaine : la page de connexion s'affiche ; identifiant `admin` et le mot de passe choisi.
Première chose à faire : **Mon compte → changer le mot de passe**, puis **Utilisateurs** pour créer les comptes de
l'équipe et **Espaces** pour les rattacher.

Si quelque chose ne va pas :
- `docker compose logs caddy` : « no certificate » ou « DNS problem » → le domaine ne pointe pas encore vers la
  machine, ou le port 80 n'est pas ouvert (Caddy en a besoin pour obtenir le certificat) ;
- `docker compose logs api` : « ECONNREFUSED postgres » → attendre, PostgreSQL démarre encore ; l'API réessaie ;
- « Out of memory » pendant la construction → `docker compose build --progress plain api` sur une machine à 12 Go
  passe ; sinon construire l'image sur votre poste (`docker build --platform linux/arm64 …`) et la transférer.

## 3. Exploiter

- **Mises à jour** : `cd ~/site/studio-data-plateforme && git pull && docker compose up -d --build`. Les migrations
  de base s'appliquent toutes seules au démarrage de l'API.
- **Sauvegardes** : le script `deploiement/sauvegarder.sh` archive PostgreSQL (`pg_dump`) et le volume des données
  (DuckDB, fichiers) dans `~/sauvegardes` et garde 14 jours. À planifier chaque nuit :
  ```bash
  chmod +x deploiement/sauvegarder.sh && ./deploiement/sauvegarder.sh     # essai à la main
  (crontab -l 2>/dev/null; echo "0 3 * * * cd $HOME/site/studio-data-plateforme && ./deploiement/sauvegarder.sh >> $HOME/sauvegardes/journal.log 2>&1") | crontab -
  ```
  Copier ces archives hors de la machine (le stockage objet Oracle offre 20 Go gratuits ; `rclone` sait y écrire).
- **Restaurer** : `gunzip -c postgres-DATE.sql.gz | docker compose exec -T postgres psql -U studio studio_data`
  pour le référentiel ; pour les données, arrêter l'API (`docker compose stop api`) puis
  `docker run --rm -v studio-data-plateforme_donnees:/donnees -v ~/sauvegardes:/entree alpine sh -c "rm -rf /donnees/* && tar xzf /entree/donnees-DATE.tgz -C /"`
  et `docker compose start api`.
- **Activité** : Oracle peut récupérer une machine gratuite jugée inactive (moins de 20 % de processeur sur
  7 jours). Une supervision externe gratuite (UptimeRobot) qui interroge `https://votre-domaine/api/sante` toutes
  les 5 minutes suffit en pratique, et vous prévient si le site tombe.
- **Supervision** : `/api/sante` renvoie l'état de la base, la version de DuckDB et les volumes ;
  `docker compose logs --since 1h api` pour le journal applicatif ; l'écran **Journal** de l'application trace
  qui a fait quoi.
- **Espace disque** : `df -h /` et `docker system df` ; `docker image prune -f` après une mise à jour libère les
  anciennes images.

## Sans Docker (machine interne)

```bash
cd studio-data-plateforme
npm run installer && npm run construire
export SD_POSTGRES_URL=postgres://studio:motdepasse@localhost:5432/studio_data SD_ADMIN_MOT_DE_PASSE=...
npm run demarrer                        # http://127.0.0.1:8430
```
Le reverse proxy (Caddy, nginx) termine le TLS et transmet à 127.0.0.1:8430 ; `deploiement/Caddyfile` sert de
modèle (remplacer `api:8430` par `127.0.0.1:8430`).
