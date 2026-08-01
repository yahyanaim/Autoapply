#!/usr/bin/env bash
set -euo pipefail

: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"
: "${RESTORE_CONFIRMATION:?RESTORE_CONFIRMATION is required}"

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file does not exist: $BACKUP_FILE" >&2
  exit 1
fi

checksum_file="$BACKUP_FILE.sha256"
if [[ ! -f "$checksum_file" ]]; then
  echo "Backup checksum does not exist: $checksum_file" >&2
  exit 1
fi

expected_checksum="$(awk 'NR == 1 { print $1 }' "$checksum_file")"
if [[ ! "$expected_checksum" =~ ^[[:xdigit:]]{64}$ ]]; then
  echo "Backup checksum is malformed: $checksum_file" >&2
  exit 1
fi

actual_checksum="$(shasum -a 256 "$BACKUP_FILE" | awk '{ print $1 }')"
normalized_expected_checksum="$(
  printf '%s' "$expected_checksum" | tr '[:upper:]' '[:lower:]'
)"
if [[ "$actual_checksum" != "$normalized_expected_checksum" ]]; then
  echo "Backup checksum verification failed: $BACKUP_FILE" >&2
  exit 1
fi

pg_restore --list "$BACKUP_FILE" >/dev/null

database_name="$(
  psql "$RESTORE_DATABASE_URL" \
    --no-psqlrc \
    --tuples-only \
    --no-align \
    --command 'SELECT current_database()'
)"
expected_confirmation="restore:$database_name"

if [[ "$RESTORE_CONFIRMATION" != "$expected_confirmation" ]]; then
  echo "Refusing restore. Set RESTORE_CONFIRMATION=$expected_confirmation" >&2
  exit 2
fi

pg_restore \
  --dbname "$RESTORE_DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --single-transaction \
  "$BACKUP_FILE"

echo "Restore completed for database: $database_name"
