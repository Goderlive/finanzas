"use client";

import { useState, useTransition } from "react";
import {
  Archive,
  ArchiveRestore,
  MoreVertical,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CategoryDialog, type TopLevelCategory } from "./category-dialog";
import { setCategoryArchived } from "./actions";

export function CategoryItem({
  category,
  topLevel,
  nested = false,
}: {
  category: Tables<"categories">;
  topLevel: TopLevelCategory[];
  nested?: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggleArchive() {
    startTransition(async () => {
      const res = await setCategoryArchived(category.id, !category.is_archived);
      if (!res.ok) toast.error(res.error ?? "No se pudo actualizar");
      else
        toast.success(
          category.is_archived ? "Categoría restaurada" : "Categoría archivada",
        );
    });
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg border p-3",
        nested && "ml-5",
        category.is_archived && "opacity-60",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: category.color ?? "#a3a3a3" }}
          aria-hidden
        />
        <span className="truncate font-medium">{category.name}</span>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={pending}
            aria-label="Acciones"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={toggleArchive}>
            {category.is_archived ? (
              <>
                <ArchiveRestore className="h-4 w-4" />
                Restaurar
              </>
            ) : (
              <>
                <Archive className="h-4 w-4" />
                Archivar
              </>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CategoryDialog
        category={category}
        topLevel={topLevel}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}
