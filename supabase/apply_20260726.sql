-- =====================================================================
-- APLICAR EN SUPABASE CLOUD (SQL Editor) — lote 20260726
-- Ciclo de tarjetas, MSI, renta fija, lotes de inversión, generador
-- del calendario MSI y posiciones cerradas. Reejecutable sin efectos.
--
-- ANTES DE EJECUTAR:  ./scripts/db-backup.sh
-- PARA REVERTIR:      supabase/rollback/20260726_down_all.sql
-- =====================================================================

-- ============================================================
-- 20260726000010_credit_card_cycle.sql
-- ============================================================
-- =====================================================================
-- Fase 2 · 0010 · Ciclo de tarjetas de crédito
--
-- ADITIVA: sólo agrega columnas nullable a accounts + funciones nuevas.
-- No borra ni cambia el tipo de ninguna columna existente.
-- Reversible con supabase/rollback/20260726000010_credit_card_cycle_down.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- Columnas de ciclo (sólo aplican a type = 'credit_card')
-- ---------------------------------------------------------------------
alter table public.accounts
  add column if not exists statement_day smallint,  -- día del corte (1-31)
  add column if not exists payment_day   smallint,  -- día límite de pago (1-31)
  add column if not exists credit_limit  bigint;    -- límite en centavos

comment on column public.accounts.statement_day is
  'Día del mes en que corta el estado de cuenta. Si el mes es más corto, se usa el último día.';
comment on column public.accounts.payment_day is
  'Día del mes límite de pago. Si payment_day <= statement_day, cae el mes siguiente al corte.';
comment on column public.accounts.credit_limit is
  'Límite de crédito en centavos.';

-- Restricciones: todas toleran NULL, así que las 9 cuentas existentes pasan.
do $$ begin
  alter table public.accounts add constraint accounts_statement_day_range
    check (statement_day between 1 and 31);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.accounts add constraint accounts_payment_day_range
    check (payment_day between 1 and 31);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.accounts add constraint accounts_credit_limit_positive
    check (credit_limit >= 0);
exception when duplicate_object then null; end $$;

-- Los campos de ciclo sólo tienen sentido en tarjetas de crédito.
-- (No se exige que las tarjetas los tengan: las 4 tarjetas actuales
--  siguen siendo válidas con NULL hasta que las configures en la UI.)
do $$ begin
  alter table public.accounts add constraint accounts_cycle_only_credit_card
    check (
      type = 'credit_card'
      or (statement_day is null and payment_day is null and credit_limit is null)
    );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Aritmética del ciclo (funciones puras, sin efectos)
-- ---------------------------------------------------------------------

-- Día del mes acotado a la longitud real del mes.
-- clamp_day('2026-02-01', 31) -> 2026-02-28
create or replace function public.clamp_day(p_month date, p_day smallint)
returns date language sql immutable strict as $$
  select date_trunc('month', p_month)::date
       + (least(
            p_day::int,
            extract(day from (date_trunc('month', p_month) + interval '1 month - 1 day'))::int
          ) - 1);
$$;

comment on function public.clamp_day(date, smallint) is
  'Devuelve la fecha del día p_day dentro del mes de p_month, acotada al último día si el mes es más corto.';

-- Fecha de corte del estado de cuenta al que pertenece una compra:
-- el primer corte en o posterior a la fecha de la compra.
-- statement_close_for('2026-01-15', 20) -> 2026-01-20
-- statement_close_for('2026-01-20', 20) -> 2026-01-20  (una compra el día
--   del corte entra en ESE corte)
-- statement_close_for('2026-01-21', 20) -> 2026-02-20
create or replace function public.statement_close_for(p_purchase date, p_statement_day smallint)
returns date language sql immutable strict as $$
  select case
    when public.clamp_day(p_purchase, p_statement_day) >= p_purchase
      then public.clamp_day(p_purchase, p_statement_day)
    else public.clamp_day((date_trunc('month', p_purchase) + interval '1 month')::date, p_statement_day)
  end;
$$;

comment on function public.statement_close_for(date, smallint) is
  'Corte al que se factura una compra: el primer corte en o posterior a la fecha de compra.';

-- Fecha límite de pago de un corte dado.
-- Si payment_day <= statement_day, el pago cae el mes siguiente al corte.
-- (Con iguales no tendría sentido pagar el mismo día del corte: se va al
--  mes siguiente, que es como opera cualquier banco.)
-- payment_due_for('2026-01-20', 20, 5)  -> 2026-02-05
-- payment_due_for('2026-01-20', 20, 20) -> 2026-02-20
-- payment_due_for('2026-01-05', 5, 20)  -> 2026-01-20
create or replace function public.payment_due_for(
  p_close date, p_statement_day smallint, p_payment_day smallint
) returns date language sql immutable strict as $$
  select public.clamp_day(
    case when p_payment_day <= p_statement_day
         then (date_trunc('month', p_close) + interval '1 month')::date
         else p_close
    end,
    p_payment_day
  );
$$;

comment on function public.payment_due_for(date, smallint, smallint) is
  'Fecha límite de pago de un corte. Si payment_day <= statement_day, cae el mes siguiente.';

-- Corte número n a partir de un corte base (n = 0 es el propio corte).
-- Recalcula desde el mes para no arrastrar el acotamiento de meses cortos:
-- base 2026-01-31 con statement_day 31, n = 1 -> 2026-02-28 (no 2026-02-31).
create or replace function public.statement_close_plus(
  p_close date, p_statement_day smallint, p_n int
) returns date language sql immutable strict as $$
  select public.clamp_day(
    (date_trunc('month', p_close) + (p_n || ' months')::interval)::date,
    p_statement_day
  );
$$;

comment on function public.statement_close_plus(date, smallint, int) is
  'Desplaza un corte n meses hacia adelante, re-acotando el día en cada mes.';

-- ============================================================
-- 20260726000011_installments.sql
-- ============================================================
-- =====================================================================
-- Fase 2 · 0011 · Meses sin intereses (MSI)
--
-- ADITIVA: tablas nuevas + 1 columna nueva en households.
-- No borra ni cambia el tipo de ninguna columna existente.
--
-- DISEÑO: la compra vive como UNA sola transacción en public.transactions,
-- en su fecha real, para que los reportes de gasto por categoría sigan
-- siendo correctos. Las mensualidades NO son transacciones: viven en
-- installment_payments y sólo describen el calendario de pago.
-- =====================================================================

do $$ begin
  create type public.installment_status as enum ('active', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Umbral de alerta de MSI sobre el ingreso mensual (configurable)
-- ---------------------------------------------------------------------
alter table public.households
  add column if not exists msi_alert_pct numeric(5,4) not null default 0.2000;

do $$ begin
  alter table public.households add constraint households_msi_alert_pct_range
    check (msi_alert_pct >= 0 and msi_alert_pct <= 1);
exception when duplicate_object then null; end $$;

comment on column public.households.msi_alert_pct is
  'Fracción del ingreso mensual a partir de la cual se alerta por MSI comprometidos (0.20 = 20%).';

-- ---------------------------------------------------------------------
-- Plan de meses sin intereses (uno por compra a MSI)
-- ---------------------------------------------------------------------
create table if not exists public.installment_plans (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households (id) on delete cascade,
  transaction_id     uuid not null unique references public.transactions (id) on delete cascade,
  total_amount       bigint not null check (total_amount > 0),      -- centavos
  months             smallint not null check (months between 2 and 120),
  monthly_amount     bigint not null check (monthly_amount > 0),    -- centavos, mensualidad base
  first_payment_date date not null,
  remaining_months   smallint not null check (remaining_months >= 0),
  status             public.installment_status not null default 'active',
  created_by         uuid not null references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint installment_plans_remaining_le_months check (remaining_months <= months)
);
create index if not exists installment_plans_household_idx
  on public.installment_plans (household_id, status);

comment on table public.installment_plans is
  'Compra diferida a MSI. La compra original sigue siendo UNA transacción; aquí sólo vive el plan.';
comment on column public.installment_plans.monthly_amount is
  'Mensualidad base (total / months, truncada). El centavo sobrante va en la última mensualidad.';
comment on column public.installment_plans.remaining_months is
  'Mensualidades no pagadas. Lo mantiene el trigger installment_payments_sync.';

-- ---------------------------------------------------------------------
-- Calendario: una fila por mensualidad
-- ---------------------------------------------------------------------
create table if not exists public.installment_payments (
  id               uuid primary key default gen_random_uuid(),
  plan_id          uuid not null references public.installment_plans (id) on delete cascade,
  installment_no   smallint not null check (installment_no >= 1),
  due_date         date not null,
  amount           bigint not null check (amount > 0),   -- centavos
  is_paid          boolean not null default false,
  paid_at          date,
  statement_period date not null,   -- fecha de corte del estado de cuenta que la factura
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (plan_id, installment_no),
  constraint installment_payments_paid_at_shape check (paid_at is null or is_paid)
);
create index if not exists installment_payments_plan_idx
  on public.installment_payments (plan_id, installment_no);
create index if not exists installment_payments_pending_due_idx
  on public.installment_payments (due_date) where not is_paid;
create index if not exists installment_payments_period_idx
  on public.installment_payments (statement_period);

comment on column public.installment_payments.statement_period is
  'Fecha de corte del estado de cuenta en el que se factura esta mensualidad.';
comment on column public.installment_payments.amount is
  'Importe de esta mensualidad. La última absorbe el redondeo del centavo sobrante.';

-- ---------------------------------------------------------------------
-- Mantener remaining_months y status en sincronía con el calendario
-- ---------------------------------------------------------------------
create or replace function public.sync_installment_plan_progress()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_plan uuid := coalesce(new.plan_id, old.plan_id);
begin
  update public.installment_plans p
     set remaining_months = sub.pending,
         status = case
                    when p.status = 'cancelled' then p.status
                    when sub.pending = 0        then 'completed'::public.installment_status
                    else 'active'::public.installment_status
                  end,
         updated_at = now()
    from (
      select count(*) filter (where not is_paid)::smallint as pending
        from public.installment_payments
       where plan_id = v_plan
    ) sub
   where p.id = v_plan;
  return null;
end;
$$;

drop trigger if exists installment_payments_sync on public.installment_payments;
create trigger installment_payments_sync
  after insert or update or delete on public.installment_payments
  for each row execute function public.sync_installment_plan_progress();

drop trigger if exists set_updated_at on public.installment_plans;
create trigger set_updated_at before update on public.installment_plans
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.installment_payments;
create trigger set_updated_at before update on public.installment_payments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS: los planes heredan la visibilidad de la cuenta de la transacción
-- ---------------------------------------------------------------------
alter table public.installment_plans    enable row level security;
alter table public.installment_payments enable row level security;

drop policy if exists installment_plans_all on public.installment_plans;
create policy installment_plans_all on public.installment_plans
  for all using (
    household_id = public.current_household_id()
    and exists (
      select 1 from public.transactions t
       where t.id = transaction_id
         and public.can_access_account(t.account_id)
    )
  ) with check (
    household_id = public.current_household_id()
    and created_by = auth.uid()
    and exists (
      select 1 from public.transactions t
       where t.id = transaction_id
         and public.can_access_account(t.account_id)
    )
  );

drop policy if exists installment_payments_all on public.installment_payments;
create policy installment_payments_all on public.installment_payments
  for all using (
    exists (
      select 1 from public.installment_plans p
       where p.id = plan_id
         and p.household_id = public.current_household_id()
    )
  ) with check (
    exists (
      select 1 from public.installment_plans p
       where p.id = plan_id
         and p.household_id = public.current_household_id()
    )
  );

-- ============================================================
-- 20260726000012_fixed_investments.sql
-- ============================================================
-- =====================================================================
-- Fase 2 · 0012 · Inversiones de renta fija
--
-- ADITIVA salvo por 3 RELAJACIONES declaradas (ver abajo). No se borra
-- ninguna columna ni cambia ningún tipo de dato.
--
-- ATENCIÓN — ÚNICO cambio sobre columnas existentes de todo este lote:
--   investments.symbol, .quantity y .purchase_price pasan de NOT NULL a
--   NULL-able, porque un pagaré o un CETE no tiene símbolo ni cantidad.
--   Para que las inversiones de renta VARIABLE conserven exactamente la
--   misma garantía que hoy, se añade un CHECK que las obliga a seguir
--   teniendo esos tres campos. Neto: renta variable no cambia en nada.
-- =====================================================================

do $$ begin
  create type public.investment_type as enum ('fixed', 'variable');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.compounding_method as enum ('simple', 'monthly', 'daily');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Columnas nuevas. investment_type se rellena como 'variable' en las
-- filas existentes, que es exactamente lo que son hoy.
-- ---------------------------------------------------------------------
alter table public.investments
  add column if not exists investment_type       public.investment_type not null default 'variable',
  add column if not exists principal             bigint,             -- centavos
  add column if not exists annual_rate           numeric(6,4),       -- fracción anual: 0.1050 = 10.50%
  add column if not exists start_date            date,
  add column if not exists maturity_date         date,
  add column if not exists compounding           public.compounding_method,
  add column if not exists reinvests_at_maturity boolean;

comment on column public.investments.investment_type is
  'fixed = pagarés, CETES, depósitos a plazo. variable = acciones, ETFs, cripto.';
comment on column public.investments.annual_rate is
  'Tasa anual como fracción (0.1050 = 10.50%), misma convención que debts.interest_rate.';
comment on column public.investments.principal is
  'Monto invertido en centavos (sólo renta fija).';

-- ---------------------------------------------------------------------
-- Relajaciones (las 3 declaradas) + CHECKs compensatorios
-- ---------------------------------------------------------------------
alter table public.investments alter column symbol         drop not null;
alter table public.investments alter column quantity       drop not null;
alter table public.investments alter column purchase_price drop not null;

-- Renta variable conserva íntegras las garantías previas.
do $$ begin
  alter table public.investments add constraint investments_variable_fields
    check (
      investment_type <> 'variable'
      or (symbol is not null and quantity is not null and purchase_price is not null)
    );
exception when duplicate_object then null; end $$;

-- Renta fija exige sus propios campos.
do $$ begin
  alter table public.investments add constraint investments_fixed_fields
    check (
      investment_type <> 'fixed'
      or (principal is not null and annual_rate is not null
          and start_date is not null and maturity_date is not null
          and compounding is not null and reinvests_at_maturity is not null)
    );
exception when duplicate_object then null; end $$;

-- Y los campos de renta fija no se cuelan en renta variable.
do $$ begin
  alter table public.investments add constraint investments_fixed_only
    check (
      investment_type = 'fixed'
      or (principal is null and annual_rate is null
          and start_date is null and maturity_date is null
          and compounding is null and reinvests_at_maturity is null)
    );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.investments add constraint investments_principal_positive
    check (principal is null or principal > 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.investments add constraint investments_annual_rate_positive
    check (annual_rate is null or annual_rate >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.investments add constraint investments_maturity_after_start
    check (maturity_date is null or start_date is null or maturity_date > start_date);
exception when duplicate_object then null; end $$;

create index if not exists investments_type_idx
  on public.investments (household_id, investment_type);

-- Vencimientos próximos (alerta < 7 días).
create index if not exists investments_maturity_idx
  on public.investments (maturity_date) where investment_type = 'fixed';

-- ============================================================
-- 20260726000013_investment_lots.sql
-- ============================================================
-- =====================================================================
-- Fase 2 · 0013 · Lotes de inversión (compras parciales, costo promedio)
--
-- ADITIVA: tabla nueva + backfill de las inversiones existentes como un
-- único lote de compra. No borra ni cambia ninguna columna existente.
--
-- investments.quantity y .purchase_price siguen siendo el agregado que
-- lee la app hoy (cantidad total y costo promedio ponderado por unidad).
-- investment_lots aporta el detalle para recalcularlo con compras parciales.
-- Tras el backfill, el agregado y la suma de lotes coinciden exactamente.
-- =====================================================================

do $$ begin
  create type public.investment_lot_type as enum ('buy', 'sell');
exception when duplicate_object then null; end $$;

create table if not exists public.investment_lots (
  id            uuid primary key default gen_random_uuid(),
  investment_id uuid not null references public.investments (id) on delete cascade,
  type          public.investment_lot_type not null default 'buy',
  quantity      numeric(20,8) not null check (quantity > 0),
  price         bigint not null check (price >= 0),   -- centavos por unidad
  occurred_at   date not null default current_date,
  note          text,
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now()
);
create index if not exists investment_lots_inv_idx
  on public.investment_lots (investment_id, occurred_at);

comment on table public.investment_lots is
  'Compras y ventas parciales de un holding de renta variable. Base para el costo promedio ponderado.';
comment on column public.investment_lots.price is
  'Precio por unidad en centavos al momento del movimiento. No se modelan comisiones.';

-- ---------------------------------------------------------------------
-- Backfill: cada inversión variable existente se convierte en su lote
-- de compra inicial. Idempotente.
-- ---------------------------------------------------------------------
insert into public.investment_lots
  (investment_id, type, quantity, price, occurred_at, created_by, created_at)
select i.id, 'buy', i.quantity, i.purchase_price, i.purchase_date, i.created_by, i.created_at
  from public.investments i
 where i.investment_type = 'variable'
   and i.quantity is not null
   and i.purchase_price is not null
   and not exists (
     select 1 from public.investment_lots l where l.investment_id = i.id
   );

-- ---------------------------------------------------------------------
-- RLS: heredan del holding, igual que price_snapshots
-- ---------------------------------------------------------------------
alter table public.investment_lots enable row level security;

drop policy if exists investment_lots_all on public.investment_lots;
create policy investment_lots_all on public.investment_lots
  for all using (
    exists (select 1 from public.investments i
             where i.id = investment_id
               and i.household_id = public.current_household_id()
               and (i.owner_id is null or i.owner_id = auth.uid()))
  ) with check (
    exists (select 1 from public.investments i
             where i.id = investment_id
               and i.household_id = public.current_household_id()
               and (i.owner_id is null or i.owner_id = auth.uid()))
  );

-- ============================================================
-- 20260726000014_installment_rpc.sql
-- ============================================================
-- =====================================================================
-- Fase 2 · 0014 · Generador del calendario de meses sin intereses
--
-- ADITIVA: sólo añade una función. No toca tablas ni datos.
-- Reversible con supabase/rollback/20260726_down_all.sql
--
-- Va en plpgsql y no en un CTE a propósito: una sentencia con CTEs no ve
-- las filas que ella misma acaba de insertar, así que el calendario no
-- puede leer la transacción recién creada.
-- =====================================================================

create or replace function public.create_installment_plan(
  p_transaction_id uuid,
  p_months smallint
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tx    record;
  v_card  record;
  v_plan  uuid;
  v_close date;
  v_base  bigint;
  n       int;
begin
  if p_months is null or p_months < 2 or p_months > 120 then
    raise exception 'El plazo debe estar entre 2 y 120 meses';
  end if;

  -- RLS filtra: si la transacción no es visible para el usuario, no existe.
  select t.id, t.type, t.amount, t.occurred_at, t.account_id, t.household_id
    into v_tx
    from public.transactions t
   where t.id = p_transaction_id;
  if not found then
    raise exception 'La transacción no existe o no tienes acceso a ella';
  end if;

  if v_tx.type <> 'expense' then
    raise exception 'Sólo un gasto puede diferirse a meses sin intereses';
  end if;

  if exists (select 1 from public.installment_plans p
              where p.transaction_id = v_tx.id) then
    raise exception 'Esta compra ya tiene un plan de meses sin intereses';
  end if;

  select a.id, a.name, a.type, a.statement_day, a.payment_day
    into v_card
    from public.accounts a
   where a.id = v_tx.account_id;

  if v_card.type <> 'credit_card' then
    raise exception '% no es una tarjeta de crédito', v_card.name;
  end if;
  if v_card.statement_day is null or v_card.payment_day is null then
    raise exception 'Configura el día de corte y el día de pago de % antes de diferir a MSI',
      v_card.name;
  end if;

  -- Mensualidad base truncada; el sobrante va en la última (ver abajo).
  v_base := v_tx.amount / p_months;
  if v_base <= 0 then
    raise exception 'El monto es demasiado pequeño para dividirse en % mensualidades', p_months;
  end if;

  -- Corte al que se factura la compra: ahí arranca la mensualidad 1.
  v_close := public.statement_close_for(v_tx.occurred_at, v_card.statement_day);

  insert into public.installment_plans (
    household_id, transaction_id, total_amount, months, monthly_amount,
    first_payment_date, remaining_months, created_by
  ) values (
    v_tx.household_id, v_tx.id, v_tx.amount, p_months, v_base,
    public.payment_due_for(v_close, v_card.statement_day, v_card.payment_day),
    p_months, auth.uid()
  ) returning id into v_plan;

  for n in 1..p_months loop
    insert into public.installment_payments (
      plan_id, installment_no, due_date, amount, statement_period
    ) values (
      v_plan,
      n,
      public.payment_due_for(
        public.statement_close_plus(v_close, v_card.statement_day, n - 1),
        v_card.statement_day, v_card.payment_day),
      -- El redondeo del centavo sobrante se acumula en la última mensualidad.
      case when n < p_months
           then v_base
           else v_tx.amount - v_base * (p_months - 1) end,
      public.statement_close_plus(v_close, v_card.statement_day, n - 1)
    );
  end loop;

  return v_plan;
end;
$$;

comment on function public.create_installment_plan(uuid, smallint) is
  'Difiere un gasto con tarjeta a N meses sin intereses y genera su calendario. El centavo sobrante va en la última mensualidad.';

-- ============================================================
-- 20260726000015_fixed_no_variable_fields.sql
-- ============================================================
-- =====================================================================
-- Fase 2 · 0015 · La renta fija no lleva cantidad ni precio unitario
--
-- ADITIVA: sólo añade una restricción. No toca columnas ni datos.
--
-- 0012 obligaba a la renta variable a tener symbol/quantity/purchase_price y
-- prohibía los campos de renta fija fuera de 'fixed', pero no al revés: una
-- fila 'fixed' podía llevar `quantity` y `purchase_price`, que la valuación
-- de renta fija ignora por completo. Quedarían ahí mintiendo en silencio.
--
-- `symbol` sí se permite en renta fija: es sólo una etiqueta y a un CETE le
-- viene bien su clave de emisión (p.ej. 'BI-CETES-260730').
-- =====================================================================

do $$ begin
  alter table public.investments add constraint investments_fixed_has_no_units
    check (
      investment_type <> 'fixed'
      or (quantity is null and purchase_price is null)
    );
exception when duplicate_object then null; end $$;

-- ============================================================
-- 20260726000016_allow_closed_positions.sql
-- ============================================================
-- =====================================================================
-- Fase 2 · 0016 · Permitir posiciones cerradas (cantidad 0)
--
-- RELAJACIÓN DECLARADA sobre una columna existente, la cuarta y última de
-- este lote. No borra datos ni cambia ningún tipo.
--
--   investments_quantity_check:  quantity > 0   ->   quantity >= 0
--
-- Con compras y ventas parciales (`investment_lots`), vender toda la posición
-- deja la cantidad en 0. Con la restricción anterior esa venta era imposible
-- de registrar: había que borrar el holding y con él su historial de precios
-- y de lotes.
--
-- Ninguna fila existente puede violar la nueva regla, porque es más
-- permisiva que la anterior. Reversible mientras no haya posiciones cerradas
-- (el rollback avisa y aborta si las hay).
-- =====================================================================

alter table public.investments drop constraint if exists investments_quantity_check;

do $$ begin
  alter table public.investments add constraint investments_quantity_check
    check (quantity >= 0);
exception when duplicate_object then null; end $$;

comment on column public.investments.quantity is
  'Unidades en posesión (renta variable). 0 = posición cerrada; se conserva por su historial.';
