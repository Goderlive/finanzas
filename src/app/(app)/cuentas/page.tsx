import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { getHousehold, getHouseholdMembers } from "@/lib/household";
import { formatMoney } from "@/lib/money";
import { NewAccountButton } from "./new-account-button";
import { AccountItem } from "./account-item";

export default async function AccountsPage() {
  const supabase = await createClient();
  const [{ data: accounts }, session, household, members] = await Promise.all([
    supabase
      .from("accounts")
      .select("*")
      .order("created_at", { ascending: true }),
    getSessionProfile(),
    getHousehold(),
    getHouseholdMembers(),
  ]);

  const currency = household?.base_currency ?? "MXN";
  const currentUserId = session?.user.id;
  const memberName = new Map(members.map((m) => [m.id, m.display_name]));

  function ownerLabel(ownerId: string | null): string {
    if (!ownerId) return "Conjunta";
    if (ownerId === currentUserId) return "Personal (tú)";
    return `Personal · ${memberName.get(ownerId) ?? ""}`.trim();
  }

  const all = accounts ?? [];
  const active = all.filter((a) => !a.is_archived);
  const archived = all.filter((a) => a.is_archived);
  const total = active.reduce((sum, a) => sum + a.current_balance, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Cuentas</h1>
          <p className="text-sm text-muted-foreground">
            Total activo: {formatMoney(total, currency)}
          </p>
        </div>
        <NewAccountButton />
      </div>

      {active.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aún no tienes cuentas. Crea la primera con el botón «Nueva».
        </div>
      ) : (
        <div className="space-y-2">
          {active.map((a) => (
            <AccountItem
              key={a.id}
              account={a}
              ownerLabel={ownerLabel(a.owner_id)}
              currency={currency}
            />
          ))}
        </div>
      )}

      {archived.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Archivadas
          </h2>
          {archived.map((a) => (
            <AccountItem
              key={a.id}
              account={a}
              ownerLabel={ownerLabel(a.owner_id)}
              currency={currency}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
