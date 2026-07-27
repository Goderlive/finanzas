import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { getHousehold, getHouseholdMembers } from "@/lib/household";
import { formatMoney } from "@/lib/money";
import {
  computeCreditCardCycle,
  type CreditCardCycle,
  type CycleMovement,
  type CyclePlan,
} from "@/lib/credit-cycle";
import { NewAccountButton } from "./new-account-button";
import { AccountItem } from "./account-item";

export default async function AccountsPage() {
  const supabase = await createClient();
  const [
    { data: accounts },
    { data: movements },
    { data: msiPlans },
    session,
    household,
    members,
  ] = await Promise.all([
      supabase
        .from("accounts")
        .select("*")
        .order("created_at", { ascending: true }),
      supabase
        .from("transactions")
        .select("id, account_id, transfer_account_id, type, amount, occurred_at"),
      supabase
        .from("installment_plans")
        .select(
          "transaction_id, total_amount, purchase:transactions!inner(account_id, occurred_at), installments:installment_payments(statement_period, amount)",
        )
        .neq("status", "cancelled"),
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

  // Ciclo de cada tarjeta de crédito, corregido por las compras a MSI.
  const movementList = (movements ?? []) as CycleMovement[];
  // Los tipos escritos a mano no modelan los embeds de PostgREST.
  const plansByCard = new Map<string, CyclePlan[]>();
  for (const p of (msiPlans ?? []) as unknown as Array<{
    transaction_id: string;
    total_amount: number;
    purchase: { account_id: string; occurred_at: string };
    installments: { statement_period: string; amount: number }[];
  }>) {
    const list = plansByCard.get(p.purchase.account_id) ?? [];
    list.push({
      transaction_id: p.transaction_id,
      occurred_at: p.purchase.occurred_at,
      total_amount: p.total_amount,
      installments: p.installments ?? [],
    });
    plansByCard.set(p.purchase.account_id, list);
  }

  const cycles = new Map<string, CreditCardCycle>();
  for (const a of all) {
    if (a.type !== "credit_card") continue;
    cycles.set(
      a.id,
      computeCreditCardCycle(
        a,
        movementList.filter(
          (m) => m.account_id === a.id || m.transfer_account_id === a.id,
        ),
        plansByCard.get(a.id) ?? [],
      ),
    );
  }

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
              cycle={cycles.get(a.id)}
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
              cycle={cycles.get(a.id)}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
