"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireHousehold } from "@/lib/auth";
import { parseAmountToCents } from "@/lib/money";
import { fail, type ActionResult } from "@/lib/action-result";
import type { CardPaymentResult } from "@/lib/supabase/database.types";
import { cardPaymentSchema } from "./schema";

export type PaymentActionResult = ActionResult & {
  /** Desglose del pago cuando salió bien, para el mensaje de confirmación. */
  breakdown?: CardPaymentResult;
};

function revalidateAll() {
  revalidatePath("/cuentas");
  revalidatePath("/transacciones");
  revalidatePath("/compromisos");
  revalidatePath("/");
}

/**
 * Pagar una tarjeta desde otra cuenta.
 *
 * Es una acción propia y no el traspaso genérico a propósito: además de mover
 * el dinero tiene que repartirlo contra el ciclo (MSI vencidas > saldo del
 * corte > periodo en curso) y marcar las mensualidades cubiertas. Todo eso
 * vive en `pay_credit_card`, del lado de la base, para que los dos asientos y
 * el marcado ocurran en una sola transacción.
 */
export async function payCreditCard(
  _prev: PaymentActionResult,
  formData: FormData,
): Promise<PaymentActionResult> {
  const parsed = cardPaymentSchema.safeParse({
    fromAccountId: formData.get("fromAccountId"),
    cardId: formData.get("cardId"),
    amount: formData.get("amount"),
    occurredAt: formData.get("occurredAt"),
    description: formData.get("description") ?? undefined,
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos");
  }

  let cents = 0;
  try {
    cents = parseAmountToCents(parsed.data.amount);
  } catch {
    return fail("Monto inválido");
  }
  if (cents <= 0) return fail("El monto debe ser mayor a cero");

  await requireHousehold();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("pay_credit_card", {
    p_from_account: parsed.data.fromAccountId,
    p_card: parsed.data.cardId,
    p_amount: cents,
    p_occurred_at: parsed.data.occurredAt,
    p_description: parsed.data.description || null,
  });
  if (error) return fail(error.message);

  revalidateAll();
  return { ok: true, breakdown: data as CardPaymentResult };
}

/**
 * Traspaso genérico entre dos cuentas. Pasa por `create_transfer` para que
 * los dos asientos nazcan juntos o no nazca ninguno.
 */
export async function createTransfer(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const fromAccountId = String(formData.get("fromAccountId") ?? "");
  const toAccountId = String(formData.get("toAccountId") ?? "");
  const occurredAt = String(formData.get("occurredAt") ?? "");
  const description = String(formData.get("description") ?? "");

  if (!fromAccountId || !toAccountId) return fail("Elige ambas cuentas");
  if (fromAccountId === toAccountId) {
    return fail("El origen y el destino deben ser cuentas distintas");
  }
  if (!occurredAt) return fail("Selecciona una fecha");

  let cents = 0;
  try {
    cents = parseAmountToCents(String(formData.get("amount") ?? ""));
  } catch {
    return fail("Monto inválido");
  }
  if (cents <= 0) return fail("El monto debe ser mayor a cero");

  await requireHousehold();
  const supabase = await createClient();

  const { error } = await supabase.rpc("create_transfer", {
    p_from_account: fromAccountId,
    p_to_account: toAccountId,
    p_amount: cents,
    p_occurred_at: occurredAt,
    p_description: description || null,
  });
  if (error) return fail(error.message);

  revalidateAll();
  return { ok: true };
}
