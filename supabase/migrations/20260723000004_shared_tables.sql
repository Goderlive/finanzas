-- =====================================================================
-- Fase 1 · 0004 · Gastos compartidos y liquidaciones
-- =====================================================================

-- Gasto compartido: quién pagó y cómo se divide
create table public.shared_expenses (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  transaction_id uuid references public.transactions (id) on delete set null, -- gasto real ligado
  description    text not null,
  amount         bigint not null check (amount > 0),   -- total en centavos
  paid_by        uuid not null references public.profiles (id),
  split_type     public.split_type not null default 'equal',
  occurred_at    date not null default current_date,
  created_by     uuid not null references public.profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index shared_expenses_household_idx on public.shared_expenses (household_id);

-- Reparto por participante (solo el monto resuelto en centavos)
create table public.shared_expense_splits (
  id                uuid primary key default gen_random_uuid(),
  shared_expense_id uuid not null references public.shared_expenses (id) on delete cascade,
  profile_id        uuid not null references public.profiles (id),
  owed_amount       bigint not null check (owed_amount >= 0), -- lo que le toca en centavos
  created_at        timestamptz not null default now(),
  unique (shared_expense_id, profile_id)
);

-- Liquidaciones para saldar el balance
create table public.settlements (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  from_profile uuid not null references public.profiles (id),  -- quien paga
  to_profile   uuid not null references public.profiles (id),  -- quien recibe
  amount       bigint not null check (amount > 0),
  settled_at   date not null default current_date,
  note         text,
  created_by   uuid not null references public.profiles (id),
  created_at   timestamptz not null default now(),
  check (from_profile <> to_profile)
);
create index settlements_household_idx on public.settlements (household_id);
