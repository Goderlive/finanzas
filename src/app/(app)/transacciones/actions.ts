"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireHousehold } from "@/lib/auth";
import { parseAmountToCents } from "@/lib/money";
import { fail, OK, type ActionResult } from "@/lib/action-result";
import { transactionFormSchema } from "./schema";

function parseForm(formData: FormData) {
  return transactionFormSchema.safeParse({
    type: formData.get("type"),
    amount: formData.get("amount"),
    accountId: formData.get("accountId"),
    transferAccountId: formData.get("transferAccountId") ?? undefined,
    categoryId: formData.get("categoryId") ?? undefined,
    description: formData.get("description") ?? undefined,
    occurredAt: formData.get("occurredAt"),
    msi: formData.get("msi") ?? undefined,
    msiMonths: formData.get("msiMonths") ?? undefined,
  });
}

function revalidateAll() {
  revalidatePath("/transacciones");
  revalidatePath("/cuentas");
  revalidatePath("/compromisos");
  revalidatePath("/");
}

type Prepared = {
  household_id: string;
  account_id: string;
  transfer_account_id: string | null;
  category_id: string | null;
  type: "income" | "expense" | "transfer";
  /** Ya con signo: ingreso positivo, gasto negativo. */
  amount: number;
  description: string | null;
  occurred_at: string;
  created_by: string;
};

/**
 * El formulario captura una magnitud; el signo se pone aquí, una sola vez,
 * según la regla del proyecto: `amount` es el efecto sobre el saldo de la
 * cuenta y sobre el patrimonio neto.
 */
function signedAmount(cents: number, type: Prepared["type"]): number {
  return type === "expense" ? -cents : cents;
}

type PreparedResult =
  | {
      ok: true;
      row: Prepared;
      msiMonths: number | null;
      /** Magnitud capturada, para los traspasos que van por RPC. */
      magnitude: number;
      transferTo: string | null;
    }
  | { ok: false; error: string };

async function prepare(formData: FormData): Promise<PreparedResult> {
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  let cents = 0;
  try {
    cents = parseAmountToCents(parsed.data.amount);
  } catch {
    return { ok: false, error: "Monto inválido" };
  }
  if (cents <= 0) return { ok: false, error: "El monto debe ser mayor a cero" };

  const isTransfer = parsed.data.type === "transfer";
  const transferTo =
    isTransfer && parsed.data.transferAccountId !== "none"
      ? (parsed.data.transferAccountId ?? null)
      : null;

  if (isTransfer && !transferTo) {
    return { ok: false, error: "Elige una cuenta destino" };
  }
  if (isTransfer && transferTo === parsed.data.accountId) {
    return {
      ok: false,
      error: "El origen y el destino deben ser cuentas distintas",
    };
  }

  // Un traspaso nunca lleva categoría de gasto: no es consumo, sólo mueve
  // dinero entre cuentas propias. La base lo exige además con un check.
  const categoryId =
    !isTransfer && parsed.data.categoryId && parsed.data.categoryId !== "none"
      ? parsed.data.categoryId
      : null;

  const { userId, householdId } = await requireHousehold();

  return {
    ok: true,
    msiMonths: parsed.data.msi ? parsed.data.msiMonths : null,
    magnitude: cents,
    transferTo,
    row: {
      household_id: householdId,
      account_id: parsed.data.accountId,
      transfer_account_id: transferTo,
      category_id: categoryId,
      type: parsed.data.type,
      // El asiento de origen de un traspaso sale de la cuenta: negativo.
      amount: isTransfer
        ? -cents
        : signedAmount(cents, parsed.data.type),
      description: parsed.data.description || null,
      occurred_at: parsed.data.occurredAt,
      created_by: userId,
    },
  };
}

export async function createTransaction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const prep = await prepare(formData);
  if (!prep.ok) return fail(prep.error);

  const supabase = await createClient();

  // Un traspaso son dos asientos que tienen que nacer juntos. Dos INSERT
  // sueltos desde aquí no pueden prometerlo, así que va por la función de
  // la base, que los escribe en una sola transacción.
  if (prep.row.type === "transfer") {
    const { error } = await supabase.rpc("create_transfer", {
      p_from_account: prep.row.account_id,
      p_to_account: prep.transferTo!,
      p_amount: prep.magnitude,
      p_occurred_at: prep.row.occurred_at,
      p_description: prep.row.description,
    });
    if (error) return fail(error.message);

    revalidateAll();
    return OK;
  }

  const { data, error } = await supabase
    .from("transactions")
    .insert(prep.row)
    .select("id")
    .single();
  if (error) return fail(error.message);

  if (prep.msiMonths !== null) {
    // El calendario lo genera la base (create_installment_plan): ahí viven la
    // aritmética de cortes y el reparto del centavo sobrante.
    const { error: msiError } = await supabase.rpc("create_installment_plan", {
      p_transaction_id: data.id,
      p_months: prep.msiMonths,
    });
    if (msiError) {
      // Sin plan la compra quedaría registrada como un cargo normal, que no es
      // lo que se pidió: se revierte para no dejar el dato a medias.
      await supabase.from("transactions").delete().eq("id", data.id);
      return fail(msiError.message);
    }
  }

  revalidateAll();
  return OK;
}

export async function updateTransaction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Transacción inválida");

  const prep = await prepare(formData);
  if (!prep.ok) return fail(prep.error);

  const supabase = await createClient();

  // Si la compra tiene plan MSI, su calendario se calculó a partir del monto,
  // la fecha y la tarjeta. Cambiar cualquiera de los tres lo dejaría mintiendo,
  // y regenerarlo en silencio borraría las mensualidades ya marcadas pagadas.
  const { data: plan } = await supabase
    .from("installment_plans")
    .select("id")
    .eq("transaction_id", id)
    .maybeSingle();
  if (plan) {
    const { data: before } = await supabase
      .from("transactions")
      .select("amount, occurred_at, account_id")
      .eq("id", id)
      .single();
    if (
      before &&
      (before.amount !== prep.row.amount ||
        before.occurred_at !== prep.row.occurred_at ||
        before.account_id !== prep.row.account_id)
    ) {
      return fail(
        "Esta compra está a meses sin intereses. Cancela el plan antes de cambiar el monto, la fecha o la tarjeta.",
      );
    }
  }

  // Cambiar de/a traspaso reescribiría la forma de la fila y dejaría un
  // asiento hermano huérfano o faltante. Es más honesto pedir que se borre
  // y se vuelva a capturar.
  const { data: current } = await supabase
    .from("transactions")
    .select("type, transfer_group_id, amount")
    .eq("id", id)
    .single();
  const wasTransfer = current?.type === "transfer";
  const willBeTransfer = prep.row.type === "transfer";
  if (wasTransfer !== willBeTransfer) {
    return fail(
      wasTransfer
        ? "Un traspaso no se puede convertir en gasto o ingreso. Bórralo y captúralo de nuevo."
        : "Para convertirlo en traspaso, bórralo y captúralo como traspaso.",
    );
  }

  // En un traspaso sólo se edita este asiento: el trigger
  // transactions_transfer_sync arrastra al hermano (monto, fecha,
  // descripción y contraparte). Se conserva el signo del lado que se está
  // editando para no invertir la dirección sin querer.
  const amount =
    willBeTransfer && (current?.amount ?? 0) > 0
      ? Math.abs(prep.row.amount)
      : prep.row.amount;

  // No se cambian household_id ni created_by al editar.
  const { error } = await supabase
    .from("transactions")
    .update({
      account_id: prep.row.account_id,
      transfer_account_id: prep.row.transfer_account_id,
      category_id: prep.row.category_id,
      type: prep.row.type,
      amount,
      description: prep.row.description,
      occurred_at: prep.row.occurred_at,
    })
    .eq("id", id);
  if (error) return fail(error.message);

  revalidateAll();
  return OK;
}

/**
 * Borra un movimiento. Si es un lado de un traspaso, el trigger
 * `transactions_transfer_delete` se lleva también al hermano: no puede
 * quedar medio traspaso.
 */
export async function deleteTransaction(id: string): Promise<ActionResult> {
  await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) return fail(error.message);

  revalidateAll();
  return OK;
}

/** Descripciones previas para autocompletar (más recientes, sin repetir). */
export async function getDescriptionSuggestions(
  query: string,
): Promise<string[]> {
  await requireHousehold();
  const supabase = await createClient();

  let q = supabase
    .from("transactions")
    .select("description, occurred_at")
    .not("description", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(60);
  if (query.trim()) q = q.ilike("description", `%${query.trim()}%`);

  const { data } = await q;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of data ?? []) {
    const d = (r.description ?? "").trim();
    const key = d.toLowerCase();
    if (d && !seen.has(key)) {
      seen.add(key);
      out.push(d);
    }
    if (out.length >= 8) break;
  }
  return out;
}
