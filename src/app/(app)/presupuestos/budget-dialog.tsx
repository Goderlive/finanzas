"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import type { Tables } from "@/lib/supabase/database.types";
import type { ActionResult } from "@/lib/action-result";
import { centsToInput } from "@/lib/money";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/submit-button";
import { createBudget, updateBudget } from "./actions";

export type BudgetCategory = {
  id: string;
  name: string;
  parent_id: string | null;
};

export function BudgetDialog({
  categories,
  month,
  budget,
  categoryName,
  open,
  onOpenChange,
}: {
  categories: BudgetCategory[];
  month: string; // YYYY-MM-01
  budget?: Tables<"budgets">;
  categoryName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = Boolean(budget);
  const [state, formAction] = useActionState<ActionResult, FormData>(
    isEdit ? updateBudget : createBudget,
    { ok: false },
  );

  useEffect(() => {
    if (state.ok) {
      onOpenChange(false);
      toast.success(isEdit ? "Presupuesto actualizado" : "Presupuesto creado");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const options = categories
    .filter((c) => !c.parent_id)
    .flatMap((p) => [
      { id: p.id, label: p.name },
      ...categories
        .filter((c) => c.parent_id === p.id)
        .map((c) => ({ id: c.id, label: `— ${c.name}` })),
    ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar presupuesto" : "Nuevo presupuesto"}
          </DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {isEdit ? (
            <input type="hidden" name="id" value={budget!.id} />
          ) : (
            <input type="hidden" name="month" value={month} />
          )}

          <div className="space-y-2">
            <Label htmlFor="categoryId">Categoría</Label>
            {isEdit ? (
              <Input value={categoryName ?? ""} readOnly disabled />
            ) : (
              <Select name="categoryId">
                <SelectTrigger id="categoryId">
                  <SelectValue placeholder="Selecciona una categoría" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Límite mensual</Label>
            <Input
              id="amount"
              name="amount"
              inputMode="decimal"
              defaultValue={budget ? centsToInput(budget.amount) : ""}
              placeholder="0.00"
              required
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="rollover"
              defaultChecked={budget?.rollover ?? false}
              className="h-4 w-4 rounded border-input"
            />
            Acumular lo no gastado al mes siguiente (rollover)
          </label>

          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}

          <DialogFooter>
            <SubmitButton>Guardar</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
