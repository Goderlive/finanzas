#!/usr/bin/env bash
# =====================================================================
# Corre la suite de pruebas SQL contra una BASE SOMBRA: una copia
# desechable de producción levantada en Docker.
#
#   ./scripts/db-test.sh                    # usa el backup más reciente
#   ./scripts/db-test.sh backups/2026...    # usa un backup concreto
#
# Nunca toca la base real. Cada caso de prueba termina en ROLLBACK, así
# que la sombra tampoco se ensucia y puede reusarse.
# =====================================================================
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

CONTAINER=finanzas-shadow
PORT=55432
BACKUP="${1:-$(ls -1d backups/*/ 2>/dev/null | tail -1)}"

if [[ -z "$BACKUP" || ! -f "$BACKUP/05_full.dump" ]]; then
  echo "ERROR: no encuentro un backup con 05_full.dump." >&2
  echo "Corre ./scripts/db-backup.sh primero." >&2
  exit 1
fi
echo "==> Backup: $BACKUP"

SERVER_MAJOR=17
if [[ -f "$BACKUP/manifest.txt" ]]; then
  detected="$(grep -oE 'PostgreSQL major [0-9]+' "$BACKUP/manifest.txt" 2>/dev/null | grep -oE '[0-9]+' | head -1 || true)"
  [[ -n "$detected" ]] && SERVER_MAJOR="$detected"
fi

echo "==> Levantando sombra postgres:$SERVER_MAJOR en el puerto $PORT"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=shadow -e POSTGRES_DB=finanzas \
  -p "$PORT":5432 "postgres:$SERVER_MAJOR" >/dev/null

for _ in $(seq 1 60); do
  docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

dex() { docker exec "$CONTAINER" "$@"; }
dpsql() { dex psql -U postgres -d finanzas "$@"; }

echo "==> Restaurando"
dpsql -q \
  -c "create schema if not exists auth;" \
  -c "create extension if not exists pgcrypto;
      create extension if not exists citext;
      create extension if not exists pg_trgm;" >/dev/null
# El rol `authenticated` sólo existe en Supabase; los GRANT lo necesitan.
dpsql -q -c "do \$\$ begin create role authenticated; exception when duplicate_object then null; end \$\$;" >/dev/null

docker cp "$BACKUP/05_full.dump" "$CONTAINER:/tmp/full.dump" >/dev/null
dex pg_restore --username postgres --dbname finanzas \
  --no-owner --no-privileges --disable-triggers /tmp/full.dump 2>&1 \
  | grep -viE "warning|already exists" || true

# El backup restaurado ya trae todo lo anterior al lote 20260728; de ahí en
# adelante se aplican todas, para que una migración nueva entre a la suite
# sin tener que tocar este script.
echo "==> Aplicando migraciones desde el lote 20260728"
for f in supabase/migrations/*.sql; do
  stamp="$(basename "$f")"; stamp="${stamp%%_*}"
  (( 10#${stamp:0:8} < 20260728 )) && continue
  echo "    $(basename "$f")"
  docker exec -i "$CONTAINER" psql -U postgres -d finanzas -v ON_ERROR_STOP=1 -q < "$f" >/dev/null
done

echo "==> Instalando el esquema repair"
docker exec -i "$CONTAINER" psql -U postgres -d finanzas -v ON_ERROR_STOP=1 -q \
  < supabase/repair/20260728_repair_signs.sql >/dev/null

echo ""
docker cp supabase/tests/20260728_signs_and_transfers_test.sql "$CONTAINER:/tmp/tests.sql" >/dev/null
if docker exec "$CONTAINER" psql -U postgres -d finanzas -v ON_ERROR_STOP=1 -f /tmp/tests.sql 2>&1 \
     | grep -vE "^SET$|^BEGIN$|^ROLLBACK$|^DO$|already exists, skipping" \
     | sed 's|psql:/tmp/tests.sql:[0-9]*: ||'; then
  echo ""
  echo "La sombra sigue en pie para inspeccionarla:"
  echo "  docker exec -it $CONTAINER psql -U postgres -d finanzas"
  echo "  docker rm -f $CONTAINER    # cuando termines"
else
  echo ""
  echo "PRUEBAS FALLIDAS" >&2
  exit 1
fi
