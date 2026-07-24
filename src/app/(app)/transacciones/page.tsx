import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { getHousehold, getHouseholdMembers } from "@/lib/household";
import { TransactionsView } from "./transactions-view";

export default async function TransaccionesPage() {
  const supabase = await createClient();
  const [
    { data: transactions },
    { data: accounts },
    { data: categories },
    session,
    household,
    members,
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("*")
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("accounts")
      .select("id, name, is_archived")
      .order("created_at", { ascending: true }),
    supabase.from("categories").select("id, name, kind, parent_id, is_archived"),
    getSessionProfile(),
    getHousehold(),
    getHouseholdMembers(),
  ]);

  const currency = household?.base_currency ?? "MXN";
  const allAccounts = accounts ?? [];
  const allCategories = categories ?? [];

  const accountNames = Object.fromEntries(
    allAccounts.map((a) => [a.id, a.name]),
  );
  const categoryNames = Object.fromEntries(
    allCategories.map((c) => [c.id, c.name]),
  );
  const memberNames = Object.fromEntries(
    members.map((m) => [m.id, m.display_name]),
  );

  const formAccounts = allAccounts
    .filter((a) => !a.is_archived)
    .map((a) => ({ id: a.id, name: a.name }));
  const formCategories = allCategories
    .filter((c) => !c.is_archived)
    .map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      parent_id: c.parent_id,
    }));

  const today = new Date().toLocaleDateString("en-CA");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Movimientos</h1>
      <TransactionsView
        transactions={transactions ?? []}
        accounts={formAccounts}
        categories={formCategories}
        accountNames={accountNames}
        categoryNames={categoryNames}
        memberNames={memberNames}
        currency={currency}
        defaultDate={today}
        currentUserId={session?.user.id ?? ""}
      />
    </div>
  );
}
