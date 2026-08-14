"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvestmentDialog } from "./investment-dialog";
import type { LinkableAccount } from "./schema";

export function NewInvestmentButton({
  accounts,
  currency,
  defaultDate,
}: {
  accounts: LinkableAccount[];
  currency: string;
  defaultDate: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nueva
      </Button>
      <InvestmentDialog
        accounts={accounts}
        currency={currency}
        defaultDate={defaultDate}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
