-- =====================================================================
-- Fase 2 · 0010 · Ciclo de tarjetas de crédito
--
-- ADITIVA: sólo agrega columnas nullable a accounts + funciones nuevas.
-- No borra ni cambia el tipo de ninguna columna existente.
-- Reversible con supabase/rollback/20260726000010_credit_card_cycle_down.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- Columnas de ciclo (sólo aplican a type = 'credit_card')
-- ---------------------------------------------------------------------
alter table public.accounts
  add column if not exists statement_day smallint,  -- día del corte (1-31)
  add column if not exists payment_day   smallint,  -- día límite de pago (1-31)
  add column if not exists credit_limit  bigint;    -- límite en centavos

comment on column public.accounts.statement_day is
  'Día del mes en que corta el estado de cuenta. Si el mes es más corto, se usa el último día.';
comment on column public.accounts.payment_day is
  'Día del mes límite de pago. Si payment_day <= statement_day, cae el mes siguiente al corte.';
comment on column public.accounts.credit_limit is
  'Límite de crédito en centavos.';

-- Restricciones: todas toleran NULL, así que las 9 cuentas existentes pasan.
do $$ begin
  alter table public.accounts add constraint accounts_statement_day_range
    check (statement_day between 1 and 31);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.accounts add constraint accounts_payment_day_range
    check (payment_day between 1 and 31);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.accounts add constraint accounts_credit_limit_positive
    check (credit_limit >= 0);
exception when duplicate_object then null; end $$;

-- Los campos de ciclo sólo tienen sentido en tarjetas de crédito.
-- (No se exige que las tarjetas los tengan: las 4 tarjetas actuales
--  siguen siendo válidas con NULL hasta que las configures en la UI.)
do $$ begin
  alter table public.accounts add constraint accounts_cycle_only_credit_card
    check (
      type = 'credit_card'
      or (statement_day is null and payment_day is null and credit_limit is null)
    );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Aritmética del ciclo (funciones puras, sin efectos)
-- ---------------------------------------------------------------------

-- Día del mes acotado a la longitud real del mes.
-- clamp_day('2026-02-01', 31) -> 2026-02-28
create or replace function public.clamp_day(p_month date, p_day smallint)
returns date language sql immutable strict as $$
  select date_trunc('month', p_month)::date
       + (least(
            p_day::int,
            extract(day from (date_trunc('month', p_month) + interval '1 month - 1 day'))::int
          ) - 1);
$$;

comment on function public.clamp_day(date, smallint) is
  'Devuelve la fecha del día p_day dentro del mes de p_month, acotada al último día si el mes es más corto.';

-- Fecha de corte del estado de cuenta al que pertenece una compra:
-- el primer corte en o posterior a la fecha de la compra.
-- statement_close_for('2026-01-15', 20) -> 2026-01-20
-- statement_close_for('2026-01-20', 20) -> 2026-01-20  (una compra el día
--   del corte entra en ESE corte)
-- statement_close_for('2026-01-21', 20) -> 2026-02-20
create or replace function public.statement_close_for(p_purchase date, p_statement_day smallint)
returns date language sql immutable strict as $$
  select case
    when public.clamp_day(p_purchase, p_statement_day) >= p_purchase
      then public.clamp_day(p_purchase, p_statement_day)
    else public.clamp_day((date_trunc('month', p_purchase) + interval '1 month')::date, p_statement_day)
  end;
$$;

comment on function public.statement_close_for(date, smallint) is
  'Corte al que se factura una compra: el primer corte en o posterior a la fecha de compra.';

-- Fecha límite de pago de un corte dado.
-- Si payment_day <= statement_day, el pago cae el mes siguiente al corte.
-- (Con iguales no tendría sentido pagar el mismo día del corte: se va al
--  mes siguiente, que es como opera cualquier banco.)
-- payment_due_for('2026-01-20', 20, 5)  -> 2026-02-05
-- payment_due_for('2026-01-20', 20, 20) -> 2026-02-20
-- payment_due_for('2026-01-05', 5, 20)  -> 2026-01-20
create or replace function public.payment_due_for(
  p_close date, p_statement_day smallint, p_payment_day smallint
) returns date language sql immutable strict as $$
  select public.clamp_day(
    case when p_payment_day <= p_statement_day
         then (date_trunc('month', p_close) + interval '1 month')::date
         else p_close
    end,
    p_payment_day
  );
$$;

comment on function public.payment_due_for(date, smallint, smallint) is
  'Fecha límite de pago de un corte. Si payment_day <= statement_day, cae el mes siguiente.';

-- Corte número n a partir de un corte base (n = 0 es el propio corte).
-- Recalcula desde el mes para no arrastrar el acotamiento de meses cortos:
-- base 2026-01-31 con statement_day 31, n = 1 -> 2026-02-28 (no 2026-02-31).
create or replace function public.statement_close_plus(
  p_close date, p_statement_day smallint, p_n int
) returns date language sql immutable strict as $$
  select public.clamp_day(
    (date_trunc('month', p_close) + (p_n || ' months')::interval)::date,
    p_statement_day
  );
$$;

comment on function public.statement_close_plus(date, smallint, int) is
  'Desplaza un corte n meses hacia adelante, re-acotando el día en cada mes.';
