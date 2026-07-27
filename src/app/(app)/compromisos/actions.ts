"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireHousehold } from "@/lib/auth";
import { fail, OK, type ActionResult } from "@/lib/action-result";

function revalidateAll() {
  revalidatePath("/compromisos");
  revalidatePath("/transacciones");
  revalidatePath("/cuentas");
  revalidatePath("/");
}

/**
 * Marca una mensualidad como pagada (o la revierte). `remaining_months` y el
 * estado del plan los mantiene el trigger `installment_payments_sync`.
 */
export async function setInstallmentPaid(
  id: string,
  paid: boolean,
  dueDate: string,
): Promise<ActionResult> {
  await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("installment_payments")
    .update({ is_paid: paid, paid_at: paid ? dueDate : null })
    .eq("id", id);
  if (error) return fail(error.message);

  revalidateAll();
  return OK;
}

/**
 * Cancela un plan MSI y borra su calendario. La compra original NO se toca:
 * sigue siendo el gasto real de esa fecha y categoría.
 */
export async function cancelInstallmentPlan(id: string): Promise<ActionResult> {
  await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("installment_plans")
    .delete()
    .eq("id", id);
  if (error) return fail(error.message);

  revalidateAll();
  return OK;
}

/** Cambia el umbral de alerta de MSI sobre el ingreso mensual del hogar. */
export async function setMsiAlertPct(pct: number): Promise<ActionResult> {
  if (!Number.isFinite(pct) || pct < 0 || pct > 1) {
    return fail("El umbral debe estar entre 0% y 100%");
  }
  const { householdId } = await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("households")
    .update({ msi_alert_pct: pct })
    .eq("id", householdId);
  if (error) return fail(error.message);

  revalidateAll();
  return OK;
}
