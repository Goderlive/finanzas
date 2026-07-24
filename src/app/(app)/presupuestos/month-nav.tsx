"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addMonths, monthLabel, monthParam } from "./month";

export function MonthNav({ month }: { month: string }) {
  const router = useRouter();
  const go = (delta: number) =>
    router.push(`/presupuestos?month=${monthParam(addMonths(month, delta))}`);

  return (
    <div className="flex items-center justify-between">
      <Button variant="ghost" size="icon" onClick={() => go(-1)} aria-label="Mes anterior">
        <ChevronLeft className="h-5 w-5" />
      </Button>
      <span className="text-sm font-medium capitalize">{monthLabel(month)}</span>
      <Button variant="ghost" size="icon" onClick={() => go(1)} aria-label="Mes siguiente">
        <ChevronRight className="h-5 w-5" />
      </Button>
    </div>
  );
}
