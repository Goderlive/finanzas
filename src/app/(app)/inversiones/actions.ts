"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireHousehold } from "@/lib/auth";
import { parseAmountToCents } from "@/lib/money";
import { fail, OK, type ActionResult } from "@/lib/action-result";
import { computeCostBasis } from "@/lib/portfolio";
import { today } from "@/lib/dates";
import {
  investmentSchema,
  linkSchema,
  lotSchema,
  priceSchema,
  NO_ACCOUNT,
  type FundingSource,
} from "./schema";

function revalidateInv() {
  revalidatePath("/inversiones");
  revalidatePath("/");
  // El capital puede haberse movido entre cuentas o haber entrado a una.
  revalidatePath("/cuentas");
  revalidatePath("/transacciones");
}

/**
 * Deja el dinero de una inversión dentro del saldo de su cuenta.
 *
 * Vincular una inversión (`investments.account_id`, migración 0022) afirma
 * que su capital ya está contado en `accounts.current_balance`. Esta función
 * es la que hace verdadera esa afirmación, según de dónde venga el dinero:
 *
 *   already   el saldo ya lo incluye  -> no se toca nada
 *   transfer  viene de otra cuenta    -> traspaso de partida doble (0019)
 *   external  la app nunca lo vio     -> sube el saldo inicial de la cuenta
 *
 * EFECTO SOBRE EL PATRIMONIO NETO. No es el mismo en las tres, y tampoco es
 * el mismo al dar de alta que al vincular una inversión que ya existía:
 *
 *                   alta nueva            vincular una existente
 *   already         sin cambio            BAJA por el capital
 *   transfer        sin cambio            BAJA por el capital
 *   external        SUBE por el capital   sin cambio
 *
 * Las bajadas no son una pérdida: son la corrección del doble conteo que
 * había mientras el capital estaba a la vez en el saldo de una cuenta y en
 * el valor de la inversión. La subida de `external` tampoco es un invento:
 * es dinero real que la app no conocía. Todo esto está medido en los casos
 * 8 a 12 de supabase/tests/20260813_investment_account_test.sql.
 *
 * La rama `external` mueve `initial_balance` y no registra una transacción a
 * propósito: no hubo tal movimiento, el dinero siempre estuvo ahí y lo que
 * estaba mal era el saldo de partida. El trigger de la 0006 propaga el delta
 * a `current_balance`.
 */
async function applyFunding(
  supabase: Awaited<ReturnType<typeof createClient>>,
  args: {
    accountId: string;
    capital: number;
    funding: FundingSource;
    fromAccountId?: string | null;
    occurredAt?: string | null;
    description: string;
  },
): Promise<string | null> {
  if (args.funding === "already") return null;
  if (args.capital <= 0) return "El monto invertido debe ser mayor a cero";

  if (args.funding === "transfer") {
    if (!args.fromAccountId) return "Selecciona la cuenta de origen";
    if (args.fromAccountId === args.accountId) {
      return "Si el dinero ya está en esa cuenta, elige la primera opción";
    }
    const { error } = await supabase.rpc("create_transfer", {
      p_from_account: args.fromAccountId,
      p_to_account: args.accountId,
      p_amount: args.capital,
      p_occurred_at: args.occurredAt || today(),
      p_description: args.description,
    });
    return error?.message ?? null;
  }

  // external
  const { data: account, error: readError } = await supabase
    .from("accounts")
    .select("initial_balance")
    .eq("id", args.accountId)
    .single();
  if (readError) return readError.message;

  const { error } = await supabase
    .from("accounts")
    .update({ initial_balance: account.initial_balance + args.capital })
    .eq("id", args.accountId);
  return error?.message ?? null;
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
  | {
      ok: true;
      personal: boolean;
      /** Capital invertido en centavos: la base del fondeo. */
      capital: number;
      /** Cuenta donde vive el dinero; null si queda sin vincular. */
      accountId: string | null;
      columns: InvestmentColumns;
    } {
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const d = parsed.data;
  const personal = d.ownership === "personal";
  const rawAccount = String(formData.get("accountId") ?? NO_ACCOUNT);
  const accountId = rawAccount === NO_ACCOUNT || !rawAccount ? null : rawAccount;

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
      capital: principal,
      accountId,
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
    capital: Math.round(qty * price),
    accountId,
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

function fundingFrom(formData: FormData): FundingSource {
  const raw = String(formData.get("funding") ?? "already");
  return raw === "transfer" || raw === "external" ? raw : "already";
}

export async function createInvestment(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const p = prepared(formData);
  if (!p.ok) return fail(p.error);

  const { userId, householdId } = await requireHousehold();
  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("investments")
    .insert({
      household_id: householdId,
      owner_id: p.personal ? userId : null,
      created_by: userId,
      account_id: p.accountId,
      ...p.columns,
    })
    .select("id, name, symbol")
    .single();
  if (error) return fail(error.message);

  if (p.accountId) {
    const fundingError = await applyFunding(supabase, {
      accountId: p.accountId,
      capital: p.capital,
      funding: fundingFrom(formData),
      fromAccountId: formData.get("fromAccountId")?.toString(),
      occurredAt: formData.get("occurredAt")?.toString(),
      description: `Aportación a ${created.name ?? created.symbol ?? "inversión"}`,
    });
    // La inversión ya existe pero su dinero no llegó a la cuenta: dejarla
    // vinculada afirmaría algo falso y descuadraría el patrimonio neto.
    if (fundingError) {
      await supabase.from("investments").delete().eq("id", created.id);
      return fail(fundingError);
    }
  }

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
  // Editar una inversión no toca su vinculación: `p.accountId` se ignora a
  // propósito. Mover el capital de cuenta tiene consecuencias sobre los
  // saldos y va por su propio diálogo (`linkInvestment` / `unlinkInvestment`);
  // aquí sólo se corrigen los datos del instrumento.
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

/**
 * Declara que el dinero de una inversión vive dentro de una cuenta, y deja
 * el saldo de esa cuenta de acuerdo con esa afirmación.
 *
 * El orden importa: primero el fondeo, después la vinculación. Si el fondeo
 * falla, la inversión se queda como estaba y nada quedó a medias.
 */
export async function linkInvestment(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = linkSchema.safeParse({
    investmentId: formData.get("investmentId"),
    accountId: formData.get("accountId"),
    funding: fundingFrom(formData),
    fromAccountId: formData.get("fromAccountId") ?? undefined,
    occurredAt: formData.get("occurredAt") ?? undefined,
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos");
  }
  const d = parsed.data;
  if (d.accountId === NO_ACCOUNT) return fail("Selecciona una cuenta");

  await requireHousehold();
  const supabase = await createClient();

  const { data: inv, error: readError } = await supabase
    .from("investments")
    .select(
      "id, name, symbol, account_id, investment_type, principal, quantity, purchase_price",
    )
    .eq("id", d.investmentId)
    .single();
  if (readError) return fail(readError.message);
  if (inv.account_id) return fail("Esa inversión ya está vinculada");

  // Capital invertido: lo que debe quedar dentro del saldo de la cuenta.
  const capital =
    inv.investment_type === "fixed"
      ? (inv.principal ?? 0)
      : Math.round((inv.quantity ?? 0) * (inv.purchase_price ?? 0));

  const fundingError = await applyFunding(supabase, {
    accountId: d.accountId,
    capital,
    funding: d.funding,
    fromAccountId: d.fromAccountId,
    occurredAt: d.occurredAt,
    description: `Aportación a ${inv.name ?? inv.symbol ?? "inversión"}`,
  });
  if (fundingError) return fail(fundingError);

  const { error } = await supabase
    .from("investments")
    .update({ account_id: d.accountId })
    .eq("id", d.investmentId);
  if (error) return fail(error.message);

  revalidateInv();
  return OK;
}

/**
 * Desvincula una inversión de su cuenta. NO devuelve el dinero: el saldo de
 * la cuenta se queda como está y la inversión vuelve a sumar su valor
 * completo al patrimonio neto, así que el total sube por el capital. Es lo
 * correcto si el saldo de la cuenta nunca debió incluirlo; si no, hay que
 * corregir la cuenta a mano.
 */
export async function unlinkInvestment(id: string): Promise<ActionResult> {
  await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("investments")
    .update({ account_id: null })
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
