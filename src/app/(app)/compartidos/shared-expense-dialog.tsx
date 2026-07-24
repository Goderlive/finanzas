"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/submit-button";
import type { Member } from "./balance";
import { splitTypes } from "./schema";
import { createSharedExpense } from "./actions";

const splitLabels: Record<(typeof splitTypes)[number], string> = {
  equal: "50/50",
  percentage: "Porcentaje",
  fixed: "Monto fijo",
};

export function SharedExpenseDialog({
  members,
  defaultPaidBy,
  defaultDate,
  open,
  onOpenChange,
}: {
  members: Member[];
  defaultPaidBy: string;
  defaultDate: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(
    createSharedExpense,
    { ok: false },
  );
  const [splitType, setSplitType] =
    useState<(typeof splitTypes)[number]>("equal");

  useEffect(() => {
    if (state.ok) {
      onOpenChange(false);
      toast.success("Gasto compartido guardado");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const [m0, m1] = members;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo gasto compartido</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="p0" value={m0.id} />
          <input type="hidden" name="p1" value={m1.id} />
          <input type="hidden" name="splitType" value={splitType} />

          <div className="space-y-2">
            <Label htmlFor="description">Descripción</Label>
            <Input
              id="description"
              name="description"
              placeholder="Súper del sábado"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="amount">Monto total</Label>
              <Input
                id="amount"
                name="amount"
                inputMode="decimal"
                placeholder="0.00"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paidBy">Pagó</Label>
              <Select name="paidBy" defaultValue={defaultPaidBy}>
                <SelectTrigger id="paidBy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>División</Label>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
              {splitTypes.map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setSplitType(t)}
                  className={cn(
                    "rounded-md py-1.5 text-sm font-medium transition-colors",
                    splitType === t
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  {splitLabels[t]}
                </button>
              ))}
            </div>
          </div>

          {splitType === "percentage" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="v0">{m0.name} (%)</Label>
                <Input
                  id="v0"
                  name="v0"
                  inputMode="numeric"
                  defaultValue="50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="v1">{m1.name} (%)</Label>
                <Input
                  id="v1"
                  name="v1"
                  inputMode="numeric"
                  defaultValue="50"
                />
              </div>
            </div>
          ) : null}

          {splitType === "fixed" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="v0f">{m0.name}</Label>
                <Input id="v0f" name="v0" inputMode="decimal" placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="v1f">{m1.name}</Label>
                <Input id="v1f" name="v1" inputMode="decimal" placeholder="0.00" />
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="occurredAt">Fecha</Label>
            <Input
              id="occurredAt"
              name="occurredAt"
              type="date"
              defaultValue={defaultDate}
              required
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
