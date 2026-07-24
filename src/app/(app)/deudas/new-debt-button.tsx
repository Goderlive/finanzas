"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DebtDialog } from "./debt-dialog";

export function NewDebtButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nueva
      </Button>
      <DebtDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
