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
