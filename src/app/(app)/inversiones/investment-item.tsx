"use client";

import { useState, useTransition } from "react";
import {
  MoreVertical,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/lib/supabase/database.types";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InvestmentDialog } from "./investment-dialog";
import { PriceDialog } from "./price-dialog";
import { deleteInvestment } from "./actions";

export function InvestmentItem({
  investment,
  latestPrice,
  ownerLabel,
  defaultDate,
  currency,
}: {
  investment: Tables<"investments">;
  latestPrice: number | null;
  ownerLabel: string;
  defaultDate: string;
  currency: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const cost = Math.round(investment.quantity * investment.purchase_price);
  const hasPrice = latestPrice !== null;
  const value = hasPrice
    ? Math.round(investment.quantity * latestPrice)
    : cost;
  const gain = value - cost;
  const gainPct = cost > 0 ? (gain / cost) * 100 : 0;

  function remove() {
    startTransition(async () => {
      const res = await deleteInvestment(investment.id);
      if (!res.ok) toast.error(res.error ?? "No se pudo eliminar");
      else toast.success("Inversión eliminada");
    });
  }

  return (
    <div className="flex items-start justify-between gap-2 rounded-lg border p-3">
      <div className="min-w-0">
        <div className="font-medium">
          {investment.symbol}
          {investment.name ? (
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {investment.name}
            </span>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground">
          {investment.quantity} × {formatMoney(investment.purchase_price, currency)}{" "}
          · {ownerLabel}
        </div>
        <div className="text-xs text-muted-foreground">
          {hasPrice
            ? `Precio actual ${formatMoney(latestPrice, currency)}`
            : "Sin precio actualizado"}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <div className="text-right">
          <div className="font-medium tabular-nums">
            {formatMoney(value, currency)}
          </div>
          {hasPrice ? (
            <div
              className={cn(
                "text-xs tabular-nums",
                gain >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-destructive",
              )}
            >
              {gain >= 0 ? "+" : "-"}
              {formatMoney(Math.abs(gain), currency)} ({gainPct.toFixed(1)}%)
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

      <InvestmentDialog
        investment={investment}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <PriceDialog
        investmentId={investment.id}
        symbol={investment.symbol}
        defaultDate={defaultDate}
        open={priceOpen}
        onOpenChange={setPriceOpen}
      />
    </div>
  );
}
