-- =====================================================================
-- ROLLBACK del lote 20260813 (0022 · la inversión vive dentro de una cuenta)
--
-- Quita los dos guardias y el índice. NO borra `investments.account_id`:
-- esa columna existe desde la 0005, es anterior a este lote y borrarla
-- destruiría las vinculaciones que se hayan hecho.
--
-- CONSECUENCIA DE REVERTIR: sin el guardia, una inversión puede quedar
-- vinculada a una cuenta de otra titularidad o de pasivo, y el patrimonio
-- neto de alguno de los dos quedaría descuadrado. La app sigue leyendo
-- account_id, así que las vinculaciones existentes se respetan; lo que se
-- pierde es la garantía de que las nuevas sean coherentes.
--
-- Si lo que se quiere es volver de verdad al comportamiento anterior
-- (inversiones sumando su valor completo, sin relación con cuentas),
-- hay que desvincularlas además:
--
--   update public.investments set account_id = null;
--
-- Esa línea va comentada a propósito: borra información que el usuario
-- capturó a mano y no se puede reconstruir.
-- =====================================================================

drop trigger if exists accounts_investment_guard on public.accounts;
drop function if exists public.accounts_investment_guard();

drop trigger if exists investments_account_guard on public.investments;
drop function if exists public.investments_account_guard();

drop index if exists public.investments_account_idx;

comment on column public.investments.account_id is null;

-- update public.investments set account_id = null;   -- ver nota de arriba
