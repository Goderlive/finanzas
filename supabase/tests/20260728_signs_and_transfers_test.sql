-- =====================================================================
-- Fase 5 · Pruebas de la regla de signo, traspasos y pago de tarjeta
--
--   psql "$DATABASE_URL" -f supabase/tests/20260728_signs_and_transfers_test.sql
--   (mejor: ./scripts/db-test.sh, que las corre contra una base sombra)
--
-- Cada caso vive en su propia transacción y termina en ROLLBACK: la suite
-- no deja nada escrito, así que puede correrse contra una copia de
-- producción sin ensuciarla.
-- =====================================================================

\set ON_ERROR_STOP on
\pset pager off
\set QUIET on

-- ---------------------------------------------------------------------
-- Utilidades de prueba
-- ---------------------------------------------------------------------
create schema if not exists tst;

create or replace function tst.assert_eq(
  p_actual bigint, p_expected bigint, p_label text
) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FALLA · %: esperado %, obtenido %', p_label, p_expected, p_actual;
  end if;
  raise notice '  ok · % (%)', p_label, p_actual;
end;
$$;

create or replace function tst.assert_true(p_cond boolean, p_label text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then
    raise exception 'FALLA · %', p_label;
  end if;
  raise notice '  ok · %', p_label;
end;
$$;

-- Monta un hogar aislado con un usuario, una tarjeta y una cuenta de
-- ahorro, y deja la sesión autenticada como ese usuario.
create or replace function tst.setup()
returns table (household uuid, profile uuid, card uuid, savings uuid, checking uuid)
language plpgsql as $$
declare
  v_h uuid := gen_random_uuid();
  v_u uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, created_at, updated_at)
  values (v_u, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', v_u || '@test.local', '', now(), now());

  insert into public.households (id, name, base_currency)
  values (v_h, 'Hogar de prueba', 'MXN');

  -- handle_new_user pudo haber creado ya el perfil con su propio hogar.
  insert into public.profiles (id, household_id, display_name)
  values (v_u, v_h, 'Tester')
  on conflict (id) do update set household_id = v_h;

  perform set_config('request.jwt.claim.sub', v_u::text, true);

  insert into public.accounts (id, household_id, name, type, initial_balance,
                               created_by, statement_day, payment_day)
  values (gen_random_uuid(), v_h, 'Tarjeta', 'credit_card', 0, v_u, 15, 5)
  returning id into card;

  insert into public.accounts (id, household_id, name, type, initial_balance, created_by)
  values (gen_random_uuid(), v_h, 'Ahorro', 'savings', 500000, v_u)
  returning id into savings;

  insert into public.accounts (id, household_id, name, type, initial_balance, created_by)
  values (gen_random_uuid(), v_h, 'Nómina', 'checking', 300000, v_u)
  returning id into checking;

  household := v_h;
  profile   := v_u;
  return next;
end;
$$;

create or replace function tst.balance(p_account uuid)
returns bigint language sql stable as $$
  select current_balance from public.accounts where id = p_account;
$$;

create or replace function tst.net_worth(p_household uuid)
returns bigint language sql stable as $$
  select coalesce(sum(current_balance), 0)::bigint
    from public.accounts where household_id = p_household and not is_archived;
$$;

\set QUIET off
\echo ''
\echo '======================================================================'
\echo ' Fase 5 · Pruebas de signo, traspasos y pago de tarjeta'
\echo '======================================================================'

-- =====================================================================
\echo ''
\echo '1. Compra de 1,000 con tarjeta -> la deuda sube a 1,000'
-- =====================================================================
begin;
do $$
declare f record;
begin
  select * into f from tst.setup();

  insert into public.transactions (household_id, account_id, type, amount,
                                   description, occurred_at, created_by)
  values (f.household, f.card, 'expense', -100000, 'Compra', current_date, f.profile);

  perform tst.assert_eq(tst.balance(f.card), -100000,
    'la tarjeta queda en -1,000 (deuda de 1,000)');
  perform tst.assert_true(tst.balance(f.card) < 0,
    'un cargo deja el pasivo más negativo, nunca positivo');
end $$;
rollback;

-- =====================================================================
\echo ''
\echo '2. Pago de 300 desde ahorro -> deuda baja a 700 y el ahorro baja 300'
-- =====================================================================
begin;
do $$
declare
  f record;
  v_savings_before bigint;
begin
  select * into f from tst.setup();
  insert into public.transactions (household_id, account_id, type, amount,
                                   description, occurred_at, created_by)
  values (f.household, f.card, 'expense', -100000, 'Compra', current_date, f.profile);
  v_savings_before := tst.balance(f.savings);

  perform public.pay_credit_card(f.savings, f.card, 30000, current_date, 'Pago');

  perform tst.assert_eq(tst.balance(f.card), -70000,
    'la deuda baja de 1,000 a 700');
  perform tst.assert_eq(tst.balance(f.savings), v_savings_before - 30000,
    'el ahorro baja exactamente 300');
end $$;
rollback;

-- =====================================================================
\echo ''
\echo '3. El patrimonio neto no cambia con el pago (sólo se mueve entre cuentas)'
-- =====================================================================
begin;
do $$
declare
  f record;
  v_before bigint;
begin
  select * into f from tst.setup();
  insert into public.transactions (household_id, account_id, type, amount,
                                   description, occurred_at, created_by)
  values (f.household, f.card, 'expense', -100000, 'Compra', current_date, f.profile);

  v_before := tst.net_worth(f.household);
  perform public.pay_credit_card(f.savings, f.card, 30000, current_date, 'Pago');

  perform tst.assert_eq(tst.net_worth(f.household), v_before,
    'el patrimonio neto es idéntico antes y después del pago');
end $$;
rollback;

-- =====================================================================
\echo ''
\echo '4. El pago NO aparece en el reporte de gastos del mes'
-- =====================================================================
begin;
do $$
declare
  f record;
  v_expenses_before bigint;
  v_expenses_after  bigint;
begin
  select * into f from tst.setup();
  insert into public.transactions (household_id, account_id, type, amount,
                                   description, occurred_at, created_by)
  values (f.household, f.card, 'expense', -100000, 'Compra', current_date, f.profile);

  select coalesce(sum(abs(amount)), 0) into v_expenses_before
    from public.transactions
   where household_id = f.household and type = 'expense'
     and occurred_at >= date_trunc('month', current_date);

  perform public.pay_credit_card(f.savings, f.card, 30000, current_date, 'Pago');

  select coalesce(sum(abs(amount)), 0) into v_expenses_after
    from public.transactions
   where household_id = f.household and type = 'expense'
     and occurred_at >= date_trunc('month', current_date);

  perform tst.assert_eq(v_expenses_after, v_expenses_before,
    'el gasto del mes no se mueve: el pago no es consumo');
  perform tst.assert_eq(
    (select count(*) from public.transactions
      where household_id = f.household and is_transfer)::bigint, 2::bigint,
    'el pago dejó dos asientos, ambos marcados is_transfer');
  perform tst.assert_true(
    not exists (select 1 from public.transactions
                 where household_id = f.household and is_transfer
                   and category_id is not null),
    'ningún asiento de traspaso lleva categoría de gasto');
end $$;
rollback;

-- =====================================================================
\echo ''
\echo '5. Pago mayor a la deuda -> la tarjeta queda con saldo a favor'
-- =====================================================================
begin;
do $$
declare
  f record;
  v_result jsonb;
begin
  select * into f from tst.setup();
  insert into public.transactions (household_id, account_id, type, amount,
                                   description, occurred_at, created_by)
  values (f.household, f.card, 'expense', -100000, 'Compra', current_date, f.profile);

  v_result := public.pay_credit_card(f.savings, f.card, 150000, current_date, 'Pago de más');

  perform tst.assert_eq(tst.balance(f.card), 50000,
    'la tarjeta cruza a positivo: 500 de saldo a favor');
  perform tst.assert_eq((v_result->>'credit_balance')::bigint, 50000,
    'el pago reporta el excedente como saldo a favor');
end $$;
rollback;

-- =====================================================================
\echo ''
\echo '6. Traspaso entre dos cuentas de débito no altera el patrimonio neto'
-- =====================================================================
begin;
do $$
declare
  f record;
  v_before bigint;
  v_group  uuid;
begin
  select * into f from tst.setup();
  v_before := tst.net_worth(f.household);

  v_group := public.create_transfer(f.savings, f.checking, 120000,
                                    current_date, 'Traspaso');

  perform tst.assert_eq(tst.net_worth(f.household), v_before,
    'el patrimonio neto no se mueve');
  perform tst.assert_eq(tst.balance(f.savings), 500000 - 120000,
    'el origen baja 1,200');
  perform tst.assert_eq(tst.balance(f.checking), 300000 + 120000,
    'el destino sube 1,200');
  perform tst.assert_eq(
    (select sum(amount) from public.transactions where transfer_group_id = v_group)::bigint,
    0::bigint,
    'los dos asientos del grupo suman cero');
end $$;
rollback;

-- =====================================================================
\echo ''
\echo '7. Un pago que cubre exactamente una mensualidad MSI la marca pagada'
-- =====================================================================
begin;
do $$
declare
  f          record;
  v_tx       uuid;
  v_plan     uuid;
  v_cuota    bigint;
  v_result   jsonb;
  v_purchase date;
begin
  select * into f from tst.setup();

  -- Compra a 6 MSI en un corte ya vencido, para que la primera
  -- mensualidad esté facturada al momento de pagar.
  v_purchase := current_date - interval '75 days';
  insert into public.transactions (household_id, account_id, type, amount,
                                   description, occurred_at, created_by)
  values (f.household, f.card, 'expense', -600000, 'Refri a MSI',
          v_purchase, f.profile)
  returning id into v_tx;

  v_plan := public.create_installment_plan(v_tx, 6::smallint);

  select amount into v_cuota
    from public.installment_payments
   where plan_id = v_plan and installment_no = 1;

  perform tst.assert_eq(v_cuota, 100000::bigint,
    'la mensualidad 1 de 6 sobre 6,000 es 1,000');

  v_result := public.pay_credit_card(f.savings, f.card, v_cuota,
                                     current_date, 'Pago de la mensualidad');

  perform tst.assert_true(
    (select is_paid from public.installment_payments
      where plan_id = v_plan and installment_no = 1),
    'la mensualidad 1 queda marcada como pagada');
  perform tst.assert_eq((v_result->>'msi_installments_paid')::bigint, 1::bigint,
    'el pago reporta una mensualidad cubierta');
  perform tst.assert_eq(
    (select remaining_months from public.installment_plans where id = v_plan)::bigint,
    5::bigint,
    'remaining_months del plan baja de 6 a 5');
  perform tst.assert_true(
    not exists (select 1 from public.installment_payments
                 where plan_id = v_plan and installment_no > 1 and is_paid),
    'no se marcó ninguna mensualidad de más');
end $$;
rollback;

-- =====================================================================
\echo ''
\echo '8. Borrar un traspaso revierte los dos lados'
-- =====================================================================
begin;
do $$
declare
  f       record;
  v_group uuid;
  v_one   uuid;
begin
  select * into f from tst.setup();
  v_group := public.create_transfer(f.savings, f.checking, 120000,
                                    current_date, 'Traspaso');

  select id into v_one from public.transactions
   where transfer_group_id = v_group order by amount limit 1;

  delete from public.transactions where id = v_one;

  perform tst.assert_eq(
    (select count(*) from public.transactions where transfer_group_id = v_group)::bigint,
    0::bigint,
    'borrar un lado borró también el otro');
  perform tst.assert_eq(tst.balance(f.savings), 500000,
    'el origen recuperó su saldo');
  perform tst.assert_eq(tst.balance(f.checking), 300000,
    'el destino recuperó su saldo');
end $$;
rollback;

-- =====================================================================
\echo ''
\echo '9. Editar el monto de un lado edita el otro'
-- =====================================================================
begin;
do $$
declare
  f       record;
  v_group uuid;
  v_out   uuid;
begin
  select * into f from tst.setup();
  v_group := public.create_transfer(f.savings, f.checking, 120000,
                                    current_date, 'Traspaso');
  select id into v_out from public.transactions
   where transfer_group_id = v_group and amount < 0;

  update public.transactions set amount = -200000 where id = v_out;

  perform tst.assert_eq(
    (select amount from public.transactions
      where transfer_group_id = v_group and id <> v_out),
    200000::bigint,
    'el lado destino siguió al origen');
  perform tst.assert_eq(
    (select sum(amount) from public.transactions where transfer_group_id = v_group)::bigint,
    0::bigint,
    'el grupo sigue cuadrando en cero');
  perform tst.assert_eq(tst.balance(f.savings), 500000 - 200000,
    'el saldo del origen refleja el monto nuevo');
  perform tst.assert_eq(tst.balance(f.checking), 300000 + 200000,
    'el saldo del destino refleja el monto nuevo');
end $$;
rollback;

-- =====================================================================
\echo ''
\echo '10. La base rechaza lo que no debe existir'
-- =====================================================================
begin;
do $$
declare
  f    record;
  v_ok boolean;
begin
  select * into f from tst.setup();

  -- Un gasto en positivo viola la regla de signo.
  begin
    insert into public.transactions (household_id, account_id, type, amount,
                                     description, occurred_at, created_by)
    values (f.household, f.card, 'expense', 100000, 'Gasto al revés',
            current_date, f.profile);
    v_ok := false;
  exception when check_violation then v_ok := true;
  end;
  perform tst.assert_true(v_ok, 'un gasto con monto positivo es rechazado');

  -- Un ingreso en negativo, también.
  begin
    insert into public.transactions (household_id, account_id, type, amount,
                                     description, occurred_at, created_by)
    values (f.household, f.savings, 'income', -100000, 'Ingreso al revés',
            current_date, f.profile);
    v_ok := false;
  exception when check_violation then v_ok := true;
  end;
  perform tst.assert_true(v_ok, 'un ingreso con monto negativo es rechazado');

  -- Traspaso a la misma cuenta.
  begin
    perform public.create_transfer(f.savings, f.savings, 10000, current_date, 'x');
    v_ok := false;
  exception when others then v_ok := true;
  end;
  perform tst.assert_true(v_ok, 'un traspaso a la misma cuenta es rechazado');

  -- Pagar una cuenta que no es de pasivo.
  begin
    perform public.pay_credit_card(f.savings, f.checking, 10000, current_date, 'x');
    v_ok := false;
  exception when others then v_ok := true;
  end;
  perform tst.assert_true(v_ok, 'no se puede «pagar» una cuenta de activo');

  -- Traspaso con categoría de gasto.
  begin
    insert into public.transactions (household_id, account_id, transfer_account_id,
                                     category_id, type, amount, occurred_at,
                                     created_by, transfer_group_id)
    values (f.household, f.savings, f.checking,
            (select id from public.categories limit 1),
            'transfer', -1000, current_date, f.profile, gen_random_uuid());
    v_ok := false;
  exception when check_violation then v_ok := true;
       when not_null_violation then v_ok := true;
  end;
  perform tst.assert_true(v_ok, 'un traspaso no admite categoría de gasto');
end $$;
rollback;

-- =====================================================================
\echo ''
\echo '11. El escenario exacto del bug reportado'
\echo '    (deuda 5,000 · pago de 3,000 desde ahorro · debe quedar en 2,000)'
-- =====================================================================
begin;
do $$
declare f record;
begin
  select * into f from tst.setup();

  insert into public.transactions (household_id, account_id, type, amount,
                                   description, occurred_at, created_by)
  values (f.household, f.card, 'expense', -500000, 'Compras del mes',
          current_date, f.profile);
  perform tst.assert_eq(tst.balance(f.card), -500000, 'deuda inicial de 5,000');

  perform public.pay_credit_card(f.savings, f.card, 300000, current_date, 'Pago');

  perform tst.assert_eq(tst.balance(f.card), -200000,
    'tras pagar 3,000 la deuda queda en 2,000, NO en 8,000');
  perform tst.assert_eq(tst.balance(f.savings), 500000 - 300000,
    'el ahorro bajó los 3,000 que salieron');
end $$;
rollback;

\echo ''
\echo '======================================================================'
\echo ' TODAS LAS PRUEBAS PASARON'
\echo '======================================================================'
\echo ''
