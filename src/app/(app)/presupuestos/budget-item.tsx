"use client";

import { useState, useTransition } from "react";
import {
  MoreVertical,
  Pencil,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/lib/supabase/database.types";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProgressBar, type ProgressTone } from "@/components/progress-bar";
import { BudgetDialog, type BudgetCategory } from "./budget-dialog";
import { deleteBudget } from "./actions";

export function BudgetItem({
  budget,
  categoryName,
  categories,
  month,
  spent,
  limit,
  currency,
}: {
  budget: Tables<"budgets">;
  categoryName: string;
  categories: BudgetCategory[];
  month: string;
  spent: number;
  limit: number;
  currency: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const pct = limit > 0 ? (spent / limit) * 100 : spent > 0 ? 100 : 0;
  const tone: ProgressTone = pct >= 100 ? "over" : pct >= 80 ? "warn" : "ok";
  const remaining = limit - spent;

  function remove() {
    startTransition(async () => {
      const res = await deleteBudget(budget.id);
      if (!res.ok) toast.error(res.error ?? "No se pudo eliminar");
      else toast.success("Presupuesto eliminado");
    });
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="font-medium">{categoryName}</span>
          {budget.rollover ? (
            <RefreshCw
              className="h-3.5 w-3.5 text-muted-foreground"
              aria-label="Con rollover"
            />
          ) : null}
          {tone !== "ok" ? (
            <TriangleAlert
              className={cn(
                "h-3.5 w-3.5",
                tone === "over" ? "text-destructive" : "text-amber-500",
              )}
            />
          ) : null}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
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

      <ProgressBar value={pct} tone={tone} />

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="tabular-nums">
          {formatMoney(spent, currency)} / {formatMoney(limit, currency)}
        </span>
        <span
          className={cn(
            "tabular-nums",
            remaining < 0 && "font-medium text-destructive",
          )}
        >
          {remaining >= 0
            ? `Quedan ${formatMoney(remaining, currency)}`
            : `Excedido ${formatMoney(-remaining, currency)}`}
        </span>
      </div>

      <BudgetDialog
        categories={categories}
        month={month}
        budget={budget}
        categoryName={categoryName}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}
