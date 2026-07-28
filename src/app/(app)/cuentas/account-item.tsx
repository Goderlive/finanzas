"use client";

import { useState, useTransition } from "react";
import {
  Archive,
  ArchiveRestore,
  CreditCard,
  MoreVertical,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/lib/supabase/database.types";
import { balanceToneClass, displayBalance } from "@/lib/money";
import { accountTypeLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { CreditCardCycle } from "@/lib/credit-cycle";
import { CreditCycleSummary } from "@/components/credit-cycle-summary";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AccountDialog } from "./account-dialog";
import { PayCardDialog, type PayableAccount } from "./pay-card-dialog";
import { setAccountArchived } from "./actions";

export function AccountItem({
  account,
  ownerLabel,
  currency,
  cycle,
  sourceAccounts,
  defaultDate,
}: {
  account: Tables<"accounts">;
  ownerLabel: string;
  currency: string;
  cycle?: CreditCardCycle;
  /** Cuentas de activo desde las que se puede pagar esta tarjeta. */
  sourceAccounts: PayableAccount[];
  defaultDate: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // El signo vive en la base; aquí se traduce a «debes X» / «a favor».
  const balance = displayBalance(
    account.current_balance,
    account.account_class,
    currency,
  );
  const isLiability = account.account_class === "liability";
  const hasDebt = isLiability && account.current_balance < 0;

  function toggleArchive() {
    startTransition(async () => {
      const res = await setAccountArchived(account.id, !account.is_archived);
      if (!res.ok) toast.error(res.error ?? "No se pudo actualizar");
      else
        toast.success(
          account.is_archived ? "Cuenta restaurada" : "Cuenta archivada",
        );
    });
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        account.is_archived && "opacity-60",
      )}
    >
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="truncate font-medium">{account.name}</div>
        <div className="text-xs text-muted-foreground">
          {accountTypeLabels[account.type]} · {ownerLabel}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-right">
          <span
            className={cn(
              "font-medium tabular-nums",
              balanceToneClass[balance.tone],
            )}
          >
            {balance.text}
          </span>
          {balance.label ? (
            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
              {balance.label}
            </span>
          ) : null}
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
            {isLiability ? (
              <DropdownMenuItem onClick={() => setPayOpen(true)}>
                <CreditCard className="h-4 w-4" />
                Pagar
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={toggleArchive}>
              {account.is_archived ? (
                <>
                  <ArchiveRestore className="h-4 w-4" />
                  Restaurar
                </>
              ) : (
                <>
                  <Archive className="h-4 w-4" />
                  Archivar
                </>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

      {cycle ? (
        <CreditCycleSummary
          cycle={cycle}
          currency={currency}
          className="mt-3 border-t pt-3"
        />
      ) : null}

      {hasDebt && !account.is_archived ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-full"
          onClick={() => setPayOpen(true)}
        >
          <CreditCard className="h-4 w-4" />
          Pagar
        </Button>
      ) : null}

      <AccountDialog
        account={account}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      {isLiability ? (
        <PayCardDialog
          card={account}
          cycle={cycle}
          sourceAccounts={sourceAccounts}
          currency={currency}
          defaultDate={defaultDate}
          open={payOpen}
          onOpenChange={setPayOpen}
        />
      ) : null}
    </div>
  );
}
