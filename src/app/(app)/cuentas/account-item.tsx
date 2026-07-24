"use client";

import { useState, useTransition } from "react";
import {
  Archive,
  ArchiveRestore,
  MoreVertical,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/lib/supabase/database.types";
import { formatMoney } from "@/lib/money";
import { accountTypeLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AccountDialog } from "./account-dialog";
import { setAccountArchived } from "./actions";

export function AccountItem({
  account,
  ownerLabel,
  currency,
}: {
  account: Tables<"accounts">;
  ownerLabel: string;
  currency: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

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
        "flex items-center justify-between gap-2 rounded-lg border p-3",
        account.is_archived && "opacity-60",
      )}
    >
      <div className="min-w-0">
        <div className="truncate font-medium">{account.name}</div>
        <div className="text-xs text-muted-foreground">
          {accountTypeLabels[account.type]} · {ownerLabel}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <span
          className={cn(
            "font-medium tabular-nums",
            account.current_balance < 0 && "text-destructive",
          )}
        >
          {formatMoney(account.current_balance, currency)}
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

      <AccountDialog
        account={account}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}
