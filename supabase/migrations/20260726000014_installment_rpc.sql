-- =====================================================================
-- Fase 2 · 0014 · Generador del calendario de meses sin intereses
--
-- ADITIVA: sólo añade una función. No toca tablas ni datos.
-- Reversible con supabase/rollback/20260726_down_all.sql
--
-- Va en plpgsql y no en un CTE a propósito: una sentencia con CTEs no ve
-- las filas que ella misma acaba de insertar, así que el calendario no
-- puede leer la transacción recién creada.
-- =====================================================================

create or replace function public.create_installment_plan(
  p_transaction_id uuid,
  p_months smallint
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tx    record;
  v_card  record;
  v_plan  uuid;
  v_close date;
  v_base  bigint;
  n       int;
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

  -- Mensualidad base truncada; el sobrante va en la última (ver abajo).
  v_base := v_tx.amount / p_months;
  if v_base <= 0 then
    raise exception 'El monto es demasiado pequeño para dividirse en % mensualidades', p_months;
  end if;

  -- Corte al que se factura la compra: ahí arranca la mensualidad 1.
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
      v_plan,
      n,
      public.payment_due_for(
        public.statement_close_plus(v_close, v_card.statement_day, n - 1),
        v_card.statement_day, v_card.payment_day),
      -- El redondeo del centavo sobrante se acumula en la última mensualidad.
      case when n < p_months
           then v_base
           else v_tx.amount - v_base * (p_months - 1) end,
      public.statement_close_plus(v_close, v_card.statement_day, n - 1)
    );
  end loop;

  return v_plan;
end;
$$;

comment on function public.create_installment_plan(uuid, smallint) is
  'Difiere un gasto con tarjeta a N meses sin intereses y genera su calendario. El centavo sobrante va en la última mensualidad.';
