-- =====================================================================
-- Fase 1 · 0005 · Presupuestos, deudas, ahorros, inversiones
-- =====================================================================

-- Presupuesto mensual por categoría, con rollover opcional
create table public.budgets (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  category_id  uuid not null references public.categories (id) on delete cascade,
  month        date not null,   -- primer día del mes
  amount       bigint not null check (amount >= 0),  -- límite en centavos
  rollover     boolean not null default false,
  created_by   uuid not null references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (household_id, category_id, month),
  check (date_trunc('month', month)::date = month)  -- fuerza día 1
);
create index budgets_household_month_idx on public.budgets (household_id, month);

-- Deudas / tarjetas (personal si owner_id, conjunta si null)
create table public.debts (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households (id) on delete cascade,
  owner_id        uuid references public.profiles (id) on delete restrict,
  name            text not null,
  type            public.debt_type not null,
  principal       bigint not null check (principal >= 0),        -- monto original
  current_balance bigint not null check (current_balance >= 0),  -- saldo actual
  interest_rate   numeric(6,4) not null default 0,   -- APR anual, p.ej. 0.1999
  minimum_payment bigint not null default 0,
  statement_day   smallint check (statement_day between 1 and 31),  -- fecha de corte
  due_day         smallint check (due_day between 1 and 31),        -- fecha de pago
  created_by      uuid not null references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index debts_household_idx on public.debts (household_id);

-- Metas de ahorro (personal si owner_id, conjunta si null)
create table public.savings_goals (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  owner_id       uuid references public.profiles (id) on delete restrict,
  account_id     uuid references public.accounts (id) on delete set null,
  name           text not null,
  target_amount  bigint not null check (target_amount > 0),
  current_amount bigint not null default 0 check (current_amount >= 0),
  target_date    date,
  created_by     uuid not null references public.profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index savings_goals_household_idx on public.savings_goals (household_id);

-- Holdings de inversión (personal si owner_id, conjunta si null)
create table public.investments (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  owner_id       uuid references public.profiles (id) on delete restrict,
  account_id     uuid references public.accounts (id) on delete set null,
  symbol         text not null,
  name           text,
  quantity       numeric(20,8) not null check (quantity > 0),  -- fracciones ok
  purchase_price bigint not null check (purchase_price >= 0),  -- centavos por unidad
  purchase_date  date not null default current_date,
  currency       char(3) not null default 'MXN',
  created_by     uuid not null references public.profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index investments_household_idx on public.investments (household_id);

-- Precios manuales para valorización histórica
create table public.price_snapshots (
  id            uuid primary key default gen_random_uuid(),
  investment_id uuid not null references public.investments (id) on delete cascade,
  price         bigint not null check (price >= 0),  -- centavos por unidad
  as_of         date not null default current_date,
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  unique (investment_id, as_of)
);
create index price_snapshots_inv_idx on public.price_snapshots (investment_id, as_of desc);
