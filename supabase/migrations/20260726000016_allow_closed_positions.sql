-- =====================================================================
-- Fase 2 · 0016 · Permitir posiciones cerradas (cantidad 0)
--
-- RELAJACIÓN DECLARADA sobre una columna existente, la cuarta y última de
-- este lote. No borra datos ni cambia ningún tipo.
--
--   investments_quantity_check:  quantity > 0   ->   quantity >= 0
--
-- Con compras y ventas parciales (`investment_lots`), vender toda la posición
-- deja la cantidad en 0. Con la restricción anterior esa venta era imposible
-- de registrar: había que borrar el holding y con él su historial de precios
-- y de lotes.
--
-- Ninguna fila existente puede violar la nueva regla, porque es más
-- permisiva que la anterior. Reversible mientras no haya posiciones cerradas
-- (el rollback avisa y aborta si las hay).
-- =====================================================================

alter table public.investments drop constraint if exists investments_quantity_check;

do $$ begin
  alter table public.investments add constraint investments_quantity_check
    check (quantity >= 0);
exception when duplicate_object then null; end $$;

comment on column public.investments.quantity is
  'Unidades en posesión (renta variable). 0 = posición cerrada; se conserva por su historial.';
