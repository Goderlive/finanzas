"use client";

import {
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type {
  Tables,
  TransactionType,
} from "@/lib/supabase/database.types";
import { formatMoney, parseAmountToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TransactionForm,
  type FormAccount,
  type FormCategory,
} from "./transaction-form";
import { createTransaction, deleteTransaction } from "./actions";

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

type OptimisticAction =
  | { kind: "add"; item: Display }
  | { kind: "remove"; id: string };

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
}) {
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
        accountName: accountNames[t.account_id] ?? "—",
        categoryName: t.category_id
          ? (categoryNames[t.category_id] ?? null)
          : null,
        transferName: t.transfer_account_id
          ? (accountNames[t.transfer_account_id] ?? null)
          : null,
        createdByName: memberNames[t.created_by] ?? "",
        pending: false,
      })),
    [transactions, accountNames, categoryNames, memberNames],
  );

  const [items, dispatch] = useOptimistic(
    base,
    (state: Display[], action: OptimisticAction) =>
      action.kind === "add"
        ? [action.item, ...state]
        : state.filter((d) => d.id !== action.id),
  );

  const [editing, setEditing] = useState<Tables<"transactions"> | null>(null);
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  async function quickAdd(formData: FormData) {
    const accountId = String(formData.get("accountId") ?? "");
    const categoryId = String(formData.get("categoryId") ?? "none");
    const type = String(formData.get("type") ?? "expense") as TransactionType;
    let amount = 0;
    try {
      amount = parseAmountToCents(String(formData.get("amount") ?? ""));
    } catch {
      /* validado en el servidor */
    }

    dispatch({
      kind: "add",
      item: {
        id: `temp-${Date.now()}`,
        type,
        amount,
        description: null,
        occurred_at: defaultDate,
        accountName: accountNames[accountId] ?? "—",
        categoryName: categoryId !== "none" ? (categoryNames[categoryId] ?? null) : null,
        transferName: null,
        createdByName: memberNames[currentUserId] ?? "",
        pending: true,
      },
    });

    const res = await createTransaction({ ok: false }, formData);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo guardar");
    } else {
      toast.success("Guardado");
      formRef.current?.reset();
    }
  }

  function remove(id: string) {
    startTransition(async () => {
      dispatch({ kind: "remove", id });
      const res = await deleteTransaction(id);
      if (!res.ok) toast.error(res.error ?? "No se pudo eliminar");
      else toast.success("Movimiento eliminado");
    });
  }

  const groups = useMemo(() => groupByDate(items), [items]);

  return (
    <div className="space-y-6">
      <QuickAdd
        formRef={formRef}
        accounts={accounts}
        categories={categories}
        defaultDate={defaultDate}
        onSubmit={quickAdd}
      />

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aún no hay movimientos. Agrega el primero arriba.
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
          {formatMoney(item.amount, currency)}
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

function QuickAdd({
  formRef,
  accounts,
  categories,
  defaultDate,
  onSubmit,
}: {
  formRef: React.RefObject<HTMLFormElement | null>;
  accounts: FormAccount[];
  categories: FormCategory[];
  defaultDate: string;
  onSubmit: (formData: FormData) => void | Promise<void>;
}) {
  const [type, setType] = useState<TransactionType>("expense");
  const [categoryId, setCategoryId] = useState("none");

  if (accounts.length === 0) return null;

  const catOptions = categories
    .filter((c) => c.kind === type && !c.parent_id)
    .flatMap((p) => [
      { id: p.id, label: p.name },
      ...categories
        .filter((c) => c.parent_id === p.id)
        .map((c) => ({ id: c.id, label: `— ${c.name}` })),
    ]);

  return (
    <form
      ref={formRef}
      action={onSubmit}
      className="space-y-3 rounded-xl border bg-card p-3"
    >
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="occurredAt" value={defaultDate} />

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {(["expense", "income"] as const).map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => {
              setType(t);
              setCategoryId("none");
            }}
            className={cn(
              "rounded-md py-1.5 text-sm font-medium transition-colors",
              type === t
                ? "bg-background shadow-sm"
                : "text-muted-foreground",
            )}
          >
            {t === "expense" ? "Gasto" : "Ingreso"}
          </button>
        ))}
      </div>

      <Input
        name="amount"
        inputMode="decimal"
        placeholder="0.00"
        className="h-11 text-xl"
        required
      />

      <div className="grid grid-cols-2 gap-2">
        <Select name="accountId" defaultValue={accounts[0]?.id}>
          <SelectTrigger aria-label="Cuenta">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select name="categoryId" value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger aria-label="Categoría">
            <SelectValue placeholder="Sin categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin categoría</SelectItem>
            {catOptions.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" className="w-full">
        Agregar
      </Button>
    </form>
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
