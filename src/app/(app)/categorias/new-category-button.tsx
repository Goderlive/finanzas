"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryDialog, type TopLevelCategory } from "./category-dialog";

export function NewCategoryButton({
  topLevel,
}: {
  topLevel: TopLevelCategory[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nueva
      </Button>
      <CategoryDialog topLevel={topLevel} open={open} onOpenChange={setOpen} />
    </>
  );
}
