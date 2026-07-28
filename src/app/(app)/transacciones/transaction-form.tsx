"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type {
  Tables,
  TransactionType,
} from "@/lib/supabase/database.types";
import type { ActionResult } from "@/lib/action-result";
import { centsToInput } from "@/lib/money";
import { transactionTypeLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";
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
import { DescriptionInput } from "./description-input";
import { msiMonthOptions } from "./schema";
import { createTransaction, updateTransaction } from "./actions";

export type FormAccount = {
  id: string;
  name: string;
  // Presentes desde la Fase B; sin ellos no se puede ofrecer MSI.
  type?: string;
  statement_day?: number | null;
  payment_day?: number | null;
};
export type FormCategory = {
  id: string;
  name: string;
  kind: "income" | "expense";
  parent_id: string | null;
};

// Campos que el formulario necesita de una transacción existente (para editar).
export type TransactionInput = Pick<
  Tables<"transactions">,
  | "id"
  | "type"
  | "amount"
  | "account_id"
  | "transfer_account_id"
  | "category_id"
  | "description"
  | "occurred_at"
>;

export function TransactionForm({
  accounts,
  categories,
  transaction,
  defaultDate,
  onDone,
}: {
  accounts: FormAccount[];
  categories: FormCategory[];
  transaction?: TransactionInput;
  defaultDate: string;
  onDone?: () => void;
}) {
  const isEdit = Boolean(transaction);
  const [state, formAction] = useActionState<ActionResult, FormData>(
    isEdit ? updateTransaction : createTransaction,
    { ok: false },
  );
  const [type, setType] = useState<TransactionType>(
    transaction?.type ?? "expense",
  );
  const [categoryId, setCategoryId] = useState<string>(
    transaction?.category_id ?? "none",
  );
  const [accountId, setAccountId] = useState<string>(
    transaction?.account_id ?? accounts[0]?.id ?? "",
  );
  const [msi, setMsi] = useState(false);
  const [msiMonths, setMsiMonths] = useState("12");

  // MSI sólo tiene sentido en un gasto nuevo con una tarjeta ya configurada.
  const selectedAccount = accounts.find((a) => a.id === accountId);
  const canUseMsi =
    !isEdit &&
    type === "expense" &&
    selectedAccount?.type === "credit_card" &&
    selectedAccount.statement_day != null &&
    selectedAccount.payment_day != null;

  useEffect(() => {
    if (state.ok) {
      toast.success(isEdit ? "Movimiento actualizado" : "Movimiento guardado");
      onDone?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const categoryOptions = useMemo(() => {
    if (type === "transfer") return [];
    const kind = type;
    const parents = categories.filter((c) => c.kind === kind && !c.parent_id);
    return parents.flatMap((p) => [
      { id: p.id, label: p.name },
      ...categories
        .filter((c) => c.parent_id === p.id)
        .map((c) => ({ id: c.id, label: `— ${c.name}` })),
    ]);
  }, [categories, type]);

  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Primero crea una cuenta en{" "}
        <Link href="/cuentas" className="underline underline-offset-4">
          Cuentas
        </Link>
        .
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {transaction ? (
        <input type="hidden" name="id" value={transaction.id} />
      ) : null}
      <input type="hidden" name="type" value={type} />

      {/* Selector de tipo */}
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {(["expense", "income", "transfer"] as const).map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => {
              setType(t);
              if (t === "transfer") setCategoryId("none");
              else setCategoryId("none");
            }}
            className={cn(
              "rounded-md py-2 text-sm font-medium transition-colors",
              type === t
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {transactionTypeLabels[t]}
          </button>
        ))}
      </div>

      {/* Monto */}
      <div className="space-y-2">
        <Label htmlFor="amount">Monto</Label>
        <Input
          id="amount"
          name="amount"
          inputMode="decimal"
          autoFocus={!isEdit}
          // El formulario captura magnitudes; el signo lo pone la acción.
          defaultValue={
            transaction ? centsToInput(Math.abs(transaction.amount)) : ""
          }
          placeholder="0.00"
          className="h-12 text-2xl"
          required
        />
      </div>

      {/* Cuenta origen */}
      <div className="space-y-2">
        <Label htmlFor="accountId">
          {type === "transfer" ? "Desde la cuenta" : "Cuenta"}
        </Label>
        <Select name="accountId" value={accountId} onValueChange={setAccountId}>
          <SelectTrigger id="accountId">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Cuenta destino (transferencias) */}
      {type === "transfer" ? (
        <div className="space-y-2">
          <Label htmlFor="transferAccountId">Hacia la cuenta</Label>
          <Select
            name="transferAccountId"
            defaultValue={transaction?.transfer_account_id ?? "none"}
          >
            <SelectTrigger id="transferAccountId">
              <SelectValue placeholder="Selecciona destino" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Selecciona destino</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="categoryId">Categoría</Label>
          <Select
            name="categoryId"
            value={categoryId}
            onValueChange={setCategoryId}
          >
            <SelectTrigger id="categoryId">
              <SelectValue placeholder="Sin categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin categoría</SelectItem>
              {categoryOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Meses sin intereses */}
      {canUseMsi ? (
        <div className="space-y-3 rounded-lg border p-3">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              name="msi"
              checked={msi}
              onChange={(e) => setMsi(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-foreground"
            />
            <span className="text-sm font-medium">¿Meses sin intereses?</span>
          </label>

          {msi ? (
            <div className="space-y-2">
              <Label htmlFor="msiMonths">Mensualidades</Label>
              <Select
                name="msiMonths"
                value={msiMonths}
                onValueChange={setMsiMonths}
              >
                <SelectTrigger id="msiMonths">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {msiMonthOptions.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {m} meses
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                La compra se registra completa en su fecha real; el calendario
                de mensualidades vive aparte, en Compromisos.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Descripción con autocompletado */}
      <div className="space-y-2">
        <Label htmlFor="description">Descripción</Label>
        <DescriptionInput defaultValue={transaction?.description ?? undefined} />
      </div>

      {/* Fecha */}
      <div className="space-y-2">
        <Label htmlFor="occurredAt">Fecha</Label>
        <Input
          id="occurredAt"
          name="occurredAt"
          type="date"
          defaultValue={transaction?.occurred_at ?? defaultDate}
          required
        />
      </div>

      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}

      <SubmitButton className="h-11 w-full text-base">Guardar</SubmitButton>
    </form>
  );
}
