import { AlertTriangle, CalendarClock, Scissors } from "lucide-react";
import { formatMoney } from "@/lib/money";
import {
  formatCycleDate,
  formatDayCount,
  type CreditCardCycle,
} from "@/lib/credit-cycle";
import { Amount } from "@/components/amount";
import { ProgressBar, type ProgressTone } from "@/components/progress-bar";
import { cn } from "@/lib/utils";

/** Umbrales de uso del límite: por encima se avisa. */
function limitTone(pct: number): ProgressTone {
  if (pct >= 80) return "over";
  if (pct >= 50) return "warn";
  return "ok";
}

/**
 * Resumen del ciclo de una tarjeta: qué se debe pagar del último corte, qué
 * llevas gastado en el periodo en curso, cuándo cortan y cuándo vence.
 */
export function CreditCycleSummary({
  cycle,
  currency,
  className,
}: {
  cycle: CreditCardCycle;
  currency: string;
  className?: string;
}) {
  if (!cycle.configured) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        Configura el día de corte y el de pago para ver el ciclo.
      </p>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Del último corte</div>
          <div
            className={cn(
              "font-medium tabular-nums",
              cycle.overdue && "text-destructive",
            )}
          >
            <Amount mask="•••••">
              {formatMoney(cycle.statementDebt, currency)}
            </Amount>
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Saldo actual</div>
          <div className="font-medium tabular-nums">
            <Amount mask="•••••">
              {formatMoney(cycle.currentDebt, currency)}
            </Amount>
          </div>
        </div>
      </div>

      {cycle.currentPeriodSpend > 0 ? (
        <p className="text-xs text-muted-foreground">
          Incluye{" "}
          <Amount mask="••••">
            {formatMoney(cycle.currentPeriodSpend, currency)}
          </Amount>{" "}
          del periodo en curso, aún sin facturar.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Scissors className="h-3.5 w-3.5" />
          Corte {formatCycleDate(cycle.nextClose!)} (
          {formatDayCount(cycle.daysToNextClose!)})
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1",
            cycle.overdue && "font-medium text-destructive",
          )}
        >
          {cycle.overdue ? (
            <AlertTriangle className="h-3.5 w-3.5" />
          ) : (
            <CalendarClock className="h-3.5 w-3.5" />
          )}
          {cycle.overdue ? "Venció" : "Pago"} {formatCycleDate(cycle.dueDate!)} (
          {formatDayCount(cycle.daysToDue!)})
        </span>
      </div>

      {cycle.limitUsedPct != null ? (
        <div className="space-y-1">
          <ProgressBar
            value={cycle.limitUsedPct}
            tone={limitTone(cycle.limitUsedPct)}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{cycle.limitUsedPct.toFixed(0)}% del límite</span>
            <span>
              <Amount mask="••••">
                {formatMoney(cycle.availableCredit ?? 0, currency)}
              </Amount>{" "}
              disponible
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
