"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import type { InvestmentType, Tables } from "@/lib/supabase/database.types";
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
import { compoundingLabels } from "@/lib/labels";
import { compoundingMethods } from "./schema";
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
  const [type, setType] = useState<InvestmentType>(
    investment?.investment_type ?? "variable",
  );
  const isFixed = type === "fixed";
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

          <input type="hidden" name="investmentType" value={type} />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="investmentType">Tipo</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as InvestmentType)}
              >
                <SelectTrigger id="investmentType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="variable">Renta variable</SelectItem>
                  <SelectItem value="fixed">Renta fija</SelectItem>
                </SelectContent>
              </Select>
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

          {isFixed ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="name">Nombre</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={investment?.name ?? ""}
                  placeholder="Pagaré Banorte 180 días"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="principal">Monto invertido</Label>
                  <Input
                    id="principal"
                    name="principal"
                    inputMode="decimal"
                    defaultValue={
                      investment?.principal != null
                        ? centsToInput(investment.principal)
                        : ""
                    }
                    placeholder="50000.00"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="annualRate">Tasa anual (%)</Label>
                  <Input
                    id="annualRate"
                    name="annualRate"
                    inputMode="decimal"
                    defaultValue={
                      investment?.annual_rate != null
                        ? String(investment.annual_rate * 100)
                        : ""
                    }
                    placeholder="10.25"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Inicio</Label>
                  <Input
                    id="startDate"
                    name="startDate"
                    type="date"
                    defaultValue={investment?.start_date ?? ""}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maturityDate">Vencimiento</Label>
                  <Input
                    id="maturityDate"
                    name="maturityDate"
                    type="date"
                    defaultValue={investment?.maturity_date ?? ""}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="compounding">Capitalización</Label>
                <Select
                  name="compounding"
                  defaultValue={investment?.compounding ?? "simple"}
                >
                  <SelectTrigger id="compounding">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {compoundingMethods.map((c) => (
                      <SelectItem key={c} value={c}>
                        {compoundingLabels[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="reinvests"
                  defaultChecked={investment?.reinvests_at_maturity ?? false}
                  className="h-4 w-4 rounded border-input accent-foreground"
                />
                <span className="text-sm">Se reinvierte al vencimiento</span>
              </label>

              <p className="text-xs text-muted-foreground">
                El interés se calcula sobre base 360 días, como los pagarés y
                CETES en México.
              </p>
            </>
          ) : (
            <>
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
                  <Label htmlFor="name">Nombre (opcional)</Label>
                  <Input
                    id="name"
                    name="name"
                    defaultValue={investment?.name ?? ""}
                    placeholder="Vanguard S&P 500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="quantity">Cantidad</Label>
                  <Input
                    id="quantity"
                    name="quantity"
                    inputMode="decimal"
                    defaultValue={
                      investment?.quantity != null
                        ? String(investment.quantity)
                        : ""
                    }
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
                      investment?.purchase_price != null
                        ? centsToInput(investment.purchase_price)
                        : ""
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
            </>
          )}

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
