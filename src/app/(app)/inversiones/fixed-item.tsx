"use client";

import { useTransition, useState } from "react";
import { AlertTriangle, CheckCircle2, MoreVertical, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/lib/supabase/database.types";
import { formatMoney } from "@/lib/money";
import { compoundingLabels } from "@/lib/labels";
import { formatLongDate } from "@/lib/dates";
import type { FixedIncomeState } from "@/lib/fixed-income";
import { cn } from "@/lib/utils";
import { Amount } from "@/components/amount";
import { ProgressBar } from "@/components/progress-bar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InvestmentDialog } from "./investment-dialog";
import { deleteInvestment } from "./actions";

export function FixedItem({
  investment,
  state,
  ownerLabel,
  currency,
}: {
  investment: Tables<"investments">;
  state: FixedIncomeState;
  ownerLabel: string;
  currency: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const res = await deleteInvestment(investment.id);
      if (!res.ok) toast.error(res.error ?? "No se pudo eliminar");
      else toast.success("Inversión eliminada");
    });
  }

  const progress =
    state.daysTotal > 0 ? (state.daysElapsed / state.daysTotal) * 100 : 0;
  const rate = ((investment.annual_rate ?? 0) * 100).toFixed(2);

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        state.maturingSoon && "border-amber-500/60 bg-amber-500/5",
        state.matured && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{investment.name}</div>
          <div className="text-xs text-muted-foreground">
            {rate}% anual · {compoundingLabels[investment.compounding ?? "simple"]}{" "}
            · {ownerLabel}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div className="text-right">
            <div className="font-medium tabular-nums">
              <Amount mask="•••••">
                {formatMoney(state.currentValue, currency)}
              </Amount>
            </div>
            <div className="text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
              +
              <Amount mask="••••">
                {formatMoney(state.accruedInterest, currency)}
              </Amount>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={pending}
                aria-label="Acciones"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={remove}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-2 space-y-1">
        <ProgressBar
          value={progress}
          tone={state.maturingSoon ? "warn" : "ok"}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            Invertido{" "}
            <Amount mask="••••">
              {formatMoney(investment.principal ?? 0, currency)}
            </Amount>
          </span>
          <span>
            Al vencimiento{" "}
            <Amount mask="••••">
              {formatMoney(state.maturityValue, currency)}
            </Amount>
          </span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {state.matured ? (
          <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Venció el {formatLongDate(state.maturityDate)}
          </span>
        ) : state.maturingSoon ? (
          <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            Vence en {state.daysRemaining}{" "}
            {state.daysRemaining === 1 ? "día" : "días"} (
            {formatLongDate(state.maturityDate)})
          </span>
        ) : (
          <span className="text-muted-foreground">
            Vence el {formatLongDate(state.maturityDate)} · faltan{" "}
            {state.daysRemaining} días
          </span>
        )}

        {investment.reinvests_at_maturity ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <RefreshCw className="h-3 w-3" />
            Se reinvierte
            {state.termsCompleted > 0
              ? ` · ${state.termsCompleted} ${state.termsCompleted === 1 ? "renovación" : "renovaciones"}`
              : ""}
          </span>
        ) : null}
      </div>

      <InvestmentDialog
        investment={investment}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}
