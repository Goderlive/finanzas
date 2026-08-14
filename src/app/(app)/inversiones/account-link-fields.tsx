"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/money";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  NO_ACCOUNT,
  type FundingSource,
  type LinkableAccount,
} from "./schema";

/**
 * Campos para decir en qué cuenta vive el dinero de una inversión y cómo
 * llegó ahí. Los comparten el alta de una inversión y el diálogo de
 * vincular una existente, para que las dos rutas escriban lo mismo.
 *
 * Sólo se ofrecen cuentas de la misma titularidad que la inversión: el
 * guardia de la 0022 rechaza cualquier otra combinación, y es mejor no
 * poder elegirla que enterarse al guardar.
 */
export function AccountLinkFields({
  accounts,
  ownership,
  currency,
  defaultDate,
  defaultAccountId,
  mode,
}: {
  accounts: LinkableAccount[];
  ownership: "joint" | "personal";
  currency: string;
  defaultDate: string;
  defaultAccountId?: string | null;
  /**
   * `create` da de alta una inversión nueva; `link` vincula una que ya
   * existía y llevaba tiempo sumando su valor completo. La consecuencia
   * sobre el patrimonio neto es distinta y hay que decirla antes de
   * confirmar.
   */
  mode: "create" | "link";
}) {
  const allowNone = mode === "create";
  // RLS sólo devuelve cuentas conjuntas o mías, así que «tiene dueño»
  // equivale a «es mía» sin necesidad de conocer el id de la sesión.
  const eligible = accounts.filter((a) =>
    ownership === "joint" ? a.owner_id === null : a.owner_id !== null,
  );

  const [accountId, setAccountId] = useState<string>(
    defaultAccountId ?? (allowNone ? NO_ACCOUNT : ""),
  );
  const [funding, setFunding] = useState<FundingSource>("already");

  // Si cambia la titularidad, la cuenta elegida puede dejar de ser válida.
  const chosen = eligible.find((a) => a.id === accountId);
  const effectiveId = chosen ? accountId : allowNone ? NO_ACCOUNT : "";
  const linked = effectiveId !== NO_ACCOUNT && effectiveId !== "";

  const sources = accounts.filter((a) => a.id !== effectiveId);

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="space-y-2">
        <Label htmlFor="accountId">¿En qué cuenta vive este dinero?</Label>
        <input type="hidden" name="accountId" value={effectiveId} />
        <Select value={effectiveId} onValueChange={setAccountId}>
          <SelectTrigger id="accountId">
            <SelectValue placeholder="Selecciona una cuenta" />
          </SelectTrigger>
          <SelectContent>
            {allowNone ? (
              <SelectItem value={NO_ACCOUNT}>Sin vincular</SelectItem>
            ) : null}
            {eligible.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name} · {formatMoney(a.current_balance, currency)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {eligible.length === 0 ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            No tienes cuentas de activo{" "}
            {ownership === "joint" ? "conjuntas" : "personales"}. Crea una en
            Cuentas, o cambia la titularidad de esta inversión.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {linked
              ? "Su capital se contará dentro del saldo de esa cuenta, y en el patrimonio neto la inversión sólo sumará su plusvalía."
              : "Sin vincular, la inversión suma su valor completo al patrimonio neto. Si ese dinero también está en el saldo de alguna cuenta, quedará contado dos veces."}
          </p>
        )}
      </div>

      {linked ? (
        <div className="space-y-2">
          <Label>¿De dónde sale ese dinero?</Label>
          <input type="hidden" name="funding" value={funding} />
          <div className="space-y-1.5">
            <FundingOption
              value="already"
              current={funding}
              onSelect={setFunding}
              title="Ya está en el saldo de esa cuenta"
              detail={
                mode === "create"
                  ? "No se registra ningún movimiento y el patrimonio neto no cambia."
                  : "No se registra ningún movimiento. El patrimonio neto baja por el capital: estaba contado dos veces."
              }
            />
            <FundingOption
              value="transfer"
              current={funding}
              onSelect={setFunding}
              title="Sale de otra cuenta"
              detail={
                mode === "create"
                  ? "Se registra un traspaso entre las dos cuentas y el patrimonio neto no cambia."
                  : "Se registra el traspaso. El patrimonio neto baja por el capital: estaba contado dos veces."
              }
            />
            <FundingOption
              value="external"
              current={funding}
              onSelect={setFunding}
              title="Es dinero que la app no tenía registrado"
              detail={
                mode === "create"
                  ? "Sube el saldo de la cuenta, y con él el patrimonio neto, por el monto invertido."
                  : "Sube el saldo de la cuenta por el monto invertido. El patrimonio neto no cambia."
              }
            />
          </div>
        </div>
      ) : null}

      {linked && funding === "transfer" ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="fromAccountId">Sale de</Label>
            <Select name="fromAccountId">
              <SelectTrigger id="fromAccountId">
                <SelectValue placeholder="Cuenta de origen" />
              </SelectTrigger>
              <SelectContent>
                {sources.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} · {formatMoney(a.current_balance, currency)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="occurredAt">Fecha</Label>
            <Input
              id="occurredAt"
              name="occurredAt"
              type="date"
              defaultValue={defaultDate}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FundingOption({
  value,
  current,
  onSelect,
  title,
  detail,
}: {
  value: FundingSource;
  current: FundingSource;
  onSelect: (v: FundingSource) => void;
  title: string;
  detail: string;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={active}
      className={
        "flex w-full flex-col items-start rounded-md border px-3 py-2 text-left transition-colors " +
        (active
          ? "border-foreground/40 bg-background"
          : "border-transparent hover:bg-background/60")
      }
    >
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </button>
  );
}
