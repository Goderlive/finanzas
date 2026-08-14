-- =====================================================================
-- Fase 4 · Pruebas de la vinculación inversión ↔ cuenta (migración 0022)
--
--   psql "$DATABASE_URL" -f supabase/tests/20260813_investment_account_test.sql
--   (mejor: ./scripts/db-test.sh, que las corre contra una base sombra)
--
-- Cada caso vive en su propia transacción y termina en ROLLBACK. Reusa
-- las utilidades del esquema `tst` que instala la suite del 20260728, así
-- que esa corre primero.
-- =====================================================================

\set ON_ERROR_STOP on
\pset pager off
\set QUIET on

-- Crea una inversión de renta fija en el hogar dado y devuelve su id.
create or replace function tst.new_fixed(
  p_household uuid,
  p_profile   uuid,
  p_owner     uuid default null,
  p_principal bigint default 1000000
) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.investments (
    household_id, owner_id, created_by, investment_type, name,
    principal, annual_rate, start_date, maturity_date,
    compounding, reinvests_at_maturity
  ) values (
    p_household, p_owner, p_profile, 'fixed', 'Cajita de prueba',
    p_principal, 0.10, date '2026-01-01', date '2026-12-31',
    'simple', false
  ) returning id into v_id;
  return v_id;
end;
$$;

\echo ''
\echo '======================================================================'
\echo ' Vinculación inversión ↔ cuenta (0022)'
\echo '======================================================================'

\echo ''
\echo '1. Una inversión se vincula a una cuenta de activo de la misma titularidad'
begin;
do $$
declare
  f   record;
  inv uuid;
begin
  select * into f from tst.setup();
  inv := tst.new_fixed(f.household, f.profile);

  update public.investments set account_id = f.savings where id = inv;

  perform tst.assert_true(
    (select account_id from public.investments where id = inv) = f.savings,
    'la inversión queda vinculada a la cuenta de ahorro');

  -- El saldo de la cuenta no lo toca la vinculación: el dinero ya estaba
  -- ahí, lo único que cambia es que ahora sabemos que parte de él está
  -- dentro de un instrumento.
  perform tst.assert_eq(tst.balance(f.savings), 500000,
    'vincular no mueve el saldo de la cuenta');
end $$;
rollback;

\echo ''
\echo '2. No puede vivir en una cuenta de pasivo'
begin;
do $$
declare
  f    record;
  inv  uuid;
  v_ok boolean := false;
begin
  select * into f from tst.setup();
  inv := tst.new_fixed(f.household, f.profile);

  begin
    update public.investments set account_id = f.card where id = inv;
  exception when check_violation then v_ok := true;
  end;

  perform tst.assert_true(v_ok,
    'una tarjeta de crédito no puede contener una inversión');
end $$;
rollback;

\echo ''
\echo '3. La titularidad de la inversión y la de la cuenta deben coincidir'
begin;
do $$
declare
  f       record;
  inv     uuid;
  v_mine  uuid;
  v_ok    boolean := false;
begin
  select * into f from tst.setup();

  -- Cuenta PERSONAL del tester; la inversión es conjunta (owner_id null).
  insert into public.accounts (household_id, owner_id, name, type,
                               initial_balance, created_by)
  values (f.household, f.profile, 'Mi cuenta', 'savings', 100000, f.profile)
  returning id into v_mine;

  inv := tst.new_fixed(f.household, f.profile, null);

  begin
    update public.investments set account_id = v_mine where id = inv;
  exception when check_violation then v_ok := true;
  end;
  perform tst.assert_true(v_ok,
    'una inversión conjunta no cabe en una cuenta personal');

  -- Y al revés: personal en cuenta conjunta tampoco.
  v_ok := false;
  update public.investments set owner_id = f.profile where id = inv;
  begin
    update public.investments set account_id = f.savings where id = inv;
  exception when check_violation then v_ok := true;
  end;
  perform tst.assert_true(v_ok,
    'una inversión personal no cabe en una cuenta conjunta');

  -- La combinación coherente sí pasa.
  update public.investments set account_id = v_mine where id = inv;
  perform tst.assert_true(
    (select account_id from public.investments where id = inv) = v_mine,
    'personal con personal sí se vincula');
end $$;
rollback;

\echo ''
\echo '4. No se cruza de hogar'
begin;
do $$
declare
  f    record;
  g    record;
  inv  uuid;
  v_ok boolean := false;
begin
  select * into f from tst.setup();
  select * into g from tst.setup();
  inv := tst.new_fixed(f.household, f.profile);

  begin
    update public.investments set account_id = g.savings where id = inv;
  exception when check_violation then v_ok := true;
  end;

  perform tst.assert_true(v_ok,
    'la cuenta de otro hogar queda fuera');
end $$;
rollback;

\echo ''
\echo '5. El invariante no se puede romper editando la CUENTA'
begin;
do $$
declare
  f     record;
  inv   uuid;
  v_ok  boolean := false;
begin
  select * into f from tst.setup();
  inv := tst.new_fixed(f.household, f.profile);
  update public.investments set account_id = f.savings where id = inv;

  -- Volverla personal dejaría a la inversión conjunta sin capital visible.
  begin
    update public.accounts set owner_id = f.profile where id = f.savings;
  exception when check_violation then v_ok := true;
  end;
  perform tst.assert_true(v_ok,
    'no se le cambia la titularidad a una cuenta que respalda una inversión');

  -- Convertirla en pasivo, igual.
  v_ok := false;
  begin
    update public.accounts set type = 'credit_card' where id = f.savings;
  exception when check_violation then v_ok := true;
  end;
  perform tst.assert_true(v_ok,
    'ni se convierte en tarjeta de crédito');

  -- Lo demás de la cuenta se sigue editando con normalidad.
  update public.accounts set name = 'Ahorro renombrado' where id = f.savings;
  perform tst.assert_true(
    (select name from public.accounts where id = f.savings) = 'Ahorro renombrado',
    'renombrar la cuenta sigue permitido');
end $$;
rollback;

\echo ''
\echo '6. Desvincular siempre se puede, y desvinculada vuelve a ser editable'
begin;
do $$
declare
  f   record;
  inv uuid;
begin
  select * into f from tst.setup();
  inv := tst.new_fixed(f.household, f.profile);
  update public.investments set account_id = f.savings where id = inv;

  update public.investments set account_id = null where id = inv;
  perform tst.assert_true(
    (select account_id from public.investments where id = inv) is null,
    'la inversión se desvincula sin estorbo');

  update public.accounts set owner_id = f.profile where id = f.savings;
  perform tst.assert_true(
    (select owner_id from public.accounts where id = f.savings) = f.profile,
    'y la cuenta liberada ya acepta el cambio de titularidad');
end $$;
rollback;

\echo ''
\echo '7. Borrar la cuenta desvincula la inversión, no la destruye'
begin;
do $$
declare
  f   record;
  inv uuid;
begin
  select * into f from tst.setup();
  inv := tst.new_fixed(f.household, f.profile);
  update public.investments set account_id = f.savings where id = inv;

  delete from public.accounts where id = f.savings;

  perform tst.assert_true(
    exists (select 1 from public.investments where id = inv),
    'la inversión sobrevive a su cuenta (on delete set null)');
  perform tst.assert_true(
    (select account_id from public.investments where id = inv) is null,
    'y queda sin vincular, aportando otra vez su valor completo');
end $$;
rollback;

-- ---------------------------------------------------------------------
-- El patrimonio neto bajo las tres formas de fondeo
--
-- Réplica en SQL de la fórmula que aplica la app (`netWorthContribution`
-- en src/lib/portfolio.ts). Sólo cubre renta variable, que es la que se
-- puede valuar sin salir de la base: valor = cantidad × último precio.
-- ---------------------------------------------------------------------
create or replace function tst.net_worth_full(p_household uuid)
returns bigint language sql stable as $$
  select
    (select coalesce(sum(current_balance), 0)
       from public.accounts
      where household_id = p_household and not is_archived)
  + (select coalesce(sum(
      case when i.account_id is null
           then v.value                 -- sin vincular: valor completo
           else v.value - v.cost        -- vinculada: sólo la plusvalía
      end), 0)
       from public.investments i
       cross join lateral (
         select round(i.quantity * coalesce(
                  (select p.price from public.price_snapshots p
                    where p.investment_id = i.id
                    order by p.as_of desc limit 1),
                  i.purchase_price))::bigint as value,
                round(i.quantity * i.purchase_price)::bigint as cost
       ) v
      where i.household_id = p_household
        and i.investment_type = 'variable');
$$;

-- Crea una posición de renta variable con plusvalía y devuelve su id.
create or replace function tst.new_variable(
  p_household uuid,
  p_profile   uuid,
  p_qty       numeric default 10,
  p_cost      bigint default 10000,   -- 100.00 por unidad
  p_price     bigint default 12000    -- 120.00 por unidad
) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.investments (
    household_id, owner_id, created_by, investment_type,
    symbol, quantity, purchase_price, purchase_date
  ) values (
    p_household, null, p_profile, 'variable',
    'TEST', p_qty, p_cost, date '2026-01-01'
  ) returning id into v_id;

  insert into public.price_snapshots (investment_id, price, as_of, created_by)
  values (v_id, p_price, date '2026-06-01', p_profile);

  return v_id;
end;
$$;

\echo ''
\echo '8. Vincular con «ya está en el saldo» corrige el doble conteo'
begin;
do $$
declare
  f      record;
  inv    uuid;
  v_pre  bigint;
begin
  select * into f from tst.setup();
  -- 10 × 100 de costo, 10 × 120 hoy: capital 1,000, valor 1,200.
  inv := tst.new_variable(f.household, f.profile);
  v_pre := tst.net_worth_full(f.household);

  -- El caso que motiva todo: ese capital YA estaba en el saldo del ahorro,
  -- así que hasta ahora se contaba dos veces.
  update public.investments set account_id = f.savings where id = inv;

  perform tst.assert_eq(tst.net_worth_full(f.household), v_pre - 100000,
    'el patrimonio baja exactamente el capital que estaba duplicado');
end $$;
rollback;

\echo ''
\echo '9. Lo mismo con «sale de otra cuenta»: el capital estaba en otra cuenta'
begin;
do $$
declare
  f     record;
  inv   uuid;
  v_pre bigint;
begin
  select * into f from tst.setup();
  inv := tst.new_variable(f.household, f.profile);
  v_pre := tst.net_worth_full(f.household);

  -- El capital estaba en la nómina, no en el ahorro. Se mueve y se vincula.
  perform public.create_transfer(f.checking, f.savings, 100000,
                                 date '2026-06-01', 'Aportación a TEST');
  update public.investments set account_id = f.savings where id = inv;

  perform tst.assert_eq(tst.balance(f.checking), 200000,
    'la cuenta de origen bajó por el capital');
  perform tst.assert_eq(tst.balance(f.savings), 600000,
    'y la de la inversión subió lo mismo');
  -- Un traspaso no crea ni destruye patrimonio, así que el efecto neto es
  -- el mismo que en el caso 8: deja de contarse dos veces el capital.
  perform tst.assert_eq(tst.net_worth_full(f.household), v_pre - 100000,
    'el patrimonio baja el capital duplicado, igual que en el caso 8');
end $$;
rollback;

\echo ''
\echo '10. Vincular con «dinero no registrado» NO mueve el patrimonio'
begin;
do $$
declare
  f     record;
  inv   uuid;
  v_pre bigint;
begin
  select * into f from tst.setup();
  inv := tst.new_variable(f.household, f.profile);
  v_pre := tst.net_worth_full(f.household);

  -- Este capital nunca estuvo en ninguna cuenta (el caso de las cajitas:
  -- $61,170 que no caben en los saldos de nadie). Se registra y se vincula.
  update public.accounts
     set initial_balance = initial_balance + 100000
   where id = f.savings;
  update public.investments set account_id = f.savings where id = inv;

  perform tst.assert_eq(tst.balance(f.savings), 600000,
    'el trigger de la 0006 propagó el delta a current_balance');
  perform tst.assert_eq(tst.net_worth_full(f.household), v_pre,
    'subir el saldo y vincular se cancelan: el patrimonio no cambia');
end $$;
rollback;

\echo ''
\echo '11. Un ALTA nueva bien fondeada no inventa ni destruye patrimonio'
begin;
do $$
declare
  f     record;
  inv   uuid;
  v_pre bigint;
begin
  select * into f from tst.setup();
  -- Medido ANTES de que la inversión exista: ésa es la referencia correcta
  -- para un alta, no el estado intermedio de una inversión sin vincular.
  v_pre := tst.net_worth_full(f.household);

  -- Abro hoy una posición de 1,000 sin plusvalía todavía, con dinero que
  -- sale de la nómina y queda en el ahorro.
  inv := tst.new_variable(f.household, f.profile, 10, 10000, 10000);
  perform public.create_transfer(f.checking, f.savings, 100000,
                                 date '2026-06-01', 'Aportación a TEST');
  update public.investments set account_id = f.savings where id = inv;

  perform tst.assert_eq(tst.net_worth_full(f.household), v_pre,
    'abrir una inversión con dinero propio no cambia el patrimonio');

  -- Y cuando sube de precio, la plusvalía sí aparece.
  insert into public.price_snapshots (investment_id, price, as_of, created_by)
  values (inv, 12000, date '2026-07-01', f.profile);

  perform tst.assert_eq(tst.net_worth_full(f.household), v_pre + 20000,
    'la plusvalía posterior sí suma, y sólo ella');
end $$;
rollback;

\echo ''
\echo '12. Un ALTA con dinero no registrado sube el patrimonio por el capital'
begin;
do $$
declare
  f     record;
  inv   uuid;
  v_pre bigint;
begin
  select * into f from tst.setup();
  v_pre := tst.net_worth_full(f.household);

  inv := tst.new_variable(f.household, f.profile, 10, 10000, 10000);
  update public.accounts
     set initial_balance = initial_balance + 100000
   where id = f.savings;
  update public.investments set account_id = f.savings where id = inv;

  -- Correcto: se le está contando a la app dinero que no conocía.
  perform tst.assert_eq(tst.net_worth_full(f.household), v_pre + 100000,
    'el patrimonio sube exactamente el capital recién declarado');
end $$;
rollback;

\echo ''
\echo '======================================================================'
\echo ' VINCULACIÓN INVERSIÓN ↔ CUENTA: TODAS LAS PRUEBAS PASARON'
\echo '======================================================================'
\echo ''
