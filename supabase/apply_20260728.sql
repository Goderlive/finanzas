-- =====================================================================
-- APLICAR EN SUPABASE (SQL Editor o psql) — lote 20260728
--
-- Regla de signo única (activo/pasivo), montos con signo, traspasos de
-- partida doble y pago de tarjeta. Reejecutable sin efectos.
--
-- ANTES DE EJECUTAR:  ./scripts/db-backup.sh
-- DESPUÉS:            supabase/repair/20260728_repair_signs.sql  (dry-run
--                     primero, ver scripts/db-repair-signs.sh)
-- PARA REVERTIR:      supabase/rollback/20260728_down_all.sql
--
-- OJO: la 0017 (alter type ... add value) debe ir en su propia
-- transacción. En el SQL Editor de Supabase ejecútala SOLA primero, y
-- después el resto. Con psql y este archivo completo no hace falta:
-- cada sentencia va en autocommit.
-- =====================================================================


-- ============================================================
-- 20260728000017_account_type_loan.sql
-- ============================================================
-- =====================================================================
-- Fase 3 · 0017 · 'loan' como tipo de cuenta
--
-- ADITIVA: sólo agrega un valor al enum account_type.
--
-- Va en su propio archivo a propósito: `alter type ... add value` no puede
-- usarse dentro de la misma transacción que lo declara, y la migración 0018
-- necesita referirse a 'loan' en la expresión de una columna generada.
-- =====================================================================

alter type public.account_type add value if not exists 'loan';


-- ============================================================
-- 20260728000018_account_class.sql
-- ============================================================
-- =====================================================================
-- Fase 3 · 0018 · Criterio de signo único: activo vs. pasivo
--
-- ADITIVA: un enum nuevo, una función nueva y una columna GENERADA en
-- accounts. No borra ni reescribe ninguna columna existente.
--
-- REGLA DE ORO DEL PROYECTO (aplica a toda la base, sin excepciones):
--
--   `accounts.current_balance` y `transactions.amount` se guardan SIEMPRE
--   con signo desde la perspectiva del patrimonio neto.
--
--     · activo  (checking, savings, cash, investment, other) → positivo
--     · pasivo  (credit_card, loan)                          → NEGATIVO
--       cuando se debe; positivo sólo si hay saldo a favor.
--
--   El valor absoluto y la etiqueta «debes X» son de la capa de
--   presentación. En la base nunca se guarda una deuda en positivo.
--
--   Corolario: el patrimonio neto es `sum(current_balance)`, una suma
--   simple sin condicionales por tipo de cuenta.
-- =====================================================================

do $$ begin
  create type public.account_class as enum ('asset', 'liability');
exception when duplicate_object then null; end $$;

comment on type public.account_class is
  'Naturaleza de una cuenta para efectos de signo. asset: el saldo positivo suma al patrimonio. liability: el saldo negativo resta.';

-- Derivación única del tipo a la clase. Inmutable para poder usarla en una
-- columna generada: la clase de una cuenta no puede desincronizarse del tipo
-- porque no existe forma de escribirla a mano.
create or replace function public.account_class_for(p_type public.account_type)
returns public.account_class language sql immutable strict as $$
  select case
    when p_type in ('credit_card', 'loan') then 'liability'
    else 'asset'
  end::public.account_class;
$$;

comment on function public.account_class_for(public.account_type) is
  'Clase (activo/pasivo) que corresponde a un tipo de cuenta. Única fuente de verdad de esa derivación.';

alter table public.accounts
  add column if not exists account_class public.account_class
  generated always as (public.account_class_for(type)) stored;

comment on column public.accounts.account_class is
  'Derivado de type, no se escribe a mano. Los pasivos guardan la deuda en NEGATIVO.';

create index if not exists accounts_class_idx on public.accounts (household_id, account_class);

-- ---------------------------------------------------------------------
-- Patrimonio neto: suma simple, sin condicionales
-- ---------------------------------------------------------------------
create or replace function public.household_net_worth(p_household uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum(current_balance), 0)::bigint
    from public.accounts
   where household_id = p_household
     and not is_archived;
$$;

comment on function public.household_net_worth(uuid) is
  'Patrimonio neto aportado por las cuentas: suma simple de current_balance. Los pasivos ya vienen en negativo.';


-- ============================================================
-- 20260728000019_signed_amounts_transfers.sql
-- ============================================================
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


-- ============================================================
-- 20260728000020_card_payment.sql
-- ============================================================
-- =====================================================================
-- Fase 3 · 0020 · Traspasos y pago de tarjeta como operaciones atómicas
--
-- ADITIVA: una columna nullable en accounts + funciones nuevas.
--
-- `create_transfer` y `pay_credit_card` son la única forma soportada de
-- escribir un traspaso: garantizan que los dos asientos nacen juntos o no
-- nace ninguno, cosa que dos INSERT sueltos desde el cliente no pueden
-- prometer.
-- =====================================================================

-- ---------------------------------------------------------------------
-- "Hoy" según el hogar, no según el servidor
--
-- La base corre en UTC. `current_date` cambia de día a las 18:00 hora de
-- México, así que un pago hecho por la noche se guardaba con la fecha del
-- día siguiente y podía caer del otro lado del corte. Todo default de
-- fecha de este archivo pasa por aquí.
--
-- El gemelo en TypeScript es `today()` en src/lib/dates.ts.
-- ---------------------------------------------------------------------
create or replace function public.household_today()
returns date language sql stable as $$
  select (now() at time zone 'America/Mexico_City')::date;
$$;

comment on function public.household_today() is
  'Fecha de hoy en la zona del hogar (America/Mexico_City). Usar en lugar de current_date.';

-- Pago mínimo del corte, si el banco lo informa. Sólo aplica a tarjetas.
alter table public.accounts
  add column if not exists minimum_payment bigint;

comment on column public.accounts.minimum_payment is
  'Pago mínimo del último corte en centavos, capturado a mano. NULL si no está configurado.';

do $$ begin
  alter table public.accounts add constraint accounts_minimum_payment_positive
    check (minimum_payment is null or minimum_payment >= 0);
exception when duplicate_object then null; end $$;

-- La restricción 0010 sólo permitía campos de ciclo en tarjetas; se
-- reemplaza para incluir el pago mínimo bajo la misma regla.
alter table public.accounts drop constraint if exists accounts_cycle_only_credit_card;
alter table public.accounts add constraint accounts_cycle_only_credit_card check (
  type = 'credit_card'
  or (statement_day is null and payment_day is null
      and credit_limit is null and minimum_payment is null)
);

-- ---------------------------------------------------------------------
-- Traspaso: dos asientos, una sola transacción
-- ---------------------------------------------------------------------
create or replace function public.create_transfer(
  p_from_account uuid,
  p_to_account   uuid,
  p_amount       bigint,          -- centavos, SIEMPRE positivo
  p_occurred_at  date default public.household_today(),
  p_description  text default null
) returns uuid                     -- transfer_group_id
language plpgsql security definer set search_path = public as $$
declare
  v_group     uuid := gen_random_uuid();
  v_household uuid := public.current_household_id();
  v_user      uuid := auth.uid();
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto del traspaso debe ser mayor a cero'
      using errcode = 'check_violation';
  end if;

  if p_from_account = p_to_account then
    raise exception 'El origen y el destino deben ser cuentas distintas'
      using errcode = 'check_violation';
  end if;

  if not public.can_access_account(p_from_account) then
    raise exception 'No tienes acceso a la cuenta de origen'
      using errcode = 'insufficient_privilege';
  end if;

  if not public.can_access_account(p_to_account) then
    raise exception 'No tienes acceso a la cuenta de destino'
      using errcode = 'insufficient_privilege';
  end if;

  -- Ambos asientos en un solo INSERT: o entran los dos, o no entra ninguno.
  insert into public.transactions (
    household_id, account_id, transfer_account_id, category_id,
    type, amount, description, occurred_at, created_by, transfer_group_id
  )
  values
    (v_household, p_from_account, p_to_account, null,
     'transfer', -p_amount, p_description, p_occurred_at, v_user, v_group),
    (v_household, p_to_account, p_from_account, null,
     'transfer',  p_amount, p_description, p_occurred_at, v_user, v_group);

  return v_group;
end;
$$;

comment on function public.create_transfer(uuid, uuid, bigint, date, text) is
  'Crea un traspaso como dos asientos ligados por transfer_group_id, ambos o ninguno.';

-- ---------------------------------------------------------------------
-- Aritmética del ciclo, del lado del servidor
--
-- Espejo de computeCreditCardCycle en src/lib/credit-cycle.ts. Se
-- replica aquí porque el pago necesita repartirse contra el saldo del
-- corte sin depender de que el cliente lo calcule bien.
-- ---------------------------------------------------------------------

-- Parte de las compras a MSI que el banco todavía NO ha facturado.
create or replace function public.credit_card_unbilled_msi(
  p_card                    uuid,
  p_billed_through          date,
  p_purchased_on_or_before  date default null
) returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum(p.total_amount - coalesce(billed.amt, 0)), 0)::bigint
    from public.installment_plans p
    join public.transactions t on t.id = p.transaction_id
    left join lateral (
      select sum(i.amount) as amt
        from public.installment_payments i
       where i.plan_id = p.id
         and i.statement_period <= p_billed_through
    ) billed on true
   where t.account_id = p_card
     and p.status <> 'cancelled'
     and (p_purchased_on_or_before is null
          or t.occurred_at <= p_purchased_on_or_before);
$$;

-- Estado del ciclo de una tarjeta a una fecha dada.
create or replace function public.credit_card_cycle(
  p_card uuid,
  p_now  date default public.household_today()
) returns table (
  configured      boolean,
  last_close      date,
  next_close      date,
  due_date        date,
  raw_debt        bigint,   -- todo lo cargado, MSI completos incluidos
  statement_debt  bigint,   -- lo que hay que pagar del último corte
  current_debt    bigint,   -- revolvente a hoy, sin MSI no facturado
  msi_unbilled    bigint,
  minimum_payment bigint
) language plpgsql stable security definer set search_path = public as $$
declare
  a               record;
  v_effects_after bigint;
  v_balance_close bigint;
begin
  select * into a from public.accounts where id = p_card;
  if not found or a.account_class <> 'liability' then
    raise exception 'La cuenta no es una tarjeta o préstamo' using errcode = 'check_violation';
  end if;

  raw_debt        := greatest(0, -a.current_balance);
  minimum_payment := a.minimum_payment;

  if a.statement_day is null or a.payment_day is null then
    configured     := false;
    statement_debt := 0;
    current_debt   := raw_debt;
    msi_unbilled   := 0;
    return next;
    return;
  end if;

  configured := true;
  next_close := public.statement_close_for(p_now, a.statement_day);
  last_close := public.statement_close_plus(next_close, a.statement_day, -1);

  -- Rebobina el saldo al último corte deshaciendo lo posterior...
  select coalesce(sum(t.amount), 0) into v_effects_after
    from public.transactions t
   where t.account_id = p_card and t.occurred_at > last_close;

  -- ...y devuelve lo que en esa fecha aún no estaba facturado.
  v_balance_close := a.current_balance - v_effects_after
                   + public.credit_card_unbilled_msi(p_card, last_close, last_close);

  statement_debt := greatest(0, -v_balance_close);
  msi_unbilled   := public.credit_card_unbilled_msi(p_card, next_close, null);
  current_debt   := greatest(0, -(a.current_balance + msi_unbilled));
  due_date       := public.payment_due_for(
                      case when statement_debt > 0 then last_close else next_close end,
                      a.statement_day, a.payment_day);
  return next;
end;
$$;

comment on function public.credit_card_cycle(uuid, date) is
  'Estado del ciclo de una tarjeta. Espejo en SQL de computeCreditCardCycle (src/lib/credit-cycle.ts).';

-- ---------------------------------------------------------------------
-- Pago de tarjeta
--
-- Es un traspaso con reglas propias, no un traspaso genérico: además de
-- mover el dinero reparte el importe contra el ciclo y marca las
-- mensualidades MSI que quedan cubiertas.
--
-- Orden de aplicación (el que pidió el usuario):
--   1. Mensualidades MSI vencidas y no pagadas del periodo
--   2. Saldo revolvente del último corte
--   3. Compras del periodo en curso
--
-- El reparto 2 y 3 no tiene almacenamiento propio: lo absorbe el saldo de
-- la tarjeta, que el asiento del traspaso ya movió. Lo que sí persiste es
-- el marcado de las mensualidades del punto 1.
-- ---------------------------------------------------------------------
create or replace function public.pay_credit_card(
  p_from_account uuid,
  p_card         uuid,
  p_amount       bigint,          -- centavos, positivo
  p_occurred_at  date default public.household_today(),
  p_description  text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_card        record;
  v_cycle       record;
  v_group       uuid;
  v_remaining   bigint;
  v_to_msi      bigint := 0;
  v_msi_count   int    := 0;
  v_to_stmt     bigint := 0;
  v_to_period   bigint := 0;
  v_to_credit   bigint := 0;
  v_period_debt bigint;
  i             record;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto del pago debe ser mayor a cero'
      using errcode = 'check_violation';
  end if;

  select * into v_card from public.accounts where id = p_card;
  if not found then
    raise exception 'La tarjeta no existe' using errcode = 'no_data_found';
  end if;
  if v_card.account_class <> 'liability' then
    raise exception 'Sólo se puede pagar una tarjeta de crédito o un préstamo'
      using errcode = 'check_violation';
  end if;
  if p_from_account = p_card then
    raise exception 'El origen y el destino deben ser cuentas distintas'
      using errcode = 'check_violation';
  end if;

  select * into v_cycle from public.credit_card_cycle(p_card, p_occurred_at);

  -- El movimiento de dinero: mismo par de asientos que cualquier traspaso.
  v_group := public.create_transfer(
    p_from_account, p_card, p_amount, p_occurred_at,
    coalesce(p_description, 'Pago de ' || v_card.name)
  );

  v_remaining := p_amount;

  -- 1. MSI vencidas y no pagadas: las ya facturadas por el banco, de la
  --    más antigua a la más reciente. Una mensualidad sólo se marca si el
  --    pago la cubre COMPLETA; un pago parcial no la salda.
  for i in
    select ip.id, ip.amount
      from public.installment_payments ip
      join public.installment_plans pl on pl.id = ip.plan_id
      join public.transactions t on t.id = pl.transaction_id
     where t.account_id = p_card
       and pl.status <> 'cancelled'
       and not ip.is_paid
       and ip.statement_period <= coalesce(v_cycle.last_close, p_occurred_at)
     order by ip.statement_period, ip.installment_no
  loop
    exit when v_remaining < i.amount;
    update public.installment_payments
       set is_paid = true, paid_at = p_occurred_at
     where id = i.id;
    v_remaining := v_remaining - i.amount;
    v_to_msi    := v_to_msi + i.amount;
    v_msi_count := v_msi_count + 1;
  end loop;

  -- 2. Saldo revolvente del último corte.
  v_to_stmt   := least(v_remaining, greatest(0, v_cycle.statement_debt - v_to_msi));
  v_remaining := v_remaining - v_to_stmt;

  -- 3. Compras del periodo en curso.
  v_period_debt := greatest(0, v_cycle.current_debt - v_cycle.statement_debt);
  v_to_period   := least(v_remaining, v_period_debt);
  v_remaining   := v_remaining - v_to_period;

  -- Lo que sobra deja la tarjeta en positivo: saldo a favor, válido.
  v_to_credit := v_remaining;

  return jsonb_build_object(
    'transfer_group_id',      v_group,
    'amount',                 p_amount,
    'applied_to_msi',         v_to_msi,
    'msi_installments_paid',  v_msi_count,
    'applied_to_statement',   v_to_stmt,
    'applied_to_period',      v_to_period,
    'credit_balance',         v_to_credit,
    'statement_debt_before',  v_cycle.statement_debt,
    'statement_debt_after',   greatest(0, v_cycle.statement_debt - v_to_msi - v_to_stmt),
    'interest_on',            greatest(0, v_cycle.statement_debt - v_to_msi - v_to_stmt)
  );
end;
$$;

comment on function public.pay_credit_card(uuid, uuid, bigint, date, text) is
  'Paga una tarjeta desde otra cuenta: crea el traspaso y reparte el importe (MSI vencidas > saldo del corte > periodo en curso).';

revoke all on function public.create_transfer(uuid, uuid, bigint, date, text) from public;
revoke all on function public.pay_credit_card(uuid, uuid, bigint, date, text) from public;
grant execute on function public.create_transfer(uuid, uuid, bigint, date, text) to authenticated;
grant execute on function public.pay_credit_card(uuid, uuid, bigint, date, text) to authenticated;
grant execute on function public.credit_card_cycle(uuid, date) to authenticated;
grant execute on function public.recalculate_all_balances() to authenticated;
