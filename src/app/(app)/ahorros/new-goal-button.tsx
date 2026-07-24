"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoalDialog } from "./goal-dialog";

export function NewGoalButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nueva
      </Button>
      <GoalDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
