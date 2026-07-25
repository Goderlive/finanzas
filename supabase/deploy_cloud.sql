-- =====================================================================
-- ESQUEMA COMPLETO PARA SUPABASE CLOUD (pegar en SQL Editor y ejecutar)
-- Generado concatenando supabase/migrations/0001..0009 en orden.
-- NO incluye seed.sql (datos de prueba de dev).
-- =====================================================================


-- ============================================================
-- 20260723000001_extensions_enums.sql
-- ============================================================
-- =====================================================================
-- Fase 1 · 0001 · Extensiones y tipos enumerados
-- =====================================================================

-- Extensiones
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;     -- emails case-insensitive
create extension if not exists pg_trgm;    -- autocompletado de descripciones (ILIKE)

-- Enums de dominio
create type public.account_type as enum
  ('checking', 'savings', 'cash', 'credit_card', 'investment', 'other');

create type public.transaction_type as enum
  ('income', 'expense', 'transfer');

create type public.category_kind as enum
  ('income', 'expense');

create type public.split_type as enum
  ('equal', 'percentage', 'fixed');   -- 'equal' = 50/50

create type public.debt_type as enum
  ('loan', 'credit_card', 'mortgage', 'other');

create type public.member_role as enum
  ('owner', 'member');

create type public.invitation_status as enum
  ('pending', 'accepted', 'revoked', 'expired');


-- ============================================================
-- 20260723000002_core_tables.sql
-- ============================================================
-- =====================================================================
-- Fase 1 · 0002 · Núcleo: hogares, perfiles, invitaciones
-- =====================================================================

-- Un hogar con moneda base
create table public.households (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  base_currency char(3) not null default 'MXN',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Perfiles vinculados 1:1 a auth.users; pertenecen a un hogar
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  household_id uuid references public.households (id) on delete set null,
  role         public.member_role not null default 'member',
  display_name text not null,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index profiles_household_idx on public.profiles (household_id);

-- Invitación para el segundo usuario (email + token secreto)
create table public.household_invitations (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  email        citext not null,
  token        uuid not null default gen_random_uuid(),
  invited_by   uuid not null references public.profiles (id),
  status       public.invitation_status not null default 'pending',
  expires_at   timestamptz not null default (now() + interval '7 days'),
  accepted_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (household_id, email)
);
create index invitations_token_idx on public.household_invitations (token);


-- ============================================================
-- 20260723000003_finance_tables.sql
-- ============================================================
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


-- ============================================================
-- 20260723000004_shared_tables.sql
-- ============================================================
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


-- ============================================================
-- 20260723000005_planning_tables.sql
-- ============================================================
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


-- ============================================================
-- 20260723000006_functions_triggers.sql
-- ============================================================
-- =====================================================================
-- Fase 1 · 0006 · Funciones y triggers
-- =====================================================================

-- Hogar del usuario actual (SECURITY DEFINER evita recursión en RLS)
create or replace function public.current_household_id()
returns uuid language sql stable security definer set search_path = public as $$
  select household_id from public.profiles where id = auth.uid();
$$;

-- ¿Puede el usuario actual ver esta cuenta? (personal = solo dueño; conjunta = ambos)
create or replace function public.can_access_account(a_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.accounts a
    where a.id = a_id
      and a.household_id = public.current_household_id()
      and (a.owner_id is null or a.owner_id = auth.uid())
  );
$$;

-- updated_at genérico
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Balance de cuentas
-- ---------------------------------------------------------------------

-- Sembrar current_balance al crear la cuenta
create or replace function public.seed_account_balance()
returns trigger language plpgsql as $$
begin
  new.current_balance = new.initial_balance;
  return new;
end;
$$;
create trigger accounts_seed_balance
  before insert on public.accounts
  for each row execute function public.seed_account_balance();

-- Si se edita initial_balance, ajustar current_balance por el delta
create or replace function public.handle_account_balance_update()
returns trigger language plpgsql as $$
begin
  if new.initial_balance <> old.initial_balance then
    new.current_balance = new.current_balance + (new.initial_balance - old.initial_balance);
  end if;
  return new;
end;
$$;
create trigger accounts_balance_delta
  before update on public.accounts
  for each row execute function public.handle_account_balance_update();

-- Ajuste puntual de saldo (dir = +1 aplica, -1 revierte)
create or replace function public._adjust_balance(
  p_account uuid, p_transfer uuid, p_type public.transaction_type,
  p_amount bigint, p_dir int
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_type = 'income' then
    update public.accounts set current_balance = current_balance + (p_amount * p_dir) where id = p_account;
  elsif p_type = 'expense' then
    update public.accounts set current_balance = current_balance - (p_amount * p_dir) where id = p_account;
  elsif p_type = 'transfer' then
    update public.accounts set current_balance = current_balance - (p_amount * p_dir) where id = p_account;
    update public.accounts set current_balance = current_balance + (p_amount * p_dir) where id = p_transfer;
  end if;
end;
$$;

-- Trigger de balance sobre transactions (INSERT / UPDATE / DELETE)
create or replace function public.apply_transaction_balance()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT') then
    perform public._adjust_balance(new.account_id, new.transfer_account_id, new.type, new.amount, 1);
    return new;
  elsif (tg_op = 'DELETE') then
    perform public._adjust_balance(old.account_id, old.transfer_account_id, old.type, old.amount, -1);
    return old;
  elsif (tg_op = 'UPDATE') then
    perform public._adjust_balance(old.account_id, old.transfer_account_id, old.type, old.amount, -1);
    perform public._adjust_balance(new.account_id, new.transfer_account_id, new.type, new.amount, 1);
    return new;
  end if;
  return null;
end;
$$;
create trigger transactions_balance
  after insert or update or delete on public.transactions
  for each row execute function public.apply_transaction_balance();

-- Recalcular saldo de una cuenta desde cero (reparación)
create or replace function public.recalculate_account_balance(p_account uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_balance bigint;
begin
  select a.initial_balance
       + coalesce(sum(case
           when t.type = 'income'   then t.amount
           when t.type = 'expense'  then -t.amount
           when t.type = 'transfer' then -t.amount
         end) filter (where t.account_id = a.id), 0)
       + coalesce(sum(t.amount) filter (
           where t.type = 'transfer' and t.transfer_account_id = a.id), 0)
    into v_balance
  from public.accounts a
  left join public.transactions t
    on t.account_id = a.id or t.transfer_account_id = a.id
  where a.id = p_account
  group by a.id, a.initial_balance;

  update public.accounts set current_balance = v_balance where id = p_account;
  return v_balance;
end;
$$;

-- ---------------------------------------------------------------------
-- updated_at en todas las tablas que lo tienen
-- ---------------------------------------------------------------------
create trigger set_updated_at before update on public.households      for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.profiles        for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.accounts        for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.categories      for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.transactions    for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.shared_expenses for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.budgets         for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.debts           for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.savings_goals   for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.investments     for each row execute function public.set_updated_at();


-- ============================================================
-- 20260723000007_rls_policies.sql
-- ============================================================
-- =====================================================================
-- Fase 1 · 0007 · Row Level Security
-- =====================================================================

alter table public.households            enable row level security;
alter table public.profiles              enable row level security;
alter table public.household_invitations enable row level security;
alter table public.accounts              enable row level security;
alter table public.categories            enable row level security;
alter table public.transactions          enable row level security;
alter table public.shared_expenses       enable row level security;
alter table public.shared_expense_splits enable row level security;
alter table public.settlements           enable row level security;
alter table public.budgets               enable row level security;
alter table public.debts                 enable row level security;
alter table public.savings_goals         enable row level security;
alter table public.investments           enable row level security;
alter table public.price_snapshots       enable row level security;

-- households: solo el propio hogar
create policy household_select on public.households
  for select using (id = public.current_household_id());
create policy household_update on public.households
  for update using (id = public.current_household_id());

-- profiles: cada quien ve su propio perfil (aunque aún no tenga hogar)
-- y también a los miembros de su mismo hogar; cada quien edita el suyo.
create policy profiles_select_self on public.profiles
  for select using (id = auth.uid());
create policy profiles_select_household on public.profiles
  for select using (household_id = public.current_household_id());
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid());

-- invitations: solo del propio hogar
create policy invitations_all on public.household_invitations
  for all using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

-- accounts: personales solo dueño; conjuntas ambos
create policy accounts_select on public.accounts
  for select using (
    household_id = public.current_household_id()
    and (owner_id is null or owner_id = auth.uid())
  );
create policy accounts_mutate on public.accounts
  for all using (
    household_id = public.current_household_id()
    and (owner_id is null or owner_id = auth.uid())
  ) with check (
    household_id = public.current_household_id()
    and created_by = auth.uid()
    and (owner_id is null or owner_id = auth.uid())
  );

-- categories / budgets / shared_expenses / settlements: hogar completo
create policy categories_all on public.categories
  for all using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

create policy budgets_all on public.budgets
  for all using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

create policy shared_expenses_all on public.shared_expenses
  for all using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

create policy settlements_all on public.settlements
  for all using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

-- splits: heredan visibilidad del gasto compartido
create policy splits_all on public.shared_expense_splits
  for all using (
    exists (select 1 from public.shared_expenses se
            where se.id = shared_expense_id
              and se.household_id = public.current_household_id())
  ) with check (
    exists (select 1 from public.shared_expenses se
            where se.id = shared_expense_id
              and se.household_id = public.current_household_id())
  );

-- transactions: visibilidad según la cuenta (personal/conjunta)
create policy transactions_select on public.transactions
  for select using (
    household_id = public.current_household_id()
    and public.can_access_account(account_id)
  );
create policy transactions_mutate on public.transactions
  for all using (
    household_id = public.current_household_id()
    and public.can_access_account(account_id)
  ) with check (
    household_id = public.current_household_id()
    and created_by = auth.uid()
    and public.can_access_account(account_id)
  );

-- debts / savings_goals / investments: personal solo dueño; null ambos
create policy debts_all on public.debts
  for all using (
    household_id = public.current_household_id()
    and (owner_id is null or owner_id = auth.uid())
  ) with check (
    household_id = public.current_household_id()
    and (owner_id is null or owner_id = auth.uid())
  );

create policy savings_all on public.savings_goals
  for all using (
    household_id = public.current_household_id()
    and (owner_id is null or owner_id = auth.uid())
  ) with check (
    household_id = public.current_household_id()
    and (owner_id is null or owner_id = auth.uid())
  );

create policy investments_all on public.investments
  for all using (
    household_id = public.current_household_id()
    and (owner_id is null or owner_id = auth.uid())
  ) with check (
    household_id = public.current_household_id()
    and (owner_id is null or owner_id = auth.uid())
  );

-- price_snapshots: heredan del holding
create policy snapshots_all on public.price_snapshots
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
-- 20260723000008_auth_onboarding.sql
-- ============================================================
-- =====================================================================
-- Fase 1 · 0008 · Onboarding de auth: alta de perfil, hogar, invitaciones
-- =====================================================================

-- Al crear un usuario en auth.users, crear su perfil (sin hogar aún)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Crear un hogar y hacer al usuario actual su dueño.
-- Solo permitido si el usuario aún no pertenece a ningún hogar.
create or replace function public.create_household(p_name text, p_display_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_household uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if exists (select 1 from public.profiles where id = auth.uid() and household_id is not null) then
    raise exception 'El usuario ya pertenece a un hogar';
  end if;

  insert into public.households (name) values (p_name) returning id into v_household;

  update public.profiles
     set household_id = v_household,
         role         = 'owner',
         display_name = coalesce(p_display_name, display_name)
   where id = auth.uid();

  return v_household;
end;
$$;

-- Crear una invitación para el segundo usuario. Devuelve el token.
create or replace function public.create_invitation(p_email citext)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_household uuid;
  v_token     uuid;
begin
  v_household := public.current_household_id();
  if v_household is null then
    raise exception 'El usuario no pertenece a ningún hogar';
  end if;

  insert into public.household_invitations (household_id, email, invited_by)
  values (v_household, p_email, auth.uid())
  on conflict (household_id, email)
    do update set status     = 'pending',
                  token      = gen_random_uuid(),
                  expires_at = now() + interval '7 days',
                  invited_by = auth.uid(),
                  accepted_at = null
  returning token into v_token;

  return v_token;
end;
$$;

-- Aceptar una invitación por token. Asigna el hogar al perfil del invitado.
create or replace function public.accept_invitation(p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_inv public.household_invitations;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select * into v_inv
    from public.household_invitations
   where token = p_token
   for update;

  if v_inv.id is null then
    raise exception 'Invitación no encontrada';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'La invitación no está pendiente';
  end if;
  if v_inv.expires_at < now() then
    update public.household_invitations set status = 'expired' where id = v_inv.id;
    raise exception 'La invitación expiró';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and household_id is not null) then
    raise exception 'El usuario ya pertenece a un hogar';
  end if;

  update public.profiles
     set household_id = v_inv.household_id,
         role         = 'member'
   where id = auth.uid();

  update public.household_invitations
     set status = 'accepted', accepted_at = now()
   where id = v_inv.id;

  return v_inv.household_id;
end;
$$;


-- ============================================================
-- 20260723000009_fix_invitation_fk.sql
-- ============================================================
-- =====================================================================
-- Fase 1 · 0009 · Fix: al borrar un perfil, sus invitaciones se eliminan
-- =====================================================================
-- Antes, borrar un usuario (auth.users -> cascade a profiles) fallaba si
-- había generado invitaciones, porque invited_by no tenía ON DELETE.

alter table public.household_invitations
  drop constraint household_invitations_invited_by_fkey,
  add constraint household_invitations_invited_by_fkey
    foreign key (invited_by) references public.profiles (id) on delete cascade;

