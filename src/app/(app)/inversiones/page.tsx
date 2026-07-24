import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { getHousehold, getHouseholdMembers } from "@/lib/household";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { NewInvestmentButton } from "./new-investment-button";
import { InvestmentItem } from "./investment-item";

export default async function InversionesPage() {
  const supabase = await createClient();
  const [{ data: investments }, { data: snapshots }, session, household, members] =
    await Promise.all([
      supabase
        .from("investments")
        .select("*")
        .order("created_at", { ascending: true }),
      supabase
        .from("price_snapshots")
        .select("investment_id, price, as_of")
        .order("as_of", { ascending: false }),
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

  // Precio más reciente por inversión (snapshots vienen ordenados desc).
  const latestPrice = new Map<string, number>();
  for (const s of snapshots ?? []) {
    if (!latestPrice.has(s.investment_id)) {
      latestPrice.set(s.investment_id, s.price);
    }
  }

  const list = investments ?? [];
  let totalValue = 0;
  let totalCost = 0;
  for (const inv of list) {
    const cost = Math.round(inv.quantity * inv.purchase_price);
    const price = latestPrice.get(inv.id);
    totalValue += price != null ? Math.round(inv.quantity * price) : cost;
    totalCost += cost;
  }
  const totalGain = totalValue - totalCost;

  const today = new Date().toLocaleDateString("en-CA");

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Inversiones</h1>
          <p className="text-sm text-muted-foreground">
            Valor: {formatMoney(totalValue, currency)}
            {list.length > 0 ? (
              <span
                className={cn(
                  "ml-1",
                  totalGain >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-destructive",
                )}
              >
                ({totalGain >= 0 ? "+" : "-"}
                {formatMoney(Math.abs(totalGain), currency)})
              </span>
            ) : null}
          </p>
        </div>
        <NewInvestmentButton />
      </div>

      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Sin inversiones. Agrega la primera con «Nueva».
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((inv) => (
            <InvestmentItem
              key={inv.id}
              investment={inv}
              latestPrice={latestPrice.get(inv.id) ?? null}
              ownerLabel={ownerLabel(inv.owner_id)}
              defaultDate={today}
              currency={currency}
            />
          ))}
        </div>
      )}
    </div>
  );
}
