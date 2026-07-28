-- =====================================================================
-- Fase 4 · Reparación de datos históricos
--
-- Instala el esquema `repair` con tres funciones. NO cambia nada por sí
-- solo: `repair.findings()` y `repair.balance_report()` son de sólo
-- lectura y `repair.apply()` hay que llamarla a propósito.
--
--   psql "$DATABASE_URL" -f supabase/repair/20260728_repair_signs.sql
--   select * from repair.findings();          -- dry-run
--   select * from repair.apply();             -- aplica
--
-- Se usa mejor con scripts/db-repair-signs.sh, que además obliga a que
-- exista un backup previo.
--
-- IDEMPOTENTE: cada hallazgo se detecta por el estado que quiere corregir,
-- así que una segunda corrida no encuentra nada que hacer.
--
-- ROLLBACK: `repair.apply()` corre dentro de una transacción; si algo
-- falla no queda nada aplicado. Para deshacer una corrida que sí terminó,
-- restaurar el backup (ver scripts/db-backup.sh).
-- =====================================================================

create schema if not exists repair;

-- ---------------------------------------------------------------------
-- Reconoce la descripción de un pago a tarjeta, sin tragarse los gastos
-- que sólo empiezan con «pago» («Pago del cable», «Pago estacionamiento»).
-- ---------------------------------------------------------------------
create or replace function repair.looks_like_card_payment(p_description text)
returns boolean language sql immutable as $$
  select coalesce(p_description, '') ~*
    '^\s*(pago|abono|liquidaci[oó]n)\s+(de\s+|a\s+|del\s+|al\s+|para\s+)?(la\s+|mi\s+|el\s+)?(tarjeta|tdc|cr[eé]dito)';
$$;

-- ---------------------------------------------------------------------
-- Hallazgos propuestos. Sólo lectura.
--
-- `action` distingue lo que se aplica solo de lo que requiere criterio:
--   fix_initial_balance_sign  se aplica
--   delete_duplicate_payment  se aplica
--   reclassify_as_transfer    NO se aplica: falta saber la cuenta origen
--   review_negative_asset     NO se aplica: sólo informa
-- ---------------------------------------------------------------------
create or replace function repair.findings()
returns table (
  action       text,
  auto         boolean,
  entity       text,
  entity_id    uuid,
  detail       text,
  amount_now   bigint,
  amount_after bigint
) language sql stable set search_path = public, repair as $$

  -- A. Pasivo con saldo inicial capturado en positivo.
  --    Bajo la regla de signo, un pasivo en positivo significa saldo a
  --    favor. Capturar ahí la deuda invierte el efecto de cada pago: el
  --    abono suma en vez de restar.
  select
    'fix_initial_balance_sign'::text,
    true,
    'account'::text,
    a.id,
    format('%s (%s): saldo inicial en positivo sobre una cuenta de pasivo',
           a.name, a.type),
    a.initial_balance,
    -a.initial_balance
  from public.accounts a
  where a.account_class = 'liability'
    and a.initial_balance > 0

  union all

  -- B1. Pago a tarjeta capturado como gasto sobre la propia tarjeta, que
  --     ADEMÁS ya tiene su traspaso correcto. Es un duplicado: dejarlo
  --     como traspaso contaría el pago dos veces.
  select
    'delete_duplicate_payment'::text,
    true,
    'transaction'::text,
    e.id,
    format('%s · %s · %s: ya existe el traspaso %s del mismo importe',
           to_char(e.occurred_at, 'YYYY-MM-DD'), a.name,
           coalesce(e.description, '(sin descripción)'),
           to_char(tr.occurred_at, 'YYYY-MM-DD')),
    e.amount,
    null::bigint
  from public.transactions e
  join public.accounts a on a.id = e.account_id and a.account_class = 'liability'
  join public.transactions tr
    on tr.type = 'transfer'
   and tr.account_id = e.account_id
   and tr.amount = abs(e.amount)                   -- lado destino del traspaso
   and abs(tr.occurred_at - e.occurred_at) <= 7
  where e.type = 'expense'
    and repair.looks_like_card_payment(e.description)

  union all

  -- B2. Pago a tarjeta capturado como gasto SIN traspaso que le
  --     corresponda. Hay que reclasificarlo, pero no se puede adivinar de
  --     qué cuenta salió el dinero: se reporta para resolverlo a mano.
  select
    'reclassify_as_transfer'::text,
    false,
    'transaction'::text,
    e.id,
    format('%s · %s · %s: falta el asiento de origen, indica desde qué cuenta se pagó',
           to_char(e.occurred_at, 'YYYY-MM-DD'), a.name,
           coalesce(e.description, '(sin descripción)')),
    e.amount,
    abs(e.amount)
  from public.transactions e
  join public.accounts a on a.id = e.account_id and a.account_class = 'liability'
  where e.type = 'expense'
    and repair.looks_like_card_payment(e.description)
    and not exists (
      select 1 from public.transactions tr
       where tr.type = 'transfer'
         and tr.account_id = e.account_id
         and tr.amount = abs(e.amount)
         and abs(tr.occurred_at - e.occurred_at) <= 7
    )

  union all

  -- C. Activo con saldo negativo. Puede ser legítimo (sobregiro) o señal
  --    de que un movimiento salió de la cuenta equivocada. Sólo informa.
  select
    'review_negative_asset'::text,
    false,
    'account'::text,
    a.id,
    format('%s (%s): cuenta de activo en negativo, revisa si algún movimiento salió de aquí por error',
           a.name, a.type),
    a.current_balance,
    null::bigint
  from public.accounts a
  where a.account_class = 'asset'
    and a.current_balance < 0;
$$;

comment on function repair.findings() is
  'Cambios propuestos por la reparación de signos. Sólo lectura: no aplica nada.';

-- ---------------------------------------------------------------------
-- Reporte antes/después por cuenta, recalculando desde las transacciones
-- sin escribir nada.
-- ---------------------------------------------------------------------
create or replace function repair.balance_report()
returns table (
  account       text,
  class         public.account_class,
  stored        bigint,
  recalculated  bigint,
  drift         bigint
) language sql stable set search_path = public as $$
  select a.name,
         a.account_class,
         a.current_balance,
         (a.initial_balance
          + coalesce((select sum(t.amount) from public.transactions t
                       where t.account_id = a.id), 0))::bigint,
         (a.current_balance
          - (a.initial_balance
             + coalesce((select sum(t.amount) from public.transactions t
                          where t.account_id = a.id), 0)))::bigint
    from public.accounts a
   order by a.account_class, a.name;
$$;

comment on function repair.balance_report() is
  'Compara current_balance con el saldo recalculado desde las transacciones. drift <> 0 significa saldo desincronizado.';

-- ---------------------------------------------------------------------
-- Aplicación. Sólo toca los hallazgos marcados `auto`.
-- ---------------------------------------------------------------------
create or replace function repair.apply()
returns table (
  step   text,
  detail text
) language plpgsql security definer set search_path = public, repair as $$
declare
  f record;
  r record;
begin
  -- A. Invertir el signo del saldo inicial de los pasivos capturados en
  --    positivo. El trigger accounts_balance_delta arrastra current_balance
  --    por el delta, así que el saldo queda correcto sin tocarlo aparte.
  for f in
    select * from repair.findings()
     where action = 'fix_initial_balance_sign' and auto
  loop
    update public.accounts
       set initial_balance = f.amount_after
     where id = f.entity_id;
    step   := 'fix_initial_balance_sign';
    detail := f.detail;
    return next;
  end loop;

  -- B1. Borrar los pagos duplicados capturados como gasto sobre la tarjeta.
  for f in
    select * from repair.findings()
     where action = 'delete_duplicate_payment' and auto
  loop
    delete from public.transactions where id = f.entity_id;
    step   := 'delete_duplicate_payment';
    detail := f.detail;
    return next;
  end loop;

  -- D. Recalcular todos los saldos desde initial_balance + transacciones.
  for r in select * from public.recalculate_all_balances() where before <> after
  loop
    step   := 'recalculate_balance';
    detail := format('%s: %s -> %s', r.name, r.before, r.after);
    return next;
  end loop;

  return;
end;
$$;

comment on function repair.apply() is
  'Aplica los hallazgos automáticos y recalcula todos los saldos. Idempotente.';
