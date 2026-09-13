#!/usr/bin/env bash
# Installation de Studio Data en une commande sur une machine Ubuntu neuve (Oracle Cloud, Google Cloud, OVH, poste Linux…).
#
#   Depuis la machine, connecté en SSH :
#     curl -fsSL -H "Authorization: token VOTRE_JETON_GITHUB" \
#       https://raw.githubusercontent.com/nicolas1kowalski-blip/site/claude/studio-data-v3/studio-data-plateforme/deploiement/installer.sh | bash
#   ou, si le script a été copié à la main :   bash installer.sh
#
# Le script pose trois questions (jeton GitHub, mot de passe administrateur, nom de domaine), puis :
#   1. installe Docker, Docker Compose et Git ;
#   2. ouvre les ports 80 et 443 dans le pare-feu de la machine (Oracle les ferme par défaut) ;
#   3. clone le dépôt (ou le met à jour s'il est déjà là) ;
#   4. écrit le fichier .env (mot de passe de base généré, cookie sécurisé selon HTTPS ou non) ;
#   5. construit et lance la plateforme, attend qu'elle réponde ;
#   6. planifie la sauvegarde nocturne à 3 h et ajoute un fichier d'échange (swap) sur les petites machines.
# Relançable sans risque : une étape déjà faite est sautée.
set -euo pipefail

DEPOT="github.com/nicolas1kowalski-blip/site.git"
BRANCHE="${SD_BRANCHE:-claude/studio-data-v3}"
DOSSIER="$HOME/site"
PLATEFORME="$DOSSIER/studio-data-plateforme"

gras() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✔\033[0m %s\n' "$*"; }
attention() { printf '  \033[33m!\033[0m %s\n' "$*"; }
demander() { # demander VARIABLE "question" [secret]
    local variable="$1" question="$2" secret="${3:-}"
    if [ -n "${!variable:-}" ]; then return; fi
    if [ -n "$secret" ]; then read -r -s -p "$question : " "$variable" </dev/tty; echo; else read -r -p "$question : " "$variable" </dev/tty; fi
}

gras "Studio Data — installation"
if [ "$(id -u)" = 0 ]; then attention "Lancez ce script avec votre utilisateur habituel (ubuntu), pas root."; exit 1; fi
if ! command -v apt-get >/dev/null; then attention "Ce script est prévu pour Ubuntu ou Debian."; exit 1; fi

# ---- Questions ---------------------------------------------------------------------------------------------
demander SD_JETON_GITHUB "Jeton GitHub (portée repo, pour cloner le dépôt privé)" secret
demander SD_ADMIN_MOT_DE_PASSE "Mot de passe de l'administrateur « admin » (12 caractères ou plus)" secret
while [ "${#SD_ADMIN_MOT_DE_PASSE}" -lt 12 ]; do attention "Trop court."; SD_ADMIN_MOT_DE_PASSE=""; demander SD_ADMIN_MOT_DE_PASSE "Mot de passe de l'administrateur « admin »" secret; done
demander SD_DOMAINE "Nom de domaine pointant vers cette machine (vide = HTTP sur l'adresse IP, pour un essai)"

# ---- 1. Docker ---------------------------------------------------------------------------------------------
gras "1/6 Docker, Docker Compose, Git"
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
    sudo apt-get update -qq
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker.io docker-compose-v2 git curl >/dev/null
fi
sudo usermod -aG docker "$USER"
ok "Docker $(docker --version | cut -d' ' -f3 | tr -d ,) prêt"

# ---- 2. Pare-feu et mémoire --------------------------------------------------------------------------------
gras "2/6 Pare-feu et mémoire"
if command -v iptables >/dev/null && sudo iptables -S INPUT | grep -q "REJECT"; then
    for port in 80 443; do
        sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 6 -p tcp --dport "$port" -j ACCEPT
    done
    if command -v netfilter-persistent >/dev/null; then sudo netfilter-persistent save >/dev/null 2>&1 || true; fi
    ok "ports 80 et 443 ouverts dans le pare-feu de la machine"
else
    ok "pas de pare-feu bloquant sur la machine"
fi
memoireMo=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$memoireMo" -lt 6000 ] && ! swapon --show | grep -q .; then
    sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
    ok "fichier d'échange de 4 Go ajouté (machine de ${memoireMo} Mo : nécessaire pour la construction)"
else
    ok "mémoire : ${memoireMo} Mo"
fi

# ---- 3. Dépôt ----------------------------------------------------------------------------------------------
gras "3/6 Code de l'application"
if [ -d "$DOSSIER/.git" ]; then
    git -C "$DOSSIER" -c "http.extraheader=Authorization: token $SD_JETON_GITHUB" pull -q origin "$BRANCHE"
    ok "dépôt mis à jour ($BRANCHE)"
else
    git -c "http.extraheader=Authorization: token $SD_JETON_GITHUB" clone -q --branch "$BRANCHE" "https://$DEPOT" "$DOSSIER"
    ok "dépôt cloné dans $DOSSIER"
fi
# Le jeton est gardé pour les mises à jour, lisible par vous seul.
git -C "$DOSSIER" config credential.helper "store --file $HOME/.studio-data-git"
printf 'https://x-access-token:%s@github.com\n' "$SD_JETON_GITHUB" > "$HOME/.studio-data-git" && chmod 600 "$HOME/.studio-data-git"

# ---- 4. Configuration --------------------------------------------------------------------------------------
gras "4/6 Configuration"
cd "$PLATEFORME"
if [ -f .env ]; then
    ok ".env déjà présent, conservé (supprimez-le pour repartir de zéro)"
else
    motDePasseBase=$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)
    if [ -n "$SD_DOMAINE" ]; then domaine="$SD_DOMAINE"; cookie=true; else domaine=":80"; cookie=false; fi
    {
        echo "POSTGRES_PASSWORD=$motDePasseBase"
        echo "SD_ADMIN_MOT_DE_PASSE=$SD_ADMIN_MOT_DE_PASSE"
        echo "SD_DOMAINE=$domaine"
        echo "SD_COOKIE_SECURISE=$cookie"
    } > .env
    chmod 600 .env
    ok ".env écrit (mot de passe de base généré)"
    [ -n "$SD_DOMAINE" ] || attention "sans domaine, l'accès se fait en HTTP : pour un essai seulement"
fi

# ---- 5. Lancement ------------------------------------------------------------------------------------------
gras "5/6 Construction et lancement (5 à 10 minutes la première fois)"
sg docker -c "docker compose up -d --build" 2>&1 | grep -Ev '^\s*$' | tail -3
printf '  attente de la réponse de l’API'
for tentative in $(seq 1 60); do
    if sg docker -c "docker compose exec -T api node -e \"fetch('http://127.0.0.1:8430/api/sante').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"" >/dev/null 2>&1; then
        echo; ok "l'API répond"; break
    fi
    printf '.'; sleep 5
    [ "$tentative" = 60 ] && { echo; attention "l'API ne répond pas encore : sg docker -c 'docker compose logs -f api'"; }
done

# ---- 6. Sauvegardes ----------------------------------------------------------------------------------------
gras "6/6 Sauvegarde nocturne"
chmod +x deploiement/sauvegarder.sh
ligneCron="0 3 * * * cd $PLATEFORME && ./deploiement/sauvegarder.sh >> $HOME/sauvegardes/journal.log 2>&1"
(crontab -l 2>/dev/null | grep -v 'deploiement/sauvegarder.sh' ; echo "$ligneCron") | crontab -
mkdir -p "$HOME/sauvegardes"
ok "chaque nuit à 3 h dans $HOME/sauvegardes (14 jours conservés)"

# ---- Résumé ------------------------------------------------------------------------------------------------
adresseIp=$(curl -fsS -4 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
gras "Terminé"
if [ -n "$SD_DOMAINE" ]; then
    echo "  Application : https://$SD_DOMAINE   (le certificat arrive dès que le domaine pointe vers $adresseIp)"
else
    echo "  Application : http://$adresseIp"
fi
echo "  Identifiant : admin — mot de passe : celui que vous venez de saisir (à changer dans « Mon compte »)"
echo "  État        : sg docker -c 'docker compose ps'      Journal : sg docker -c 'docker compose logs -f api'"
echo "  Mise à jour : relancer ce script, ou : cd $PLATEFORME && git pull && docker compose up -d --build"
echo "  (Déconnectez-vous et reconnectez-vous une fois pour utiliser docker sans « sg docker ».)"
