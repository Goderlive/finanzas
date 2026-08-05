"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { transactionTypeLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  emptyFilters,
  isDefault,
  panelCount,
  periodLabels,
  periodPresets,
  rangeLabel,
  toSearchParams,
  transactionTypes,
  UNCATEGORIZED,
  type Filters,
  type PeriodPreset,
} from "./filters";

export type FilterAccount = { id: string; name: string; archived: boolean };
export type FilterCategory = {
  id: string;
  name: string;
  kind: "income" | "expense";
  parent_id: string | null;
};

export function TransactionFilters({
  filters,
  accounts,
  categories,
  today,
}: {
  filters: Filters;
  accounts: FilterAccount[];
  categories: FilterCategory[];
  today: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(filters.q);

  function apply(next: Filters) {
    const qs = toSearchParams(next).toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  // La búsqueda se aplica sola, pero no en cada tecla: cada cambio de URL es
  // una consulta al servidor.
  useEffect(() => {
    if (q === filters.q) return;
    const id = setTimeout(() => apply({ ...filters, q: q.trim() }), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filters]);

  // Si el filtro cambia desde fuera (chip, limpiar, back del navegador), el
  // input tiene que seguirlo.
  useEffect(() => setQ(filters.q), [filters.q]);

  const accountNames = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );
  const categoryNames = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const count = panelCount(filters);
  const clean = isDefault(filters);

  return (
    <div className={cn("space-y-2", pending && "opacity-70 transition-opacity")}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar en la descripción…"
          aria-label="Buscar movimientos"
          className="pl-9 pr-9"
        />
        {q ? (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Limpiar búsqueda"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="flex gap-2">
        <Select
          value={filters.period}
          onValueChange={(v) => {
            const period = v as PeriodPreset;
            // «Personalizado» sin fechas no filtra nada: se abre el panel para
            // que se elijan ahí mismo.
            if (period === "custom") {
              setOpen(true);
              if (filters.period === "custom") return;
            }
            apply({ ...filters, period });
          }}
        >
          <SelectTrigger className="flex-1" aria-label="Periodo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {periodPresets.map((p) => (
              <SelectItem key={p} value={p}>
                {p === "custom" && filters.period === "custom"
                  ? rangeLabel(filters, today)
                  : periodLabels[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen(true)}
          className="shrink-0"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtros
          {count > 0 ? (
            <span className="ml-1 rounded-full bg-foreground px-1.5 text-xs font-medium text-background">
              {count}
            </span>
          ) : null}
        </Button>
      </div>

      {clean ? null : (
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.period !== "mes" ? (
            <Chip
              label={rangeLabel(filters, today)}
              onRemove={() =>
                apply({ ...filters, period: "mes", from: null, to: null })
              }
            />
          ) : null}
          {filters.types.map((t) => (
            <Chip
              key={t}
              label={transactionTypeLabels[t]}
              onRemove={() =>
                apply({ ...filters, types: filters.types.filter((x) => x !== t) })
              }
            />
          ))}
          {filters.accounts.map((id) => (
            <Chip
              key={id}
              label={accountNames.get(id) ?? "Cuenta"}
              onRemove={() =>
                apply({
                  ...filters,
                  accounts: filters.accounts.filter((x) => x !== id),
                })
              }
            />
          ))}
          {filters.categories.map((id) => (
            <Chip
              key={id}
              label={
                id === UNCATEGORIZED
                  ? "Sin categoría"
                  : (categoryNames.get(id) ?? "Categoría")
              }
              onRemove={() =>
                apply({
                  ...filters,
                  categories: filters.categories.filter((x) => x !== id),
                })
              }
            />
          ))}
          <button
            type="button"
            onClick={() => {
              setQ("");
              apply(emptyFilters);
            }}
            className="rounded-full px-2 py-1 text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Limpiar
          </button>
        </div>
      )}

      <FilterPanel
        open={open}
        onOpenChange={setOpen}
        filters={filters}
        accounts={accounts}
        categories={categories}
        onApply={(next) => {
          setOpen(false);
          apply(next);
        }}
      />
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-1 pl-2.5 pr-1 text-xs">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Quitar filtro ${label}`}
        className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

/**
 * El panel es un borrador: nada se aplica hasta «Ver movimientos». En móvil,
 * navegar en cada toque haría parpadear la lista debajo del diálogo.
 */
function FilterPanel({
  open,
  onOpenChange,
  filters,
  accounts,
  categories,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: Filters;
  accounts: FilterAccount[];
  categories: FilterCategory[];
  onApply: (next: Filters) => void;
}) {
  const [draft, setDraft] = useState(filters);

  // Al abrir, el borrador parte de lo que hay puesto.
  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  function toggle<K extends "types" | "accounts" | "categories">(
    key: K,
    value: string,
  ) {
    setDraft((d) => {
      const current = d[key] as string[];
      const next = current.includes(value)
        ? current.filter((x) => x !== value)
        : [...current, value];
      return { ...d, [key]: next };
    });
  }

  const parents = categories.filter((c) => !c.parent_id);
  const byKind = (kind: "expense" | "income") =>
    parents.filter((p) => p.kind === kind);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Filtros</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Periodo</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="desde" className="text-xs text-muted-foreground">
                  Desde
                </Label>
                <Input
                  id="desde"
                  type="date"
                  value={draft.period === "custom" ? (draft.from ?? "") : ""}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      period: "custom",
                      from: e.target.value || null,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="hasta" className="text-xs text-muted-foreground">
                  Hasta
                </Label>
                <Input
                  id="hasta"
                  type="date"
                  value={draft.period === "custom" ? (draft.to ?? "") : ""}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      period: "custom",
                      to: e.target.value || null,
                    }))
                  }
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {periodPresets
                .filter((p) => p !== "custom")
                .map((p) => (
                  <Toggle
                    key={p}
                    active={draft.period === p}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        period: p,
                        from: null,
                        to: null,
                      }))
                    }
                  >
                    {periodLabels[p]}
                  </Toggle>
                ))}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-medium">Tipo</h3>
            <div className="flex flex-wrap gap-1.5">
              {transactionTypes.map((t) => (
                <Toggle
                  key={t}
                  active={draft.types.includes(t)}
                  onClick={() => toggle("types", t)}
                >
                  {transactionTypeLabels[t]}
                </Toggle>
              ))}
            </div>
          </section>

          {accounts.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Cuenta</h3>
              <div className="flex flex-wrap gap-1.5">
                {accounts.map((a) => (
                  <Toggle
                    key={a.id}
                    active={draft.accounts.includes(a.id)}
                    onClick={() => toggle("accounts", a.id)}
                  >
                    {a.name}
                    {a.archived ? (
                      <span className="text-muted-foreground"> · archivada</span>
                    ) : null}
                  </Toggle>
                ))}
              </div>
            </section>
          ) : null}

          {categories.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Categoría</h3>
              <p className="text-xs text-muted-foreground">
                Elegir una categoría incluye sus subcategorías.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Toggle
                  active={draft.categories.includes(UNCATEGORIZED)}
                  onClick={() => toggle("categories", UNCATEGORIZED)}
                >
                  Sin categoría
                </Toggle>
              </div>
              {(["expense", "income"] as const).map((kind) =>
                byKind(kind).length ? (
                  <div key={kind} className="space-y-1.5">
                    <h4 className="text-xs text-muted-foreground">
                      {kind === "expense" ? "Gastos" : "Ingresos"}
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {byKind(kind).map((p) => {
                        const children = categories.filter(
                          (c) => c.parent_id === p.id,
                        );
                        const parentOn = draft.categories.includes(p.id);
                        return [
                          <Toggle
                            key={p.id}
                            active={parentOn}
                            onClick={() => toggle("categories", p.id)}
                          >
                            {p.name}
                          </Toggle>,
                          ...children.map((c) => (
                            <Toggle
                              key={c.id}
                              // Con el padre puesto la hija ya está dentro:
                              // se ve marcada, pero desactivada para no
                              // sugerir que quitarla la excluiría.
                              active={parentOn || draft.categories.includes(c.id)}
                              disabled={parentOn}
                              onClick={() => toggle("categories", c.id)}
                            >
                              {c.name}
                            </Toggle>
                          )),
                        ];
                      })}
                    </div>
                  </div>
                ) : null,
              )}
            </section>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setDraft({ ...emptyFilters, q: draft.q })}
          >
            Limpiar
          </Button>
          <Button type="button" onClick={() => onApply(draft)}>
            Ver movimientos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Toggle({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "bg-background text-muted-foreground hover:text-foreground",
        disabled && "opacity-60",
      )}
    >
      {children}
    </button>
  );
}
