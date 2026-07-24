"use client";

import { useMemo, useState, useTransition } from "react";
import { MoreVertical, Pencil, PiggyBank, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/lib/supabase/database.types";
import { formatMoney, parseAmountToCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProgressBar } from "@/components/progress-bar";
import { GoalDialog } from "./goal-dialog";
import { ContributeDialog } from "./contribute-dialog";
import { deleteGoal } from "./actions";

function safeCents(v: string): number {
  try {
    return Math.max(0, parseAmountToCents(v || "0"));
  } catch {
    return 0;
  }
}

function addMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString("es-MX", { month: "short", year: "numeric" });
}

function monthsUntil(dateStr: string): number {
  const target = new Date(`${dateStr}T00:00:00`);
  const now = new Date();
  return (
    (target.getFullYear() - now.getFullYear()) * 12 +
    (target.getMonth() - now.getMonth())
  );
}

export function GoalItem({
  goal,
  ownerLabel,
  currency,
}: {
  goal: Tables<"savings_goals">;
  ownerLabel: string;
  currency: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [contribOpen, setContribOpen] = useState(false);
  const [monthly, setMonthly] = useState("");
  const [pending, startTransition] = useTransition();

  const remaining = Math.max(0, goal.target_amount - goal.current_amount);
  const pct =
    goal.target_amount > 0
      ? (goal.current_amount / goal.target_amount) * 100
      : 0;
  const done = remaining <= 0;

  const projection = useMemo(() => {
    const m = safeCents(monthly);
    if (done) return "¡Meta cumplida! 🎉";
    if (m <= 0) return null;
    const months = Math.ceil(remaining / m);
    return `A ese ritmo la cumples en ${addMonths(months)} (${months} mes${months === 1 ? "" : "es"}).`;
  }, [monthly, remaining, done]);

  const requiredMonthly = useMemo(() => {
    if (done || !goal.target_date) return null;
    const months = monthsUntil(goal.target_date);
    if (months <= 0) return null;
    return Math.ceil(remaining / months);
  }, [goal.target_date, remaining, done]);

  function remove() {
    startTransition(async () => {
      const res = await deleteGoal(goal.id);
      if (!res.ok) toast.error(res.error ?? "No se pudo eliminar");
      else toast.success("Meta eliminada");
    });
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium">{goal.name}</div>
          <div className="text-xs text-muted-foreground">{ownerLabel}</div>
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
            <DropdownMenuItem onClick={() => setContribOpen(true)}>
              <PiggyBank className="h-4 w-4" />
              Aportar
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

      <ProgressBar value={pct} tone="ok" />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="tabular-nums">
          {formatMoney(goal.current_amount, currency)} /{" "}
          {formatMoney(goal.target_amount, currency)}
        </span>
        <span className="tabular-nums">{Math.min(100, pct).toFixed(0)}%</span>
      </div>

      {!done ? (
        <div className="space-y-1 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Aporte mensual
            </span>
            <Input
              value={monthly}
              onChange={(e) => setMonthly(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="h-8 max-w-32"
            />
          </div>
          {requiredMonthly !== null ? (
            <p className="text-xs text-muted-foreground">
              Para llegar a tu fecha necesitas ~
              {formatMoney(requiredMonthly, currency)}/mes.
            </p>
          ) : null}
          {projection ? (
            <p className="text-xs text-muted-foreground">{projection}</p>
          ) : null}
        </div>
      ) : (
        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
          ¡Meta cumplida! 🎉
        </p>
      )}

      <GoalDialog goal={goal} open={editOpen} onOpenChange={setEditOpen} />
      <ContributeDialog
        goalId={goal.id}
        goalName={goal.name}
        open={contribOpen}
        onOpenChange={setContribOpen}
      />
    </div>
  );
}
