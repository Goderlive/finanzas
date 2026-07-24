import { createClient } from "@/lib/supabase/server";
import { getHousehold } from "@/lib/household";
import { formatMoney } from "@/lib/money";
import { ProgressBar, type ProgressTone } from "@/components/progress-bar";
import { parseMonthParam, addMonths } from "./month";
import { childrenMap, rollupSpent, type SpentMap } from "./compute";
import { MonthNav } from "./month-nav";
import { NewBudgetButton } from "./new-budget-button";
import { BudgetItem } from "./budget-item";
import type { BudgetCategory } from "./budget-dialog";

export default async function PresupuestosPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const monthFirst = parseMonthParam(month);
  const prevFirst = addMonths(monthFirst, -1);
  const nextFirst = addMonths(monthFirst, 1);

  const supabase = await createClient();
  const [
    { data: budgets },
    { data: prevBudgets },
    { data: categories },
    { data: txns },
    household,
  ] = await Promise.all([
    supabase.from("budgets").select("*").eq("month", monthFirst),
    supabase.from("budgets").select("category_id, amount").eq("month", prevFirst),
    supabase
      .from("categories")
      .select("id, name, kind, parent_id, is_archived"),
    supabase
      .from("transactions")
      .select("category_id, amount, occurred_at")
      .eq("type", "expense")
      .gte("occurred_at", prevFirst)
      .lt("occurred_at", nextFirst),
    getHousehold(),
  ]);

  const currency = household?.base_currency ?? "MXN";
  const cats = categories ?? [];
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const children = childrenMap(cats);

  const spentCur: SpentMap = {};
  const spentPrev: SpentMap = {};
  for (const t of txns ?? []) {
    if (!t.category_id) continue;
    const bucket = t.occurred_at >= monthFirst ? spentCur : spentPrev;
    bucket[t.category_id] = (bucket[t.category_id] ?? 0) + t.amount;
  }
  const prevAmountByCat = new Map(
    (prevBudgets ?? []).map((b) => [b.category_id, b.amount]),
  );

  const rows = (budgets ?? [])
    .map((b) => {
      const spent = rollupSpent(b.category_id, spentCur, children);
      let limit = b.amount;
      if (b.rollover) {
        const prevAmount = prevAmountByCat.get(b.category_id);
        if (prevAmount != null) {
          const prevSpent = rollupSpent(b.category_id, spentPrev, children);
          limit += Math.max(0, prevAmount - prevSpent);
        }
      }
      return { budget: b, spent, limit };
    })
    .sort((a, b) =>
      (catName.get(a.budget.category_id) ?? "").localeCompare(
        catName.get(b.budget.category_id) ?? "",
      ),
    );

  const totalLimit = rows.reduce((s, r) => s + r.limit, 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  const totalPct =
    totalLimit > 0 ? (totalSpent / totalLimit) * 100 : totalSpent > 0 ? 100 : 0;
  const totalTone: ProgressTone =
    totalPct >= 100 ? "over" : totalPct >= 80 ? "warn" : "ok";

  const expenseCats: BudgetCategory[] = cats
    .filter((c) => c.kind === "expense" && !c.is_archived)
    .map((c) => ({ id: c.id, name: c.name, parent_id: c.parent_id }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Presupuestos</h1>
        <NewBudgetButton categories={expenseCats} month={monthFirst} />
      </div>

      <MonthNav month={monthFirst} />

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Sin presupuestos este mes. Crea el primero con «Nuevo».
        </div>
      ) : (
        <>
          <div className="space-y-2 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Total del mes</span>
              <span className="tabular-nums text-muted-foreground">
                {formatMoney(totalSpent, currency)} /{" "}
                {formatMoney(totalLimit, currency)}
              </span>
            </div>
            <ProgressBar value={totalPct} tone={totalTone} />
          </div>

          <div className="space-y-2">
            {rows.map((r) => (
              <BudgetItem
                key={r.budget.id}
                budget={r.budget}
                categoryName={catName.get(r.budget.category_id) ?? "—"}
                categories={expenseCats}
                month={monthFirst}
                spent={r.spent}
                limit={r.limit}
                currency={currency}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
