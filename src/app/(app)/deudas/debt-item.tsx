"use client";

import { useState, useTransition } from "react";
import {
  Calculator,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/lib/supabase/database.types";
import { formatMoney } from "@/lib/money";
import { debtTypeLabels } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DebtDialog } from "./debt-dialog";
import { DebtSimulatorDialog } from "./debt-simulator-dialog";
import { deleteDebt } from "./actions";

export function DebtItem({
  debt,
  ownerLabel,
  currency,
}: {
  debt: Tables<"debts">;
  ownerLabel: string;
  currency: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const res = await deleteDebt(debt.id);
      if (!res.ok) toast.error(res.error ?? "No se pudo eliminar");
      else toast.success("Deuda eliminada");
    });
  }

  const meta = [
    debtTypeLabels[debt.type],
    ownerLabel,
    `${(debt.interest_rate * 100).toFixed(2)}%`,
    debt.due_day ? `paga día ${debt.due_day}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex items-start justify-between gap-2 rounded-lg border p-3">
      <div className="min-w-0">
        <div className="truncate font-medium">{debt.name}</div>
        <div className="truncate text-xs text-muted-foreground">{meta}</div>
        {debt.minimum_payment > 0 ? (
          <div className="text-xs text-muted-foreground">
            Pago mínimo {formatMoney(debt.minimum_payment, currency)}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <span className="font-medium tabular-nums text-destructive">
          {formatMoney(debt.current_balance, currency)}
        </span>
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
            <DropdownMenuItem onClick={() => setSimOpen(true)}>
              <Calculator className="h-4 w-4" />
              Simular
            </DropdownMenuItem>
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

      <DebtDialog debt={debt} open={editOpen} onOpenChange={setEditOpen} />
      <DebtSimulatorDialog
        name={debt.name}
        balance={debt.current_balance}
        annualRate={debt.interest_rate}
        minimumPayment={debt.minimum_payment}
        currency={currency}
        open={simOpen}
        onOpenChange={setSimOpen}
      />
    </div>
  );
}
