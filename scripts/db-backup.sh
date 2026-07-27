#!/usr/bin/env bash
# =====================================================================
# Backup completo de la base de datos ANTES de aplicar migraciones.
#
#   ./scripts/db-backup.sh [directorio-destino]
#
# Produce en backups/<timestamp>/:
#   01_roles.sql          roles del cluster (best effort, vía Supabase CLI)
#   02_schema.sql         DDL de public + auth (schema-only, legible)
#   03_data_public.sql    datos de public como INSERTs (legible y diffeable)
#   04_data_auth.sql      auth.users / auth.identities (INSERTs)
#   05_full.dump          dump binario -Fc de public + auth  <- artefacto de restore
#   00_signature.txt      firma de columnas (para probar que nada se borró)
#   manifest.txt          conteos de filas, tamaños y sha256
#
# El servidor es PostgreSQL 17; si el pg_dump local es más viejo, el script
# usa automáticamente la imagen docker postgres:<major>.
# =====================================================================
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# --- Credenciales -----------------------------------------------------
if [[ -z "${DATABASE_URL:-}" ]]; then
  for envfile in .env.local .env; do
    if [[ -f "$envfile" ]]; then
      set -a; . "./$envfile"; set +a
      break
    fi
  done
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: falta DATABASE_URL (ponlo en .env.local o expórtalo)." >&2
  exit 1
fi

OUT_ROOT="${1:-backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$OUT_ROOT/$STAMP"
mkdir -p "$OUT"
chmod 700 "$OUT_ROOT" "$OUT"

echo "==> Destino: $OUT"

# --- Conectividad y versión del servidor ------------------------------
SERVER_NUM="$(psql "$DATABASE_URL" -tAc 'show server_version_num')"
SERVER_MAJOR="$(( SERVER_NUM / 10000 ))"
echo "==> Servidor PostgreSQL major $SERVER_MAJOR"

# --- Elegir pg_dump compatible (local si sirve, docker si no) ---------
LOCAL_MAJOR=0
if command -v pg_dump >/dev/null 2>&1; then
  LOCAL_MAJOR="$(pg_dump --version | grep -oE '[0-9]+' | head -1)"
fi

DOCKER_ENV_FILE=""
cleanup() { [[ -n "$DOCKER_ENV_FILE" ]] && rm -f "$DOCKER_ENV_FILE"; }
trap cleanup EXIT

if (( LOCAL_MAJOR >= SERVER_MAJOR )); then
  echo "==> Usando pg_dump local (major $LOCAL_MAJOR)"
  pg_dump_run() { pg_dump "$DATABASE_URL" "$@"; }
else
  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: pg_dump local es $LOCAL_MAJOR y el servidor es $SERVER_MAJOR." >&2
    echo "       Instala postgresql-client-$SERVER_MAJOR o Docker." >&2
    exit 1
  fi
  echo "==> pg_dump local ($LOCAL_MAJOR) < servidor ($SERVER_MAJOR): usando docker postgres:$SERVER_MAJOR"
  docker pull -q "postgres:$SERVER_MAJOR" >/dev/null
  # La URL viaja por env-file (600) para no aparecer en la línea de comandos.
  DOCKER_ENV_FILE="$(mktemp)"; chmod 600 "$DOCKER_ENV_FILE"
  printf 'PGURL=%s\n' "$DATABASE_URL" > "$DOCKER_ENV_FILE"
  # Shell dentro del contenedor para que $PGURL se expanda allí, no aquí.
  pg_dump_run() {
    local quoted=() a
    for a in "$@"; do quoted+=("$(printf '%q' "$a")"); done
    docker run --rm --network host --env-file "$DOCKER_ENV_FILE" \
      "postgres:$SERVER_MAJOR" \
      sh -c "pg_dump \"\$PGURL\" ${quoted[*]}"
  }
fi

# --- 00 · Firma del esquema (prueba de que nada se borra) -------------
echo "==> 00_signature.txt (firma de columnas de public)"
./scripts/db-schema-signature.sh > "$OUT/00_signature.txt"

# --- 01 · Roles (best effort) -----------------------------------------
echo "==> 01_roles.sql"
if command -v supabase >/dev/null 2>&1; then
  supabase db dump --db-url "$DATABASE_URL" --role-only -f "$OUT/01_roles.sql" \
    || echo "  (aviso: no se pudieron volcar los roles; no es bloqueante)"
else
  echo "  (aviso: Supabase CLI no disponible; se omiten los roles)"
fi

# --- 01b · Extensiones -------------------------------------------------
# pg_dump con --schema NO emite las CREATE EXTENSION (son objetos de base,
# no de esquema). Sin esto un restore desde 02/05 queda incompleto:
# citext y gin_trgm_ops viven en public y los usa household_invitations
# y el índice trigram de transactions.
echo "==> 01b_extensions.sql"
psql "$DATABASE_URL" -tA -v ON_ERROR_STOP=1 -c "
  select 'create extension if not exists ' || quote_ident(e.extname)
         || ' with schema ' || quote_ident(n.nspname) || ';'
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
   where e.extname <> 'plpgsql'
   order by 1;" > "$OUT/01b_extensions.sql"

# --- 02 · Esquema (DDL legible) ---------------------------------------
echo "==> 02_schema.sql"
pg_dump_run --schema-only --no-owner --no-privileges \
  --schema=public --schema=auth > "$OUT/02_schema.sql"

# --- 03 · Datos de public (INSERTs legibles) --------------------------
echo "==> 03_data_public.sql"
pg_dump_run --data-only --no-owner --no-privileges \
  --column-inserts --rows-per-insert=100 \
  --schema=public > "$OUT/03_data_public.sql"

# --- 04 · Datos de auth (usuarios) ------------------------------------
echo "==> 04_data_auth.sql"
pg_dump_run --data-only --no-owner --no-privileges --column-inserts \
  --table=auth.users --table=auth.identities > "$OUT/04_data_auth.sql"

# --- 05 · Dump binario: el artefacto real de restore ------------------
echo "==> 05_full.dump (custom format)"
pg_dump_run --format=custom --no-owner --no-privileges \
  --schema=public --schema=auth > "$OUT/05_full.dump"

# --- Manifiesto y verificación ----------------------------------------
echo "==> manifest.txt"
{
  echo "fecha:      $(date -Is)"
  echo "servidor:   PostgreSQL major $SERVER_MAJOR"
  echo "host:       $(psql "$DATABASE_URL" -tAc 'select inet_server_addr()' 2>/dev/null || echo n/a)"
  echo "database:   $(psql "$DATABASE_URL" -tAc 'select current_database()')"
  echo
  echo "--- conteo de filas (public) ---"
  psql "$DATABASE_URL" -tA -F$'\t' -c "
    select relname, n_live_tup
      from pg_stat_user_tables
     where schemaname = 'public'
     order by relname;"
  echo
  echo "--- conteo exacto de tablas clave ---"
  psql "$DATABASE_URL" -tA -F$'\t' -c "
    select 'accounts',      count(*) from public.accounts
    union all select 'transactions',   count(*) from public.transactions
    union all select 'investments',    count(*) from public.investments
    union all select 'price_snapshots',count(*) from public.price_snapshots
    union all select 'profiles',       count(*) from public.profiles
    union all select 'households',     count(*) from public.households;"
  echo
  echo "--- archivos ---"
  (cd "$OUT" && sha256sum ./* 2>/dev/null)
  echo
  (cd "$OUT" && ls -l)
} > "$OUT/manifest.txt"

# Sanity check: el dump binario debe poder listarse.
if command -v pg_restore >/dev/null 2>&1 && (( LOCAL_MAJOR >= SERVER_MAJOR )); then
  pg_restore --list "$OUT/05_full.dump" > /dev/null \
    && echo "==> 05_full.dump verificado (pg_restore --list OK)"
elif [[ -n "$DOCKER_ENV_FILE" ]]; then
  docker run --rm -v "$(cd "$OUT" && pwd):/b:ro" "postgres:$SERVER_MAJOR" \
    pg_restore --list /b/05_full.dump > /dev/null \
    && echo "==> 05_full.dump verificado (pg_restore --list OK)"
fi

for f in 02_schema.sql 03_data_public.sql 05_full.dump; do
  if [[ ! -s "$OUT/$f" ]]; then
    echo "ERROR: $f quedó vacío. NO apliques migraciones." >&2
    exit 1
  fi
done

echo
echo "===================================================================="
echo " Backup OK en: $OUT"
echo
echo " Para RESTAURAR todo (destructivo, borra el estado actual):"
echo "   psql \"\$DATABASE_URL\" -c 'drop schema public cascade; create schema public;'"
echo "   psql \"\$DATABASE_URL\" -f $OUT/01b_extensions.sql   # <- imprescindible, va primero"
echo "   pg_restore --dbname \"\$DATABASE_URL\" --no-owner --no-privileges \\"
echo "              --schema=public $OUT/05_full.dump"
echo
echo " Los .sql de datos (03/04) requieren triggers desactivados:"
echo "   psql \"\$DATABASE_URL\" -c 'set session_replication_role = replica;' -f ..."
echo " El 05_full.dump no tiene ese problema (restaura triggers al final)."
echo
echo " Para restaurar SOLO datos de una tabla:"
echo "   pg_restore --dbname \"\$DATABASE_URL\" --data-only --table=accounts \\"
echo "              $OUT/05_full.dump"
echo
echo " Recomendado además: Supabase Dashboard > Database > Backups,"
echo " toma un backup manual/PITR antes de migrar."
echo "===================================================================="
