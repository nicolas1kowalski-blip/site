# Déployer sur AWS (démonstration, puis architecture d'entreprise)

Tout tient dans un modèle CloudFormation, `deploiement/aws/pile.yaml`, qui crée en une fois :

| Élément | Rôle |
|---|---|
| Une machine EC2 (Ubuntu 24.04, disque chiffré gp3 ; t3.micro sur le plan gratuit, ARM Graviton au-delà) | exécute l'application avec Docker : API + front, Caddy pour le HTTPS |
| Une adresse IP publique fixe (Elastic IP) | cible de l'enregistrement DNS du domaine |
| Un groupe de sécurité web | seuls les ports 80 et 443 sont ouverts ; **pas de port 22** |
| Un rôle IAM + Systems Manager | terminal sur la machine depuis la console AWS, sans clé SSH ; écriture des sauvegardes dans S3 |
| Un compartiment S3 privé et chiffré | sauvegardes nocturnes, archives expirées après 35 jours |
| En mode **entreprise** : Amazon RDS for PostgreSQL | base gérée (db.t4g.micro, 20 Go chiffrés, instantanés automatiques 7 jours), accessible uniquement depuis la machine, connexion TLS vérifiée avec le certificat d'autorité d'Amazon |

Deux modes, choisis par le paramètre `ModeBaseDeDonnees` :

- **demo** : PostgreSQL dans un conteneur sur la machine. Une seule machine, quelques euros par mois, prêt en
  un quart d'heure. C'est le mode pour montrer que l'application fonctionne dans un compte AWS d'entreprise
  (VPC, IAM, S3, Systems Manager, pas de SSH).
- **entreprise** : la même machine, mais le référentiel dans Amazon RDS. C'est le mode cible : la base est
  sauvegardée, chiffrée et administrée par AWS ; l'application ne garde sur son disque que les bases DuckDB et
  les fichiers déposés (sauvegardés chaque nuit dans S3).

Coût indicatif (région Paris, septembre 2026, hors offre gratuite) : machine t4g.medium ≈ 30 €/mois ; RDS
db.t4g.micro ≈ 15 €/mois ; disque, adresse IP et S3 ≈ 10 €/mois. Une machine t4g.small suffit pour une
démonstration à deux ou trois personnes.

## 1. Avant de créer la pile

1. Un compte AWS avec le droit de créer des ressources (CloudFormation, EC2, RDS, S3, IAM). Dans un compte
   d'entreprise, demander ces droits à l'équipe cloud, ou lui transmettre le modèle : il est lisible et commenté.
2. Choisir la région (Paris `eu-west-3`, Francfort `eu-central-1`, Irlande `eu-west-1`).
3. Repérer le VPC et les sous-réseaux : console **VPC → Your VPCs** (le VPC par défaut convient pour une
   démonstration) et **Subnets** (noter deux sous-réseaux publics dans deux zones différentes).
4. Un jeton GitHub pour cloner le dépôt privé : GitHub → Settings → Developer settings → Personal access tokens
   → Tokens (classic) → portée `repo`, durée courte (7 jours suffisent).
5. Facultatif mais recommandé : un nom de domaine (ou un sous-domaine) dont vous pouvez modifier l'enregistrement
   A. Sans domaine, la démonstration se fait en HTTP sur l'adresse publique.

## 2. Créer la pile

1. Console **CloudFormation → Create stack → With new resources → Upload a template file** : choisir
   `deploiement/aws/pile.yaml`.
2. Nom de la pile : `studio-data`. Renseigner les paramètres : mode, domaine (ou vide), les deux mots de passe,
   le jeton GitHub, le VPC, le sous-réseau de la machine, les deux sous-réseaux de la base.
3. À la dernière étape, cocher **« I acknowledge that AWS CloudFormation might create IAM resources »** puis
   **Submit**.
4. Attendre `CREATE_COMPLETE` (3 minutes en mode demo, 10 à 15 en mode entreprise : RDS est long à créer).
   L'onglet **Outputs** donne l'adresse IP, l'URL, le lien vers le terminal de la machine et le nom du
   compartiment de sauvegardes.
5. Avec un domaine : créer maintenant l'enregistrement **A** vers l'adresse IP de l'onglet Outputs (Route 53 ou
   votre registrar). Caddy réessaie d'obtenir le certificat jusqu'à ce que le nom réponde.

L'installation de l'application continue sur la machine pendant 5 à 10 minutes (construction de l'image
Docker). Pour la suivre : Outputs → **Console** (ouvre un terminal Session Manager dans le navigateur), puis :

```bash
sudo tail -f /var/log/studio-data-installation.log      # jusqu'à « == terminé »
cd /home/ubuntu/site/studio-data-plateforme
sudo docker compose ps                                  # mode demo : postgres, api, caddy en running (healthy)
sudo ./deploiement/aws/composer.sh ps                   # mode entreprise : api, caddy
curl -s http://127.0.0.1:8430/api/sante                 # {"ok":true,…}
```

Puis ouvrir l'URL de l'onglet Outputs : identifiant `admin`, le mot de passe choisi. Premier geste : **Mon
compte → changer le mot de passe**, puis **Utilisateurs** et **Espaces** pour l'équipe.

Sans jeton GitHub, la machine est prête mais le dépôt n'est pas cloné. Dans le terminal Session Manager :

```bash
sudo -u ubuntu git clone --branch claude/studio-data-v3 https://github.com/nicolas1kowalski-blip/site.git /home/ubuntu/site
sudo /usr/local/bin/studio-data-installer
```

## 3. Exploiter

- **Terminal** : toujours par Session Manager (console EC2 → instance → Connect → Session Manager, ou le lien
  Outputs). Tout est tracé dans CloudTrail ; aucune clé à distribuer, aucun port ouvert.
- **Sauvegardes** : chaque nuit à 3 h, `deploiement/aws/sauvegarder-aws.sh` archive le référentiel (pg_dump du
  conteneur ou de RDS) et le volume des données, puis copie le tout dans le compartiment S3 (journal :
  `/var/log/studio-data-sauvegarde.log`). En mode entreprise, RDS garde en plus ses propres instantanés 7 jours.
- **Restaurer** : récupérer l'archive voulue (`aws s3 cp s3://<compartiment>/postgres-DATE.sql.gz .`) puis
  suivre la procédure de restauration du guide Oracle (`deploiement/oracle-cloud.md`, section 3) ; pour RDS,
  `gunzip -c postgres-DATE.sql.gz | docker run --rm -i postgres:17-alpine psql "$SD_POSTGRES_URL"`.
- **Mises à jour** : dans le terminal, `cd /home/ubuntu/site && sudo -u ubuntu git pull` (le jeton GitHub est
  redemandé), puis `sudo /usr/local/bin/studio-data-installer` : l'image est reconstruite et l'API redémarre
  avec ses migrations.
- **Supervision** : Route 53 Health Check ou CloudWatch Synthetics sur `https://votre-domaine/api/sante` ; les
  journaux Docker sont lisibles avec `sudo docker compose logs --since 1h api`.
- **Supprimer** : CloudFormation → Delete stack. Le compartiment S3 et l'instantané final de RDS sont conservés
  volontairement (politiques `Retain` et `Snapshot`).

## 4. Vers l'architecture d'entreprise complète

Ce que la pile fait déjà correspond aux règles habituelles d'un compte d'entreprise : réseau privé pour la base,
chiffrement au repos (EBS, RDS, S3) et en transit (HTTPS, TLS vers RDS vérifié par le certificat d'Amazon),
accès administrateur tracé sans SSH, sauvegardes automatiques hors machine, IAM au plus juste.

Les étapes suivantes, quand l'application passe en production dans l'entreprise :

| Besoin | Réponse AWS | Ce que l'application demande |
|---|---|---|
| Authentification par l'annuaire (SSO) | Cognito ou IAM Identity Center en OpenID Connect | remplacer `api/src/authentification` par un fournisseur OIDC (contrat : poser `request.contexte`) — prévu au plan |
| Certificat et domaine gérés | Route 53 + Application Load Balancer + ACM devant la machine | Caddy devient inutile ; l'API écoute sur 8430 derrière l'ALB |
| Secrets hors des fichiers | Secrets Manager pour les mots de passe de base et d'admin | lire `SD_POSTGRES_URL` depuis le secret au démarrage (script de lancement) |
| Journaux centralisés | agent CloudWatch sur la machine (journaux Docker) | rien : l'API journalise sur la sortie standard |
| Reprise sur une autre machine | AMI de la machine + volume de données restauré depuis S3, ou EFS pour le dossier `/donnees` | rien ; DuckDB reste mono-écrivain, donc une seule instance d'API à la fois |
| Sources d'entreprise | accès en lecture aux bases (RDS, Redshift) et à S3 depuis DuckDB | connecteurs, aujourd'hui dans l'application classique, à porter dans l'API |

## Pourquoi une seule machine et pas des conteneurs gérés (ECS, EKS) ?

Les données de travail sont dans DuckDB, une base fichier très rapide mais **à un seul écrivain**. Une seule
instance d'API doit y accéder, sur un disque local rapide. Une machine EC2 avec un disque gp3 est donc la bonne
unité : simple, économique, et suffisante pour plusieurs dizaines d'utilisateurs. Si le besoin dépasse une
machine, la voie est un espace de travail par machine (le référentiel PostgreSQL reste partagé), pas la
multiplication des conteneurs.
