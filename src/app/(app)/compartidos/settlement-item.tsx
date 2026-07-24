"use client";

import { useTransition } from "react";
import { ArrowRight, MoreVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteSettlement } from "./actions";

export function SettlementItem({
  id,
  fromName,
  toName,
  amount,
  note,
  currency,
}: {
  id: string;
  fromName: string;
  toName: string;
  amount: number;
  note: string | null;
  currency: string;
}) {
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const res = await deleteSettlement(id);
      if (!res.ok) toast.error(res.error ?? "No se pudo eliminar");
      else toast.success("Liquidación eliminada");
    });
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1 text-sm font-medium">
          {fromName}
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          {toName}
        </div>
        {note ? (
          <div className="truncate text-xs text-muted-foreground">{note}</div>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
          {formatMoney(amount, currency)}
        </span>
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
  );
}
