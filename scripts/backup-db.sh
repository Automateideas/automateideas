#!/usr/bin/env bash
# Backs up the Postgres database to backups/<timestamp>.dump (pg_dump custom
# format: compressed, restorable table by table) and keeps the newest 14.
#
#   DATABASE_URL=postgres://... scripts/backup-db.sh        # any server
#   scripts/backup-db.sh                                     # local docker compose database
#
# Restore: see docs/operations.md. Copy backups off this machine (e.g. to
# private object storage) — a backup on the same disk isn't a backup.
set -euo pipefail

KEEP="${KEEP:-14}"
DIR="${BACKUP_DIR:-backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$DIR"
OUT="$DIR/$STAMP.dump"

if [[ -n "${DATABASE_URL:-}" ]]; then
  pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" --file="$OUT"
else
  docker compose exec -T postgres pg_dump --format=custom --no-owner -U app hrms > "$OUT"
fi

# A dump that can't be listed is broken: fail loudly rather than keep it.
if command -v pg_restore >/dev/null 2>&1; then
  pg_restore --list "$OUT" > /dev/null
else
  docker compose exec -T postgres pg_restore --list < "$OUT" > /dev/null
fi

echo "Backup written: $OUT ($(du -h "$OUT" | cut -f1))"
ls -1t "$DIR"/*.dump | tail -n +"$((KEEP + 1))" | xargs -r rm --
