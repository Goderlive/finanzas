-- =====================================================================
-- Fase 2 · 0012 · Inversiones de renta fija
--
-- ADITIVA salvo por 3 RELAJACIONES declaradas (ver abajo). No se borra
-- ninguna columna ni cambia ningún tipo de dato.
--
-- ATENCIÓN — ÚNICO cambio sobre columnas existentes de todo este lote:
--   investments.symbol, .quantity y .purchase_price pasan de NOT NULL a
--   NULL-able, porque un pagaré o un CETE no tiene símbolo ni cantidad.
--   Para que las inversiones de renta VARIABLE conserven exactamente la
--   misma garantía que hoy, se añade un CHECK que las obliga a seguir
--   teniendo esos tres campos. Neto: renta variable no cambia en nada.
-- =====================================================================

do $$ begin
  create type public.investment_type as enum ('fixed', 'variable');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.compounding_method as enum ('simple', 'monthly', 'daily');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Columnas nuevas. investment_type se rellena como 'variable' en las
-- filas existentes, que es exactamente lo que son hoy.
-- ---------------------------------------------------------------------
alter table public.investments
  add column if not exists investment_type       public.investment_type not null default 'variable',
  add column if not exists principal             bigint,             -- centavos
  add column if not exists annual_rate           numeric(6,4),       -- fracción anual: 0.1050 = 10.50%
  add column if not exists start_date            date,
  add column if not exists maturity_date         date,
  add column if not exists compounding           public.compounding_method,
  add column if not exists reinvests_at_maturity boolean;

comment on column public.investments.investment_type is
  'fixed = pagarés, CETES, depósitos a plazo. variable = acciones, ETFs, cripto.';
comment on column public.investments.annual_rate is
  'Tasa anual como fracción (0.1050 = 10.50%), misma convención que debts.interest_rate.';
comment on column public.investments.principal is
  'Monto invertido en centavos (sólo renta fija).';

-- ---------------------------------------------------------------------
-- Relajaciones (las 3 declaradas) + CHECKs compensatorios
-- ---------------------------------------------------------------------
alter table public.investments alter column symbol         drop not null;
alter table public.investments alter column quantity       drop not null;
alter table public.investments alter column purchase_price drop not null;

-- Renta variable conserva íntegras las garantías previas.
do $$ begin
  alter table public.investments add constraint investments_variable_fields
    check (
      investment_type <> 'variable'
      or (symbol is not null and quantity is not null and purchase_price is not null)
    );
exception when duplicate_object then null; end $$;

-- Renta fija exige sus propios campos.
do $$ begin
  alter table public.investments add constraint investments_fixed_fields
    check (
      investment_type <> 'fixed'
      or (principal is not null and annual_rate is not null
          and start_date is not null and maturity_date is not null
          and compounding is not null and reinvests_at_maturity is not null)
    );
exception when duplicate_object then null; end $$;

-- Y los campos de renta fija no se cuelan en renta variable.
do $$ begin
  alter table public.investments add constraint investments_fixed_only
    check (
      investment_type = 'fixed'
      or (principal is null and annual_rate is null
          and start_date is null and maturity_date is null
          and compounding is null and reinvests_at_maturity is null)
    );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.investments add constraint investments_principal_positive
    check (principal is null or principal > 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.investments add constraint investments_annual_rate_positive
    check (annual_rate is null or annual_rate >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.investments add constraint investments_maturity_after_start
    check (maturity_date is null or start_date is null or maturity_date > start_date);
exception when duplicate_object then null; end $$;

create index if not exists investments_type_idx
  on public.investments (household_id, investment_type);

-- Vencimientos próximos (alerta < 7 días).
create index if not exists investments_maturity_idx
  on public.investments (maturity_date) where investment_type = 'fixed';
