-- =====================================================================
-- Fase 2 · 0013 · Lotes de inversión (compras parciales, costo promedio)
--
-- ADITIVA: tabla nueva + backfill de las inversiones existentes como un
-- único lote de compra. No borra ni cambia ninguna columna existente.
--
-- investments.quantity y .purchase_price siguen siendo el agregado que
-- lee la app hoy (cantidad total y costo promedio ponderado por unidad).
-- investment_lots aporta el detalle para recalcularlo con compras parciales.
-- Tras el backfill, el agregado y la suma de lotes coinciden exactamente.
-- =====================================================================

do $$ begin
  create type public.investment_lot_type as enum ('buy', 'sell');
exception when duplicate_object then null; end $$;

create table if not exists public.investment_lots (
  id            uuid primary key default gen_random_uuid(),
  investment_id uuid not null references public.investments (id) on delete cascade,
  type          public.investment_lot_type not null default 'buy',
  quantity      numeric(20,8) not null check (quantity > 0),
  price         bigint not null check (price >= 0),   -- centavos por unidad
  occurred_at   date not null default current_date,
  note          text,
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now()
);
create index if not exists investment_lots_inv_idx
  on public.investment_lots (investment_id, occurred_at);

comment on table public.investment_lots is
  'Compras y ventas parciales de un holding de renta variable. Base para el costo promedio ponderado.';
comment on column public.investment_lots.price is
  'Precio por unidad en centavos al momento del movimiento. No se modelan comisiones.';

-- ---------------------------------------------------------------------
-- Backfill: cada inversión variable existente se convierte en su lote
-- de compra inicial. Idempotente.
-- ---------------------------------------------------------------------
insert into public.investment_lots
  (investment_id, type, quantity, price, occurred_at, created_by, created_at)
select i.id, 'buy', i.quantity, i.purchase_price, i.purchase_date, i.created_by, i.created_at
  from public.investments i
 where i.investment_type = 'variable'
   and i.quantity is not null
   and i.purchase_price is not null
   and not exists (
     select 1 from public.investment_lots l where l.investment_id = i.id
   );

-- ---------------------------------------------------------------------
-- RLS: heredan del holding, igual que price_snapshots
-- ---------------------------------------------------------------------
alter table public.investment_lots enable row level security;

drop policy if exists investment_lots_all on public.investment_lots;
create policy investment_lots_all on public.investment_lots
  for all using (
    exists (select 1 from public.investments i
             where i.id = investment_id
               and i.household_id = public.current_household_id()
               and (i.owner_id is null or i.owner_id = auth.uid()))
  ) with check (
    exists (select 1 from public.investments i
             where i.id = investment_id
               and i.household_id = public.current_household_id()
               and (i.owner_id is null or i.owner_id = auth.uid()))
  );
