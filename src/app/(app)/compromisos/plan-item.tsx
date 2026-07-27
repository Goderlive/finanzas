"use client";

import { useState, useTransition } from "react";
import { Check, MoreVertical, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/lib/supabase/database.types";
import { formatMoney } from "@/lib/money";
import { formatCycleDate } from "@/lib/credit-cycle";
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
import { cancelInstallmentPlan, setInstallmentPaid } from "./actions";

type Plan = Pick<
  Tables<"installment_plans">,
  | "id"
  | "total_amount"
  | "months"
  | "monthly_amount"
  | "remaining_months"
  | "status"
  | "first_payment_date"
  | "transaction_id"
>;

type Payment = Pick<
  Tables<"installment_payments">,
  "id" | "installment_no" | "due_date" | "amount" | "is_paid"
>;

export function PlanItem({
  plan,
  purchase,
  payments,
  currency,
}: {
  plan: Plan;
  purchase: { description: string | null; occurred_at: string } | null;
  payments: Payment[];
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const paidCount = plan.months - plan.remaining_months;
  const paidAmount = payments
    .filter((p) => p.is_paid)
    .reduce((s, p) => s + p.amount, 0);
  const pendingAmount = plan.total_amount - paidAmount;
  const progress = (paidCount / plan.months) * 100;
  const done = plan.status === "completed";

  function togglePaid(payment: Payment) {
    startTransition(async () => {
      const res = await setInstallmentPaid(
        payment.id,
        !payment.is_paid,
        payment.due_date,
      );
      if (!res.ok) toast.error(res.error ?? "No se pudo actualizar");
    });
  }

  function cancel() {
    startTransition(async () => {
      const res = await cancelInstallmentPlan(plan.id);
      if (!res.ok) toast.error(res.error ?? "No se pudo cancelar");
      else toast.success("Plan cancelado. La compra sigue registrada.");
    });
  }

  return (
    <div className={cn("rounded-lg border p-3", done && "opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="truncate font-medium">
            {purchase?.description || "Compra a meses"}
          </div>
          <div className="text-xs text-muted-foreground">
            {paidCount} de {plan.months} mensualidades ·{" "}
            <Amount mask="••••">
              {formatMoney(plan.monthly_amount, currency)}
            </Amount>{" "}
            al mes
          </div>
        </button>
        <div className="flex items-center gap-1">
          <div className="text-right">
            <div className="text-sm font-medium tabular-nums">
              <Amount mask="•••••">
                {formatMoney(pendingAmount, currency)}
              </Amount>
            </div>
            <div className="text-xs text-muted-foreground">pendiente</div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={pending}
                aria-label="Acciones del plan"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={cancel}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Cancelar plan
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-2">
        <ProgressBar value={progress} tone={done ? "ok" : "warn"} />
      </div>

      {open ? (
        <ul className="mt-3 space-y-1 border-t pt-2">
          {payments.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span
                className={cn(
                  "flex items-center gap-2",
                  p.is_paid && "text-muted-foreground line-through",
                )}
              >
                <span className="w-6 text-xs tabular-nums text-muted-foreground">
                  {p.installment_no}
                </span>
                {formatCycleDate(p.due_date)}
              </span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums">
                  <Amount mask="••••">{formatMoney(p.amount, currency)}</Amount>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={pending}
                  onClick={() => togglePaid(p)}
                  aria-label={
                    p.is_paid
                      ? `Desmarcar mensualidad ${p.installment_no}`
                      : `Marcar mensualidad ${p.installment_no} como pagada`
                  }
                >
                  {p.is_paid ? (
                    <Undo2 className="h-3.5 w-3.5" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
