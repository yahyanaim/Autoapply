#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_DIRECTORY:?BACKUP_DIRECTORY is required}"

umask 077
mkdir -p "$BACKUP_DIRECTORY"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_path="$BACKUP_DIRECTORY/applyai-$timestamp.dump"
temporary_path="$backup_path.partial"

cleanup() {
  rm -f "$temporary_path"
}
trap cleanup EXIT INT TERM

pg_dump \
  --dbname "$DATABASE_URL" \
  --format custom \
  --no-owner \
  --no-acl \
  --file "$temporary_path"

pg_restore --list "$temporary_path" >/dev/null
mv "$temporary_path" "$backup_path"
shasum -a 256 "$backup_path" > "$backup_path.sha256"

echo "Backup created: $backup_path"
