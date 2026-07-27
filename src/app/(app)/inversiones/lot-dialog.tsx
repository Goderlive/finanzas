"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";
import { addLot } from "./actions";

/** Alta de una compra o venta parcial sobre un holding. */
export function LotDialog({
  investmentId,
  symbol,
  defaultDate,
  open,
  onOpenChange,
}: {
  investmentId: string;
  symbol: string;
  defaultDate: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [type, setType] = useState<"buy" | "sell">("buy");
  const [state, formAction] = useActionState<ActionResult, FormData>(addLot, {
    ok: false,
  });

  useEffect(() => {
    if (state.ok) {
      onOpenChange(false);
      toast.success("Movimiento registrado");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Movimiento en {symbol}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="investmentId" value={investmentId} />
          <input type="hidden" name="type" value={type} />

          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {(["buy", "sell"] as const).map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setType(t)}
                className={cn(
                  "rounded-md py-2 text-sm font-medium transition-colors",
                  type === t
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "buy" ? "Compra" : "Venta"}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="lotQuantity">Cantidad</Label>
              <Input
                id="lotQuantity"
                name="quantity"
                inputMode="decimal"
                placeholder="0"
                autoFocus
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lotPrice">Precio (c/u)</Label>
              <Input
                id="lotPrice"
                name="price"
                inputMode="decimal"
                placeholder="0.00"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lotDate">Fecha</Label>
            <Input
              id="lotDate"
              name="occurredAt"
              type="date"
              defaultValue={defaultDate}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lotNote">Nota (opcional)</Label>
            <Input id="lotNote" name="note" placeholder="Aportación mensual" />
          </div>

          <p className="text-xs text-muted-foreground">
            {type === "buy"
              ? "La compra se suma a la posición y recalcula el costo promedio ponderado."
              : "La venta reduce la posición al costo promedio vigente y registra la ganancia materializada."}
          </p>

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
