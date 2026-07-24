"use client";

import { useState } from "react";
import { HandCoins, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Member } from "./balance";
import { SharedExpenseDialog } from "./shared-expense-dialog";
import { SettlementDialog } from "./settlement-dialog";

export function SharedActions({
  members,
  defaultPaidBy,
  defaultDate,
  settleFrom,
  settleTo,
  settleAmount,
}: {
  members: Member[];
  defaultPaidBy: string;
  defaultDate: string;
  settleFrom: string;
  settleTo: string;
  settleAmount: string;
}) {
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);

  return (
    <>
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" onClick={() => setExpenseOpen(true)}>
          <Plus className="h-4 w-4" />
          Nuevo gasto
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={() => setSettleOpen(true)}
        >
          <HandCoins className="h-4 w-4" />
          Saldar
        </Button>
      </div>

      <SharedExpenseDialog
        members={members}
        defaultPaidBy={defaultPaidBy}
        defaultDate={defaultDate}
        open={expenseOpen}
        onOpenChange={setExpenseOpen}
      />
      <SettlementDialog
        members={members}
        defaultFrom={settleFrom}
        defaultTo={settleTo}
        defaultAmount={settleAmount}
        defaultDate={defaultDate}
        open={settleOpen}
        onOpenChange={setSettleOpen}
      />
    </>
  );
}
