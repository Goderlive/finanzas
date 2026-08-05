"use client";

import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { flushQueue, getQueued } from "@/lib/offline/transactions";
import type { Tables, TransactionType } from "@/lib/supabase/database.types";
import { formatMoney, formatMoneyAbs } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  TransactionForm,
  type FormAccount,
  type FormCategory,
} from "./transaction-form";
import { deleteTransaction } from "./actions";

/** Cuántas filas se pintan de golpe. El resto entra con «Mostrar más». */
const PAGE_SIZE = 100;

type Display = {
  id: string;
  type: TransactionType;
  amount: number;
  description: string | null;
  occurred_at: string;
  accountName: string;
  categoryName: string | null;
  transferName: string | null;
  createdByName: string;
  pending: boolean;
};

export type Totals = {
  /** Con signo natural: ingresos positivos, gastos como magnitud. */
  income: number;
  expense: number;
  count: number;
};

export function TransactionsView({
  transactions,
  accounts,
  categories,
  accountNames,
  categoryNames,
  memberNames,
  currency,
  defaultDate,
  currentUserId,
  householdId,
  totals,
  truncated,
}: {
  transactions: Tables<"transactions">[];
  accounts: FormAccount[];
  categories: FormCategory[];
  accountNames: Record<string, string>;
  categoryNames: Record<string, string>;
  memberNames: Record<string, string>;
  currency: string;
  defaultDate: string;
  currentUserId: string;
  householdId: string;
  totals: Totals;
  truncated: boolean;
}) {
  const router = useRouter();
  const rawById = useMemo(
    () => new Map(transactions.map((t) => [t.id, t])),
    [transactions],
  );

  const base: Display[] = useMemo(
    () =>
      transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        description: t.description,
        occurred_at: t.occurred_at,
        // En un traspaso el asiento que sale (amount < 0) tiene el origen en
        // `account_id`; el que entra lo tiene al revés. Se normaliza aquí para
        // que la fila siempre se lea «de dónde → a dónde».
        accountName:
          t.type === "transfer" && t.amount > 0 && t.transfer_account_id
            ? (accountNames[t.transfer_account_id] ?? "—")
            : (accountNames[t.account_id] ?? "—"),
        categoryName: t.category_id
          ? (categoryNames[t.category_id] ?? null)
          : null,
        transferName:
          t.type === "transfer" && t.amount > 0
            ? (accountNames[t.account_id] ?? null)
            : t.transfer_account_id
              ? (accountNames[t.transfer_account_id] ?? null)
              : null,
        createdByName: memberNames[t.created_by] ?? "",
        pending: false,
      })),
    [transactions, accountNames, categoryNames, memberNames],
  );

  const [items, removeItem] = useOptimistic(base, (state: Display[], id: string) =>
    state.filter((d) => d.id !== id),
  );

  const [editing, setEditing] = useState<Tables<"transactions"> | null>(null);
  const [, startTransition] = useTransition();
  const [queued, setQueued] = useState<Display[]>([]);
  const [limit, setLimit] = useState(PAGE_SIZE);

  // Cada vez que cambia el filtro se vuelve a empezar por arriba.
  useEffect(() => setLimit(PAGE_SIZE), [transactions]);

  // Sincroniza la cola offline al montar y al reconectar; guarda un cache
  // ligero para la página offline.
  useEffect(() => {
    try {
      localStorage.setItem(
        "finanzas-offline-cache",
        JSON.stringify({
          accounts,
          categories,
          householdId,
          currentUserId,
          defaultDate,
        }),
      );
    } catch {
      /* localStorage puede fallar en modo privado */
    }

    let active = true;
    async function loadQueued() {
      const q = await getQueued();
      if (!active) return;
      setQueued(
        q.map((it) => ({
          id: it.id,
          type: it.payload.type,
          amount: it.payload.amount,
          description: it.payload.description ?? null,
          occurred_at: it.payload.occurred_at ?? defaultDate,
          accountName: accountNames[it.payload.account_id] ?? "—",
          categoryName: it.payload.category_id
            ? (categoryNames[it.payload.category_id] ?? null)
            : null,
          transferName: it.payload.transfer_account_id
            ? (accountNames[it.payload.transfer_account_id] ?? null)
            : null,
          createdByName: memberNames[it.payload.created_by] ?? "",
          pending: true,
        })),
      );
    }
    async function sync() {
      if (navigator.onLine) {
        const n = await flushQueue();
        if (n > 0) {
          toast.success(
            `${n} movimiento${n === 1 ? "" : "s"} sincronizado${n === 1 ? "" : "s"}`,
          );
          router.refresh();
        }
      }
      await loadQueued();
    }
    sync();
    window.addEventListener("online", sync);
    return () => {
      active = false;
      window.removeEventListener("online", sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions]);

  function remove(id: string) {
    startTransition(async () => {
      removeItem(id);
      const res = await deleteTransaction(id);
      if (!res.ok) toast.error(res.error ?? "No se pudo eliminar");
      else toast.success("Movimiento eliminado");
    });
  }

  // Los pendientes de la cola offline van siempre arriba: son de este
  // dispositivo y todavía no existen para el filtro.
  const all = useMemo(() => [...queued, ...items], [items, queued]);
  const groups = useMemo(() => groupByDate(all.slice(0, limit)), [all, limit]);
  const hidden = all.length - Math.min(limit, all.length);

  return (
    <div className="space-y-4">
      <TotalsBar totals={totals} currency={currency} />

      {truncated ? (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          Hay más movimientos de los que caben en una consulta. Los totales
          cubren sólo los que se muestran: acota el periodo para verlos todos.
        </p>
      ) : null}

      {all.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No hay movimientos con estos filtros.
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.date} className="space-y-2">
              <h2 className="text-xs font-medium text-muted-foreground">
                {dateHeader(g.date, defaultDate)}
              </h2>
              <div className="space-y-1">
                {g.items.map((it) => (
                  <Row
                    key={it.id}
                    item={it}
                    currency={currency}
                    onEdit={() => {
                      const raw = rawById.get(it.id);
                      if (raw) setEditing(raw);
                    }}
                    onDelete={() => remove(it.id)}
                  />
                ))}
              </div>
            </section>
          ))}

          {hidden > 0 ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setLimit((n) => n + PAGE_SIZE)}
            >
              Mostrar {Math.min(hidden, PAGE_SIZE)} más
            </Button>
          ) : null}
        </div>
      )}

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(o) => !o && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar movimiento</DialogTitle>
          </DialogHeader>
          {editing ? (
            <TransactionForm
              accounts={accounts}
              categories={categories}
              transaction={editing}
              defaultDate={defaultDate}
              onDone={() => setEditing(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Filtrar sin ver el total deja el trabajo a medias. Los traspasos no entran
 * en ninguna de las tres cifras: mueven dinero entre cuentas propias.
 */
function TotalsBar({ totals, currency }: { totals: Totals; currency: string }) {
  const net = totals.income - totals.expense;

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Total
          label="Ingresos"
          value={formatMoney(totals.income, currency)}
          className="text-emerald-600 dark:text-emerald-400"
        />
        <Total label="Gastos" value={formatMoney(totals.expense, currency)} />
        <Total
          label="Neto"
          value={`${net < 0 ? "−" : ""}${formatMoneyAbs(net, currency)}`}
          className={
            net < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
          }
        />
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {totals.count} movimiento{totals.count === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function Total({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("truncate font-semibold tabular-nums", className)}>
        {value}
      </div>
    </div>
  );
}

function Row({
  item,
  currency,
  onEdit,
  onDelete,
}: {
  item: Display;
  currency: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  // `amount` ya viene con signo desde la base; aquí sólo se elige el símbolo
  // y se muestra la magnitud.
  const sign =
    item.type === "income" ? "+" : item.type === "expense" ? "-" : "";
  const amountColor =
    item.type === "income"
      ? "text-emerald-600 dark:text-emerald-400"
      : item.type === "transfer"
        ? "text-muted-foreground"
        : "text-foreground";

  const subtitle =
    item.type === "transfer"
      ? `${item.accountName} → ${item.transferName ?? "—"}`
      : `${item.categoryName ?? "Sin categoría"} · ${item.accountName}`;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg border p-3",
        item.pending && "opacity-60",
      )}
    >
      <div className="min-w-0">
        <div className="truncate font-medium">
          {item.description || subtitle}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {item.description ? subtitle : item.createdByName}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <span className={cn("font-medium tabular-nums", amountColor)}>
          {sign}
          {formatMoneyAbs(item.amount, currency)}
        </span>
        {item.pending ? (
          <span className="w-8" />
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Acciones">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-4 w-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

function groupByDate(items: Display[]): { date: string; items: Display[] }[] {
  const groups: { date: string; items: Display[] }[] = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === it.occurred_at) last.items.push(it);
    else groups.push({ date: it.occurred_at, items: [it] });
  }
  return groups;
}

function dateHeader(dateStr: string, today: string): string {
  if (dateStr === today) return "Hoy";
  const d = new Date(`${dateStr}T00:00:00`);
  const t = new Date(`${today}T00:00:00`);
  const diffDays = Math.round((t.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 1) return "Ayer";
  return d.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
