"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireHousehold } from "@/lib/auth";
import { parseAmountToCents } from "@/lib/money";
import { fail, OK, type ActionResult } from "@/lib/action-result";
import { budgetFormSchema } from "./schema";

function revalidateBudgets() {
  revalidatePath("/presupuestos");
  revalidatePath("/");
}

export async function createBudget(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = budgetFormSchema.safeParse({
    categoryId: formData.get("categoryId"),
    amount: formData.get("amount"),
    month: formData.get("month"),
    rollover: formData.get("rollover") ?? undefined,
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
  if (cents < 0) return fail("El monto no puede ser negativo");

  const { userId, householdId } = await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase.from("budgets").insert({
    household_id: householdId,
    category_id: parsed.data.categoryId,
    month: parsed.data.month,
    amount: cents,
    rollover: parsed.data.rollover === "on",
    created_by: userId,
  });
  if (error) {
    if (error.code === "23505") {
      return fail("Ya existe un presupuesto para esa categoría este mes");
    }
    return fail(error.message);
  }

  revalidateBudgets();
  return OK;
}

export async function updateBudget(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Presupuesto inválido");

  const amountRaw = String(formData.get("amount") ?? "");
  let cents = 0;
  try {
    cents = parseAmountToCents(amountRaw);
  } catch {
    return fail("Monto inválido");
  }
  if (cents < 0) return fail("El monto no puede ser negativo");

  await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("budgets")
    .update({ amount: cents, rollover: formData.get("rollover") === "on" })
    .eq("id", id);
  if (error) return fail(error.message);

  revalidateBudgets();
  return OK;
}

export async function deleteBudget(id: string): Promise<ActionResult> {
  await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase.from("budgets").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidateBudgets();
  return OK;
}
