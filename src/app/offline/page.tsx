"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { WifiOff } from "lucide-react";
import { toast } from "sonner";
import { parseAmountToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { enqueueTransaction, getQueued } from "@/lib/offline/transactions";

type OfflineCache = {
  accounts: { id: string; name: string }[];
  categories: {
    id: string;
    name: string;
    kind: "income" | "expense";
    parent_id: string | null;
  }[];
  householdId: string;
  currentUserId: string;
  defaultDate: string;
};

export default function OfflinePage() {
  const [cache, setCache] = useState<OfflineCache | null>(null);
  const [pending, setPending] = useState(0);
  const [type, setType] = useState<"expense" | "income">("expense");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("none");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("finanzas-offline-cache");
      if (raw) {
        const c = JSON.parse(raw) as OfflineCache;
        setCache(c);
        setAccountId(c.accounts[0]?.id ?? "");
      }
    } catch {
      /* sin cache */
    }
    getQueued().then((q) => setPending(q.length));
    // Si vuelve la conexión, ir a la app.
    const back = () => {
      window.location.href = "/transacciones";
    };
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  }, []);

  const catOptions = (cache?.categories ?? [])
    .filter((c) => c.kind === type && !c.parent_id)
    .flatMap((p) => [
      { id: p.id, label: p.name },
      ...(cache?.categories ?? [])
        .filter((c) => c.parent_id === p.id)
        .map((c) => ({ id: c.id, label: `— ${c.name}` })),
    ]);

  async function submit(formData: FormData) {
    if (!cache) return;
    let amount = 0;
    try {
      amount = parseAmountToCents(String(formData.get("amount") ?? ""));
    } catch {
      toast.error("Monto inválido");
      return;
    }
    if (amount <= 0) return;

    await enqueueTransaction({
      household_id: cache.householdId,
      account_id: accountId,
      transfer_account_id: null,
      category_id: categoryId !== "none" ? categoryId : null,
      type,
      // El signo va aquí, igual que en el servidor: gasto en negativo.
      amount: type === "expense" ? -amount : amount,
      description: null,
      occurred_at: cache.defaultDate,
      created_by: cache.currentUserId,
    });
    setPending((n) => n + 1);
    formRef.current?.reset();
    toast.message("Guardado offline. Se sincronizará al reconectar.");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <WifiOff className="h-5 w-5" />
        <span className="text-sm">Sin conexión</span>
      </div>

      {cache ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Captura rápida offline</CardTitle>
            <CardDescription>
              Se guarda en tu dispositivo y se sincroniza al reconectar.
              {pending > 0 ? ` (${pending} en cola)` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form ref={formRef} action={submit} className="space-y-3">
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
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger aria-label="Cuenta">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cache.accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={categoryId} onValueChange={setCategoryId}>
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
                Guardar offline
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Estás sin conexión</CardTitle>
            <CardDescription>
              Abre la app con conexión al menos una vez para habilitar la
              captura offline.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Button asChild variant="outline">
        <Link href="/transacciones">Reintentar</Link>
      </Button>
    </main>
  );
}
