import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CreditCard,
  Users,
  UserPlus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getHousehold, getHouseholdMembers } from "@/lib/household";
import { formatMoney } from "@/lib/money";
import { ProgressBar, type ProgressTone } from "@/components/progress-bar";
import { computeBalance, type Member } from "./compartidos/balance";
import { childrenMap, rollupSpent, type SpentMap } from "./presupuestos/compute";
import {
  computeCreditCardCycle,
  type CyclePlan,
  type CycleMovement,
} from "@/lib/credit-cycle";
import { CreditCycleSummary } from "@/components/credit-cycle-summary";
import { computeFixedIncome } from "@/lib/fixed-income";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Amount } from "@/components/amount";
import { PrivacyToggle } from "@/components/privacy";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function HomePage() {
  const supabase = await createClient();

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  // El periodo en curso de una tarjeta nunca pasa de 31 días; con 100 sobra
  // para reconstruirlo sin traerse el histórico completo.
  const cycleWindow = new Date(now);
  cycleWindow.setDate(cycleWindow.getDate() - 100);
  const cycleStart = `${cycleWindow.getFullYear()}-${String(cycleWindow.getMonth() + 1).padStart(2, "0")}-${String(cycleWindow.getDate()).padStart(2, "0")}`;

  const [
    { data: accounts },
    { data: cardMovements },
    { data: msiPlans },
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
    supabase
      .from("accounts")
      .select(
        "id, name, type, account_class, current_balance, statement_day, payment_day, credit_limit, minimum_payment",
      )
      .eq("is_archived", false),
    supabase
      .from("transactions")
      .select("id, account_id, type, amount, occurred_at")
      .gte("occurred_at", cycleStart),
    supabase
      .from("installment_plans")
      .select(
        "id, transaction_id, total_amount, purchase:transactions!inner(account_id, occurred_at), installments:installment_payments(statement_period, amount, is_paid)",
      )
      .neq("status", "cancelled"),
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
    supabase
      .from("investments")
      .select(
        "id, name, investment_type, quantity, purchase_price, purchase_date, principal, annual_rate, start_date, maturity_date, compounding, reinvests_at_maturity",
      ),
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
  //
  // La parte de cuentas es una suma simple, sin condicionales por tipo: los
  // pasivos ya vienen en negativo por la regla de signo (migración 0018), así
  // que las tarjetas restan solas.
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
  // Portafolio = renta variable valuada a último precio + renta fija devengada.
  const variableValue = (investments ?? [])
    .filter((inv) => inv.investment_type === "variable")
    .reduce((sum, inv) => {
      const quantity = inv.quantity ?? 0;
      const price = latestPrice.get(inv.id) ?? inv.purchase_price ?? 0;
      return sum + Math.round(quantity * price);
    }, 0);

  const fixedHoldings = (investments ?? [])
    .filter((inv) => inv.investment_type === "fixed")
    .map((inv) => ({
      inv,
      state: computeFixedIncome({
        principal: inv.principal ?? 0,
        annual_rate: inv.annual_rate ?? 0,
        start_date: inv.start_date ?? inv.purchase_date,
        maturity_date: inv.maturity_date ?? inv.purchase_date,
        compounding: inv.compounding ?? "simple",
        reinvests_at_maturity: inv.reinvests_at_maturity ?? false,
      }),
    }));
  const fixedValue = fixedHoldings.reduce((s, f) => s + f.state.currentValue, 0);
  const investmentsValue = variableValue + fixedValue;
  const netWorth = accountsTotal + investmentsValue - debtsTotal;

  // Vencimientos de renta fija a menos de 7 días.
  const maturingSoon = fixedHoldings
    .filter((f) => f.state.maturingSoon)
    .sort((a, b) => a.state.daysRemaining - b.state.daysRemaining);

  // Ciclo de las tarjetas de crédito, corregido por las compras a MSI.
  const cardMovementList = (cardMovements ?? []) as CycleMovement[];
  // Los tipos escritos a mano no modelan los embeds de PostgREST.
  const msiPlanList = (msiPlans ?? []) as unknown as Array<{
    id: string;
    transaction_id: string;
    total_amount: number;
    purchase: { account_id: string; occurred_at: string };
    installments: {
      statement_period: string;
      amount: number;
      is_paid: boolean;
    }[];
  }>;
  const plansByCard = new Map<string, CyclePlan[]>();
  for (const p of msiPlanList) {
    const list = plansByCard.get(p.purchase.account_id) ?? [];
    list.push({
      transaction_id: p.transaction_id,
      occurred_at: p.purchase.occurred_at,
      total_amount: p.total_amount,
      installments: p.installments ?? [],
    });
    plansByCard.set(p.purchase.account_id, list);
  }

  const cards = (accounts ?? [])
    .filter((a) => a.type === "credit_card")
    .map((a) => ({
      account: a,
      cycle: computeCreditCardCycle(
        a,
        // Un traspaso tiene una fila por cuenta, así que cada tarjeta sólo
        // mira los asientos cuyo account_id es el suyo.
        cardMovementList.filter((m) => m.account_id === a.id),
        plansByCard.get(a.id) ?? [],
      ),
    }))
    .filter((c) => c.cycle.configured || c.cycle.currentDebt > 0)
    .sort((a, b) => {
      // Primero lo vencido, luego lo que vence antes.
      if (a.cycle.overdue !== b.cycle.overdue) return a.cycle.overdue ? -1 : 1;
      return (a.cycle.daysToDue ?? 999) - (b.cycle.daysToDue ?? 999);
    });
  const cardsStatementDebt = cards.reduce(
    (s, c) => s + c.cycle.statementDebt,
    0,
  );
  // Deuda de tarjeta separada en sus dos naturalezas: la revolvente (facturada
  // y periodo en curso) y lo diferido a MSI que el banco aún no cobra. Suman
  // exactamente el cargo total de las tarjetas.
  const revolvingDebt = cards.reduce((s, c) => s + c.cycle.currentDebt, 0);
  const msiUnbilledDebt = cards.reduce((s, c) => s + c.cycle.msiUnbilled, 0);
  // Todas las mensualidades que faltan por pagar, marcadas o no.
  const msiPendingTotal = msiPlanList.reduce(
    (s, p) =>
      s +
      (p.installments ?? [])
        .filter((i) => !i.is_paid)
        .reduce((a, i) => a + i.amount, 0),
    0,
  );

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

  // Ingresos y gastos del mes. Los traspasos (type = 'transfer') quedan
  // fuera por construcción: mover dinero entre cuentas propias no es ni
  // ingreso ni gasto. `amount` viene con signo, así que el gasto se muestra
  // en magnitud.
  const income = (monthTx ?? [])
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const expense = (monthTx ?? [])
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const flow = income - expense;

  // Presupuesto consumido del mes (con roll-up de subcategorías).
  const budgetList = budgets ?? [];
  const spentMap: SpentMap = {};
  for (const t of monthTx ?? []) {
    if (t.type === "expense" && t.category_id) {
      spentMap[t.category_id] =
        (spentMap[t.category_id] ?? 0) + Math.abs(t.amount);
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
            <Amount mask="••••••••">{formatMoney(netWorth, currency)}</Amount>
          </CardTitle>
          <CardAction>
            <PrivacyToggle className="-mr-2 -mt-1" />
          </CardAction>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          Cuentas <Amount mask="•••••">{formatMoney(accountsTotal, currency)}</Amount>{" "}
          + inversiones{" "}
          <Amount mask="•••••">{formatMoney(investmentsValue, currency)}</Amount>{" "}
          − deudas{" "}
          <Amount mask="•••••">{formatMoney(debtsTotal, currency)}</Amount>.
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
            <Amount mask="•••••••">
              {flow >= 0 ? "+" : "-"}
              {formatMoney(Math.abs(flow), currency)}
            </Amount>
          </CardTitle>
        </CardHeader>
      </Card>

      {maturingSoon.length > 0 ? (
        <Link href="/inversiones" className="block">
          <div className="flex gap-3 rounded-lg border border-amber-500/60 bg-amber-500/5 p-3 text-sm transition-colors hover:bg-amber-500/10">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="space-y-0.5">
              <p className="font-medium text-amber-700 dark:text-amber-400">
                {maturingSoon.length === 1
                  ? "Una inversión vence pronto"
                  : `${maturingSoon.length} inversiones vencen pronto`}
              </p>
              {maturingSoon.map(({ inv, state }) => (
                <p key={inv.id} className="text-muted-foreground">
                  {inv.name} —{" "}
                  {state.daysRemaining === 0
                    ? "vence hoy"
                    : `en ${state.daysRemaining} ${state.daysRemaining === 1 ? "día" : "días"}`}
                  {inv.reinvests_at_maturity ? ", se reinvierte" : ""}
                </p>
              ))}
            </div>
          </div>
        </Link>
      ) : null}

      {cards.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5" />
              Tarjetas de crédito
            </CardDescription>
            {cardsStatementDebt > 0 ? (
              <CardTitle className="text-lg tabular-nums">
                <Amount mask="•••••••">
                  {formatMoney(cardsStatementDebt, currency)}
                </Amount>{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  por pagar de los últimos cortes
                </span>
              </CardTitle>
            ) : (
              <CardTitle className="text-lg text-emerald-600 dark:text-emerald-400">
                Sin saldo por pagar ✓
              </CardTitle>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {msiUnbilledDebt > 0 || msiPendingTotal > 0 ? (
              <Link
                href="/compromisos"
                className="-mx-1 flex items-center justify-between gap-2 rounded-md px-1 py-1 transition-colors hover:bg-muted/40"
              >
                <div className="grid flex-1 grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Revolvente
                    </div>
                    <div className="font-medium tabular-nums">
                      <Amount mask="•••••">
                        {formatMoney(revolvingDebt, currency)}
                      </Amount>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      MSI pendiente
                    </div>
                    <div className="font-medium tabular-nums">
                      <Amount mask="•••••">
                        {formatMoney(msiPendingTotal, currency)}
                      </Amount>
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ) : null}

            {cards.map(({ account, cycle }) => (
              <div key={account.id} className="space-y-2">
                <div className="text-sm font-medium">{account.name}</div>
                <CreditCycleSummary cycle={cycle} currency={currency} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

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
                <Amount>{formatMoney(budgetSpent, currency)}</Amount>{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  de <Amount>{formatMoney(budgetLimit, currency)}</Amount>
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
                  <Amount className="tabular-nums">
                    {formatMoney(balance.amount, currency)}
                  </Amount>
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
          <Amount>{value}</Amount>
        </CardTitle>
      </CardHeader>
    </Card>
  );
}
