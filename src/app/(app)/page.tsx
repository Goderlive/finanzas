import Link from "next/link";
import { ArrowRight, Users, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getHousehold, getHouseholdMembers } from "@/lib/household";
import { formatMoney } from "@/lib/money";
import { ProgressBar, type ProgressTone } from "@/components/progress-bar";
import { computeBalance, type Member } from "./compartidos/balance";
import { childrenMap, rollupSpent, type SpentMap } from "./presupuestos/compute";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function HomePage() {
  const supabase = await createClient();

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const [
    { data: accounts },
    { data: monthTx },
    { data: sharedExpenses },
    { data: settlements },
    { data: budgets },
    { data: categories },
    { data: debts },
    { data: investments },
    { data: snapshots },
    household,
    membersRaw,
  ] = await Promise.all([
    supabase.from("accounts").select("current_balance").eq("is_archived", false),
    supabase
      .from("transactions")
      .select("type, amount, category_id")
      .gte("occurred_at", monthStart),
    supabase
      .from("shared_expenses")
      .select("id, amount, paid_by, splits:shared_expense_splits(profile_id, owed_amount)"),
    supabase.from("settlements").select("from_profile, to_profile, amount"),
    supabase.from("budgets").select("category_id, amount").eq("month", monthStart),
    supabase.from("categories").select("id, parent_id"),
    supabase.from("debts").select("name, current_balance, due_day"),
    supabase.from("investments").select("id, quantity, purchase_price"),
    supabase
      .from("price_snapshots")
      .select("investment_id, price, as_of")
      .order("as_of", { ascending: false }),
    getHousehold(),
    getHouseholdMembers(),
  ]);

  const currency = household?.base_currency ?? "MXN";
  const members: Member[] = membersRaw.map((m) => ({
    id: m.id,
    name: m.display_name,
  }));
  // Los tipos escritos a mano no modelan los embeds de PostgREST; el runtime sí
  // trae `splits` porque el FK existe.
  const sharedList = (sharedExpenses ?? []) as unknown as Array<{
    id: string;
    amount: number;
    paid_by: string;
    splits: { profile_id: string; owed_amount: number }[];
  }>;
  const balance = computeBalance(
    members,
    sharedList.map((e) => ({
      id: e.id,
      amount: e.amount,
      paid_by: e.paid_by,
      splits: e.splits ?? [],
    })),
    settlements ?? [],
  );
  // Patrimonio neto = cuentas + inversiones − deudas.
  const accountsTotal = (accounts ?? []).reduce(
    (s, a) => s + a.current_balance,
    0,
  );
  const debtsTotal = (debts ?? []).reduce((s, d) => s + d.current_balance, 0);
  const latestPrice = new Map<string, number>();
  for (const s of snapshots ?? []) {
    if (!latestPrice.has(s.investment_id)) {
      latestPrice.set(s.investment_id, s.price);
    }
  }
  const investmentsValue = (investments ?? []).reduce((sum, inv) => {
    const price = latestPrice.get(inv.id);
    return (
      sum +
      (price != null
        ? Math.round(inv.quantity * price)
        : Math.round(inv.quantity * inv.purchase_price))
    );
  }, 0);
  const netWorth = accountsTotal + investmentsValue - debtsTotal;

  // Próximos vencimientos de deudas (con día de pago).
  const upcoming = (debts ?? [])
    .filter((d) => d.due_day)
    .map((d) => {
      const t = new Date();
      const due = new Date(t.getFullYear(), t.getMonth(), d.due_day!);
      if (due < new Date(t.getFullYear(), t.getMonth(), t.getDate())) {
        due.setMonth(due.getMonth() + 1);
      }
      return { name: d.name, due };
    })
    .sort((a, b) => a.due.getTime() - b.due.getTime())
    .slice(0, 3);

  const income = (monthTx ?? [])
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const expense = (monthTx ?? [])
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);
  const flow = income - expense;

  // Presupuesto consumido del mes (con roll-up de subcategorías).
  const budgetList = budgets ?? [];
  const spentMap: SpentMap = {};
  for (const t of monthTx ?? []) {
    if (t.type === "expense" && t.category_id) {
      spentMap[t.category_id] = (spentMap[t.category_id] ?? 0) + t.amount;
    }
  }
  const children = childrenMap(categories ?? []);
  const budgetLimit = budgetList.reduce((s, b) => s + b.amount, 0);
  const budgetSpent = budgetList.reduce(
    (s, b) => s + rollupSpent(b.category_id, spentMap, children),
    0,
  );
  const budgetPct =
    budgetLimit > 0 ? (budgetSpent / budgetLimit) * 100 : 0;
  const budgetTone: ProgressTone =
    budgetPct >= 100 ? "over" : budgetPct >= 80 ? "warn" : "ok";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Patrimonio neto</CardDescription>
          <CardTitle
            className={cn(
              "text-3xl tabular-nums",
              netWorth < 0 && "text-destructive",
            )}
          >
            {formatMoney(netWorth, currency)}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          Cuentas {formatMoney(accountsTotal, currency)} + inversiones{" "}
          {formatMoney(investmentsValue, currency)} − deudas{" "}
          {formatMoney(debtsTotal, currency)}.
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Ingresos del mes" value={formatMoney(income, currency)} tone="income" />
        <StatCard label="Gastos del mes" value={formatMoney(expense, currency)} tone="expense" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Flujo del mes</CardDescription>
          <CardTitle
            className={cn(
              "text-2xl tabular-nums",
              flow >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-destructive",
            )}
          >
            {flow >= 0 ? "+" : "-"}
            {formatMoney(Math.abs(flow), currency)}
          </CardTitle>
        </CardHeader>
      </Card>

      {upcoming.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Próximos vencimientos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {upcoming.map((u, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm"
              >
                <span>{u.name}</span>
                <span className="text-muted-foreground">
                  {u.due.toLocaleDateString("es-MX", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {budgetList.length > 0 ? (
        <Link href="/presupuestos" className="block">
          <Card className="transition-colors hover:bg-muted/40">
            <CardHeader className="pb-2">
              <CardDescription>Presupuesto del mes</CardDescription>
              <CardTitle className="text-lg tabular-nums">
                {formatMoney(budgetSpent, currency)}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  de {formatMoney(budgetLimit, currency)}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ProgressBar value={budgetPct} tone={budgetTone} />
            </CardContent>
          </Card>
        </Link>
      ) : null}

      {members.length >= 2 ? (
        <Link href="/compartidos" className="block">
          <Card className="transition-colors hover:bg-muted/40">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Balance entre ustedes
              </CardDescription>
              {balance.amount === 0 ? (
                <CardTitle className="text-lg text-emerald-600 dark:text-emerald-400">
                  Están a mano ✓
                </CardTitle>
              ) : (
                <CardTitle className="text-lg">
                  {balance.debtor?.name}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    le debe a
                  </span>{" "}
                  {balance.creditor?.name}{" "}
                  <span className="tabular-nums">
                    {formatMoney(balance.amount, currency)}
                  </span>
                </CardTitle>
              )}
            </CardHeader>
          </Card>
        </Link>
      ) : null}

      {members.length < 2 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-4 w-4" />
              Invita a tu pareja
            </CardTitle>
            <CardDescription>
              Compartan las finanzas del hogar desde ambos teléfonos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm" variant="outline">
              <Link href="/hogar">
                Ir a Hogar
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "income" | "expense";
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={cn(
            "text-xl tabular-nums",
            tone === "income"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-foreground",
          )}
        >
          {value}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}
