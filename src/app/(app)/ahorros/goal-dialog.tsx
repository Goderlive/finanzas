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
import { createGoal, updateGoal } from "./actions";

export function GoalDialog({
  goal,
  open,
  onOpenChange,
}: {
  goal?: Tables<"savings_goals">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = Boolean(goal);
  const [state, formAction] = useActionState<ActionResult, FormData>(
    isEdit ? updateGoal : createGoal,
    { ok: false },
  );

  useEffect(() => {
    if (state.ok) {
      onOpenChange(false);
      toast.success(isEdit ? "Meta actualizada" : "Meta creada");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar meta" : "Nueva meta"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {goal ? <input type="hidden" name="id" value={goal.id} /> : null}

          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              name="name"
              defaultValue={goal?.name ?? ""}
              placeholder="Fondo de emergencia"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="targetAmount">Meta</Label>
              <Input
                id="targetAmount"
                name="targetAmount"
                inputMode="decimal"
                defaultValue={goal ? centsToInput(goal.target_amount) : ""}
                placeholder="0.00"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currentAmount">Ahorrado</Label>
              <Input
                id="currentAmount"
                name="currentAmount"
                inputMode="decimal"
                defaultValue={goal ? centsToInput(goal.current_amount) : "0.00"}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="targetDate">Fecha límite (opcional)</Label>
              <Input
                id="targetDate"
                name="targetDate"
                type="date"
                defaultValue={goal?.target_date ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ownership">Titularidad</Label>
              <Select
                name="ownership"
                defaultValue={goal?.owner_id ? "personal" : "joint"}
              >
                <SelectTrigger id="ownership">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="joint">Conjunta</SelectItem>
                  <SelectItem value="personal">Personal (mía)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

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
