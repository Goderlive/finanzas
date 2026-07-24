"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireHousehold } from "@/lib/auth";
import { parseAmountToCents } from "@/lib/money";
import { fail, OK, type ActionResult } from "@/lib/action-result";
import { accountFormSchema } from "./schema";

function parseForm(formData: FormData) {
  return accountFormSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    ownership: formData.get("ownership"),
    initialBalance: formData.get("initialBalance") ?? "",
  });
}

export async function createAccount(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos");
  }

  let cents = 0;
  try {
    cents = parseAmountToCents(parsed.data.initialBalance || "0");
  } catch {
    return fail("Saldo inicial inválido");
  }

  const { userId, householdId } = await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase.from("accounts").insert({
    household_id: householdId,
    owner_id: parsed.data.ownership === "personal" ? userId : null,
    name: parsed.data.name,
    type: parsed.data.type,
    initial_balance: cents,
    created_by: userId,
  });
  if (error) return fail(error.message);

  revalidatePath("/cuentas");
  revalidatePath("/");
  return OK;
}

export async function updateAccount(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Cuenta inválida");

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos");
  }

  let cents = 0;
  try {
    cents = parseAmountToCents(parsed.data.initialBalance || "0");
  } catch {
    return fail("Saldo inicial inválido");
  }

  const { userId } = await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("accounts")
    .update({
      name: parsed.data.name,
      type: parsed.data.type,
      owner_id: parsed.data.ownership === "personal" ? userId : null,
      initial_balance: cents,
    })
    .eq("id", id);
  if (error) return fail(error.message);

  revalidatePath("/cuentas");
  revalidatePath("/");
  return OK;
}

export async function setAccountArchived(
  id: string,
  archived: boolean,
): Promise<ActionResult> {
  await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("accounts")
    .update({ is_archived: archived })
    .eq("id", id);
  if (error) return fail(error.message);

  revalidatePath("/cuentas");
  revalidatePath("/");
  return OK;
}
