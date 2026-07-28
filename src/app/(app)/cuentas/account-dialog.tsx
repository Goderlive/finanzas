"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import type { Tables } from "@/lib/supabase/database.types";
import type { ActionResult } from "@/lib/action-result";
import { centsToInput } from "@/lib/money";
import { accountTypeLabels } from "@/lib/labels";
import { accountTypes, isLiabilityType } from "./schema";
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
  const [type, setType] = useState(account?.type ?? "checking");
  const isCard = type === "credit_card";
  const isLiability = isLiabilityType(type);
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
              <Select
                name="type"
                value={type}
                onValueChange={(v) => setType(v as typeof type)}
              >
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
            <Label htmlFor="initialBalance">
              {isLiability ? "¿Cuánto debes hoy?" : "Saldo inicial"}
            </Label>
            <Input
              id="initialBalance"
              name="initialBalance"
              inputMode="decimal"
              // Siempre en magnitud: en un pasivo el usuario escribe la deuda
              // como número positivo y la acción le pone el signo. Capturar
              // una deuda en positivo era lo que hacía que pagarla la
              // aumentara en vez de reducirla.
              defaultValue={
                account
                  ? centsToInput(Math.abs(account.initial_balance))
                  : "0.00"
              }
            />
            <p className="text-xs text-muted-foreground">
              {isLiability
                ? "Escribe la deuda como número positivo. El saldo actual se recalcula con tus movimientos."
                : "El saldo actual se recalcula con tus movimientos."}
            </p>
          </div>

          {isCard ? (
            <fieldset className="space-y-3 rounded-lg border p-3">
              <legend className="px-1 text-xs font-medium text-muted-foreground">
                Ciclo de la tarjeta
              </legend>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="statementDay">Día de corte</Label>
                  <Input
                    id="statementDay"
                    name="statementDay"
                    inputMode="numeric"
                    min={1}
                    max={31}
                    type="number"
                    placeholder="20"
                    defaultValue={account?.statement_day ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="paymentDay">Día límite de pago</Label>
                  <Input
                    id="paymentDay"
                    name="paymentDay"
                    inputMode="numeric"
                    min={1}
                    max={31}
                    type="number"
                    placeholder="5"
                    defaultValue={account?.payment_day ?? ""}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="creditLimit">Límite de crédito</Label>
                  <Input
                    id="creditLimit"
                    name="creditLimit"
                    inputMode="decimal"
                    placeholder="50000.00"
                    defaultValue={
                      account?.credit_limit != null
                        ? centsToInput(account.credit_limit)
                        : ""
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="minimumPayment">Pago mínimo</Label>
                  <Input
                    id="minimumPayment"
                    name="minimumPayment"
                    inputMode="decimal"
                    placeholder="Opcional"
                    defaultValue={
                      account?.minimum_payment != null
                        ? centsToInput(account.minimum_payment)
                        : ""
                    }
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Si el día de pago es igual o anterior al de corte, el pago cae
                el mes siguiente. Los meses cortos usan su último día.
              </p>
            </fieldset>
          ) : null}

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
