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
import { createInvestment, updateInvestment } from "./actions";

export function InvestmentDialog({
  investment,
  open,
  onOpenChange,
}: {
  investment?: Tables<"investments">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = Boolean(investment);
  const [state, formAction] = useActionState<ActionResult, FormData>(
    isEdit ? updateInvestment : createInvestment,
    { ok: false },
  );

  useEffect(() => {
    if (state.ok) {
      onOpenChange(false);
      toast.success(isEdit ? "Inversión actualizada" : "Inversión creada");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar inversión" : "Nueva inversión"}
          </DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {investment ? (
            <input type="hidden" name="id" value={investment.id} />
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="symbol">Símbolo</Label>
              <Input
                id="symbol"
                name="symbol"
                defaultValue={investment?.symbol ?? ""}
                placeholder="VOO"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ownership">Titularidad</Label>
              <Select
                name="ownership"
                defaultValue={investment?.owner_id ? "personal" : "joint"}
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

          <div className="space-y-2">
            <Label htmlFor="name">Nombre (opcional)</Label>
            <Input
              id="name"
              name="name"
              defaultValue={investment?.name ?? ""}
              placeholder="Vanguard S&P 500 ETF"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="quantity">Cantidad</Label>
              <Input
                id="quantity"
                name="quantity"
                inputMode="decimal"
                defaultValue={investment ? String(investment.quantity) : ""}
                placeholder="0"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchasePrice">Precio de compra (c/u)</Label>
              <Input
                id="purchasePrice"
                name="purchasePrice"
                inputMode="decimal"
                defaultValue={
                  investment ? centsToInput(investment.purchase_price) : ""
                }
                placeholder="0.00"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="purchaseDate">Fecha de compra</Label>
            <Input
              id="purchaseDate"
              name="purchaseDate"
              type="date"
              defaultValue={investment?.purchase_date ?? ""}
            />
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
