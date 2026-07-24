import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { getHousehold, getHouseholdMembers } from "@/lib/household";
import { formatMoney } from "@/lib/money";
import { NewDebtButton } from "./new-debt-button";
import { DebtItem } from "./debt-item";

export default async function DeudasPage() {
  const supabase = await createClient();
  const [{ data: debts }, session, household, members] = await Promise.all([
    supabase.from("debts").select("*").order("created_at", { ascending: true }),
    getSessionProfile(),
    getHousehold(),
    getHouseholdMembers(),
  ]);

  const currency = household?.base_currency ?? "MXN";
  const currentUserId = session?.user.id;
  const memberName = new Map(members.map((m) => [m.id, m.display_name]));
  const ownerLabel = (ownerId: string | null) =>
    !ownerId
      ? "Conjunta"
      : ownerId === currentUserId
        ? "Personal (tú)"
        : `Personal · ${memberName.get(ownerId) ?? ""}`.trim();

  const list = debts ?? [];
  const total = list.reduce((s, d) => s + d.current_balance, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Deudas</h1>
          <p className="text-sm text-muted-foreground">
            Total: {formatMoney(total, currency)}
          </p>
        </div>
        <NewDebtButton />
      </div>

      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Sin deudas registradas. Agrega una con «Nueva».
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((d) => (
            <DebtItem
              key={d.id}
              debt={d}
              ownerLabel={ownerLabel(d.owner_id)}
              currency={currency}
            />
          ))}
        </div>
      )}
    </div>
  );
}
