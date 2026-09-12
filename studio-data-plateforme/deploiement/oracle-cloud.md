# Déployer gratuitement sur Oracle Cloud (Free Tier)

Une machine ARM « Ampere A1 » (jusqu'à 4 cœurs, 24 Go de mémoire, 200 Go de disque) est incluse sans limite de
durée dans l'offre gratuite. C'est largement suffisant pour la plateforme, PostgreSQL et DuckDB.

## 1. Créer la machine

1. Créer un compte sur cloud.oracle.com (carte bancaire demandée, sans débit dans l'offre gratuite). Choisir une
   région où la capacité ARM est disponible ; si la création échoue avec « Out of capacity », réessayer plus tard
   ou depuis une autre région.
2. Compute → Instances → Créer : image **Ubuntu 24.04 (aarch64)**, forme **VM.Standard.A1.Flex**, 4 OCPU et
   24 Go, volume de démarrage 200 Go. Ajouter sa clé SSH publique.
3. Réseau : dans la liste de sécurité du sous-réseau, ouvrir les ports **80** et **443** (règles d'entrée TCP).
   Sur la machine, ouvrir aussi le pare-feu système :
   ```bash
   sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```
4. Nom de domaine : faire pointer un enregistrement A vers l'adresse publique de la machine (un sous-domaine
   gratuit type DuckDNS convient pour tester).

## 2. Installer Docker et la plateforme

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
sudo usermod -aG docker $USER && newgrp docker
git clone <adresse du dépôt> site && cd site/studio-data-plateforme
cp .env.exemple .env && nano .env      # POSTGRES_PASSWORD, SD_ADMIN_MOT_DE_PASSE, SD_DOMAINE
docker compose up -d --build           # première construction : 5 à 10 minutes sur ARM
docker compose logs -f api             # attendre « API à l'écoute »
```

Ouvrir https://votre-domaine : la page de connexion s'affiche ; identifiant `admin` et le mot de passe choisi.

## 3. Exploiter

- **Mises à jour** : `git pull && docker compose up -d --build`.
- **Sauvegardes** (à planifier avec cron, par exemple chaque nuit) :
  ```bash
  docker compose exec -T postgres pg_dump -U studio studio_data | gzip > sauvegarde-postgres-$(date +%F).sql.gz
  docker run --rm -v studio-data-plateforme_donnees:/donnees -v $PWD:/sortie alpine tar czf /sortie/sauvegarde-donnees-$(date +%F).tgz /donnees
  ```
  Copier ces fichiers hors de la machine (le stockage objet Oracle offre 20 Go gratuits).
- **Activité** : Oracle récupère les machines gratuites inactives ; le healthcheck Docker et une supervision
  externe (UptimeRobot, gratuit) qui interroge `/api/sante` suffisent à la garder active.
- **Supervision** : `/api/sante` renvoie l'état de la base, la version de DuckDB et les volumes.

## Sans Docker (machine interne)

```bash
cd studio-data-plateforme
npm run installer && npm run construire
export SD_POSTGRES_URL=postgres://studio:motdepasse@localhost:5432/studio_data SD_ADMIN_MOT_DE_PASSE=...
npm run demarrer                        # http://127.0.0.1:8430
```
Le reverse proxy (Caddy, nginx) termine le TLS et transmet à 127.0.0.1:8430 ; `deploiement/Caddyfile` sert de
modèle (remplacer `api:8430` par `127.0.0.1:8430`).
