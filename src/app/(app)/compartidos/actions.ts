"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireHousehold } from "@/lib/auth";
import { parseAmountToCents } from "@/lib/money";
import { fail, OK, type ActionResult } from "@/lib/action-result";
import { sharedExpenseSchema, settlementSchema } from "./schema";

function revalidateShared() {
  revalidatePath("/compartidos");
  revalidatePath("/");
}

/** Calcula lo que le toca a cada uno (en centavos), sumando exactamente el total. */
function computeOwed(
  splitType: "equal" | "percentage" | "fixed",
  total: number,
  v0?: string,
  v1?: string,
): { ok: true; owed0: number; owed1: number } | { ok: false; error: string } {
  if (splitType === "equal") {
    const owed0 = Math.floor(total / 2);
    return { ok: true, owed0, owed1: total - owed0 };
  }

  if (splitType === "percentage") {
    const p0 = Number(v0);
    const p1 = Number(v1);
    if (!Number.isFinite(p0) || !Number.isFinite(p1) || p0 < 0 || p1 < 0) {
      return { ok: false, error: "Porcentajes inválidos" };
    }
    if (Math.round(p0 + p1) !== 100) {
      return { ok: false, error: "Los porcentajes deben sumar 100%" };
    }
    const owed0 = Math.round((total * p0) / 100);
    return { ok: true, owed0, owed1: total - owed0 };
  }

  // fixed
  let a0 = 0;
  let a1 = 0;
  try {
    a0 = parseAmountToCents(v0 || "0");
    a1 = parseAmountToCents(v1 || "0");
  } catch {
    return { ok: false, error: "Montos inválidos" };
  }
  if (a0 + a1 !== total) {
    return { ok: false, error: "Los montos fijos deben sumar el total" };
  }
  return { ok: true, owed0: a0, owed1: a1 };
}

export async function createSharedExpense(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = sharedExpenseSchema.safeParse({
    description: formData.get("description"),
    amount: formData.get("amount"),
    paidBy: formData.get("paidBy"),
    splitType: formData.get("splitType"),
    p0: formData.get("p0"),
    v0: formData.get("v0") ?? undefined,
    p1: formData.get("p1"),
    v1: formData.get("v1") ?? undefined,
    occurredAt: formData.get("occurredAt"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos");
  }

  const d = parsed.data;
  if (d.paidBy !== d.p0 && d.paidBy !== d.p1) {
    return fail("Quien pagó debe ser un miembro del hogar");
  }

  let total = 0;
  try {
    total = parseAmountToCents(d.amount);
  } catch {
    return fail("Monto inválido");
  }
  if (total <= 0) return fail("El monto debe ser mayor a cero");

  const split = computeOwed(d.splitType, total, d.v0, d.v1);
  if (!split.ok) return fail(split.error);

  const { userId, householdId } = await requireHousehold();
  const supabase = await createClient();

  const { data: expense, error: expErr } = await supabase
    .from("shared_expenses")
    .insert({
      household_id: householdId,
      description: d.description,
      amount: total,
      paid_by: d.paidBy,
      split_type: d.splitType,
      occurred_at: d.occurredAt,
      created_by: userId,
    })
    .select("id")
    .single();
  if (expErr || !expense) return fail(expErr?.message ?? "No se pudo crear");

  const { error: splitErr } = await supabase
    .from("shared_expense_splits")
    .insert([
      { shared_expense_id: expense.id, profile_id: d.p0, owed_amount: split.owed0 },
      { shared_expense_id: expense.id, profile_id: d.p1, owed_amount: split.owed1 },
    ]);
  if (splitErr) {
    // Compensación: evitar dejar un gasto sin reparto.
    await supabase.from("shared_expenses").delete().eq("id", expense.id);
    return fail(splitErr.message);
  }

  revalidateShared();
  return OK;
}

export async function createSettlement(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = settlementSchema.safeParse({
    fromProfile: formData.get("fromProfile"),
    toProfile: formData.get("toProfile"),
    amount: formData.get("amount"),
    settledAt: formData.get("settledAt"),
    note: formData.get("note") ?? undefined,
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

  const { userId, householdId } = await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase.from("settlements").insert({
    household_id: householdId,
    from_profile: parsed.data.fromProfile,
    to_profile: parsed.data.toProfile,
    amount: cents,
    settled_at: parsed.data.settledAt,
    note: parsed.data.note || null,
    created_by: userId,
  });
  if (error) return fail(error.message);

  revalidateShared();
  return OK;
}

export async function deleteSharedExpense(id: string): Promise<ActionResult> {
  await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("shared_expenses")
    .delete()
    .eq("id", id);
  if (error) return fail(error.message);
  revalidateShared();
  return OK;
}

export async function deleteSettlement(id: string): Promise<ActionResult> {
  await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase.from("settlements").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidateShared();
  return OK;
}
