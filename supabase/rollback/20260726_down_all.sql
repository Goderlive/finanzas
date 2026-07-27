-- =====================================================================
-- ROLLBACK de las migraciones 0010–0013 (ciclo de tarjeta, MSI,
-- renta fija, lotes de inversión).
--
--   psql "$DATABASE_URL" -f supabase/rollback/20260726_down_all.sql
--
-- Deja la base exactamente como estaba antes de 0010.
--
-- DESTRUCTIVO PARA LOS DATOS NUEVOS: borra planes MSI, calendario de
-- mensualidades, lotes de inversión y la configuración de ciclo de las
-- tarjetas. NO toca transacciones, cuentas, categorías ni saldos.
--
-- Está escrito en orden inverso y es idempotente: se puede correr entero
-- o por bloques.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0016 · Posiciones cerradas
--
-- Devolver `quantity > 0` exige que no queden posiciones cerradas, que con
-- la regla anterior no podrían existir.
-- ---------------------------------------------------------------------
do $$
declare v_closed int;
begin
  select count(*) into v_closed from public.investments where quantity = 0;
  if v_closed > 0 then
    raise exception
      'Hay % posiciones cerradas (cantidad 0). Bórralas antes de revertir 0016: delete from public.investments where quantity = 0;',
      v_closed;
  end if;
end $$;

alter table public.investments drop constraint if exists investments_quantity_check;
alter table public.investments add constraint investments_quantity_check
  check (quantity > 0);

-- ---------------------------------------------------------------------
-- 0013 · Lotes de inversión
-- ---------------------------------------------------------------------
drop table if exists public.investment_lots;
drop type  if exists public.investment_lot_type;

-- ---------------------------------------------------------------------
-- 0012 · Renta fija
--
-- Restaurar los NOT NULL exige que no queden inversiones de renta fija
-- (no tienen symbol/quantity/purchase_price). Si las hay, este bloque
-- aborta a propósito: decide antes si quieres borrarlas o migrarlas.
-- ---------------------------------------------------------------------
do $$
declare v_fixed int;
begin
  select count(*) into v_fixed from public.investments where investment_type = 'fixed';
  if v_fixed > 0 then
    raise exception
      'Hay % inversiones de renta fija. Bórralas o conviértelas antes de revertir 0012: delete from public.investments where investment_type = ''fixed'';',
      v_fixed;
  end if;
end $$;

alter table public.investments drop constraint if exists investments_fixed_has_no_units;
alter table public.investments drop constraint if exists investments_variable_fields;
alter table public.investments drop constraint if exists investments_fixed_fields;
alter table public.investments drop constraint if exists investments_fixed_only;
alter table public.investments drop constraint if exists investments_principal_positive;
alter table public.investments drop constraint if exists investments_annual_rate_positive;
alter table public.investments drop constraint if exists investments_maturity_after_start;

drop index if exists public.investments_type_idx;
drop index if exists public.investments_maturity_idx;

alter table public.investments
  drop column if exists investment_type,
  drop column if exists principal,
  drop column if exists annual_rate,
  drop column if exists start_date,
  drop column if exists maturity_date,
  drop column if exists compounding,
  drop column if exists reinvests_at_maturity;

-- Devolver los NOT NULL originales.
alter table public.investments alter column symbol         set not null;
alter table public.investments alter column quantity       set not null;
alter table public.investments alter column purchase_price set not null;

drop type if exists public.compounding_method;
drop type if exists public.investment_type;

-- ---------------------------------------------------------------------
-- 0014 · Generador del calendario MSI
-- ---------------------------------------------------------------------
drop function if exists public.create_installment_plan(uuid, smallint);

-- ---------------------------------------------------------------------
-- 0011 · MSI
-- ---------------------------------------------------------------------
drop table if exists public.installment_payments;
drop table if exists public.installment_plans;
drop function if exists public.sync_installment_plan_progress();
drop type if exists public.installment_status;

alter table public.households drop constraint if exists households_msi_alert_pct_range;
alter table public.households drop column if exists msi_alert_pct;

-- ---------------------------------------------------------------------
-- 0010 · Ciclo de tarjetas
-- ---------------------------------------------------------------------
drop function if exists public.statement_close_plus(date, smallint, int);
drop function if exists public.payment_due_for(date, smallint, smallint);
drop function if exists public.statement_close_for(date, smallint);
drop function if exists public.clamp_day(date, smallint);

alter table public.accounts drop constraint if exists accounts_cycle_only_credit_card;
alter table public.accounts drop constraint if exists accounts_credit_limit_positive;
alter table public.accounts drop constraint if exists accounts_payment_day_range;
alter table public.accounts drop constraint if exists accounts_statement_day_range;

alter table public.accounts
  drop column if exists statement_day,
  drop column if exists payment_day,
  drop column if exists credit_limit;

commit;
