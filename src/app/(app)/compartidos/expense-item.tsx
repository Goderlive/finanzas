"use client";

import { useTransition } from "react";
import { MoreVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteSharedExpense } from "./actions";

const splitLabels: Record<string, string> = {
  equal: "50/50",
  percentage: "Porcentaje",
  fixed: "Monto fijo",
};

export function ExpenseItem({
  id,
  description,
  amount,
  paidBy,
  splitType,
  splits,
  memberName,
  currency,
}: {
  id: string;
  description: string;
  amount: number;
  paidBy: string;
  splitType: string;
  splits: { profile_id: string; owed_amount: number }[];
  memberName: Record<string, string>;
  currency: string;
}) {
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const res = await deleteSharedExpense(id);
      if (!res.ok) toast.error(res.error ?? "No se pudo eliminar");
      else toast.success("Gasto eliminado");
    });
  }

  const splitText = splits
    .map((s) => `${memberName[s.profile_id] ?? "?"} ${formatMoney(s.owed_amount, currency)}`)
    .join(" · ");

  return (
    <div className="flex items-start justify-between gap-2 rounded-lg border p-3">
      <div className="min-w-0 space-y-0.5">
        <div className="truncate font-medium">{description}</div>
        <div className="text-xs text-muted-foreground">
          Pagó {memberName[paidBy] ?? "?"} · {splitLabels[splitType] ?? splitType}
        </div>
        <div className="text-xs text-muted-foreground">{splitText}</div>
      </div>
      <div className="flex items-center gap-1">
        <span className="font-medium tabular-nums">
          {formatMoney(amount, currency)}
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
  );
}
