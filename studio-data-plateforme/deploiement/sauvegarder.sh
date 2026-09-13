#!/usr/bin/env bash
# Sauvegarde nocturne de la plateforme Studio Data (à lancer depuis le dossier studio-data-plateforme) :
#   - le référentiel PostgreSQL (pg_dump compressé) ;
#   - le volume des données (bases DuckDB, fichiers déposés, Parquet).
# Les archives vont dans ~/sauvegardes et les plus anciennes sont supprimées après 14 jours.
# Exemple de planification (chaque nuit à 3 h) :  crontab -e
#   0 3 * * * cd ~/site/studio-data-plateforme && ./deploiement/sauvegarder.sh >> ~/sauvegardes/journal.log 2>&1
set -euo pipefail

dossierSauvegardes="${SD_DOSSIER_SAUVEGARDES:-$HOME/sauvegardes}"
joursConserves="${SD_JOURS_SAUVEGARDES:-14}"
horodatage="$(date +%F_%H-%M)"
# Docker compose préfixe les volumes du nom du dossier du projet (ici « studio-data-plateforme »).
volumeDonnees="$(basename "$PWD")_donnees"

mkdir -p "$dossierSauvegardes"
echo "[$horodatage] sauvegarde du référentiel PostgreSQL…"
docker compose exec -T postgres pg_dump -U studio studio_data | gzip > "$dossierSauvegardes/postgres-$horodatage.sql.gz"
echo "[$horodatage] sauvegarde des données (DuckDB et fichiers)…"
docker run --rm -v "$volumeDonnees":/donnees:ro -v "$dossierSauvegardes":/sortie alpine \
    tar czf "/sortie/donnees-$horodatage.tgz" -C / donnees
find "$dossierSauvegardes" -name '*.gz' -mtime +"$joursConserves" -delete -o -name '*.tgz' -mtime +"$joursConserves" -delete
echo "[$horodatage] terminé : $(du -sh "$dossierSauvegardes" | cut -f1) dans $dossierSauvegardes"
