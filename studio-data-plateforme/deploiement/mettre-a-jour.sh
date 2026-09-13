#!/usr/bin/env bash
# Mise à jour de Studio Data sur un serveur déjà installé (à lancer depuis le dossier studio-data-plateforme).
#
#   ./deploiement/mettre-a-jour.sh
#
# Le script fait, dans l'ordre, ce qu'on oublie facilement à la main :
#   1. il note le commit actuellement installé ;
#   2. il récupère le code de la branche (le jeton GitHub est demandé si le dépôt est privé et non mémorisé) ;
#   3. il s'arrête avec un message clair si la récupération n'a rien rapporté ;
#   4. il reconstruit l'image en y inscrivant le numéro de commit et la date ;
#   5. il redémarre, attend la réponse de l'API et vérifie que le serveur annonce bien le nouveau commit.
#
# C'est ce dernier point qui évite le piège le plus courant : un « git pull » silencieusement en échec
# (jeton expiré), suivi d'une reconstruction qui remet en service… exactement le même code qu'avant.
#
# Options par variables d'environnement :
#   SD_JETON_GITHUB   jeton d'accès GitHub (portée repo), pour ne pas qu'il soit demandé ;
#   SD_BRANCHE        branche à déployer (par défaut claude/studio-data-v3) ;
#   SD_SANS_SAUVEGARDE=1   saute la sauvegarde préalable.
set -euo pipefail

BRANCHE="${SD_BRANCHE:-claude/studio-data-v3}"
PLATEFORME="$(cd "$(dirname "$0")/.." && pwd)"
DEPOT="$(cd "$PLATEFORME/.." && pwd)"

gras() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✔\033[0m %s\n' "$*"; }
attention() { printf '  \033[33m!\033[0m %s\n' "$*"; }
echec() { printf '  \033[31m✘\033[0m %s\n' "$*"; exit 1; }

cd "$PLATEFORME"
[ -f docker-compose.yml ] || echec "Lancez ce script depuis le dossier studio-data-plateforme."
[ -f .env ] || echec "Pas de fichier .env : la plateforme n'a jamais été installée ici (voir deploiement/installer.sh)."

# Le mode « base externe » (Amazon RDS) a son propre fichier compose : on le reconnaît à SD_POSTGRES_URL.
if grep -q '^SD_POSTGRES_URL=' .env; then
    composer() { ./deploiement/aws/composer.sh "$@"; }
    ok "mode base externe (Amazon RDS) : deploiement/aws/docker-compose.rds.yml"
else
    composer() { docker compose "$@"; }
    ok "mode base sur la machine : docker-compose.yml"
fi

# ---- 1. Sauvegarde préalable --------------------------------------------------------------------------------
gras "1/5 Sauvegarde avant mise à jour"
if [ "${SD_SANS_SAUVEGARDE:-}" = "1" ]; then
    attention "sauvegarde sautée (SD_SANS_SAUVEGARDE=1)"
elif [ -x deploiement/aws/sauvegarder-aws.sh ] && grep -q '^SD_SAUVEGARDES_S3=' .env; then
    ./deploiement/aws/sauvegarder-aws.sh && ok "sauvegarde envoyée dans S3"
else
    ./deploiement/sauvegarder.sh && ok "sauvegarde écrite sur la machine"
fi

# ---- 2. Récupération du code --------------------------------------------------------------------------------
gras "2/5 Récupération du code ($BRANCHE)"
commitAvant="$(git -C "$DEPOT" rev-parse HEAD)"
echo "  commit installé : $(git -C "$DEPOT" log -1 --format='%h %s' "$commitAvant")"
# Le jeton n'est utilisé que le temps de la commande et n'est écrit nulle part.
# GIT_TERMINAL_PROMPT=0 : sans identifiants mémorisés, Git échoue tout de suite au lieu de bloquer sur une
# demande de mot de passe — c'est ainsi qu'on sait s'il faut réclamer un jeton.
if GIT_TERMINAL_PROMPT=0 git -C "$DEPOT" ls-remote --exit-code origin "$BRANCHE" >/dev/null 2>&1; then
    git -C "$DEPOT" pull -q origin "$BRANCHE"
else
    if [ -z "${SD_JETON_GITHUB:-}" ]; then
        echo "  Le dépôt est privé : un jeton GitHub est nécessaire (Settings → Developer settings → Tokens classic, portée repo)."
        read -r -s -p "  Jeton GitHub : " SD_JETON_GITHUB </dev/tty; echo
    fi
    git -C "$DEPOT" -c "http.extraheader=Authorization: token $SD_JETON_GITHUB" pull -q origin "$BRANCHE" ||
        echec "récupération impossible : jeton refusé ou expiré. Rien n'a été modifié."
fi
commitApres="$(git -C "$DEPOT" rev-parse HEAD)"
construitLe="$(date -u +%FT%TZ)"

if [ "$commitAvant" = "$commitApres" ]; then
    ok "déjà à jour : $(git -C "$DEPOT" log -1 --format='%h %s')"
    echo "  Rien à reconstruire. Si l'application semble pourtant ancienne, videz le cache du navigateur"
    echo "  (Ctrl+Maj+R) et comparez : curl -s http://127.0.0.1:8430/api/sante"
    exit 0
fi
ok "nouveau code : $(git -C "$DEPOT" log -1 --format='%h %s')"
echo "  $(git -C "$DEPOT" rev-list --count "$commitAvant..$commitApres") commit(s) récupéré(s)"

# ---- 3. Reconstruction --------------------------------------------------------------------------------------
gras "3/5 Reconstruction de l'image (5 à 10 minutes)"
export SD_REVISION="${commitApres:0:12}"
export SD_CONSTRUIT_LE="$construitLe"
composer up -d --build

# ---- 4. Attente de l'API ------------------------------------------------------------------------------------
gras "4/5 Redémarrage"
printf '  attente de la réponse de l’API'
santeJson=""
for tentative in $(seq 1 60); do
    santeJson="$(curl -fsS http://127.0.0.1:8430/api/sante 2>/dev/null || true)"
    if [ -n "$santeJson" ]; then echo; ok "l'API répond"; break; fi
    printf '.'; sleep 5
done
[ -n "$santeJson" ] || { echo; echec "l'API ne répond pas : composer logs -f api (les migrations peuvent être en cause)"; }

# ---- 5. Vérification de la version en service ---------------------------------------------------------------
gras "5/5 Vérification"
revisionServie="$(printf '%s' "$santeJson" | sed -n 's/.*"revision":"\([^"]*\)".*/\1/p')"
if [ "$revisionServie" = "$SD_REVISION" ]; then
    ok "le serveur exécute bien le commit $revisionServie (construit le $construitLe)"
else
    attention "le serveur annonce « ${revisionServie:-inconnue} » au lieu de « $SD_REVISION »"
    attention "l'ancien conteneur est peut-être resté : composer up -d --force-recreate"
fi
echo
echo "  Santé   : curl -s http://127.0.0.1:8430/api/sante"
if grep -q '^SD_POSTGRES_URL=' .env; then
    echo "  Journal : ./deploiement/aws/composer.sh logs -f api"
else
    echo "  Journal : docker compose logs -f api"
fi
echo "  Côté navigateur, forcez le rechargement (Ctrl+Maj+R) pour abandonner l'ancienne page en cache."
