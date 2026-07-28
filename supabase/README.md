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
| `20260723000009_fix_invitation_fk.sql` | FK de invitaciones en cascada |
| `20260726000010_credit_card_cycle.sql` | Ciclo de tarjeta en `accounts` + aritmética de cortes |
| `20260726000011_installments.sql` | `installment_plans`, `installment_payments`, `households.msi_alert_pct` |
| `20260726000012_fixed_investments.sql` | Renta fija en `investments` |
| `20260726000013_investment_lots.sql` | `investment_lots` (compras parciales) |
| `20260726000014_installment_rpc.sql` | `create_installment_plan` (genera el calendario MSI) |
| `20260726000015_fixed_no_variable_fields.sql` | La renta fija no lleva cantidad ni precio unitario |
| `20260726000016_allow_closed_positions.sql` | `investments.quantity >= 0` (posiciones vendidas por completo) |
| `20260728000017_account_type_loan.sql` | `'loan'` en el enum `account_type` (va solo, ver abajo) |
| `20260728000018_account_class.sql` | `accounts.account_class` (activo/pasivo) + `household_net_worth` |
| `20260728000019_signed_amounts_transfers.sql` | **Montos con signo** + traspasos de partida doble |
| `20260728000020_card_payment.sql` | `create_transfer`, `pay_credit_card`, `credit_card_cycle`, pago mínimo |

## Migrar con datos reales en producción

La base ya está en uso. El procedimiento es:

```bash
./scripts/db-backup.sh                 # 1. backup completo + firma del esquema
# 2. aplicar: pegar supabase/apply_20260726.sql en el SQL Editor de Supabase
./scripts/db-verify-additive.sh backups/<stamp>/00_signature.txt   # 3. probar que fue aditiva
```

Si algo sale mal: `psql "$DATABASE_URL" -f supabase/rollback/20260726_down_all.sql`.

El backup guarda en `backups/<timestamp>/` (ignorado por git):

| Archivo | Para qué |
|---|---|
| `00_signature.txt` | firma del esquema, base de la verificación aditiva |
| `01b_extensions.sql` | **imprescindible en un restore, va primero** (`citext` y `pg_trgm` viven en `public`) |
| `05_full.dump` | artefacto real de restore (`pg_restore`) |
| `03_data_public.sql` | datos como INSERTs, legibles y diffeables |

Los `.sql` de datos deben restaurarse con los triggers desactivados
(`set session_replication_role = replica;`), o `handle_new_user` duplica
perfiles al recargar `auth.users`. El `05_full.dump` no tiene ese problema.

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

## Regla de signo (desde el lote 20260728)

`accounts.current_balance`, `accounts.initial_balance` y
`transactions.amount` se guardan **siempre con el signo del efecto sobre el
patrimonio neto**, sin excepciones:

| | Se guarda |
|---|---|
| Activo (checking, savings, cash, investment, other) | positivo |
| **Pasivo (credit_card, loan)** | **NEGATIVO cuando debes** |
| Ingreso | `amount > 0` |
| Gasto | `amount < 0` |
| Traspaso, lado origen | `amount < 0` |
| Traspaso, lado destino | `amount > 0` |

De ahí salen dos identidades que ya no necesitan condicionales:

```
saldo de una cuenta = initial_balance + sum(amount) de sus filas
patrimonio neto     = sum(current_balance)
```

El valor absoluto y la etiqueta «debes X» viven **sólo** en presentación
(`displayBalance` en `src/lib/money.ts`). Un pasivo en positivo es saldo a
favor, y es un estado válido. La base hace cumplir el signo con los checks
`transactions_sign_matches_type` y `transactions_transfer_shape`.

**Traspasos**: dos asientos ligados por `transfer_group_id`, creados por
`create_transfer()` en una sola transacción. Sin categoría, excluidos de
reportes de ingreso/gasto (`is_transfer`), y con propagación de borrado y
edición al hermano vía trigger.

**Pagar tarjeta**: `pay_credit_card()` es una acción propia, no el traspaso
genérico. Reparte el importe en el orden MSI vencidas → saldo del corte →
periodo en curso, y marca las `installment_payments` cubiertas.

## Regla de zona horaria

La base y el servidor de Next.js corren en **UTC**, pero el hogar vive en
México (UTC−6). Sin corregirlo, a partir de las 18:00 hora local ambos ya
creen que es el día siguiente: un movimiento capturado por la noche se
guardaba con la fecha de mañana y podía caer del otro lado del corte de una
tarjeta.

Nada de código nuevo debe preguntar la fecha de hoy por su cuenta:

| Capa | Usar | En vez de |
|---|---|---|
| SQL | `public.household_today()` | `current_date` |
| TypeScript, como `"YYYY-MM-DD"` | `today()` de `@/lib/dates` | `new Date().toLocaleDateString("en-CA")` |
| TypeScript, como `Date` | `todayDate()` de `@/lib/dates` | `new Date()` |

La zona está en un solo lugar por capa: la constante `HOUSEHOLD_TIME_ZONE`
en `src/lib/dates.ts` y el literal dentro de `household_today()`.

## Aplicar el lote 20260728

```bash
./scripts/db-backup.sh                       # 1. backup obligatorio
./scripts/db-test.sh                         # 2. ensayo en base sombra
psql "$DATABASE_URL" -f supabase/apply_20260728.sql   # 3. aplicar
./scripts/db-repair-signs.sh                 # 4. dry-run de reparación
./scripts/db-repair-signs.sh --apply         # 5. reparar datos históricos
```

En el SQL Editor de Supabase, la `0017` va **sola primero**: un
`alter type ... add value` no puede compartir transacción con el uso del
valor nuevo.

Revertir: `psql "$DATABASE_URL" -f supabase/rollback/20260728_down_all.sql`
(no deshace la reparación de datos; para eso, restaurar el backup).

## Notas de diseño

- **Montos en centavos** (`bigint`), nunca float.
- **Cuentas**: `owner_id` con valor = personal (solo la ve su dueño);
  `owner_id` NULL = conjunta (la ven ambos miembros). Misma regla en
  `debts`, `savings_goals` e `investments`.
- **Balances** de cuenta los mantiene el trigger `transactions_balance`,
  que desde el lote 20260728 es una suma simple (`+ new.amount`). Usa
  `recalculate_account_balance(uuid)` o `recalculate_all_balances()` si
  necesitas reparar.
- **RLS** filtra todo por `current_household_id()`; las cuentas personales
  y sus transacciones solo las ve su dueño.
- El seed inserta usuarios en `auth.users`; las columnas exactas dependen
  de la versión de GoTrue de tu Supabase — ajusta si tu versión difiere.
