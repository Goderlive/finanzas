-- =====================================================================
-- Fase 2 · 0015 · La renta fija no lleva cantidad ni precio unitario
--
-- ADITIVA: sólo añade una restricción. No toca columnas ni datos.
--
-- 0012 obligaba a la renta variable a tener symbol/quantity/purchase_price y
-- prohibía los campos de renta fija fuera de 'fixed', pero no al revés: una
-- fila 'fixed' podía llevar `quantity` y `purchase_price`, que la valuación
-- de renta fija ignora por completo. Quedarían ahí mintiendo en silencio.
--
-- `symbol` sí se permite en renta fija: es sólo una etiqueta y a un CETE le
-- viene bien su clave de emisión (p.ej. 'BI-CETES-260730').
-- =====================================================================

do $$ begin
  alter table public.investments add constraint investments_fixed_has_no_units
    check (
      investment_type <> 'fixed'
      or (quantity is null and purchase_price is null)
    );
exception when duplicate_object then null; end $$;
