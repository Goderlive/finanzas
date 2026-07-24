"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireHousehold } from "@/lib/auth";
import { parseAmountToCents } from "@/lib/money";
import { fail, OK, type ActionResult } from "@/lib/action-result";
import { debtFormSchema } from "./schema";

function parseDay(v?: string): number | null {
  if (!v || !v.trim()) return null;
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n) || n < 1 || n > 31) return null;
  return n;
}

function revalidateDebts() {
  revalidatePath("/deudas");
  revalidatePath("/");
}

type Prepared = {
  owner_id: string | null;
  name: string;
  type: "loan" | "credit_card" | "mortgage" | "other";
  principal: number;
  current_balance: number;
  interest_rate: number;
  minimum_payment: number;
  statement_day: number | null;
  due_day: number | null;
};

function prepare(
  formData: FormData,
  userId: string,
): { ok: true; row: Prepared } | { ok: false; error: string } {
  const parsed = debtFormSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    ownership: formData.get("ownership"),
    principal: formData.get("principal") ?? undefined,
    currentBalance: formData.get("currentBalance"),
    interestRate: formData.get("interestRate") ?? undefined,
    minimumPayment: formData.get("minimumPayment") ?? undefined,
    statementDay: formData.get("statementDay") ?? undefined,
    dueDay: formData.get("dueDay") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const d = parsed.data;
  let current = 0;
  let principal = 0;
  let minPay = 0;
  try {
    current = parseAmountToCents(d.currentBalance);
    principal = d.principal ? parseAmountToCents(d.principal) : current;
    minPay = d.minimumPayment ? parseAmountToCents(d.minimumPayment) : 0;
  } catch {
    return { ok: false, error: "Monto inválido" };
  }
  if (current < 0 || principal < 0 || minPay < 0) {
    return { ok: false, error: "Los montos no pueden ser negativos" };
  }

  const ratePct = d.interestRate ? Number(d.interestRate) : 0;
  if (!Number.isFinite(ratePct) || ratePct < 0) {
    return { ok: false, error: "Tasa inválida" };
  }

  return {
    ok: true,
    row: {
      owner_id: d.ownership === "personal" ? userId : null,
      name: d.name,
      type: d.type,
      principal,
      current_balance: current,
      interest_rate: ratePct / 100,
      minimum_payment: minPay,
      statement_day: parseDay(d.statementDay),
      due_day: parseDay(d.dueDay),
    },
  };
}

export async function createDebt(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { userId, householdId } = await requireHousehold();
  const prep = prepare(formData, userId);
  if (!prep.ok) return fail(prep.error);

  const supabase = await createClient();
  const { error } = await supabase.from("debts").insert({
    household_id: householdId,
    created_by: userId,
    ...prep.row,
  });
  if (error) return fail(error.message);

  revalidateDebts();
  return OK;
}

export async function updateDebt(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Deuda inválida");

  const { userId } = await requireHousehold();
  const prep = prepare(formData, userId);
  if (!prep.ok) return fail(prep.error);

  const supabase = await createClient();
  const { error } = await supabase.from("debts").update(prep.row).eq("id", id);
  if (error) return fail(error.message);

  revalidateDebts();
  return OK;
}

export async function deleteDebt(id: string): Promise<ActionResult> {
  await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase.from("debts").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidateDebts();
  return OK;
}
