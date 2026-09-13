#!/usr/bin/env bash
# Raccourci « docker compose » pour le mode base externe (Amazon RDS) : même dossier de projet que
# docker-compose.yml, donc mêmes volumes (studio-data-plateforme_donnees) et même fichier .env.
#   ./deploiement/aws/composer.sh up -d --build
#   ./deploiement/aws/composer.sh logs -f api
#   ./deploiement/aws/composer.sh ps
set -euo pipefail
racine="$(cd "$(dirname "$0")/../.." && pwd)"
exec docker compose --project-directory "$racine" -f "$racine/deploiement/aws/docker-compose.rds.yml" "$@"
