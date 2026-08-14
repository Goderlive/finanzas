"use client";

import { useTransition } from "react";
import { Link2, Link2Off, Wallet } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { unlinkInvestment } from "./actions";
import type { LinkableAccount } from "./schema";

/**
 * Dónde vive el dinero de una inversión, en una línea.
 *
 * Sin vincular no es un estado de error, es el de siempre: la inversión suma
 * su valor completo al patrimonio neto. Pero sí es el que puede duplicar
 * dinero si ese mismo capital está además en el saldo de una cuenta, así que
 * se marca para que se note.
 */
export function AccountBadge({ account }: { account?: LinkableAccount }) {
  if (!account) {
    return (
      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
        <Link2Off className="h-3 w-3" />
        Sin cuenta
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <Wallet className="h-3 w-3" />
      {account.name}
    </span>
  );
}

/** Entradas de menú para vincular o desvincular. */
export function LinkMenuItems({
  investmentId,
  linked,
  onLink,
}: {
  investmentId: string;
  linked: boolean;
  onLink: () => void;
}) {
  const [pending, startTransition] = useTransition();

  if (!linked) {
    return (
      <DropdownMenuItem onClick={onLink}>
        <Link2 className="h-4 w-4" />
        Vincular a una cuenta
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await unlinkInvestment(investmentId);
          if (!res.ok) toast.error(res.error ?? "No se pudo desvincular");
          else
            toast.success(
              "Inversión desvinculada. El saldo de la cuenta no cambió.",
            );
        })
      }
    >
      <Link2Off className="h-4 w-4" />
      Desvincular de su cuenta
    </DropdownMenuItem>
  );
}
