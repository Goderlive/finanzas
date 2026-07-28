"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";
import { centsToInput, formatMoney, parseAmountToCents } from "@/lib/money";
import {
  interestExposure,
  paymentShortcuts,
  type CreditCardCycle,
} from "@/lib/credit-cycle";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { payCreditCard, type PaymentActionResult } from "./payment-actions";

export type PayableAccount = {
  id: string;
  name: string;
  current_balance: number;
};

/**
 * «Pagar tarjeta»: acción propia, distinta del traspaso genérico.
 *
 * Ofrece los atajos de monto que de verdad se usan (total, saldo del corte,
 * mínimo) y avisa antes de guardar si el importe no alcanza a cubrir el
 * corte, que es justo cuando el banco cobra intereses.
 */
export function PayCardDialog({
  card,
  cycle,
  sourceAccounts,
  currency,
  defaultDate,
  open,
  onOpenChange,
}: {
  card: { id: string; name: string; current_balance: number };
  cycle?: CreditCardCycle;
  sourceAccounts: PayableAccount[];
  currency: string;
  defaultDate: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction] = useActionState<PaymentActionResult, FormData>(
    payCreditCard,
    { ok: false },
  );
  const [amount, setAmount] = useState("");
  const [fromAccountId, setFromAccountId] = useState(
    sourceAccounts[0]?.id ?? "",
  );

  const shortcuts = useMemo(
    () => (cycle ? paymentShortcuts(cycle) : []),
    [cycle],
  );

  // Deuda a mostrar cuando la tarjeta no tiene ciclo configurado.
  const rawDebt = Math.max(0, -card.current_balance);

  const amountCents = useMemo(() => {
    if (!amount.trim()) return 0;
    try {
      return parseAmountToCents(amount);
    } catch {
      return 0;
    }
  }, [amount]);

  const uncovered = cycle ? interestExposure(cycle, amountCents) : 0;
  const overpay = Math.max(0, amountCents - rawDebt);

  useEffect(() => {
    if (!state.ok) return;
    const b = state.breakdown;
    if (b && b.msi_installments_paid > 0) {
      toast.success(
        `Pago registrado · ${b.msi_installments_paid} mensualidad${
          b.msi_installments_paid === 1 ? "" : "es"
        } MSI marcada${b.msi_installments_paid === 1 ? "" : "s"} como pagada${
          b.msi_installments_paid === 1 ? "" : "s"
        }`,
      );
    } else {
      toast.success("Pago registrado");
    }
    setAmount("");
    onOpenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (sourceAccounts.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pagar {card.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            No hay ninguna otra cuenta desde la cual pagar. Crea una cuenta de
            débito, ahorro o efectivo primero.
          </p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pagar {card.name}</DialogTitle>
          <DialogDescription>
            {rawDebt > 0
              ? `Debes ${formatMoney(rawDebt, currency)}`
              : "Esta tarjeta no tiene saldo por pagar"}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="cardId" value={card.id} />

          {shortcuts.length > 0 ? (
            <div className="space-y-2">
              <Label>Atajos</Label>
              <div className="grid gap-2">
                {shortcuts.map((s) => {
                  const selected = amountCents === s.amount;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setAmount(centsToInput(s.amount))}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors",
                        selected
                          ? "border-foreground bg-muted"
                          : "hover:bg-muted/50",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-sm font-medium">
                          {selected ? <Check className="h-3.5 w-3.5" /> : null}
                          {s.label}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {s.hint}
                        </div>
                      </div>
                      <span className="shrink-0 font-medium tabular-nums">
                        {formatMoney(s.amount, currency)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="pay-amount">Monto</Label>
            <Input
              id="pay-amount"
              name="amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="h-12 text-2xl"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fromAccountId">Pagar desde</Label>
            <Select
              name="fromAccountId"
              value={fromAccountId}
              onValueChange={setFromAccountId}
            >
              <SelectTrigger id="fromAccountId">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sourceAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} · {formatMoney(a.current_balance, currency)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pay-date">Fecha</Label>
            <Input
              id="pay-date"
              name="occurredAt"
              type="date"
              defaultValue={defaultDate}
              required
            />
          </div>

          {amountCents > 0 && uncovered > 0 ? (
            <div className="flex gap-2 rounded-lg border border-amber-500/60 bg-amber-500/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-amber-700 dark:text-amber-400">
                Vas a generar intereses sobre{" "}
                <span className="font-medium tabular-nums">
                  {formatMoney(uncovered, currency)}
                </span>
                . Para evitarlos, paga el saldo del último corte completo.
              </p>
            </div>
          ) : null}

          {overpay > 0 ? (
            <p className="text-sm text-muted-foreground">
              El pago excede la deuda: la tarjeta queda con{" "}
              <span className="font-medium tabular-nums">
                {formatMoney(overpay, currency)}
              </span>{" "}
              de saldo a favor.
            </p>
          ) : null}

          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <SubmitButton className="flex-1">Pagar</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
