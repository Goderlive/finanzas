# Base de datos — Finanzas del hogar

Migraciones versionadas para Supabase self-hosted (Coolify).

## Orden de las migraciones

| Archivo | Contenido |
|---|---|
| `20260723000001_extensions_enums.sql` | Extensiones (`pgcrypto`, `citext`, `pg_trgm`) y enums |
| `20260723000002_core_tables.sql` | `households`, `profiles`, `household_invitations` |
| `20260723000003_finance_tables.sql` | `accounts`, `categories`, `transactions` |
| `20260723000004_shared_tables.sql` | `shared_expenses`, `shared_expense_splits`, `settlements` |
| `20260723000005_planning_tables.sql` | `budgets`, `debts`, `savings_goals`, `investments`, `price_snapshots` |
| `20260723000006_functions_triggers.sql` | Helpers RLS, trigger de balance, `updated_at`, recálculo |
| `20260723000007_rls_policies.sql` | RLS por hogar + visibilidad personal/conjunta |
| `20260723000008_auth_onboarding.sql` | `handle_new_user`, `create_household`, `create_invitation`, `accept_invitation` |

## Aplicar

Con Supabase CLI (recomendado):

```bash
supabase db reset          # local: aplica migraciones + seed.sql
supabase db push           # aplica migraciones a la instancia remota
```

O directo con `psql` en orden alfabético:

```bash
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
psql "$DATABASE_URL" -f supabase/seed.sql   # solo en desarrollo
```

## Notas de diseño

- **Montos en centavos** (`bigint`), nunca float.
- **Cuentas**: `owner_id` con valor = personal (solo la ve su dueño);
  `owner_id` NULL = conjunta (la ven ambos miembros). Misma regla en
  `debts`, `savings_goals` e `investments`.
- **Balances** de cuenta los mantiene el trigger `transactions_balance`;
  usa `recalculate_account_balance(uuid)` si necesitas reparar.
- **RLS** filtra todo por `current_household_id()`; las cuentas personales
  y sus transacciones solo las ve su dueño.
- El seed inserta usuarios en `auth.users`; las columnas exactas dependen
  de la versión de GoTrue de tu Supabase — ajusta si tu versión difiere.
