"use client";

import { useState, useTransition } from "react";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setMsiAlertPct } from "./actions";

/** Umbral de alerta: % del ingreso mensual a partir del cual se avisa. */
export function ThresholdDialog({ currentPct }: { currentPct: number }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(Math.round(currentPct * 100)));
  const [pending, startTransition] = useTransition();

  function save() {
    const pct = Number(value) / 100;
    startTransition(async () => {
      const res = await setMsiAlertPct(pct);
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo guardar");
        return;
      }
      setOpen(false);
      toast.success(`Umbral en ${Math.round(pct * 100)}%`);
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="-mr-2 -mt-1"
        onClick={() => setOpen(true)}
        aria-label="Cambiar umbral de alerta"
      >
        <Settings2 className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Umbral de alerta</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="pct">% del ingreso mensual</Label>
            <Input
              id="pct"
              inputMode="numeric"
              type="number"
              min={0}
              max={100}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Se avisa cuando las mensualidades de un mes pasan de este
              porcentaje del ingreso mensual promedio de los últimos 6 meses.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={save} disabled={pending}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
