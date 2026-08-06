-- =====================================================================
-- Fase 3 · 0021 · El pago abona al corte + alcance por hogar
--
-- ADITIVA: sólo redefine funciones. No toca datos, columnas ni triggers.
-- Los saldos no cambian; lo que cambia es lo que se REPORTA sobre ellos.
--
-- Son dos arreglos independientes que caen en las mismas funciones.
--
-- ---------------------------------------------------------------------
-- 1. `credit_card_cycle` ignoraba los pagos
--
-- Para saber cuánto se debía al último corte, la 0020 rebobinaba el saldo
-- deshaciendo TODO lo posterior a esa fecha. Pero un pago es siempre
-- posterior al corte: la tarjeta cierra el 12 y se paga el 27, ése es el
-- diseño de una tarjeta. El rebobinado, entonces, borraba sistemáticamente
-- todos los pagos y `statement_debt` no bajaba nunca, se pagara lo que se
-- pagara.
--
-- Medido en la tarjeta Didi (corte 12, pago 27) el 2026-08-06:
--
--     cerró el 12-jul debiendo      $6,392.58
--     se pagó el 27-jul             $3,134.10
--     statement_debt reportado      $6,392.58   <- el pago no existía
--     deuda total de la tarjeta     $5,780.22   <- menor que "lo del corte"
--
-- Un `statement_debt` mayor que la deuda total es imposible, y era la
-- señal de que el cálculo estaba mal. Además, como `due_date` y `overdue`
-- se derivan de él, tarjetas ya pagadas aparecían vencidas para siempre.
--
-- Ahora los abonos posteriores al corte se restan de la deuda de ese
-- corte, que es exactamente aquello para lo que se hicieron.
--
-- ---------------------------------------------------------------------
-- 2. Funciones SECURITY DEFINER abiertas a `anon`
--
-- Estas funciones se saltan RLS por diseño, y en PostgreSQL el EXECUTE de
-- una función se otorga a PUBLIC por omisión. La 0020 revocó sólo
-- `create_transfer` y `pay_credit_card`, así que las demás quedaron
-- ejecutables por el rol `anon` —el de la anon key, que viaja en el bundle
-- del navegador y es pública por diseño—:
--
--   · credit_card_cycle(uuid)         leía la deuda, el límite y las fechas
--                                     de CUALQUIER tarjeta con sólo su UUID,
--                                     sin sesión iniciada.
--   · credit_card_unbilled_msi(...)   lo mismo con los MSI no facturados.
--   · recalculate_account_balance()   reescribía el saldo de cualquier cuenta.
--   · recalculate_all_balances()      devolvía nombre y saldo de las cuentas
--                                     de TODOS los hogares, y las reescribía.
--
-- Se cierran las cuatro: EXECUTE sólo para `authenticated`, y dentro de
-- cada una la misma regla que ya aplica la política RLS de `accounts`
-- (propia o conjunta del hogar), vía `can_access_account`.
--
-- DOS TRAMPAS QUE COSTARON UN INTENTO FALLIDO, ANOTADAS PARA LA PRÓXIMA:
--
-- a) `revoke ... from public` NO le quita el permiso a `anon`. Supabase
--    deja DEFAULT PRIVILEGES (pg_default_acl, tipo 'f') que otorgan
--    EXECUTE **directo** a anon/authenticated/service_role sobre toda
--    función creada en `public`. El ACL queda así:
--
--        {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,...}
--
--    `anon=X` es un grant nominal, no el de PUBLIC, y sólo se va con un
--    `revoke ... from anon` explícito. Por esto el revoke de la 0020
--    tampoco surtió efecto nunca sobre `create_transfer` ni
--    `pay_credit_card`; se corrigen aquí de paso.
--
-- b) «Sin JWT» NO significa «contexto de mantenimiento». Una llamada con
--    la anon key llega a PostgREST sin claim `sub`, así que `auth.uid()`
--    es null igual que en un psql. Un guarda escrito como
--    `if auth.uid() is not null and not can_access_account(...)` se salta
--    entero justo para el caller anónimo, que es de quien había que
--    defenderse. El discriminante correcto es si la llamada entró por la
--    API (`request.jwt.claims`), no si trae usuario: eso es
--    `public.is_api_call()`, aquí abajo.
--
-- El permiso es la defensa principal (anon ni siquiera entra); el guarda
-- dentro de la función es defensa en profundidad, y es el que impide que
-- un usuario autenticado toque cuentas de otro hogar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ¿La llamada entró por la API o es un psql de mantenimiento?
--
-- PostgREST fija `request.jwt.claims` con los claims del token, aunque el
-- token sea el anónimo y no traiga `sub`. La suite de pruebas usa la forma
-- vieja `request.jwt.claim.sub`, por eso se miran las dos. Un psql o una
-- migración no fijan ninguna, y ahí no hay a quién restringir: corre como
-- superusuario de todos modos. Esto mantiene vivo el
-- `select recalculate_account_balance(id) from accounts` del final de la 0019.
-- ---------------------------------------------------------------------
create or replace function public.is_api_call()
returns boolean language sql stable set search_path = public as $$
  select nullif(current_setting('request.jwt.claims',    true), '') is not null
      or nullif(current_setting('request.jwt.claim.sub', true), '') is not null;
$$;

comment on function public.is_api_call() is
  'true si la sesión viene de PostgREST (hay claims de JWT), false en psql o migraciones.';

-- ---------------------------------------------------------------------
-- Estado del ciclo de una tarjeta
-- ---------------------------------------------------------------------
create or replace function public.credit_card_cycle(
  p_card uuid,
  p_now  date default public.household_today()
) returns table (
  configured      boolean,
  last_close      date,
  next_close      date,
  due_date        date,
  raw_debt        bigint,   -- todo lo cargado, MSI completos incluidos
  statement_debt  bigint,   -- lo que falta por pagar del último corte
  current_debt    bigint,   -- revolvente a hoy, sin MSI no facturado
  msi_unbilled    bigint,
  minimum_payment bigint
) language plpgsql stable security definer set search_path = public as $$
declare
  a                record;
  v_effects_after  bigint;
  v_payments_after bigint;
  v_balance_close  bigint;
begin
  if public.is_api_call() and not public.can_access_account(p_card) then
    raise exception 'No tienes acceso a esta cuenta'
      using errcode = 'insufficient_privilege';
  end if;

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

  -- El rebobinado deshizo por igual las compras nuevas y los abonos. Las
  -- compras nuevas efectivamente no son de este corte; los abonos sí le
  -- pertenecen, porque se hicieron para pagarlo. Se devuelven aquí.
  --
  -- Cuenta cualquier efecto positivo posterior al corte, no sólo los
  -- traspasos: una devolución o una bonificación también bajan lo que hay
  -- que pagar, igual que en el estado de cuenta del banco.
  select coalesce(sum(t.amount), 0) into v_payments_after
    from public.transactions t
   where t.account_id = p_card
     and t.occurred_at > last_close
     and t.amount > 0;

  -- Si el abono excede la deuda del corte, el sobrante no se pierde: ya
  -- está reflejado en `current_debt`, que se mide contra el saldo real.
  statement_debt := greatest(0, -v_balance_close - v_payments_after);

  msi_unbilled   := public.credit_card_unbilled_msi(p_card, next_close, null);
  current_debt   := greatest(0, -(a.current_balance + msi_unbilled));
  due_date       := public.payment_due_for(
                      case when statement_debt > 0 then last_close else next_close end,
                      a.statement_day, a.payment_day);
  return next;
end;
$$;

comment on function public.credit_card_cycle(uuid, date) is
  'Estado del ciclo de una tarjeta, con los abonos posteriores al corte descontados de la deuda del corte. Espejo en SQL de computeCreditCardCycle (src/lib/credit-cycle.ts).';

-- ---------------------------------------------------------------------
-- Recálculo de saldos: sólo sobre lo que el llamante puede ver
-- ---------------------------------------------------------------------
create or replace function public.recalculate_account_balance(p_account uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_balance bigint;
begin
  if public.is_api_call() and not public.can_access_account(p_account) then
    raise exception 'No tienes acceso a esta cuenta'
      using errcode = 'insufficient_privilege';
  end if;

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
  r       record;
  v_new   bigint;
  v_admin boolean := not public.is_api_call();
begin
  -- Filtrar aquí y no dentro del bucle evita que una cuenta personal del
  -- otro miembro del hogar haga estallar el recálculo completo.
  for r in
    select a.id, a.name as nm, a.current_balance
      from public.accounts a
     where v_admin or public.can_access_account(a.id)
  loop
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
  'Recalcula current_balance desde initial_balance + transacciones, sólo de las cuentas visibles para el llamante. Devuelve antes/después.';

-- ---------------------------------------------------------------------
-- Quitarle el EXECUTE a `anon`
-- ---------------------------------------------------------------------
-- Se revoca de PUBLIC **y de anon**: el segundo es el que de verdad
-- importa (ver la trampa (a) del encabezado). Se incluyen `create_transfer`
-- y `pay_credit_card`, que la 0020 creyó haber cerrado.
--
-- Los roles de Supabase no existen en la base sombra de db-test.sh, así
-- que cada sentencia por rol se intenta aparte y se ignora si el rol no
-- está. `authenticated` sí existe en la sombra y ahí conserva el permiso.
do $$
declare
  fn   text;
  rol  text;
  fns  text[] := array[
    'public.is_api_call()',
    'public.credit_card_cycle(uuid, date)',
    'public.credit_card_unbilled_msi(uuid, date, date)',
    'public.recalculate_account_balance(uuid)',
    'public.recalculate_all_balances()',
    'public.create_transfer(uuid, uuid, bigint, date, text)',
    'public.pay_credit_card(uuid, uuid, bigint, date, text)'
  ];
begin
  foreach fn in array fns loop
    execute format('revoke all on function %s from public', fn);

    foreach rol in array array['anon'] loop
      begin
        execute format('revoke all on function %s from %I', fn, rol);
      exception when undefined_object then null;
      end;
    end loop;

    foreach rol in array array['authenticated', 'service_role'] loop
      begin
        execute format('grant execute on function %s to %I', fn, rol);
      exception when undefined_object then null;
      end;
    end loop;
  end loop;
end $$;

-- Comprobación dentro de la propia migración: si `anon` conserva el
-- EXECUTE, la migración falla en vez de dar por hecho que cerró algo.
-- Es exactamente el error que se cometió en el primer intento.
do $$
declare
  v_abiertas text;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    return;   -- base sombra: no hay rol anon que verificar
  end if;

  select string_agg(p.proname, ', ' order by p.proname) into v_abiertas
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('is_api_call', 'credit_card_cycle', 'credit_card_unbilled_msi',
                       'recalculate_account_balance', 'recalculate_all_balances',
                       'create_transfer', 'pay_credit_card')
     and has_function_privilege('anon', p.oid, 'execute');

  if v_abiertas is not null then
    raise exception 'anon todavía puede ejecutar: %', v_abiertas;
  end if;
end $$;
