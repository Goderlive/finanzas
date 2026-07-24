import { createClient } from "@/lib/supabase/server";
import { getHousehold, getHouseholdMembers } from "@/lib/household";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { addMonths, firstOfMonth } from "../presupuestos/month";
import { childrenMap, rollupSpent, type SpentMap } from "../presupuestos/compute";
import {
  CategoryBreakdown,
  MemberComparison,
  MonthlyTrend,
} from "./charts";

function shortMonth(monthFirst: string): string {
  const [y, mo] = monthFirst.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("es-MX", { month: "short" });
}

export default async function ReportesPage() {
  const currentFirst = firstOfMonth(new Date());
  const windowStart = addMonths(currentFirst, -5);
  const nextFirst = addMonths(currentFirst, 1);

  const supabase = await createClient();
  const [{ data: txns }, { data: categories }, household, members] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("type, amount, category_id, created_by, occurred_at")
        .gte("occurred_at", windowStart)
        .lt("occurred_at", nextFirst),
      supabase.from("categories").select("id, name, color, parent_id"),
      getHousehold(),
      getHouseholdMembers(),
    ]);

  const currency = household?.base_currency ?? "MXN";
  const cats = categories ?? [];
  const catById = new Map(cats.map((c) => [c.id, c]));
  const children = childrenMap(cats);
  const all = txns ?? [];
  const currentExpenses = all.filter(
    (t) => t.type === "expense" && t.occurred_at >= currentFirst,
  );

  // --- Gasto por categoría (mes actual, roll-up a categorías padre) ---
  const spent: SpentMap = {};
  let uncategorized = 0;
  for (const t of currentExpenses) {
    if (t.category_id) spent[t.category_id] = (spent[t.category_id] ?? 0) + t.amount;
    else uncategorized += t.amount;
  }
  const totalExpenses =
    currentExpenses.reduce((s, t) => s + t.amount, 0) || 0;

  const breakdown = cats
    .filter((c) => !c.parent_id)
    .map((c) => ({
      name: c.name,
      color: c.color ?? "#a3a3a3",
      amount: rollupSpent(c.id, spent, children),
    }))
    .filter((x) => x.amount > 0);
  if (uncategorized > 0) {
    breakdown.push({
      name: "Sin categoría",
      color: "#a3a3a3",
      amount: uncategorized,
    });
  }
  breakdown.sort((a, b) => b.amount - a.amount);
  const breakdownItems = breakdown.map((b) => ({
    ...b,
    pct: totalExpenses > 0 ? (b.amount / totalExpenses) * 100 : 0,
  }));

  // --- Tendencia mensual (últimos 6 meses) ---
  const monthsList: { label: string; income: number; expense: number }[] = [];
  for (let i = -5; i <= 0; i++) {
    const mStart = addMonths(currentFirst, i);
    const mEnd = addMonths(currentFirst, i + 1);
    let income = 0;
    let expense = 0;
    for (const t of all) {
      if (t.occurred_at >= mStart && t.occurred_at < mEnd) {
        if (t.type === "income") income += t.amount;
        else if (t.type === "expense") expense += t.amount;
      }
    }
    monthsList.push({ label: shortMonth(mStart), income, expense });
  }

  // --- Comparativa entre los dos (gasto del mes por persona) ---
  const byMember = new Map<string, number>();
  for (const t of currentExpenses) {
    byMember.set(t.created_by, (byMember.get(t.created_by) ?? 0) + t.amount);
  }
  const memberComparison = members.map((m) => ({
    name: m.display_name,
    amount: byMember.get(m.id) ?? 0,
  }));

  void catById; // (reservado para detalle futuro)

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Reportes</h1>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Gasto por categoría</CardTitle>
          <CardDescription>Este mes</CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryBreakdown items={breakdownItems} currency={currency} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Tendencia mensual</CardTitle>
          <CardDescription>Últimos 6 meses</CardDescription>
        </CardHeader>
        <CardContent>
          <MonthlyTrend months={monthsList} currency={currency} />
        </CardContent>
      </Card>

      {members.length >= 2 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Comparativa entre ustedes</CardTitle>
            <CardDescription>Gasto registrado este mes</CardDescription>
          </CardHeader>
          <CardContent>
            <MemberComparison members={memberComparison} currency={currency} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
