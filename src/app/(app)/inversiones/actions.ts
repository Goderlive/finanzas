"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireHousehold } from "@/lib/auth";
import { parseAmountToCents } from "@/lib/money";
import { fail, OK, type ActionResult } from "@/lib/action-result";
import { computeCostBasis } from "@/lib/portfolio";
import { investmentSchema, lotSchema, priceSchema } from "./schema";

function revalidateInv() {
  revalidatePath("/inversiones");
  revalidatePath("/");
}

function parseForm(formData: FormData) {
  const investmentType =
    formData.get("investmentType") === "fixed" ? "fixed" : "variable";
  return investmentSchema.safeParse(
    investmentType === "fixed"
      ? {
          investmentType,
          name: formData.get("name"),
          ownership: formData.get("ownership"),
          principal: formData.get("principal"),
          annualRate: formData.get("annualRate"),
          startDate: formData.get("startDate"),
          maturityDate: formData.get("maturityDate"),
          compounding: formData.get("compounding"),
          reinvests: formData.get("reinvests") ?? undefined,
        }
      : {
          investmentType,
          symbol: formData.get("symbol"),
          name: formData.get("name") ?? undefined,
          ownership: formData.get("ownership"),
          quantity: formData.get("quantity"),
          purchasePrice: formData.get("purchasePrice"),
          purchaseDate: formData.get("purchaseDate") ?? undefined,
        },
  );
}

/**
 * Columnas de `investments` a escribir. Los campos del otro tipo van en null:
 * las restricciones `investments_fixed_only` / `investments_variable_fields`
 * lo exigen en la base.
 */
type InvestmentColumns = {
  investment_type: "fixed" | "variable";
  symbol: string | null;
  name: string | null;
  quantity: number | null;
  purchase_price: number | null;
  purchase_date?: string;
  principal: number | null;
  annual_rate: number | null;
  start_date: string | null;
  maturity_date: string | null;
  compounding: "simple" | "monthly" | "daily" | null;
  reinvests_at_maturity: boolean | null;
};

function prepared(formData: FormData):
  | { ok: false; error: string }
  | { ok: true; personal: boolean; columns: InvestmentColumns } {
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const d = parsed.data;
  const personal = d.ownership === "personal";

  if (d.investmentType === "fixed") {
    let principal = 0;
    try {
      principal = parseAmountToCents(d.principal);
    } catch {
      return { ok: false, error: "Monto invertido inválido" };
    }
    if (principal <= 0) return { ok: false, error: "El monto debe ser mayor a cero" };

    // La tasa se captura en porcentaje (10.25) y se guarda como fracción.
    const rate = Number(d.annualRate.replace(",", ".").replace("%", "")) / 100;
    if (!Number.isFinite(rate) || rate < 0) {
      return { ok: false, error: "Tasa anual inválida" };
    }
    if (rate > 1) {
      return { ok: false, error: "La tasa se captura en porcentaje, p.ej. 10.25" };
    }
    if (d.maturityDate <= d.startDate) {
      return { ok: false, error: "El vencimiento debe ser posterior al inicio" };
    }

    return {
      ok: true,
      personal,
      columns: {
        investment_type: "fixed",
        symbol: null,
        name: d.name,
        quantity: null,
        purchase_price: null,
        purchase_date: d.startDate,
        principal,
        annual_rate: rate,
        start_date: d.startDate,
        maturity_date: d.maturityDate,
        compounding: d.compounding,
        reinvests_at_maturity: d.reinvests,
      },
    };
  }

  const qty = Number(d.quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: "Cantidad inválida" };
  }
  let price = 0;
  try {
    price = parseAmountToCents(d.purchasePrice);
  } catch {
    return { ok: false, error: "Precio inválido" };
  }

  return {
    ok: true,
    personal,
    columns: {
      investment_type: "variable",
      symbol: d.symbol.toUpperCase(),
      name: d.name || null,
      quantity: qty,
      purchase_price: price,
      purchase_date: d.purchaseDate || undefined,
      principal: null,
      annual_rate: null,
      start_date: null,
      maturity_date: null,
      compounding: null,
      reinvests_at_maturity: null,
    },
  };
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
    owner_id: p.personal ? userId : null,
    created_by: userId,
    ...p.columns,
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
      owner_id: p.personal ? userId : null,
      ...p.columns,
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

/**
 * Recalcula `investments.quantity` y `purchase_price` desde los lotes.
 *
 * Los lotes son la fuente de verdad de una posición de renta variable; esas
 * dos columnas son el agregado que lee el resto de la app (dashboard,
 * patrimonio neto). Se recalculan aquí para que nunca se separen.
 */
async function syncAggregateFromLots(
  supabase: Awaited<ReturnType<typeof createClient>>,
  investmentId: string,
): Promise<string | null> {
  const { data: lots, error } = await supabase
    .from("investment_lots")
    .select("type, quantity, price, occurred_at")
    .eq("investment_id", investmentId);
  if (error) return error.message;

  const basis = computeCostBasis(lots ?? []);
  if (basis.oversold) return "No puedes vender más unidades de las que tienes";

  const { error: updateError } = await supabase
    .from("investments")
    .update({
      quantity: basis.quantity,
      // El promedio ponderado se guarda redondeado a centavos por unidad.
      purchase_price: Math.round(basis.averageCost),
    })
    .eq("id", investmentId);
  return updateError?.message ?? null;
}

/** Registra una compra o venta parcial y recalcula el costo promedio. */
export async function addLot(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = lotSchema.safeParse({
    investmentId: formData.get("investmentId"),
    type: formData.get("type"),
    quantity: formData.get("quantity"),
    price: formData.get("price"),
    occurredAt: formData.get("occurredAt"),
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos");
  }

  const qty = Number(parsed.data.quantity);
  if (!Number.isFinite(qty) || qty <= 0) return fail("Cantidad inválida");
  let price = 0;
  try {
    price = parseAmountToCents(parsed.data.price);
  } catch {
    return fail("Precio inválido");
  }
  if (price < 0) return fail("El precio no puede ser negativo");

  const { userId } = await requireHousehold();
  const supabase = await createClient();

  const { data: lot, error } = await supabase
    .from("investment_lots")
    .insert({
      investment_id: parsed.data.investmentId,
      type: parsed.data.type,
      quantity: qty,
      price,
      occurred_at: parsed.data.occurredAt,
      note: parsed.data.note || null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) return fail(error.message);

  const syncError = await syncAggregateFromLots(
    supabase,
    parsed.data.investmentId,
  );
  if (syncError) {
    // Un lote que deja la posición en un estado imposible no se queda.
    await supabase.from("investment_lots").delete().eq("id", lot.id);
    return fail(syncError);
  }

  revalidateInv();
  return OK;
}

/** Borra un lote y recalcula el agregado. */
export async function deleteLot(
  id: string,
  investmentId: string,
): Promise<ActionResult> {
  await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("investment_lots")
    .delete()
    .eq("id", id);
  if (error) return fail(error.message);

  const syncError = await syncAggregateFromLots(supabase, investmentId);
  if (syncError) return fail(syncError);

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
