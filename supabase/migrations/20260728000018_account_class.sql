-- =====================================================================
-- Fase 3 · 0018 · Criterio de signo único: activo vs. pasivo
--
-- ADITIVA: un enum nuevo, una función nueva y una columna GENERADA en
-- accounts. No borra ni reescribe ninguna columna existente.
--
-- REGLA DE ORO DEL PROYECTO (aplica a toda la base, sin excepciones):
--
--   `accounts.current_balance` y `transactions.amount` se guardan SIEMPRE
--   con signo desde la perspectiva del patrimonio neto.
--
--     · activo  (checking, savings, cash, investment, other) → positivo
--     · pasivo  (credit_card, loan)                          → NEGATIVO
--       cuando se debe; positivo sólo si hay saldo a favor.
--
--   El valor absoluto y la etiqueta «debes X» son de la capa de
--   presentación. En la base nunca se guarda una deuda en positivo.
--
--   Corolario: el patrimonio neto es `sum(current_balance)`, una suma
--   simple sin condicionales por tipo de cuenta.
-- =====================================================================

do $$ begin
  create type public.account_class as enum ('asset', 'liability');
exception when duplicate_object then null; end $$;

comment on type public.account_class is
  'Naturaleza de una cuenta para efectos de signo. asset: el saldo positivo suma al patrimonio. liability: el saldo negativo resta.';

-- Derivación única del tipo a la clase. Inmutable para poder usarla en una
-- columna generada: la clase de una cuenta no puede desincronizarse del tipo
-- porque no existe forma de escribirla a mano.
create or replace function public.account_class_for(p_type public.account_type)
returns public.account_class language sql immutable strict as $$
  select case
    when p_type in ('credit_card', 'loan') then 'liability'
    else 'asset'
  end::public.account_class;
$$;

comment on function public.account_class_for(public.account_type) is
  'Clase (activo/pasivo) que corresponde a un tipo de cuenta. Única fuente de verdad de esa derivación.';

alter table public.accounts
  add column if not exists account_class public.account_class
  generated always as (public.account_class_for(type)) stored;

comment on column public.accounts.account_class is
  'Derivado de type, no se escribe a mano. Los pasivos guardan la deuda en NEGATIVO.';

create index if not exists accounts_class_idx on public.accounts (household_id, account_class);

-- ---------------------------------------------------------------------
-- Patrimonio neto: suma simple, sin condicionales
-- ---------------------------------------------------------------------
create or replace function public.household_net_worth(p_household uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum(current_balance), 0)::bigint
    from public.accounts
   where household_id = p_household
     and not is_archived;
$$;

comment on function public.household_net_worth(uuid) is
  'Patrimonio neto aportado por las cuentas: suma simple de current_balance. Los pasivos ya vienen en negativo.';
