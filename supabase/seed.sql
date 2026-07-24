-- =====================================================================
-- Seed de datos de ejemplo (desarrollo local)
-- =====================================================================
-- Crea 2 usuarios de auth, 1 hogar, cuentas, categorías, transacciones,
-- un gasto compartido con su reparto, una liquidación, presupuestos,
-- una deuda, una meta de ahorro y una inversión con precio.
--
-- Login de prueba (GoTrue email+password): password para ambos = "password123"
--   goder@example.com  /  esposa@example.com
--
-- Nota: las columnas exactas de auth.users/auth.identities pueden variar
-- según la versión de GoTrue de tu Supabase self-hosted. Ajusta si aplica.
-- =====================================================================

-- IDs fijos para poder referenciarlos
-- Goder  = 11111111-1111-1111-1111-111111111111
-- Esposa = 22222222-2222-2222-2222-222222222222

-- ---------------------------------------------------------------------
-- Usuarios de auth  (el trigger handle_new_user crea sus profiles)
-- ---------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
   'goder@example.com', crypt('password123', gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}',
   '{"display_name":"Goder"}'),
  ('00000000-0000-0000-0000-000000000000',
   '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
   'esposa@example.com', crypt('password123', gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}',
   '{"display_name":"Esposa"}')
on conflict (id) do nothing;

insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values
  ('11111111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111',
   '{"sub":"11111111-1111-1111-1111-111111111111","email":"goder@example.com"}',
   'email', now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222',
   '22222222-2222-2222-2222-222222222222',
   '{"sub":"22222222-2222-2222-2222-222222222222","email":"esposa@example.com"}',
   'email', now(), now(), now())
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Hogar y perfiles
-- ---------------------------------------------------------------------
insert into public.households (id, name, base_currency)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Casa Goder', 'MXN')
on conflict (id) do nothing;

update public.profiles
   set household_id = 'aaaaaaaa-0000-0000-0000-000000000001',
       role = 'owner', display_name = 'Goder'
 where id = '11111111-1111-1111-1111-111111111111';

update public.profiles
   set household_id = 'aaaaaaaa-0000-0000-0000-000000000001',
       role = 'member', display_name = 'Esposa'
 where id = '22222222-2222-2222-2222-222222222222';

-- ---------------------------------------------------------------------
-- Cuentas  (conjunta = owner_id null; personales = owner_id)
-- ---------------------------------------------------------------------
insert into public.accounts (id, household_id, owner_id, name, type, initial_balance, created_by) values
  ('acc00000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', null,
     'Cuenta conjunta', 'checking', 5000000, '11111111-1111-1111-1111-111111111111'),
  ('acc00000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
     '11111111-1111-1111-1111-111111111111', 'Personal Goder', 'checking', 1500000,
     '11111111-1111-1111-1111-111111111111'),
  ('acc00000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001',
     '22222222-2222-2222-2222-222222222222', 'Personal Esposa', 'checking', 1200000,
     '22222222-2222-2222-2222-222222222222'),
  ('acc00000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', null,
     'Efectivo', 'cash', 200000, '11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Categorías jerárquicas
-- ---------------------------------------------------------------------
insert into public.categories (id, household_id, parent_id, name, kind, icon, color) values
  ('ca000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', null, 'Hogar',       'expense', 'home',        '#6366f1'),
  ('ca000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'Renta',       'expense', 'key',    '#6366f1'),
  ('ca000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'Servicios',   'expense', 'zap',    '#6366f1'),
  ('ca000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', null, 'Comida',      'expense', 'utensils',    '#f59e0b'),
  ('ca000000-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000004', 'Supermercado','expense', 'shopping-cart', '#f59e0b'),
  ('ca000000-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000004', 'Restaurantes','expense', 'coffee', '#f59e0b'),
  ('ca000000-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', null, 'Transporte',  'expense', 'car',         '#10b981'),
  ('ca000000-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001', null, 'Salario',     'income',  'briefcase',   '#22c55e')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Transacciones  (el trigger actualiza current_balance)
-- ---------------------------------------------------------------------
insert into public.transactions (household_id, account_id, transfer_account_id, category_id, type, amount, description, occurred_at, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000001', null, 'ca000000-0000-0000-0000-000000000008', 'income',  4500000, 'Salario Goder',        current_date - 20, '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000001', null, 'ca000000-0000-0000-0000-000000000002', 'expense', 1800000, 'Renta mensual',        current_date - 18, '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000001', null, 'ca000000-0000-0000-0000-000000000005', 'expense',  320000, 'Supermercado semana',  current_date - 15, '22222222-2222-2222-2222-222222222222'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000002', null, 'ca000000-0000-0000-0000-000000000006', 'expense',   45000, 'Café con amigos',      current_date - 10, '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000003', null, 'ca000000-0000-0000-0000-000000000007', 'expense',   28000, 'Gasolina',             current_date - 8,  '22222222-2222-2222-2222-222222222222'),
  -- Transferencia de conjunta a efectivo
  ('aaaaaaaa-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000001', 'acc00000-0000-0000-0000-000000000004', null, 'transfer', 100000, 'Retiro efectivo',      current_date - 5,  '11111111-1111-1111-1111-111111111111');

-- ---------------------------------------------------------------------
-- Gasto compartido 50/50 + reparto  (Goder pagó $3,200; cada quien $1,600)
-- ---------------------------------------------------------------------
insert into public.shared_expenses (id, household_id, description, amount, paid_by, split_type, occurred_at, created_by)
values ('5e000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
        'Supermercado semana', 320000, '11111111-1111-1111-1111-111111111111', 'equal',
        current_date - 15, '11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

insert into public.shared_expense_splits (shared_expense_id, profile_id, owed_amount) values
  ('5e000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 160000),
  ('5e000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 160000)
on conflict do nothing;

-- Liquidación parcial: Esposa le paga $500 a Goder
insert into public.settlements (household_id, from_profile, to_profile, amount, settled_at, note, created_by)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
        50000, current_date - 3, 'Abono del súper', '22222222-2222-2222-2222-222222222222');

-- ---------------------------------------------------------------------
-- Presupuestos del mes actual
-- ---------------------------------------------------------------------
insert into public.budgets (household_id, category_id, month, amount, rollover, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000004', date_trunc('month', current_date)::date, 800000, true,  '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000007', date_trunc('month', current_date)::date, 150000, false, '11111111-1111-1111-1111-111111111111')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Deuda (tarjeta conjunta)
-- ---------------------------------------------------------------------
insert into public.debts (household_id, owner_id, name, type, principal, current_balance, interest_rate, minimum_payment, statement_day, due_day, created_by)
values ('aaaaaaaa-0000-0000-0000-000000000001', null, 'Tarjeta BBVA', 'credit_card',
        3000000, 2450000, 0.4200, 90000, 5, 25, '11111111-1111-1111-1111-111111111111');

-- ---------------------------------------------------------------------
-- Meta de ahorro conjunta
-- ---------------------------------------------------------------------
insert into public.savings_goals (household_id, owner_id, account_id, name, target_amount, current_amount, target_date, created_by)
values ('aaaaaaaa-0000-0000-0000-000000000001', null, 'acc00000-0000-0000-0000-000000000001',
        'Fondo de emergencia', 10000000, 3500000, current_date + 300, '11111111-1111-1111-1111-111111111111');

-- ---------------------------------------------------------------------
-- Inversión + snapshot de precio
-- ---------------------------------------------------------------------
insert into public.investments (id, household_id, owner_id, symbol, name, quantity, purchase_price, purchase_date, created_by)
values ('19000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', null,
        'VOO', 'Vanguard S&P 500 ETF', 2.5, 8500000, current_date - 120, '11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

insert into public.price_snapshots (investment_id, price, as_of, created_by) values
  ('19000000-0000-0000-0000-000000000001', 8500000, current_date - 120, '11111111-1111-1111-1111-111111111111'),
  ('19000000-0000-0000-0000-000000000001', 9100000, current_date - 30,  '11111111-1111-1111-1111-111111111111'),
  ('19000000-0000-0000-0000-000000000001', 9450000, current_date,       '11111111-1111-1111-1111-111111111111')
on conflict do nothing;
