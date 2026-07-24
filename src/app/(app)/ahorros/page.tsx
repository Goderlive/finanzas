import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { getHousehold, getHouseholdMembers } from "@/lib/household";
import { formatMoney } from "@/lib/money";
import { NewGoalButton } from "./new-goal-button";
import { GoalItem } from "./goal-item";

export default async function AhorrosPage() {
  const supabase = await createClient();
  const [{ data: goals }, session, household, members] = await Promise.all([
    supabase
      .from("savings_goals")
      .select("*")
      .order("created_at", { ascending: true }),
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

  const list = goals ?? [];
  const totalSaved = list.reduce((s, g) => s + g.current_amount, 0);
  const totalTarget = list.reduce((s, g) => s + g.target_amount, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Metas de ahorro</h1>
          <p className="text-sm text-muted-foreground">
            {formatMoney(totalSaved, currency)} de{" "}
            {formatMoney(totalTarget, currency)}
          </p>
        </div>
        <NewGoalButton />
      </div>

      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Sin metas de ahorro. Crea la primera con «Nueva».
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((g) => (
            <GoalItem
              key={g.id}
              goal={g}
              ownerLabel={ownerLabel(g.owner_id)}
              currency={currency}
            />
          ))}
        </div>
      )}
    </div>
  );
}
