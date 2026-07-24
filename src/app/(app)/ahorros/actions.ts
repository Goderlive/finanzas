"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireHousehold } from "@/lib/auth";
import { parseAmountToCents } from "@/lib/money";
import { fail, OK, type ActionResult } from "@/lib/action-result";
import { savingsGoalSchema } from "./schema";

function revalidateGoals() {
  revalidatePath("/ahorros");
  revalidatePath("/");
}

function parseForm(formData: FormData) {
  return savingsGoalSchema.safeParse({
    name: formData.get("name"),
    ownership: formData.get("ownership"),
    targetAmount: formData.get("targetAmount"),
    currentAmount: formData.get("currentAmount") ?? undefined,
    targetDate: formData.get("targetDate") ?? undefined,
  });
}

export async function createGoal(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos");
  }

  let target = 0;
  let current = 0;
  try {
    target = parseAmountToCents(parsed.data.targetAmount);
    current = parsed.data.currentAmount
      ? parseAmountToCents(parsed.data.currentAmount)
      : 0;
  } catch {
    return fail("Monto inválido");
  }
  if (target <= 0) return fail("La meta debe ser mayor a cero");
  if (current < 0) return fail("El monto actual no puede ser negativo");

  const { userId, householdId } = await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase.from("savings_goals").insert({
    household_id: householdId,
    owner_id: parsed.data.ownership === "personal" ? userId : null,
    name: parsed.data.name,
    target_amount: target,
    current_amount: current,
    target_date: parsed.data.targetDate || null,
    created_by: userId,
  });
  if (error) return fail(error.message);

  revalidateGoals();
  return OK;
}

export async function updateGoal(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Meta inválida");

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos");
  }

  let target = 0;
  let current = 0;
  try {
    target = parseAmountToCents(parsed.data.targetAmount);
    current = parsed.data.currentAmount
      ? parseAmountToCents(parsed.data.currentAmount)
      : 0;
  } catch {
    return fail("Monto inválido");
  }
  if (target <= 0) return fail("La meta debe ser mayor a cero");

  const { userId } = await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("savings_goals")
    .update({
      name: parsed.data.name,
      owner_id: parsed.data.ownership === "personal" ? userId : null,
      target_amount: target,
      current_amount: current,
      target_date: parsed.data.targetDate || null,
    })
    .eq("id", id);
  if (error) return fail(error.message);

  revalidateGoals();
  return OK;
}

export async function contributeGoal(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Meta inválida");

  let amount = 0;
  try {
    amount = parseAmountToCents(String(formData.get("amount") ?? ""));
  } catch {
    return fail("Monto inválido");
  }
  if (amount === 0) return fail("Escribe un monto");

  await requireHousehold();
  const supabase = await createClient();
  const { data: goal, error: readErr } = await supabase
    .from("savings_goals")
    .select("current_amount")
    .eq("id", id)
    .single();
  if (readErr || !goal) return fail(readErr?.message ?? "Meta no encontrada");

  const next = Math.max(0, goal.current_amount + amount);
  const { error } = await supabase
    .from("savings_goals")
    .update({ current_amount: next })
    .eq("id", id);
  if (error) return fail(error.message);

  revalidateGoals();
  return OK;
}

export async function deleteGoal(id: string): Promise<ActionResult> {
  await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase.from("savings_goals").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidateGoals();
  return OK;
}
