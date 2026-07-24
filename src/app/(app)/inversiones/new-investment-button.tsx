"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvestmentDialog } from "./investment-dialog";

export function NewInvestmentButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nueva
      </Button>
      <InvestmentDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
