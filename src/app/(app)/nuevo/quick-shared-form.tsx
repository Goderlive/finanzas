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
import { createSharedExpense } from "../compartidos/actions";
import type { QuickSharedOptions } from "./data";

const EMPTY: QuickSharedOptions = {
  members: [],
  defaultPaidBy: null,
  suggestions: [],
};

export function QuickSharedForm({
  optionsPromise,
  defaultDate,
}: {
  optionsPromise: Promise<QuickSharedOptions>;
  defaultDate: string;
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(
    createSharedExpense,
    { ok: false },
  );

  const [options, setOptions] = useState<QuickSharedOptions | null>(null);
  const [paidBy, setPaidBy] = useState("");
  const [description, setDescription] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    optionsPromise
      .then((o) => {
        if (!alive) return;
        setOptions(o);
        setPaidBy((current) => current || o.defaultPaidBy || "");
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
    let text = "Gasto compartido guardado";
    const raw = amountRef.current?.value ?? "";
    try {
      if (raw.trim()) text = `${formatMoney(parseAmountToCents(raw))} a medias`;
    } catch {
      // Sin monto legible basta con el mensaje genérico.
    }
    setSaved(text);
    toast.success(text);
  }, [state]);

  function addAnother() {
    formRef.current?.reset();
    setDescription("");
    setSaved(null);
    amountRef.current?.focus();
  }

  const loading = options === null;

  // El reparto se guarda por perfil: sin dos miembros no hay entre quiénes
  // dividir, y el formulario no tendría a quién asignarle su mitad.
  if (options !== null && options.members.length < 2) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Un gasto compartido necesita a las dos personas del hogar. Invita a la
        otra desde{" "}
        <Link href="/hogar" className="underline underline-offset-4">
          Hogar
        </Link>
        .
      </div>
    );
  }

  const members = options?.members ?? [];

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
              <Link href="/compartidos">Ver</Link>
            </Button>
          </div>
        </div>
      ) : null}

      <form ref={formRef} action={formAction} className="space-y-4">
        {/* Sólo 50/50 desde el acceso directo: es el caso de la fila del
            súper. Los repartos por porcentaje o monto fijo siguen en
            /compartidos, donde hay espacio para cuadrarlos. */}
        <input type="hidden" name="splitType" value="equal" />
        <input type="hidden" name="p0" value={members[0]?.id ?? ""} />
        <input type="hidden" name="p1" value={members[1]?.id ?? ""} />

        <div className="space-y-2">
          <Label htmlFor="amount">Monto total</Label>
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
          <p className="text-xs text-muted-foreground">Se divide 50/50.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Descripción</Label>
          {loading ? (
            <div className="flex flex-wrap gap-2" aria-hidden>
              {[20, 16].map((w, i) => (
                <span
                  key={i}
                  className="h-9 animate-pulse rounded-full bg-muted"
                  style={{ width: `${w * 4}px` }}
                />
              ))}
            </div>
          ) : options.suggestions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {options.suggestions.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setDescription(s)}
                  aria-pressed={description === s}
                  className={cn(
                    "min-h-9 rounded-full border px-3 py-1.5 text-sm transition-colors active:scale-95",
                    description === s
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
          <Input
            id="description"
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            autoComplete="off"
            placeholder="Súper del sábado"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="paidBy">Pagó</Label>
            {loading ? (
              <div className="h-9 animate-pulse rounded-md bg-muted" aria-hidden />
            ) : (
              <Select name="paidBy" value={paidBy} onValueChange={setPaidBy}>
                <SelectTrigger id="paidBy" className="w-full">
                  <SelectValue placeholder="¿Quién pagó?" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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

        {loading ? (
          <Button type="button" disabled className="h-14 w-full text-lg">
            Cargando…
          </Button>
        ) : (
          <SubmitButton className="h-14 w-full text-lg">Guardar</SubmitButton>
        )}
      </form>
    </div>
  );
}
