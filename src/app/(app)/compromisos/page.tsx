import Link from "next/link";
import { AlertTriangle, CalendarRange } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getHousehold } from "@/lib/household";
import { formatMoney } from "@/lib/money";
import {
  averageMonthlyIncome,
  monthOf,
  projectCommitments,
  type CommitmentInstallment,
} from "@/lib/commitments";
import { Amount } from "@/components/amount";
import { PrivacyToggle } from "@/components/privacy";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CommitmentChart } from "./commitment-chart";
import { PlanItem } from "./plan-item";
import { ThresholdDialog } from "./threshold-dialog";
import { today } from "@/lib/dates";

export default async function CompromisosPage() {
  const supabase = await createClient();

  const [{ data: plans }, { data: incomes }, household] = await Promise.all([
    supabase
      .from("installment_plans")
      .select(
        "id, total_amount, months, monthly_amount, remaining_months, status, first_payment_date, transaction_id",
      )
      .neq("status", "cancelled")
      .order("first_payment_date", { ascending: true }),
    supabase
      .from("transactions")
      .select("amount, occurred_at")
      .eq("type", "income"),
    getHousehold(),
  ]);

  const planList = plans ?? [];
  const currency = household?.base_currency ?? "MXN";
  const alertPct = household?.msi_alert_pct ?? 0.2;

  // Calendario y descripción de la compra original de cada plan.
  const planIds = planList.map((p) => p.id);
  const txIds = planList.map((p) => p.transaction_id);
  const [{ data: payments }, { data: purchases }] = await Promise.all([
    planIds.length
      ? supabase
          .from("installment_payments")
          .select("id, plan_id, installment_no, due_date, amount, is_paid")
          .in("plan_id", planIds)
          .order("installment_no", { ascending: true })
      : Promise.resolve({ data: [] as never[] }),
    txIds.length
      ? supabase
          .from("transactions")
          .select("id, description, occurred_at, account_id")
          .in("id", txIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const paymentList = payments ?? [];
  const purchaseById = new Map((purchases ?? []).map((t) => [t.id, t]));

  const currentMonth = monthOf(today());
  const monthlyIncome = averageMonthlyIncome(incomes ?? [], currentMonth);
  const projection = projectCommitments(
    paymentList as CommitmentInstallment[],
    currentMonth,
    monthlyIncome,
    alertPct,
  );

  const totalPending = paymentList
    .filter((p) => !p.is_paid)
    .reduce((s, p) => s + p.amount, 0);
  const thisMonth = projection.find((m) => m.month === currentMonth);
  const peak = projection.reduce<(typeof projection)[number] | null>(
    (max, m) => (max === null || m.total > max.total ? m : max),
    null,
  );
  const alertMonths = projection.filter((m) => m.overThreshold);

  const activePlans = planList.filter((p) => p.status === "active");

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Compromisos mensuales</h1>
          <p className="text-sm text-muted-foreground">
            Lo que ya está comprometido a meses sin intereses.
          </p>
        </div>
        <PrivacyToggle />
      </div>

      {planList.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No tienes compras a meses sin intereses. Al capturar un gasto con
          tarjeta de crédito puedes activar «Meses sin intereses» en{" "}
          <Link
            href="/transacciones/nueva"
            className="underline underline-offset-4"
          >
            Nuevo movimiento
          </Link>
          .
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Deuda MSI pendiente</CardDescription>
                <CardTitle className="text-xl tabular-nums">
                  <Amount mask="•••••••">
                    {formatMoney(totalPending, currency)}
                  </Amount>
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Este mes</CardDescription>
                <CardTitle
                  className={
                    thisMonth?.overThreshold
                      ? "text-xl tabular-nums text-destructive"
                      : "text-xl tabular-nums"
                  }
                >
                  <Amount mask="••••••">
                    {formatMoney(thisMonth?.total ?? 0, currency)}
                  </Amount>
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          {alertMonths.length > 0 ? (
            <div className="flex gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="space-y-1">
                <p className="font-medium text-destructive">
                  {alertMonths.length === 1
                    ? "Un mes supera tu umbral"
                    : `${alertMonths.length} meses superan tu umbral`}
                </p>
                <p className="text-muted-foreground">
                  Tus mensualidades pasan del {(alertPct * 100).toFixed(0)}% del
                  ingreso mensual promedio (
                  <Amount mask="•••••">
                    {formatMoney(monthlyIncome, currency)}
                  </Amount>
                  ). El pico es{" "}
                  <Amount mask="•••••">
                    {formatMoney(peak?.total ?? 0, currency)}
                  </Amount>
                  .
                </p>
              </div>
            </div>
          ) : null}

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <CalendarRange className="h-3.5 w-3.5" />
                Proyección
              </CardDescription>
              <CardAction>
                <ThresholdDialog currentPct={alertPct} />
              </CardAction>
            </CardHeader>
            <CardContent>
              <CommitmentChart
                months={projection}
                currency={currency}
                monthlyIncome={monthlyIncome}
                alertPct={alertPct}
              />
            </CardContent>
          </Card>

          <section className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              Planes activos ({activePlans.length})
            </h2>
            {planList.map((plan) => (
              <PlanItem
                key={plan.id}
                plan={plan}
                purchase={purchaseById.get(plan.transaction_id) ?? null}
                payments={paymentList.filter((p) => p.plan_id === plan.id)}
                currency={currency}
              />
            ))}
          </section>
        </>
      )}
    </div>
  );
}
