#!/usr/bin/env bash
# =====================================================================
# Imprime una "firma" estable del esquema public: una línea por columna,
# constraint, índice y policy. Sirve para comparar ANTES y DESPUÉS de una
# migración y demostrar que sólo hubo ALTAS.
#
#   ./scripts/db-schema-signature.sh > antes.txt
#   # ... aplicar migraciones ...
#   ./scripts/db-schema-signature.sh > despues.txt
#   diff antes.txt despues.txt        # sólo deben aparecer líneas '>'
#
# O directamente:  ./scripts/db-verify-additive.sh
# =====================================================================
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ -z "${DATABASE_URL:-}" ]]; then
  for envfile in .env.local .env; do
    if [[ -f "$envfile" ]]; then set -a; . "./$envfile"; set +a; break; fi
  done
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: falta DATABASE_URL" >&2; exit 1
fi

psql "$DATABASE_URL" -tA -F'|' -v ON_ERROR_STOP=1 <<'SQL'
select 'COLUMN|' || c.table_name || '.' || c.column_name
       || '|' || c.data_type
       || coalesce('(' || c.character_maximum_length || ')', '')
       || coalesce('(' || c.numeric_precision || ',' || c.numeric_scale || ')', '')
       || '|null=' || c.is_nullable
       || '|default=' || coalesce(c.column_default, '-')
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name
 where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
 order by 1;
SQL

psql "$DATABASE_URL" -tA -F'|' -v ON_ERROR_STOP=1 <<'SQL'
select 'CONSTRAINT|' || rel.relname || '|' || con.conname
       || '|' || con.contype::text || '|' || pg_get_constraintdef(con.oid)
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
 where ns.nspname = 'public'
 order by 1;
SQL

psql "$DATABASE_URL" -tA -F'|' -v ON_ERROR_STOP=1 <<'SQL'
select 'INDEX|' || tablename || '|' || indexname || '|' || indexdef
  from pg_indexes where schemaname = 'public' order by 1;
SQL

psql "$DATABASE_URL" -tA -F'|' -v ON_ERROR_STOP=1 <<'SQL'
select 'POLICY|' || tablename || '|' || policyname || '|' || cmd
  from pg_policies where schemaname = 'public' order by 1;
SQL

psql "$DATABASE_URL" -tA -F'|' -v ON_ERROR_STOP=1 <<'SQL'
select 'RLS|' || relname || '|' || relrowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' order by 1;
SQL

psql "$DATABASE_URL" -tA -F'|' -v ON_ERROR_STOP=1 <<'SQL'
select 'ENUM|' || t.typname || '|' || string_agg(e.enumlabel, ',' order by e.enumsortorder)
  from pg_type t
  join pg_enum e on e.enumtypid = t.oid
  join pg_namespace n on n.oid = t.typnamespace
 where n.nspname = 'public'
 group by t.typname order by 1;
SQL
