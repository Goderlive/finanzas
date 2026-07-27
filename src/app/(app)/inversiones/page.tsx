import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { getHousehold, getHouseholdMembers } from "@/lib/household";
import { formatMoney } from "@/lib/money";
import { computeFixedIncome, type FixedIncomeState } from "@/lib/fixed-income";
import {
  buildEvolution,
  computeHoldingReturn,
  summarizePortfolio,
  annualizedReturn,
  type HoldingReturn,
  type Lot,
} from "@/lib/portfolio";
import { formatLongDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Amount } from "@/components/amount";
import { PrivacyToggle } from "@/components/privacy";
import { NewInvestmentButton } from "./new-investment-button";
import { InvestmentItem } from "./investment-item";
import { FixedItem } from "./fixed-item";

export default async function InversionesPage() {
  const supabase = await createClient();
  const [
    { data: investments },
    { data: snapshots },
    { data: allLots },
    session,
    household,
    members,
  ] = await Promise.all([
      supabase
        .from("investments")
        .select("*")
        .order("created_at", { ascending: true }),
      supabase
        .from("price_snapshots")
        .select("investment_id, price, as_of")
        .order("as_of", { ascending: false }),
      supabase
        .from("investment_lots")
        .select("id, investment_id, type, quantity, price, occurred_at, note")
        .order("occurred_at", { ascending: true }),
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

  const todayIso = new Date().toLocaleDateString("en-CA");
  const all = investments ?? [];
  const variable = all.filter((i) => i.investment_type === "variable");
  const fixed = all.filter((i) => i.investment_type === "fixed");

  // Renta variable: costo promedio ponderado y rendimiento desde los lotes.
  const lotsByInvestment = new Map<string, (Lot & { id: string; note: string | null })[]>();
  for (const l of allLots ?? []) {
    const list = lotsByInvestment.get(l.investment_id) ?? [];
    list.push(l);
    lotsByInvestment.set(l.investment_id, list);
  }
  const snapshotsByInvestment = new Map<string, { as_of: string; price: number }[]>();
  for (const s of snapshots ?? []) {
    const list = snapshotsByInvestment.get(s.investment_id) ?? [];
    list.push(s);
    snapshotsByInvestment.set(s.investment_id, list);
  }

  const returns = new Map<string, HoldingReturn>();
  const evolutions = new Map<string, ReturnType<typeof buildEvolution>>();
  let variableValue = 0;
  for (const inv of variable) {
    const lots = lotsByInvestment.get(inv.id) ?? [];
    const ret = computeHoldingReturn(lots, latestPrice.get(inv.id) ?? null);
    returns.set(inv.id, ret);
    evolutions.set(
      inv.id,
      buildEvolution(lots, snapshotsByInvestment.get(inv.id) ?? []),
    );
    variableValue += ret.currentValue;
  }

  // Renta fija: interés devengado a hoy.
  const fixedStates = new Map<string, FixedIncomeState>();
  let fixedValue = 0;
  for (const inv of fixed) {
    const state = computeFixedIncome({
      principal: inv.principal ?? 0,
      annual_rate: inv.annual_rate ?? 0,
      start_date: inv.start_date ?? inv.purchase_date,
      maturity_date: inv.maturity_date ?? inv.purchase_date,
      compounding: inv.compounding ?? "simple",
      reinvests_at_maturity: inv.reinvests_at_maturity ?? false,
    });
    fixedStates.set(inv.id, state);
    fixedValue += state.currentValue;
  }

  // Portafolio completo: fijas + variables, con rendimiento ponderado.
  const portfolio = summarizePortfolio([
    ...variable.map((inv) => {
      const ret = returns.get(inv.id)!;
      return {
        cost: ret.costBasis,
        value: ret.currentValue,
        annualizedReturn: ret.annualizedReturn,
      };
    }),
    ...fixed.map((inv) => {
      const state = fixedStates.get(inv.id)!;
      const principal = inv.principal ?? 0;
      return {
        cost: principal,
        value: state.currentValue,
        // Un instrumento de renta fija se anualiza con sus propios flujos:
        // el principal a la salida y el valor devengado a hoy.
        annualizedReturn: annualizedReturn([
          { amount: -principal, date: inv.start_date ?? inv.purchase_date },
          { amount: state.currentValue, date: todayIso },
        ]),
      };
    }),
  ]);
  const totalValue = portfolio.totalValue;
  const totalGain = portfolio.totalGain;
  const totalGainPct = portfolio.totalGainPct ?? 0;

  // Vencimientos inminentes, para avisar arriba del todo.
  const maturingSoon = fixed
    .map((inv) => ({ inv, state: fixedStates.get(inv.id)! }))
    .filter(({ state }) => state.maturingSoon)
    .sort((a, b) => a.state.daysRemaining - b.state.daysRemaining);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Inversiones</h1>
          <p className="text-sm text-muted-foreground">
            Valor:{" "}
            <Amount mask="•••••••">{formatMoney(totalValue, currency)}</Amount>
            {all.length > 0 ? (
              <span
                className={cn(
                  "ml-1",
                  totalGain >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-destructive",
                )}
              >
                ({totalGain >= 0 ? "+" : "-"}
                <Amount mask="•••••">
                  {formatMoney(Math.abs(totalGain), currency)}
                </Amount>{" "}
                · {totalGainPct >= 0 ? "+" : ""}
                {totalGainPct.toFixed(1)}%)
              </span>
            ) : null}
          </p>
          {portfolio.weightedAnnualReturn !== null ? (
            <p className="text-xs text-muted-foreground">
              Rendimiento anualizado del conjunto:{" "}
              <span
                className={cn(
                  "font-medium",
                  portfolio.weightedAnnualReturn >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-destructive",
                )}
              >
                {portfolio.weightedAnnualReturn >= 0 ? "+" : ""}
                {(portfolio.weightedAnnualReturn * 100).toFixed(1)}%
              </span>{" "}
              · ponderado por el valor de cada posición
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <PrivacyToggle />
          <NewInvestmentButton />
        </div>
      </div>

      {maturingSoon.length > 0 ? (
        <div className="flex gap-3 rounded-lg border border-amber-500/60 bg-amber-500/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-1">
            <p className="font-medium text-amber-700 dark:text-amber-400">
              {maturingSoon.length === 1
                ? "Una inversión vence pronto"
                : `${maturingSoon.length} inversiones vencen pronto`}
            </p>
            <ul className="space-y-0.5 text-muted-foreground">
              {maturingSoon.map(({ inv, state }) => (
                <li key={inv.id}>
                  {inv.name} — {formatLongDate(state.maturityDate)} (
                  {state.daysRemaining === 0
                    ? "hoy"
                    : `${state.daysRemaining} ${state.daysRemaining === 1 ? "día" : "días"}`}
                  )
                  {inv.reinvests_at_maturity ? ", se reinvierte" : ""}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {all.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Sin inversiones. Agrega la primera con «Nueva».
        </div>
      ) : null}

      {fixed.length > 0 ? (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              Renta fija
            </h2>
            <span className="text-xs tabular-nums text-muted-foreground">
              <Amount mask="•••••">{formatMoney(fixedValue, currency)}</Amount>
            </span>
          </div>
          {fixed.map((inv) => (
            <FixedItem
              key={inv.id}
              investment={inv}
              state={fixedStates.get(inv.id)!}
              ownerLabel={ownerLabel(inv.owner_id)}
              currency={currency}
            />
          ))}
        </section>
      ) : null}

      {variable.length > 0 ? (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              Renta variable
            </h2>
            <span className="text-xs tabular-nums text-muted-foreground">
              <Amount mask="•••••">
                {formatMoney(variableValue, currency)}
              </Amount>
            </span>
          </div>
          {variable.map((inv) => (
            <InvestmentItem
              key={inv.id}
              investment={inv}
              latestPrice={latestPrice.get(inv.id) ?? null}
              ownerLabel={ownerLabel(inv.owner_id)}
              defaultDate={todayIso}
              currency={currency}
              ret={returns.get(inv.id)!}
              lots={lotsByInvestment.get(inv.id) ?? []}
              evolution={evolutions.get(inv.id) ?? []}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
