"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import type { CategoryKind, Tables } from "@/lib/supabase/database.types";
import type { ActionResult } from "@/lib/action-result";
import { createCategory, updateCategory } from "./actions";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/submit-button";

export type TopLevelCategory = { id: string; name: string; kind: CategoryKind };

const kindLabels: Record<CategoryKind, string> = {
  expense: "Gasto",
  income: "Ingreso",
};

export function CategoryDialog({
  category,
  topLevel,
  open,
  onOpenChange,
}: {
  category?: Tables<"categories">;
  topLevel: TopLevelCategory[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = Boolean(category);
  const [state, formAction] = useActionState<ActionResult, FormData>(
    isEdit ? updateCategory : createCategory,
    { ok: false },
  );
  const [kind, setKind] = useState<CategoryKind>(category?.kind ?? "expense");
  const [parentId, setParentId] = useState<string>(
    category?.parent_id ?? "none",
  );

  useEffect(() => {
    if (state.ok) {
      onOpenChange(false);
      toast.success(isEdit ? "Categoría actualizada" : "Categoría creada");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const parentOptions = topLevel.filter(
    (t) => t.kind === kind && t.id !== category?.id,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar categoría" : "Nueva categoría"}
          </DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {category ? (
            <input type="hidden" name="id" value={category.id} />
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              name="name"
              defaultValue={category?.name ?? ""}
              placeholder="Supermercado"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="kind">Tipo</Label>
              <Select
                name="kind"
                value={kind}
                onValueChange={(v) => {
                  setKind(v as CategoryKind);
                  setParentId("none");
                }}
              >
                <SelectTrigger id="kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">{kindLabels.expense}</SelectItem>
                  <SelectItem value="income">{kindLabels.income}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="parentId">Categoría padre</Label>
              <Select
                name="parentId"
                value={parentId}
                onValueChange={setParentId}
              >
                <SelectTrigger id="parentId">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ninguna (nivel raíz)</SelectItem>
                  {parentOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="icon">Icono (opcional)</Label>
              <Input
                id="icon"
                name="icon"
                defaultValue={category?.icon ?? ""}
                placeholder="shopping-cart"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="color">Color</Label>
              <Input
                id="color"
                name="color"
                type="color"
                defaultValue={category?.color ?? "#6366f1"}
                className="h-9 p-1"
              />
            </div>
          </div>

          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}

          <DialogFooter>
            <SubmitButton>Guardar</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
