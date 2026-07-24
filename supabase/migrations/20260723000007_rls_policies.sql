-- =====================================================================
-- Fase 1 · 0007 · Row Level Security
-- =====================================================================

alter table public.households            enable row level security;
alter table public.profiles              enable row level security;
alter table public.household_invitations enable row level security;
alter table public.accounts              enable row level security;
alter table public.categories            enable row level security;
alter table public.transactions          enable row level security;
alter table public.shared_expenses       enable row level security;
alter table public.shared_expense_splits enable row level security;
alter table public.settlements           enable row level security;
alter table public.budgets               enable row level security;
alter table public.debts                 enable row level security;
alter table public.savings_goals         enable row level security;
alter table public.investments           enable row level security;
alter table public.price_snapshots       enable row level security;

-- households: solo el propio hogar
create policy household_select on public.households
  for select using (id = public.current_household_id());
create policy household_update on public.households
  for update using (id = public.current_household_id());

-- profiles: cada quien ve su propio perfil (aunque aún no tenga hogar)
-- y también a los miembros de su mismo hogar; cada quien edita el suyo.
create policy profiles_select_self on public.profiles
  for select using (id = auth.uid());
create policy profiles_select_household on public.profiles
  for select using (household_id = public.current_household_id());
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid());

-- invitations: solo del propio hogar
create policy invitations_all on public.household_invitations
  for all using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

-- accounts: personales solo dueño; conjuntas ambos
create policy accounts_select on public.accounts
  for select using (
    household_id = public.current_household_id()
    and (owner_id is null or owner_id = auth.uid())
  );
create policy accounts_mutate on public.accounts
  for all using (
    household_id = public.current_household_id()
    and (owner_id is null or owner_id = auth.uid())
  ) with check (
    household_id = public.current_household_id()
    and created_by = auth.uid()
    and (owner_id is null or owner_id = auth.uid())
  );

-- categories / budgets / shared_expenses / settlements: hogar completo
create policy categories_all on public.categories
  for all using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

create policy budgets_all on public.budgets
  for all using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

create policy shared_expenses_all on public.shared_expenses
  for all using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

create policy settlements_all on public.settlements
  for all using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

-- splits: heredan visibilidad del gasto compartido
create policy splits_all on public.shared_expense_splits
  for all using (
    exists (select 1 from public.shared_expenses se
            where se.id = shared_expense_id
              and se.household_id = public.current_household_id())
  ) with check (
    exists (select 1 from public.shared_expenses se
            where se.id = shared_expense_id
              and se.household_id = public.current_household_id())
  );

-- transactions: visibilidad según la cuenta (personal/conjunta)
create policy transactions_select on public.transactions
  for select using (
    household_id = public.current_household_id()
    and public.can_access_account(account_id)
  );
create policy transactions_mutate on public.transactions
  for all using (
    household_id = public.current_household_id()
    and public.can_access_account(account_id)
  ) with check (
    household_id = public.current_household_id()
    and created_by = auth.uid()
    and public.can_access_account(account_id)
  );

-- debts / savings_goals / investments: personal solo dueño; null ambos
create policy debts_all on public.debts
  for all using (
    household_id = public.current_household_id()
    and (owner_id is null or owner_id = auth.uid())
  ) with check (
    household_id = public.current_household_id()
    and (owner_id is null or owner_id = auth.uid())
  );

create policy savings_all on public.savings_goals
  for all using (
    household_id = public.current_household_id()
    and (owner_id is null or owner_id = auth.uid())
  ) with check (
    household_id = public.current_household_id()
    and (owner_id is null or owner_id = auth.uid())
  );

create policy investments_all on public.investments
  for all using (
    household_id = public.current_household_id()
    and (owner_id is null or owner_id = auth.uid())
  ) with check (
    household_id = public.current_household_id()
    and (owner_id is null or owner_id = auth.uid())
  );

-- price_snapshots: heredan del holding
create policy snapshots_all on public.price_snapshots
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
