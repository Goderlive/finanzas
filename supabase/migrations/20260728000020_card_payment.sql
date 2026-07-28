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
  p_occurred_at  date default current_date,
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
  p_now  date default current_date
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
  p_occurred_at  date default current_date,
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
