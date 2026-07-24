-- =====================================================================
-- Fase 1 · 0003 · Finanzas: cuentas, categorías, transacciones
-- =====================================================================

-- Cuentas: owner_id null = conjunta; con owner = personal
create table public.accounts (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households (id) on delete cascade,
  owner_id        uuid references public.profiles (id) on delete restrict,
  name            text not null,
  type            public.account_type not null,
  currency        char(3) not null default 'MXN',
  initial_balance bigint not null default 0,   -- centavos
  current_balance bigint not null default 0,   -- centavos, mantenido por trigger
  is_archived     boolean not null default false,
  created_by      uuid not null references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index accounts_household_idx on public.accounts (household_id);
create index accounts_owner_idx     on public.accounts (owner_id);

-- Categorías jerárquicas (padre/hijo)
create table public.categories (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  parent_id    uuid references public.categories (id) on delete cascade,
  name         text not null,
  kind         public.category_kind not null,
  icon         text,
  color        text,
  is_archived  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index categories_household_idx on public.categories (household_id);
create index categories_parent_idx    on public.categories (parent_id);

-- Transacciones
create table public.transactions (
  id                   uuid primary key default gen_random_uuid(),
  household_id         uuid not null references public.households (id) on delete cascade,
  account_id           uuid not null references public.accounts (id) on delete restrict,
  transfer_account_id  uuid references public.accounts (id) on delete restrict, -- solo transfers
  category_id          uuid references public.categories (id) on delete set null,
  type                 public.transaction_type not null,
  amount               bigint not null check (amount > 0),  -- centavos, siempre positivo
  description          text,
  occurred_at          date not null default current_date,
  created_by           uuid not null references public.profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- Coherencia transferencia vs. no-transferencia
  constraint transfer_shape check (
    (type = 'transfer'
       and transfer_account_id is not null
       and transfer_account_id <> account_id)
    or
    (type <> 'transfer' and transfer_account_id is null)
  )
);
create index transactions_household_date_idx on public.transactions (household_id, occurred_at desc);
create index transactions_account_idx        on public.transactions (account_id);
create index transactions_category_idx       on public.transactions (category_id);
-- Autocompletado de descripciones previas (ILIKE '%texto%')
create index transactions_desc_trgm_idx on public.transactions using gin (description gin_trgm_ops);
