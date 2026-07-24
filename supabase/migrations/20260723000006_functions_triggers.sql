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
