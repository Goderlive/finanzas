"use client";

import { useMemo, useState } from "react";
import { formatMoney, parseAmountToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { simulatePayoff } from "./simulate";
import { todayDate } from "@/lib/dates";

function safeCents(v: string): number {
  try {
    return Math.max(0, parseAmountToCents(v || "0"));
  } catch {
    return 0;
  }
}

function monthsLabel(months: number): string {
  if (!Number.isFinite(months)) return "Nunca";
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} mes${m === 1 ? "" : "es"}`;
  if (m === 0) return `${y} año${y === 1 ? "" : "s"}`;
  return `${y} a ${m} m`;
}

function payoffDate(months: number): string {
  if (!Number.isFinite(months)) return "—";
  const d = todayDate();
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString("es-MX", { month: "short", year: "numeric" });
}

export function DebtSimulatorDialog({
  name,
  balance,
  annualRate,
  minimumPayment,
  currency,
  open,
  onOpenChange,
}: {
  name: string;
  balance: number;
  annualRate: number;
  minimumPayment: number;
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [monthly, setMonthly] = useState(
    minimumPayment > 0 ? (minimumPayment / 100).toFixed(2) : "",
  );
  const [extra, setExtra] = useState("");

  const base = useMemo(
    () => simulatePayoff(balance, annualRate, safeCents(monthly)),
    [balance, annualRate, monthly],
  );
  const boosted = useMemo(
    () =>
      simulatePayoff(
        balance,
        annualRate,
        safeCents(monthly) + safeCents(extra),
      ),
    [balance, annualRate, monthly, extra],
  );

  const interestSaved =
    base.paysOff && boosted.paysOff
      ? base.totalInterest - boosted.totalInterest
      : null;
  const monthsSaved =
    base.paysOff && boosted.paysOff ? base.months - boosted.months : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Simulador · {name}</DialogTitle>
          <DialogDescription>
            Saldo {formatMoney(balance, currency)} · tasa{" "}
            {(annualRate * 100).toFixed(2)}% anual
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="monthly">Pago mensual</Label>
              <Input
                id="monthly"
                inputMode="decimal"
                value={monthly}
                onChange={(e) => setMonthly(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="extra">Pago extra al mes</Label>
              <Input
                id="extra"
                inputMode="decimal"
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ScenarioCard
              title="Solo pago mensual"
              result={base}
              currency={currency}
            />
            <ScenarioCard
              title="Con pago extra"
              result={boosted}
              currency={currency}
              highlight
            />
          </div>

          {interestSaved !== null && monthsSaved !== null && monthsSaved > 0 ? (
            <div className="rounded-lg border bg-emerald-50 p-3 text-sm dark:bg-emerald-950/30">
              Ahorrarías{" "}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {formatMoney(interestSaved, currency)}
              </span>{" "}
              en intereses y liquidarías{" "}
              <span className="font-semibold">
                {monthsLabel(monthsSaved)}
              </span>{" "}
              antes.
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ingresa un pago que cubra al menos el interés mensual para ver el
              ahorro.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScenarioCard({
  title,
  result,
  currency,
  highlight,
}: {
  title: string;
  result: { paysOff: boolean; months: number; totalInterest: number };
  currency: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "space-y-1 rounded-lg border p-3",
        highlight && "border-primary",
      )}
    >
      <div className="text-xs text-muted-foreground">{title}</div>
      {result.paysOff ? (
        <>
          <div className="text-lg font-semibold">
            {monthsLabel(result.months)}
          </div>
          <div className="text-xs text-muted-foreground">
            Liquida en {payoffDate(result.months)}
          </div>
          <div className="text-xs text-muted-foreground">
            Interés: {formatMoney(result.totalInterest, currency)}
          </div>
        </>
      ) : (
        <div className="text-sm font-medium text-destructive">
          No se salda con ese pago
        </div>
      )}
    </div>
  );
}
