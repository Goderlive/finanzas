"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import type { Tables } from "@/lib/supabase/database.types";
import type { ActionResult } from "@/lib/action-result";
import { centsToInput } from "@/lib/money";
import { accountTypeLabels } from "@/lib/labels";
import { accountTypes } from "./schema";
import { createAccount, updateAccount } from "./actions";
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

export function AccountDialog({
  account,
  open,
  onOpenChange,
}: {
  account?: Tables<"accounts">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = Boolean(account);
  const [state, formAction] = useActionState<ActionResult, FormData>(
    isEdit ? updateAccount : createAccount,
    { ok: false },
  );

  useEffect(() => {
    if (state.ok) {
      onOpenChange(false);
      toast.success(isEdit ? "Cuenta actualizada" : "Cuenta creada");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar cuenta" : "Nueva cuenta"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {account ? (
            <input type="hidden" name="id" value={account.id} />
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              name="name"
              defaultValue={account?.name ?? ""}
              placeholder="Cuenta conjunta"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="type">Tipo</Label>
              <Select name="type" defaultValue={account?.type ?? "checking"}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accountTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {accountTypeLabels[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ownership">Titularidad</Label>
              <Select
                name="ownership"
                defaultValue={account?.owner_id ? "personal" : "joint"}
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
            <Label htmlFor="initialBalance">Saldo inicial</Label>
            <Input
              id="initialBalance"
              name="initialBalance"
              inputMode="decimal"
              defaultValue={
                account ? centsToInput(account.initial_balance) : "0.00"
              }
            />
            <p className="text-xs text-muted-foreground">
              El saldo actual se recalcula con tus movimientos.
            </p>
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
