"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";
import { formatMoney } from "@/lib/money";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SubmitButton } from "@/components/submit-button";
import { AccountLinkFields } from "./account-link-fields";
import { linkInvestment } from "./actions";
import type { LinkableAccount } from "./schema";

/**
 * Vincula una inversión ya existente a la cuenta donde vive su dinero.
 *
 * Va aparte del diálogo de edición porque no edita el instrumento: mueve (o
 * declara) dinero, y eso toca saldos de cuentas.
 */
export function LinkDialog({
  investmentId,
  investmentName,
  capital,
  ownership,
  accounts,
  currency,
  defaultDate,
  open,
  onOpenChange,
}: {
  investmentId: string;
  investmentName: string;
  /** Capital invertido, para que se vea de cuánto dinero se está hablando. */
  capital: number;
  ownership: "joint" | "personal";
  accounts: LinkableAccount[];
  currency: string;
  defaultDate: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(
    linkInvestment,
    { ok: false },
  );

  useEffect(() => {
    if (state.ok) {
      onOpenChange(false);
      toast.success("Inversión vinculada a su cuenta");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vincular «{investmentName}» a una cuenta</DialogTitle>
          <DialogDescription>
            Capital invertido: {formatMoney(capital, currency)}. Al vincularla,
            ese dinero se cuenta dentro del saldo de la cuenta y la inversión
            deja de sumarlo por separado al patrimonio neto.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="investmentId" value={investmentId} />

          <AccountLinkFields
            accounts={accounts}
            ownership={ownership}
            currency={currency}
            defaultDate={defaultDate}
            mode="link"
          />

          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}

          <DialogFooter>
            <SubmitButton>Vincular</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
