#!/usr/bin/env bash
# =====================================================================
# Fase 4 · Reparación de datos históricos de signo.
#
#   ./scripts/db-repair-signs.sh              # dry-run (no cambia nada)
#   ./scripts/db-repair-signs.sh --apply      # aplica, exige backup previo
#
# El dry-run imprime los cambios propuestos y el estado de los saldos.
# El modo --apply corre todo dentro de UNA transacción: si algo falla, no
# queda nada escrito. Es idempotente: una segunda corrida no encuentra
# nada que hacer.
# =====================================================================
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

APPLY=false
[[ "${1:-}" == "--apply" ]] && APPLY=true

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

PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -P pager=off)

echo "==> Instalando/actualizando el esquema repair (sólo funciones)"
"${PSQL[@]}" -q -f supabase/repair/20260728_repair_signs.sql

echo ""
echo "======================================================================"
echo " CAMBIOS PROPUESTOS"
echo "======================================================================"
"${PSQL[@]}" -c "
  select action        as \"Acción\",
         case when auto then 'sí' else 'MANUAL' end as \"Automático\",
         detail        as \"Detalle\",
         amount_now    as \"Ahora\",
         amount_after  as \"Después\"
    from repair.findings()
   order by auto desc, action;"

echo ""
echo "======================================================================"
echo " SALDOS ANTES"
echo "======================================================================"
"${PSQL[@]}" -c "select * from repair.balance_report();"

if [[ "$APPLY" != true ]]; then
  echo ""
  echo "Dry-run. No se cambió nada."
  echo "Para aplicar:  ./scripts/db-backup.sh && ./scripts/db-repair-signs.sh --apply"
  exit 0
fi

# --- Aplicar ---------------------------------------------------------
if ! compgen -G "backups/*/05_full.dump" >/dev/null; then
  echo "" >&2
  echo "ERROR: no encuentro ningún backup en backups/*/05_full.dump." >&2
  echo "Corre ./scripts/db-backup.sh antes de aplicar." >&2
  exit 1
fi
LATEST_BACKUP="$(ls -1d backups/*/ | tail -1)"
echo ""
echo "==> Backup más reciente: $LATEST_BACKUP"

echo ""
echo "======================================================================"
echo " APLICANDO (una sola transacción)"
echo "======================================================================"
"${PSQL[@]}" --single-transaction -c "select * from repair.apply();"

echo ""
echo "======================================================================"
echo " SALDOS DESPUÉS"
echo "======================================================================"
"${PSQL[@]}" -c "select * from repair.balance_report();"

echo ""
echo "======================================================================"
echo " PENDIENTES QUE REQUIEREN TU CRITERIO"
echo "======================================================================"
"${PSQL[@]}" -c "
  select action as \"Acción\", detail as \"Detalle\"
    from repair.findings() where not auto;"

echo ""
echo "Listo. Para deshacer: restaurar $LATEST_BACKUP (ver scripts/db-backup.sh)."
