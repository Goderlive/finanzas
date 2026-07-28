-- =====================================================================
-- Rollback de las migraciones 0017-0020 (regla de signo y traspasos)
--
--   psql "$DATABASE_URL" -f supabase/rollback/20260728_down_all.sql
--
-- Devuelve el esquema al estado previo: `amount` positivo con el signo en
-- el trigger, y traspasos de una sola fila.
--
-- LÍMITES QUE HAY QUE CONOCER ANTES DE CORRERLO:
--
--   · `account_type` NO puede perder el valor 'loan': PostgreSQL no permite
--     quitar valores de un enum. Si hay cuentas de tipo 'loan' hay que
--     convertirlas a 'other' a mano ANTES. El script aborta si las
--     encuentra.
--
--   · Las mensualidades MSI marcadas como pagadas por `pay_credit_card` NO
--     se desmarcan: no hay forma de saber cuáles lo estaban de antes.
--
--   · La reparación de datos (supabase/repair/) NO se deshace aquí. Para
--     revertirla hay que restaurar el backup.
--
-- Si lo que quieres es volver al estado exacto anterior, restaurar el
-- backup es más seguro que este script. Ver scripts/db-backup.sh.
-- =====================================================================

do $$ begin
  if exists (select 1 from public.accounts where type = 'loan') then
    raise exception
      'Hay cuentas de tipo loan. Conviértelas a otro tipo antes de revertir: un enum no puede perder valores.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Fuera lo nuevo
--
-- El esquema `repair` va primero: sus funciones dependen del tipo
-- account_class, y sin quitarlas el DROP TYPE de más abajo falla.
-- ---------------------------------------------------------------------
drop schema if exists repair cascade;

drop trigger if exists transactions_transfer_sync   on public.transactions;
drop trigger if exists transactions_transfer_delete on public.transactions;
drop trigger if exists transactions_balance         on public.transactions;

drop function if exists public.pay_credit_card(uuid, uuid, bigint, date, text);
drop function if exists public.create_transfer(uuid, uuid, bigint, date, text);
drop function if exists public.credit_card_cycle(uuid, date);
drop function if exists public.credit_card_unbilled_msi(uuid, date, date);
drop function if exists public.sync_transfer_sibling();
drop function if exists public.cascade_transfer_delete();
drop function if exists public.recalculate_all_balances();
drop function if exists public.household_net_worth(uuid);

alter table public.transactions
  drop constraint if exists transactions_amount_nonzero,
  drop constraint if exists transactions_sign_matches_type,
  drop constraint if exists transactions_transfer_shape;

-- ---------------------------------------------------------------------
-- 2. Volver a fusionar cada traspaso en una sola fila
--    Se conserva el asiento de origen (el negativo) y se borra el espejo.
-- ---------------------------------------------------------------------
delete from public.transactions
 where type = 'transfer' and amount > 0 and transfer_group_id is not null;

update public.transactions
   set amount = abs(amount)
 where type = 'transfer';

-- ---------------------------------------------------------------------
-- 3. Los gastos vuelven a positivo
-- ---------------------------------------------------------------------
update public.transactions
   set amount = abs(amount)
 where type = 'expense';

-- ---------------------------------------------------------------------
-- 4. Columnas nuevas fuera
-- ---------------------------------------------------------------------
drop index if exists public.transactions_transfer_group_idx;
alter table public.transactions
  drop column if exists is_transfer,
  drop column if exists transfer_group_id;

drop index if exists public.accounts_class_idx;
alter table public.accounts
  drop column if exists account_class,
  drop column if exists minimum_payment;

drop function if exists public.account_class_for(public.account_type);
drop type if exists public.account_class;

alter table public.accounts drop constraint if exists accounts_minimum_payment_positive;
alter table public.accounts drop constraint if exists accounts_cycle_only_credit_card;
alter table public.accounts add constraint accounts_cycle_only_credit_card check (
  type = 'credit_card'
  or (statement_day is null and payment_day is null and credit_limit is null)
);

-- ---------------------------------------------------------------------
-- 5. Restituir constraints y trigger originales
-- ---------------------------------------------------------------------
alter table public.transactions
  add constraint transactions_amount_check check (amount > 0);

alter table public.transactions
  add constraint transfer_shape check (
    (type = 'transfer'
       and transfer_account_id is not null
       and transfer_account_id <> account_id)
    or
    (type <> 'transfer' and transfer_account_id is null)
  );

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

-- MSI: vuelve a leer `amount` tal cual (positivo otra vez).
create or replace function public.create_installment_plan(
  p_transaction_id uuid, p_months smallint
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_tx record; v_card record; v_plan uuid; v_close date; v_base bigint; n int;
begin
  if p_months is null or p_months < 2 or p_months > 120 then
    raise exception 'El plazo debe estar entre 2 y 120 meses';
  end if;
  select t.id, t.type, t.amount, t.occurred_at, t.account_id, t.household_id
    into v_tx from public.transactions t where t.id = p_transaction_id;
  if not found then
    raise exception 'La transacción no existe o no tienes acceso a ella';
  end if;
  if v_tx.type <> 'expense' then
    raise exception 'Sólo un gasto puede diferirse a meses sin intereses';
  end if;
  if exists (select 1 from public.installment_plans p where p.transaction_id = v_tx.id) then
    raise exception 'Esta compra ya tiene un plan de meses sin intereses';
  end if;
  select a.id, a.name, a.type, a.statement_day, a.payment_day
    into v_card from public.accounts a where a.id = v_tx.account_id;
  if v_card.type <> 'credit_card' then
    raise exception '% no es una tarjeta de crédito', v_card.name;
  end if;
  if v_card.statement_day is null or v_card.payment_day is null then
    raise exception 'Configura el día de corte y el día de pago de % antes de diferir a MSI', v_card.name;
  end if;
  v_base := v_tx.amount / p_months;
  if v_base <= 0 then
    raise exception 'El monto es demasiado pequeño para dividirse en % mensualidades', p_months;
  end if;
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
      v_plan, n,
      public.payment_due_for(
        public.statement_close_plus(v_close, v_card.statement_day, n - 1),
        v_card.statement_day, v_card.payment_day),
      case when n < p_months then v_base
           else v_tx.amount - v_base * (p_months - 1) end,
      public.statement_close_plus(v_close, v_card.statement_day, n - 1)
    );
  end loop;
  return v_plan;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Cuadrar saldos con la fórmula vieja
-- ---------------------------------------------------------------------
select public.recalculate_account_balance(id) from public.accounts;
