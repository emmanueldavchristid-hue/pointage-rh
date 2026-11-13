#!/bin/sh
# Restauration d'une sauvegarde : ./deploy/scripts/restore.sh deploy/backups/fichier.dump
# ATTENTION : remplace intégralement les données actuelles (une sauvegarde de sécurité est faite avant).
set -e
FILE="$1"
[ -f "$FILE" ] || { echo "Usage : $0 chemin/vers/sauvegarde.dump"; exit 1; }
cd "$(dirname "$0")/../.."
printf "Restaurer %s et REMPLACER les données actuelles ? Tapez OUI : " "$FILE"; read ans; [ "$ans" = "OUI" ] || exit 1
STAMP=$(date +%Y-%m-%dT%H-%M-%S)
docker compose exec -T db pg_dump -U pointage -Fc pointage > "deploy/backups/avant-restauration-$STAMP.dump"
docker compose stop app
docker compose exec -T db psql -U pointage -d postgres -c "DROP DATABASE pointage WITH (FORCE);" -c "CREATE DATABASE pointage OWNER pointage;"
docker compose exec -T db pg_restore -U pointage -d pointage --no-owner < "$FILE"
docker compose start app
echo "Restauration terminée. Sauvegarde de sécurité : deploy/backups/avant-restauration-$STAMP.dump"
