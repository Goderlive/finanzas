-- =====================================================================
-- Fase 3 · 0019 · Montos con signo + traspasos de partida doble
--
-- NO es aditiva: reescribe el signo de `transactions.amount` y parte cada
-- traspaso en dos asientos. Requiere backup previo (scripts/db-backup.sh).
-- Reversible con supabase/rollback/20260728_down_all.sql
--
-- QUÉ CAMBIA Y POR QUÉ
--
-- Antes, `amount` era siempre positivo y el signo lo ponía `type` dentro
-- del trigger de saldos. Eso hacía que el efecto de una fila sobre el
-- patrimonio dependiera de una regla escrita en otro lado, y que un mismo
-- hecho («pagué la tarjeta») pudiera capturarse con dos formas distintas
-- y signo opuesto según cuál eligiera quien captura.
--
-- Ahora `amount` YA ES el efecto sobre el saldo de `account_id`, y por la
-- regla de signo de la 0018 también es el efecto sobre el patrimonio neto:
--
--     ingreso           amount > 0
--     gasto             amount < 0
--     traspaso origen   amount < 0
--     traspaso destino  amount > 0
--
--   saldo de una cuenta = initial_balance + sum(amount) de sus filas
--   patrimonio neto     = sum(current_balance) de todas las cuentas
--
-- Un cargo a la tarjeta (gasto, negativo) la deja más negativa. Un pago
-- (traspaso destino, positivo) la acerca a cero, y puede cruzarla a
-- positivo: eso es saldo a favor, y es un estado válido.
--
-- TRASPASOS: dos asientos ligados por `transfer_group_id`, escritos en una
-- sola transacción de base de datos. Sin categoría, fuera de los reportes
-- de ingreso y gasto, y con propagación de borrado y edición al hermano.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Fuera lo viejo (triggers y constraints que asumen amount > 0)
-- ---------------------------------------------------------------------
drop trigger if exists transactions_balance on public.transactions;

alter table public.transactions
  drop constraint if exists transactions_amount_check,
  drop constraint if exists transfer_shape;

-- ---------------------------------------------------------------------
-- 2. Columnas nuevas
-- ---------------------------------------------------------------------
alter table public.transactions
  add column if not exists transfer_group_id uuid;

comment on column public.transactions.transfer_group_id is
  'Liga los dos asientos de un traspaso. NULL en ingresos y gastos.';

do $$ begin
  alter table public.transactions
    add column is_transfer boolean
    generated always as (type = 'transfer') stored;
exception when duplicate_column then null; end $$;

comment on column public.transactions.is_transfer is
  'Derivado de type, no se escribe a mano. Los reportes de ingreso y gasto excluyen las filas con is_transfer.';

create index if not exists transactions_transfer_group_idx
  on public.transactions (transfer_group_id) where transfer_group_id is not null;

-- ---------------------------------------------------------------------
-- 3. Migración de los datos existentes
--    (el trigger de saldos ya está caído; los saldos se recalculan al final)
-- ---------------------------------------------------------------------

-- 3a. Los gastos pasan a negativo. Idempotente: sólo toca los que aún no
--     lo están, por si la migración se corre dos veces.
update public.transactions
   set amount = -amount
 where type = 'expense' and amount > 0;

-- 3b. Los ingresos ya estaban en positivo; se normaliza por si acaso.
update public.transactions
   set amount = abs(amount)
 where type = 'income' and amount < 0;

-- 3c. Cada traspaso de una fila se convierte en dos asientos.
--     La fila original se queda como el asiento de ORIGEN (negativo) y se
--     crea el asiento espejo de DESTINO (positivo).
do $$
declare
  v_row record;
  v_group uuid;
begin
  for v_row in
    select * from public.transactions
     where type = 'transfer' and transfer_group_id is null
  loop
    v_group := gen_random_uuid();

    -- Origen: se queda con la fila original, en negativo y sin categoría.
    update public.transactions
       set amount            = -abs(v_row.amount),
           transfer_group_id = v_group,
           category_id       = null
     where id = v_row.id;

    -- Destino: asiento espejo. `transfer_account_id` apunta de vuelta al
    -- origen, así cada asiento sabe cuál es su contraparte.
    insert into public.transactions (
      household_id, account_id, transfer_account_id, category_id,
      type, amount, description, occurred_at, created_by,
      transfer_group_id, created_at, updated_at
    ) values (
      v_row.household_id,
      v_row.transfer_account_id,
      v_row.account_id,
      null,
      'transfer',
      abs(v_row.amount),
      v_row.description,
      v_row.occurred_at,
      v_row.created_by,
      v_group,
      v_row.created_at,
      now()
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Constraints nuevas: el signo deja de ser una convención y pasa a ser
--    una regla que la base hace cumplir.
-- ---------------------------------------------------------------------
-- Los `drop ... if exists` hacen la migración re-ejecutable: correrla dos
-- veces no falla y no cambia nada la segunda vez.
alter table public.transactions
  drop constraint if exists transactions_amount_nonzero,
  drop constraint if exists transactions_sign_matches_type,
  drop constraint if exists transactions_transfer_shape;

alter table public.transactions
  add constraint transactions_amount_nonzero check (amount <> 0);

alter table public.transactions
  add constraint transactions_sign_matches_type check (
    (type = 'income'   and amount > 0) or
    (type = 'expense'  and amount < 0) or
    (type = 'transfer')
  );

comment on constraint transactions_sign_matches_type on public.transactions is
  'El signo de amount es el efecto sobre el patrimonio: ingreso positivo, gasto negativo. El traspaso lo fija su lado.';

-- Forma de un traspaso: contraparte distinta, grupo obligatorio y SIN
-- categoría de gasto (un traspaso no es consumo, sólo mueve dinero).
alter table public.transactions
  add constraint transactions_transfer_shape check (
    (type = 'transfer'
       and transfer_account_id is not null
       and transfer_account_id <> account_id
       and transfer_group_id is not null
       and category_id is null)
    or
    (type <> 'transfer'
       and transfer_account_id is null
       and transfer_group_id is null)
  );

-- ---------------------------------------------------------------------
-- 5. Trigger de saldos: ahora es una suma, sin ramas por tipo
-- ---------------------------------------------------------------------
create or replace function public.apply_transaction_balance()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.accounts
       set current_balance = current_balance + new.amount
     where id = new.account_id;
    return new;

  elsif tg_op = 'DELETE' then
    update public.accounts
       set current_balance = current_balance - old.amount
     where id = old.account_id;
    return old;

  elsif tg_op = 'UPDATE' then
    -- Revierte donde estaba y aplica donde queda; cubre el cambio de cuenta.
    update public.accounts
       set current_balance = current_balance - old.amount
     where id = old.account_id;
    update public.accounts
       set current_balance = current_balance + new.amount
     where id = new.account_id;
    return new;
  end if;
  return null;
end;
$$;

create trigger transactions_balance
  after insert or update or delete on public.transactions
  for each row execute function public.apply_transaction_balance();

-- `_adjust_balance` ya no tiene sentido: el signo vive en la fila.
drop function if exists public._adjust_balance(uuid, uuid, public.transaction_type, bigint, int);

-- ---------------------------------------------------------------------
-- 6. Integridad del par de un traspaso
-- ---------------------------------------------------------------------

-- Borrar un lado borra el otro. La recursión termina sola: cuando el
-- trigger del hermano se dispara, la fila que lo invocó ya no existe y el
-- delete no encuentra nada.
create or replace function public.cascade_transfer_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.transactions
   where transfer_group_id = old.transfer_group_id
     and id <> old.id;
  return null;
end;
$$;

drop trigger if exists transactions_transfer_delete on public.transactions;
create trigger transactions_transfer_delete
  after delete on public.transactions
  for each row when (old.transfer_group_id is not null)
  execute function public.cascade_transfer_delete();

-- Editar un lado edita el otro (monto, fecha, descripción y contraparte).
-- El `where` de desigualdad corta la recursión: al actualizar al hermano,
-- su trigger encuentra que el original ya coincide y no escribe nada.
create or replace function public.sync_transfer_sibling()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.transactions t
     set amount              = -new.amount,
         occurred_at         = new.occurred_at,
         description         = new.description,
         transfer_account_id = new.account_id
   where t.transfer_group_id = new.transfer_group_id
     and t.id <> new.id
     and (t.amount              is distinct from -new.amount
       or t.occurred_at         is distinct from new.occurred_at
       or t.description         is distinct from new.description
       or t.transfer_account_id is distinct from new.account_id);
  return null;
end;
$$;

drop trigger if exists transactions_transfer_sync on public.transactions;
create trigger transactions_transfer_sync
  after update on public.transactions
  for each row when (new.transfer_group_id is not null)
  execute function public.sync_transfer_sibling();

-- ---------------------------------------------------------------------
-- 7. Recálculo de saldos desde cero (ahora es una suma)
-- ---------------------------------------------------------------------
create or replace function public.recalculate_account_balance(p_account uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_balance bigint;
begin
  select a.initial_balance
       + coalesce((select sum(t.amount)
                     from public.transactions t
                    where t.account_id = a.id), 0)
    into v_balance
    from public.accounts a
   where a.id = p_account;

  update public.accounts set current_balance = v_balance where id = p_account;
  return v_balance;
end;
$$;

create or replace function public.recalculate_all_balances()
returns table (account_id uuid, name text, before bigint, after bigint)
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_new bigint;
begin
  for r in select id, accounts.name as nm, current_balance from public.accounts loop
    v_new := public.recalculate_account_balance(r.id);
    account_id := r.id;
    name       := r.nm;
    before     := r.current_balance;
    after      := v_new;
    return next;
  end loop;
end;
$$;

comment on function public.recalculate_all_balances() is
  'Recalcula current_balance de todas las cuentas desde initial_balance + transacciones. Devuelve antes/después.';

-- ---------------------------------------------------------------------
-- 8. El calendario MSI se mide en magnitudes, no en asientos
--
-- `create_installment_plan` leía `transactions.amount` tal cual para
-- llenar `total_amount`, que exige ser positivo. Con el gasto ahora en
-- negativo eso reventaría el check, así que toma el valor absoluto.
--
-- Decisión: installment_plans e installment_payments siguen guardando
-- importes POSITIVOS. No son asientos del libro mayor, son un calendario
-- de «cuánto toca pagar»; ahí el signo no aporta nada.
-- ---------------------------------------------------------------------
create or replace function public.create_installment_plan(
  p_transaction_id uuid,
  p_months smallint
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tx     record;
  v_card   record;
  v_plan   uuid;
  v_close  date;
  v_base   bigint;
  v_total  bigint;
  n        int;
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

  -- El gasto se guarda en negativo; el calendario se expresa en magnitud.
  v_total := abs(v_tx.amount);

  -- Mensualidad base truncada; el sobrante va en la última (ver abajo).
  v_base := v_total / p_months;
  if v_base <= 0 then
    raise exception 'El monto es demasiado pequeño para dividirse en % mensualidades', p_months;
  end if;

  -- Corte al que se factura la compra: ahí arranca la mensualidad 1.
  v_close := public.statement_close_for(v_tx.occurred_at, v_card.statement_day);

  insert into public.installment_plans (
    household_id, transaction_id, total_amount, months, monthly_amount,
    first_payment_date, remaining_months, created_by
  ) values (
    v_tx.household_id, v_tx.id, v_total, p_months, v_base,
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
           else v_total - v_base * (p_months - 1) end,
      public.statement_close_plus(v_close, v_card.statement_day, n - 1)
    );
  end loop;

  return v_plan;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. Cuadrar los saldos con el libro mayor ya migrado
-- ---------------------------------------------------------------------
select public.recalculate_account_balance(id) from public.accounts;
