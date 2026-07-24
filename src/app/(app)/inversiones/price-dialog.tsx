"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";
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
import { addPrice } from "./actions";

export function PriceDialog({
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
  const [state, formAction] = useActionState<ActionResult, FormData>(addPrice, {
    ok: false,
  });

  useEffect(() => {
    if (state.ok) {
      onOpenChange(false);
      toast.success("Precio actualizado");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Actualizar precio · {symbol}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="investmentId" value={investmentId} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="price">Precio actual (c/u)</Label>
              <Input
                id="price"
                name="price"
                inputMode="decimal"
                placeholder="0.00"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="asOf">Fecha</Label>
              <Input
                id="asOf"
                name="asOf"
                type="date"
                defaultValue={defaultDate}
                required
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
