"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccountDialog } from "./account-dialog";

export function NewAccountButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nueva
      </Button>
      <AccountDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
