#!/usr/bin/env bash
# Sauvegarde nocturne sur AWS (à lancer depuis le dossier studio-data-plateforme) :
#   - le référentiel PostgreSQL : pg_dump du conteneur local (mode demo) ou de la base externe RDS (mode entreprise,
#     en plus des instantanés automatiques de RDS) ;
#   - le volume des données (bases DuckDB, fichiers déposés) ;
#   - puis copie du dossier ~/sauvegardes vers le compartiment S3 indiqué par SD_SAUVEGARDES_S3 dans .env.
# Planifié par la pile CloudFormation dans /etc/cron.d/studio-data-sauvegarde (3 h du matin).
set -euo pipefail

dossierSauvegardes="${SD_DOSSIER_SAUVEGARDES:-/home/ubuntu/sauvegardes}"
joursConserves="${SD_JOURS_SAUVEGARDES:-14}"
horodatage="$(date +%F_%H-%M)"
volumeDonnees="$(basename "$PWD")_donnees"

# Les variables du fichier .env (SD_POSTGRES_URL, SD_SAUVEGARDES_S3…) ; les commentaires en fin de ligne sont ignorés.
set -a
# shellcheck disable=SC1091
. ./.env
set +a

mkdir -p "$dossierSauvegardes"
if [ -n "${SD_POSTGRES_URL:-}" ]; then
    echo "[$horodatage] sauvegarde de la base externe (pg_dump)…"
    docker run --rm postgres:17-alpine pg_dump "$SD_POSTGRES_URL" | gzip > "$dossierSauvegardes/postgres-$horodatage.sql.gz"
else
    echo "[$horodatage] sauvegarde du conteneur PostgreSQL…"
    docker compose exec -T postgres pg_dump -U studio studio_data | gzip > "$dossierSauvegardes/postgres-$horodatage.sql.gz"
fi
echo "[$horodatage] sauvegarde des données (DuckDB et fichiers)…"
docker run --rm -v "$volumeDonnees":/donnees:ro -v "$dossierSauvegardes":/sortie alpine \
    tar czf "/sortie/donnees-$horodatage.tgz" -C / donnees
find "$dossierSauvegardes" -name '*.gz' -mtime +"$joursConserves" -delete -o -name '*.tgz' -mtime +"$joursConserves" -delete

if [ -n "${SD_SAUVEGARDES_S3:-}" ]; then
    echo "[$horodatage] copie vers $SD_SAUVEGARDES_S3…"
    aws s3 sync "$dossierSauvegardes" "$SD_SAUVEGARDES_S3/" --only-show-errors
fi
echo "[$horodatage] terminé : $(du -sh "$dossierSauvegardes" | cut -f1) dans $dossierSauvegardes"
