#!/usr/bin/env bash
# =====================================================================
# Compara la firma del esquema contra una tomada antes de migrar y falla
# si detecta algo que NO sea una alta.
#
#   ./scripts/db-verify-additive.sh backups/<stamp>/00_signature.txt
#
# Regla: en el diff sólo se aceptan líneas nuevas ('>'). Cualquier línea
# eliminada ('<') significa que se borró o cambió una columna/constraint
# existente, salvo las excepciones declaradas explícitamente abajo.
# =====================================================================
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

BEFORE="${1:-}"
if [[ -z "$BEFORE" || ! -f "$BEFORE" ]]; then
  echo "Uso: $0 <firma-anterior.txt>" >&2
  echo "  p.ej. $0 backups/20260726-120000/00_signature.txt" >&2
  exit 1
fi

# Cambios sobre columnas EXISTENTES aprobados para esta tanda. Los cuatro son
# relajaciones: ninguna puede invalidar una fila que hoy exista.
#   - NOT NULL en investments.symbol/quantity/purchase_price (para renta fija)
#   - investments_quantity_check: > 0  ->  >= 0 (para posiciones cerradas)
ALLOWED_REMOVALS='^< (COLUMN\|investments\.(symbol|quantity|purchase_price)\||CONSTRAINT\|investments\|investments_quantity_check\|)'

AFTER="$(mktemp)"; trap 'rm -f "$AFTER"' EXIT
./scripts/db-schema-signature.sh > "$AFTER"

DIFF="$(diff "$BEFORE" "$AFTER" || true)"

REMOVED="$(printf '%s\n' "$DIFF" | grep '^<' || true)"
ADDED="$(printf '%s\n' "$DIFF" | grep '^>' || true)"

echo "=== ALTAS (esperado) ==="
printf '%s\n' "$ADDED" | sed 's/^> /  + /'

UNEXPECTED="$(printf '%s\n' "$REMOVED" | grep -Ev "$ALLOWED_REMOVALS" | grep '^<' || true)"

if [[ -n "$REMOVED" ]]; then
  echo
  echo "=== BAJAS / CAMBIOS ==="
  printf '%s\n' "$REMOVED" | sed 's/^< /  - /'
fi

if [[ -n "$UNEXPECTED" ]]; then
  echo
  echo "FALLO: hay cambios no declarados sobre el esquema existente:" >&2
  printf '%s\n' "$UNEXPECTED" >&2
  exit 1
fi

echo
echo "OK: la migración es aditiva (sólo altas + las relajaciones declaradas)."
