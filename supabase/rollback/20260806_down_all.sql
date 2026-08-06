-- =====================================================================
-- ROLLBACK del lote 20260806
--
-- Devuelve `credit_card_cycle` a la aritmética de la 0020: la que rebobina
-- el saldo al último corte deshaciendo TODO lo posterior, pagos incluidos.
-- Con esto vuelve el error de reportar deudas de corte mayores que la
-- deuda total de la tarjeta, y tarjetas ya pagadas marcadas como vencidas.
--
-- DECISIÓN DELIBERADA: este rollback NO reabre el EXECUTE a PUBLIC.
--
-- El lote 20260806 arregló dos cosas a la vez, y sólo una es reversible
-- sin consecuencias. Devolver el permiso a `anon` volvería a dejar que
-- cualquiera con la anon key —que viaja en el bundle del navegador— leyera
-- la deuda de una tarjeta ajena y reescribiera saldos. Un rollback existe
-- para deshacer un cambio que salió mal, no para reintroducir una fuga de
-- datos. Los guardas por hogar dentro de cada función también se quedan.
--
-- Si de verdad hace falta el estado exacto de la 0020, está en
-- supabase/migrations/20260728000020_card_payment.sql.
-- =====================================================================

create or replace function public.credit_card_cycle(
  p_card uuid,
  p_now  date default public.household_today()
) returns table (
  configured      boolean,
  last_close      date,
  next_close      date,
  due_date        date,
  raw_debt        bigint,
  statement_debt  bigint,
  current_debt    bigint,
  msi_unbilled    bigint,
  minimum_payment bigint
) language plpgsql stable security definer set search_path = public as $$
declare
  a               record;
  v_effects_after bigint;
  v_balance_close bigint;
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

  select coalesce(sum(t.amount), 0) into v_effects_after
    from public.transactions t
   where t.account_id = p_card and t.occurred_at > last_close;

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

-- Recordatorio: el espejo en TypeScript (src/lib/credit-cycle.ts) también
-- hay que revertirlo, o los dos lados dejarán de coincidir.
