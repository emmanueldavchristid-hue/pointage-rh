#!/bin/sh
# Sauvegarde manuelle immédiate (en plus de la sauvegarde automatique quotidienne)
set -e
cd "$(dirname "$0")/../.."
STAMP=$(date +%Y-%m-%dT%H-%M-%S)
docker compose exec -T db pg_dump -U pointage -Fc pointage > "deploy/backups/manuel-$STAMP.dump"
echo "Sauvegarde : deploy/backups/manuel-$STAMP.dump"
