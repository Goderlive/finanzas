"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireHousehold } from "@/lib/auth";
import { parseAmountToCents } from "@/lib/money";
import { fail, OK, type ActionResult } from "@/lib/action-result";
import { investmentSchema, priceSchema } from "./schema";

function revalidateInv() {
  revalidatePath("/inversiones");
  revalidatePath("/");
}

function parseForm(formData: FormData) {
  return investmentSchema.safeParse({
    symbol: formData.get("symbol"),
    name: formData.get("name") ?? undefined,
    ownership: formData.get("ownership"),
    quantity: formData.get("quantity"),
    purchasePrice: formData.get("purchasePrice"),
    purchaseDate: formData.get("purchaseDate") ?? undefined,
  });
}

function prepared(formData: FormData) {
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const qty = Number(parsed.data.quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false as const, error: "Cantidad inválida" };
  }
  let price = 0;
  try {
    price = parseAmountToCents(parsed.data.purchasePrice);
  } catch {
    return { ok: false as const, error: "Precio inválido" };
  }
  return { ok: true as const, data: parsed.data, qty, price };
}

export async function createInvestment(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const p = prepared(formData);
  if (!p.ok) return fail(p.error);

  const { userId, householdId } = await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase.from("investments").insert({
    household_id: householdId,
    owner_id: p.data.ownership === "personal" ? userId : null,
    symbol: p.data.symbol.toUpperCase(),
    name: p.data.name || null,
    quantity: p.qty,
    purchase_price: p.price,
    purchase_date: p.data.purchaseDate || undefined,
    created_by: userId,
  });
  if (error) return fail(error.message);

  revalidateInv();
  return OK;
}

export async function updateInvestment(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Inversión inválida");

  const p = prepared(formData);
  if (!p.ok) return fail(p.error);

  const { userId } = await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("investments")
    .update({
      owner_id: p.data.ownership === "personal" ? userId : null,
      symbol: p.data.symbol.toUpperCase(),
      name: p.data.name || null,
      quantity: p.qty,
      purchase_price: p.price,
      purchase_date: p.data.purchaseDate || undefined,
    })
    .eq("id", id);
  if (error) return fail(error.message);

  revalidateInv();
  return OK;
}

export async function addPrice(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = priceSchema.safeParse({
    investmentId: formData.get("investmentId"),
    price: formData.get("price"),
    asOf: formData.get("asOf"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos");
  }

  let price = 0;
  try {
    price = parseAmountToCents(parsed.data.price);
  } catch {
    return fail("Precio inválido");
  }
  if (price < 0) return fail("El precio no puede ser negativo");

  const { userId } = await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("price_snapshots")
    .upsert(
      {
        investment_id: parsed.data.investmentId,
        price,
        as_of: parsed.data.asOf,
        created_by: userId,
      },
      { onConflict: "investment_id,as_of" },
    );
  if (error) return fail(error.message);

  revalidateInv();
  return OK;
}

export async function deleteInvestment(id: string): Promise<ActionResult> {
  await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase.from("investments").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidateInv();
  return OK;
}
