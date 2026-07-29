"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check } from "lucide-react";
import type { ActionResult } from "@/lib/action-result";
import { formatMoney, parseAmountToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/submit-button";
import { createTransaction } from "../transacciones/actions";
import type { QuickTransactionOptions } from "./data";

const EMPTY: QuickTransactionOptions = {
  accounts: [],
  categories: [],
  topCategories: [],
  defaultAccountId: null,
};

export function QuickTransactionForm({
  transactionType,
  optionsPromise,
  defaultDate,
}: {
  transactionType: "expense" | "income";
  /**
   * Llega como promesa a propósito: el shell no la espera, así el input de
   * monto se pinta y toma el foco sin depender de la red.
   */
  optionsPromise: Promise<QuickTransactionOptions>;
  defaultDate: string;
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(
    createTransaction,
    { ok: false },
  );

  const [options, setOptions] = useState<QuickTransactionOptions | null>(null);
  const [categoryId, setCategoryId] = useState("none");
  const [accountId, setAccountId] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    optionsPromise
      .then((o) => {
        if (!alive) return;
        setOptions(o);
        // No pisar la cuenta si el usuario ya la eligió mientras cargaba.
        setAccountId((current) => current || o.defaultAccountId || "");
      })
      .catch(() => {
        if (alive) setOptions(EMPTY);
      });
    return () => {
      alive = false;
    };
  }, [optionsPromise]);

  useEffect(() => {
    if (!state.ok) return;
    // El formulario conserva lo capturado: limpiarlo es lo que hace
    // "Agregar otro", para que un guardado accidental no borre el trabajo.
    let text = "Movimiento guardado";
    const raw = amountRef.current?.value ?? "";
    try {
      if (raw.trim()) text = `${formatMoney(parseAmountToCents(raw))} guardado`;
    } catch {
      // Sin monto legible basta con el mensaje genérico.
    }
    setSaved(text);
    toast.success(text);
  }, [state]);

  function addAnother() {
    formRef.current?.reset();
    setCategoryId("none");
    setSaved(null);
    // La cuenta se queda: quien captura dos gastos seguidos suele pagar con
    // la misma tarjeta.
    amountRef.current?.focus();
  }

  const loading = options === null;
  const noAccounts = options !== null && options.accounts.length === 0;

  if (noAccounts) {
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
    <div className="space-y-4">
      {saved ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-600/30 bg-emerald-600/10 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            <Check className="h-4 w-4 shrink-0" />
            {saved}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" size="sm" onClick={addAnother}>
              Agregar otro
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/transacciones">Ver</Link>
            </Button>
          </div>
        </div>
      ) : null}

      <form ref={formRef} action={formAction} className="space-y-4">
        <input type="hidden" name="type" value={transactionType} />

        {/* Monto: el único campo obligatorio de verdad, y el que recibe el
            foco al abrir desde el acceso directo. */}
        <div className="space-y-2">
          <Label htmlFor="amount">Monto</Label>
          <Input
            ref={amountRef}
            id="amount"
            name="amount"
            inputMode="decimal"
            autoFocus
            autoComplete="off"
            placeholder="0.00"
            className="h-16 text-3xl"
            required
          />
        </div>

        {/* Categorías más usadas, de un toque. */}
        <div className="space-y-2">
          <Label>Categoría</Label>
          {loading ? (
            <div className="flex flex-wrap gap-2" aria-hidden>
              {[16, 24, 20].map((w, i) => (
                <span
                  key={i}
                  className="h-9 animate-pulse rounded-full bg-muted"
                  style={{ width: `${w * 4}px` }}
                />
              ))}
            </div>
          ) : options.topCategories.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {options.topCategories.map((c) => {
                const active = categoryId === c.id;
                return (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => setCategoryId(active ? "none" : c.id)}
                    aria-pressed={active}
                    className={cn(
                      "min-h-9 rounded-full border px-3 py-1.5 text-sm transition-colors active:scale-95",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground",
                    )}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          ) : null}

          <Select
            name="categoryId"
            value={categoryId}
            onValueChange={setCategoryId}
          >
            <SelectTrigger id="categoryId" className="w-full">
              <SelectValue placeholder="Sin categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin categoría</SelectItem>
              {(options?.categories ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Cuenta: preseleccionada con la última usada para este tipo. */}
        <div className="space-y-2">
          <Label htmlFor="accountId">Cuenta</Label>
          {loading ? (
            <div className="h-9 animate-pulse rounded-md bg-muted" aria-hidden />
          ) : (
            <Select name="accountId" value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="accountId" className="w-full">
                <SelectValue placeholder="Selecciona una cuenta" />
              </SelectTrigger>
              <SelectContent>
                {options.accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="description">Descripción</Label>
            <Input
              id="description"
              name="description"
              autoComplete="off"
              placeholder="Opcional"
            />
          </div>
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
        </div>

        {state.error ? (
          <p className="text-sm text-destructive">{state.error}</p>
        ) : null}

        {/* Botón único, alto y al alcance del pulgar. Mientras no hay cuentas
            cargadas es un botón aparte, no un SubmitButton deshabilitado: ese
            aplica su propio `disabled` durante el envío y no debe pisarse. */}
        {loading ? (
          <Button type="button" disabled className="h-14 w-full text-lg">
            Cargando cuentas…
          </Button>
        ) : (
          <SubmitButton className="h-14 w-full text-lg">Guardar</SubmitButton>
        )}
      </form>
    </div>
  );
}
