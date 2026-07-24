import { createClient } from "@/lib/supabase/client";
import type { TablesInsert } from "@/lib/supabase/database.types";
import { idbDelete, idbGetAll, idbPut } from "./db";

export type QueuedTransaction = {
  id: string;
  payload: TablesInsert<"transactions">;
  createdAt: number;
};

export async function enqueueTransaction(
  payload: TablesInsert<"transactions">,
): Promise<void> {
  await idbPut<QueuedTransaction>({
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    payload,
    createdAt: Date.now(),
  });
}

export async function getQueued(): Promise<QueuedTransaction[]> {
  try {
    const items = await idbGetAll<QueuedTransaction>();
    return items.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

/**
 * Inserta las transacciones en cola vía el cliente de navegador (respeta RLS
 * con la sesión del usuario). Devuelve cuántas se sincronizaron.
 * Se detiene al primer error (p.ej. sigue offline) para reintentar luego.
 */
export async function flushQueue(): Promise<number> {
  const items = await getQueued();
  if (items.length === 0) return 0;

  const supabase = createClient();
  let synced = 0;
  // Más antiguas primero para conservar el orden.
  for (const item of [...items].reverse()) {
    const { error } = await supabase.from("transactions").insert(item.payload);
    if (error) break;
    await idbDelete(item.id);
    synced += 1;
  }
  return synced;
}
