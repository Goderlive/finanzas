"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import type { Tables } from "@/lib/supabase/database.types";
import type { ActionResult } from "@/lib/action-result";
import { centsToInput } from "@/lib/money";
import { debtTypeLabels } from "@/lib/labels";
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
import { debtTypes } from "./schema";
import { createDebt, updateDebt } from "./actions";

export function DebtDialog({
  debt,
  open,
  onOpenChange,
}: {
  debt?: Tables<"debts">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = Boolean(debt);
  const [state, formAction] = useActionState<ActionResult, FormData>(
    isEdit ? updateDebt : createDebt,
    { ok: false },
  );

  useEffect(() => {
    if (state.ok) {
      onOpenChange(false);
      toast.success(isEdit ? "Deuda actualizada" : "Deuda creada");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar deuda" : "Nueva deuda"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {debt ? <input type="hidden" name="id" value={debt.id} /> : null}

          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              name="name"
              defaultValue={debt?.name ?? ""}
              placeholder="Tarjeta BBVA"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="type">Tipo</Label>
              <Select name="type" defaultValue={debt?.type ?? "credit_card"}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {debtTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {debtTypeLabels[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ownership">Titularidad</Label>
              <Select
                name="ownership"
                defaultValue={debt?.owner_id ? "personal" : "joint"}
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="currentBalance">Saldo actual</Label>
              <Input
                id="currentBalance"
                name="currentBalance"
                inputMode="decimal"
                defaultValue={debt ? centsToInput(debt.current_balance) : ""}
                placeholder="0.00"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="interestRate">Tasa anual (%)</Label>
              <Input
                id="interestRate"
                name="interestRate"
                inputMode="decimal"
                defaultValue={
                  debt ? String(+(debt.interest_rate * 100).toFixed(2)) : ""
                }
                placeholder="42"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="minimumPayment">Pago mínimo</Label>
              <Input
                id="minimumPayment"
                name="minimumPayment"
                inputMode="decimal"
                defaultValue={
                  debt ? centsToInput(debt.minimum_payment) : ""
                }
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="principal">Monto original (opcional)</Label>
              <Input
                id="principal"
                name="principal"
                inputMode="decimal"
                defaultValue={debt ? centsToInput(debt.principal) : ""}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="statementDay">Día de corte</Label>
              <Input
                id="statementDay"
                name="statementDay"
                inputMode="numeric"
                defaultValue={debt?.statement_day ?? ""}
                placeholder="1-31"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDay">Día de pago</Label>
              <Input
                id="dueDay"
                name="dueDay"
                inputMode="numeric"
                defaultValue={debt?.due_day ?? ""}
                placeholder="1-31"
              />
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
