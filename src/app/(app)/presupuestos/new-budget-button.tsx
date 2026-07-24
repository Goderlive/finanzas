"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BudgetDialog, type BudgetCategory } from "./budget-dialog";

export function NewBudgetButton({
  categories,
  month,
}: {
  categories: BudgetCategory[];
  month: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nuevo
      </Button>
      <BudgetDialog
        categories={categories}
        month={month}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
