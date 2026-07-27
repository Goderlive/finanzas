"use client";

import { useState, useTransition } from "react";
import {
  ChevronDown,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/lib/supabase/database.types";
import { formatMoney } from "@/lib/money";
import { formatShortDate } from "@/lib/dates";
import type { EvolutionPoint, HoldingReturn, Lot } from "@/lib/portfolio";
import { cn } from "@/lib/utils";
import { Amount } from "@/components/amount";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InvestmentDialog } from "./investment-dialog";
import { PriceDialog } from "./price-dialog";
import { LotDialog } from "./lot-dialog";
import { EvolutionChart } from "./evolution-chart";
import { deleteInvestment, deleteLot } from "./actions";

type LotRow = Lot & { id: string; note: string | null };

export function InvestmentItem({
  investment,
  latestPrice,
  ownerLabel,
  defaultDate,
  currency,
  ret,
  lots,
  evolution,
}: {
  investment: Tables<"investments">;
  latestPrice: number | null;
  ownerLabel: string;
  defaultDate: string;
  currency: string;
  ret: HoldingReturn;
  lots: LotRow[];
  evolution: EvolutionPoint[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [lotOpen, setLotOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const res = await deleteInvestment(investment.id);
      if (!res.ok) toast.error(res.error ?? "No se pudo eliminar");
      else toast.success("Inversión eliminada");
    });
  }

  function removeLot(lotId: string) {
    startTransition(async () => {
      const res = await deleteLot(lotId, investment.id);
      if (!res.ok) toast.error(res.error ?? "No se pudo eliminar");
      else toast.success("Movimiento eliminado");
    });
  }

  const up = ret.totalGain >= 0;
  const closed = ret.quantity === 0;

  return (
    <div className={cn("rounded-lg border p-3", closed && "opacity-70")}>
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-center gap-1 font-medium">
            {investment.symbol}
            {investment.name ? (
              <span className="truncate text-xs font-normal text-muted-foreground">
                {investment.name}
              </span>
            ) : null}
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                expanded && "rotate-180",
              )}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            {closed ? (
              "Posición cerrada"
            ) : (
              <>
                {ret.quantity} × costo{" "}
                <Amount mask="••••">
                  {formatMoney(Math.round(ret.averageCost), currency)}
                </Amount>
              </>
            )}{" "}
            · {ownerLabel}
          </div>
          <div className="text-xs text-muted-foreground">
            {latestPrice !== null
              ? `Precio actual ${formatMoney(latestPrice, currency)}`
              : "Sin precio actualizado"}
          </div>
        </button>

        <div className="flex items-center gap-1">
          <div className="text-right">
            <div className="font-medium tabular-nums">
              <Amount mask="•••••">
                {formatMoney(ret.currentValue, currency)}
              </Amount>
            </div>
            <div
              className={cn(
                "text-xs tabular-nums",
                up
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-destructive",
              )}
            >
              {up ? "+" : "-"}
              <Amount mask="••••">
                {formatMoney(Math.abs(ret.totalGain), currency)}
              </Amount>
              {ret.totalGainPct !== null
                ? ` (${ret.totalGainPct >= 0 ? "+" : ""}${ret.totalGainPct.toFixed(1)}%)`
                : ""}
            </div>
            {ret.annualizedReturn !== null ? (
              <div className="text-xs text-muted-foreground">
                {(ret.annualizedReturn * 100).toFixed(1)}% anual
              </div>
            ) : null}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={pending}
                aria-label="Acciones"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setLotOpen(true)}>
                <Plus className="h-4 w-4" />
                Compra o venta
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPriceOpen(true)}>
                <RefreshCw className="h-4 w-4" />
                Actualizar precio
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={remove}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {expanded ? (
        <div className="mt-3 space-y-3 border-t pt-3">
          <EvolutionChart points={evolution} currency={currency} />

          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <Row label="Invertido (en posesión)">
              <Amount mask="••••">
                {formatMoney(ret.costBasis, currency)}
              </Amount>
            </Row>
            <Row label="Plusvalía">
              <Amount mask="••••">
                {formatMoney(ret.unrealizedGain, currency)}
              </Amount>
            </Row>
            {ret.realizedGain !== 0 ? (
              <Row label="Ganancia materializada">
                <Amount mask="••••">
                  {formatMoney(ret.realizedGain, currency)}
                </Amount>
              </Row>
            ) : null}
            <Row label="Días en cartera">{ret.daysHeld}</Row>
          </dl>

          {ret.annualizedReturn === null && ret.daysHeld < 30 ? (
            <p className="text-xs text-muted-foreground">
              El rendimiento anualizado aparece con más de 30 días de historia.
            </p>
          ) : null}

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Movimientos ({lots.length})
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setLotOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Añadir
              </Button>
            </div>
            <ul className="space-y-1">
              {lots.map((lot) => (
                <li
                  key={lot.id}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 font-medium",
                        lot.type === "buy"
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : "bg-amber-500/10 text-amber-700 dark:text-amber-400",
                      )}
                    >
                      {lot.type === "buy" ? "Compra" : "Venta"}
                    </span>
                    <span className="tabular-nums">
                      {lot.quantity} ×{" "}
                      <Amount mask="•••">
                        {formatMoney(lot.price, currency)}
                      </Amount>
                    </span>
                    <span className="text-muted-foreground">
                      {formatShortDate(lot.occurred_at)}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={pending}
                    onClick={() => removeLot(lot.id)}
                    aria-label="Eliminar movimiento"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <InvestmentDialog
        investment={investment}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <PriceDialog
        investmentId={investment.id}
        symbol={investment.symbol ?? ""}
        defaultDate={defaultDate}
        open={priceOpen}
        onOpenChange={setPriceOpen}
      />
      <LotDialog
        investmentId={investment.id}
        symbol={investment.symbol ?? ""}
        defaultDate={defaultDate}
        open={lotOpen}
        onOpenChange={setLotOpen}
      />
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </>
  );
}
