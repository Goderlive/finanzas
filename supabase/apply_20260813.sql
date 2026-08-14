-- =====================================================================
-- APLICAR EN SUPABASE (SQL Editor o psql) — lote 20260813
--
-- La inversión pasa a vivir DENTRO de una cuenta: se le da significado,
-- índice y guardias a `investments.account_id`, que existía sin usarse
-- desde la 0005. ADITIVA: no crea, borra ni cambia el tipo de ninguna
-- columna. Reejecutable sin efectos.
--
-- AL APLICARLA NO CAMBIA NINGÚN NÚMERO. Las inversiones actuales tienen
-- account_id en NULL y siguen sumando su valor completo al patrimonio
-- neto, exactamente como hasta ahora. Los saldos empiezan a moverse sólo
-- cuando alguien vincula una inversión desde la app, y el diálogo dice
-- antes de confirmar qué le va a pasar al patrimonio.
--
-- ANTES DE EJECUTAR:  ./scripts/db-backup.sh
-- PROBAR ANTES:       ./scripts/db-test.sh   (suite de la 0022, casos 1 a 12)
-- PARA REVERTIR:      supabase/rollback/20260813_down_all.sql
--
-- Requiere la 0018 (`account_class`, `account_class_for`) y la 0019/0020
-- (`create_transfer`), que la app usa para el fondeo por traspaso.
-- =====================================================================


-- ============================================================
-- 20260813000022_investment_account_link.sql
-- ============================================================
-- =====================================================================
-- Fase 4 · 0022 · La inversión vive DENTRO de una cuenta
--
-- ADITIVA: no crea, borra ni cambia el tipo de ninguna columna. Añade un
-- índice, dos funciones y dos triggers. `investments.account_id` existe
-- desde la 0005 y jamás se usó; aquí se le da significado.
--
-- Ninguna fila cambia al aplicar: hoy todas las inversiones tienen
-- account_id NULL y el guardia no se dispara con NULL.
--
-- ---------------------------------------------------------------------
-- EL PROBLEMA
--
-- Hasta ahora Inversiones y Cuentas eran dos mundos sin contacto: ni una
-- sola transacción movía dinero hacia una inversión. Abrir una cajita de
-- $30,000 no bajaba el saldo de ninguna cuenta. Eso deja dos estados
-- posibles y ninguna forma de distinguirlos:
--
--   · el dinero SIGUE contado en el saldo de la cuenta  -> contado DOS veces
--   · el dinero se bajó a mano de la cuenta             -> el movimiento no
--                                                          existe en ningún lado
--
-- ---------------------------------------------------------------------
-- QUÉ SIGNIFICA account_id
--
--   «El dinero de esta inversión está DENTRO del saldo de esa cuenta.»
--
-- Con eso el patrimonio neto deja de poder contar el mismo peso dos
-- veces. La regla de lectura, evaluada por inversión:
--
--   account_id NOT NULL -> el capital YA está en accounts.current_balance;
--                          la inversión sólo aporta su PLUSVALÍA
--                          (valor de mercado o devengado − costo).
--   account_id NULL     -> nadie más la cuenta; aporta su VALOR completo,
--                          que es exactamente lo que hacía la app antes.
--
-- Las dos ramas suman el capital una sola vez, así que vincular una
-- inversión nunca altera el patrimonio salvo para corregir un doble
-- conteo que ya existía. Y como la migración deja todo en NULL, aplicarla
-- no mueve ni un centavo de ningún número: la app se comporta igual hasta
-- que alguien vincula la primera inversión.
--
-- Corolario práctico: una compra o venta DENTRO de la cuenta contenedora
-- (efectivo -> títulos en la misma casa de bolsa) no mueve dinero entre
-- cuentas y no necesita traspaso. Sólo los depósitos y retiros hacia esa
-- cuenta lo son, y para eso ya está `create_transfer` de la 0020.
--
-- ---------------------------------------------------------------------
-- INVARIANTES QUE IMPONEN LOS GUARDIAS
--
--   1. La cuenta es del mismo hogar que la inversión.
--   2. La cuenta es de ACTIVO. Una inversión no puede vivir dentro de una
--      tarjeta ni de un préstamo: por la regla de signo de la 0018 el
--      capital sumaría a un saldo que es negativo por naturaleza.
--   3. La titularidad coincide: investments.owner_id = accounts.owner_id.
--      Si no, alguien vería la plusvalía sin ver el capital que la produce
--      (o al revés) y su patrimonio quedaría descuadrado.
--
-- El segundo guardia va sobre `accounts` y evita romper el invariante 2 o
-- el 3 por la puerta de atrás, editando la cuenta en vez de la inversión.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Índice y documentación
-- ---------------------------------------------------------------------
create index if not exists investments_account_idx
  on public.investments (account_id) where account_id is not null;

comment on column public.investments.account_id is
  'Cuenta dentro de la cual vive el dinero de esta inversión. NOT NULL => el capital ya está contado en accounts.current_balance y la inversión sólo aporta plusvalía al patrimonio neto. NULL => la inversión aporta su valor completo.';

-- ---------------------------------------------------------------------
-- 2. Guardia sobre investments
--
-- SECURITY INVOKER a propósito (es el modo por omisión): al leer
-- `accounts` bajo RLS, sólo se puede vincular a una cuenta que quien
-- escribe puede ver. Una cuenta ajena es indistinguible de una
-- inexistente, y así debe ser.
-- ---------------------------------------------------------------------
create or replace function public.investments_account_guard()
returns trigger language plpgsql as $$
declare
  a record;
begin
  if new.account_id is null then
    return new;
  end if;

  select household_id, owner_id, account_class, name
    into a
    from public.accounts
   where id = new.account_id;

  if not found then
    raise exception 'La cuenta seleccionada no existe o no es tuya'
      using errcode = 'foreign_key_violation';
  end if;

  if a.household_id <> new.household_id then
    raise exception 'La cuenta «%» es de otro hogar', a.name
      using errcode = 'check_violation';
  end if;

  if a.account_class <> 'asset' then
    raise exception 'Una inversión no puede vivir en «%», que es una cuenta de pasivo', a.name
      using errcode = 'check_violation';
  end if;

  if a.owner_id is distinct from new.owner_id then
    raise exception 'La titularidad de la inversión debe coincidir con la de la cuenta «%»', a.name
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.investments_account_guard() is
  'Impone que la cuenta contenedora de una inversión sea del mismo hogar, de activo y de la misma titularidad.';

drop trigger if exists investments_account_guard on public.investments;
create trigger investments_account_guard
  before insert or update of account_id, owner_id, household_id
  on public.investments
  for each row execute function public.investments_account_guard();

-- ---------------------------------------------------------------------
-- 3. Guardia sobre accounts
--
-- El invariante se puede romper desde el otro lado: volver personal una
-- cuenta conjunta que respalda una inversión conjunta, o convertirla en
-- tarjeta de crédito. Se bloquea el cambio y se pide desvincular primero.
-- ---------------------------------------------------------------------
create or replace function public.accounts_investment_guard()
returns trigger language plpgsql as $$
declare
  v_name text;
begin
  -- Sólo importan los dos atributos de los que depende el invariante.
  if new.owner_id is not distinct from old.owner_id
     and new.type is not distinct from old.type then
    return new;
  end if;

  select coalesce(i.name, i.symbol)
    into v_name
    from public.investments i
   where i.account_id = new.id
     and (i.owner_id is distinct from new.owner_id
          or public.account_class_for(new.type) <> 'asset')
   limit 1;

  if found then
    raise exception
      'La cuenta «%» respalda la inversión «%». Desvincúlala antes de cambiarle la titularidad o el tipo.',
      new.name, v_name
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.accounts_investment_guard() is
  'Evita romper por el lado de accounts el invariante de titularidad y clase que exige investments_account_guard.';

drop trigger if exists accounts_investment_guard on public.accounts;
create trigger accounts_investment_guard
  before update of owner_id, type
  on public.accounts
  for each row execute function public.accounts_investment_guard();
