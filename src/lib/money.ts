// Utilidades de dinero. Regla del proyecto: todo se guarda en CENTAVOS (enteros).

/** Formatea centavos como moneda. `cents` es un entero (ej. 123456 => $1,234.56). */
export function formatMoney(
  cents: number,
  currency = "MXN",
  locale = "es-MX",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(cents / 100);
}

/** Formatea centavos como número simple con 2 decimales (sin símbolo). */
export function formatAmount(cents: number, locale = "es-MX"): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * Convierte texto ingresado por el usuario (ej. "1,234.56" o "1234.5") a
 * centavos enteros. Lanza si no es un número válido.
 */
export function parseAmountToCents(input: string): number {
  const cleaned = input.trim().replace(/[^0-9.,-]/g, "");
  // Normaliza: quita separadores de miles (coma) dejando el punto decimal.
  const normalized = cleaned.replace(/,/g, "");
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    throw new Error(`Monto inválido: ${input}`);
  }
  return Math.round(value * 100);
}

/** Convierte centavos a string decimal para inputs controlados (ej. 123456 => "1234.56"). */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

// ---------------------------------------------------------------------------
// Presentación de la regla de signo
//
// En la base, activos y pasivos se guardan con el signo de su efecto sobre el
// patrimonio neto: un pasivo con deuda va en NEGATIVO. Todo lo de aquí abajo
// es la ÚNICA capa donde ese signo se convierte en «debes X». Nada de esto
// debe filtrarse a una consulta ni a un cálculo.
// ---------------------------------------------------------------------------

import type { AccountClass } from "@/lib/supabase/database.types";

/** Importe sin signo. Para montos de fila, donde el signo lo dice el color. */
export function formatMoneyAbs(cents: number, currency = "MXN"): string {
  return formatMoney(Math.abs(cents), currency);
}

export type BalanceDisplay = {
  /** Importe ya formateado y sin signo. */
  text: string;
  /** Qué significa ese importe: «debes», «a favor» o nada. */
  label: string | null;
  /** Para elegir color sin volver a razonar sobre el signo. */
  tone: "neutral" | "debt" | "credit";
};

/**
 * Traduce un saldo con signo a lo que se le muestra al usuario.
 *
 *   activo    +2,957.00  ->  "$2,957.00"            neutral
 *   activo      -692.00  ->  "$692.00"  en rojo     debt   (sobregiro)
 *   pasivo    -4,483.00  ->  "$4,483.00" «debes»    debt
 *   pasivo      +500.00  ->  "$500.00" «a favor»    credit (saldo a favor)
 *   cualquiera      0    ->  "$0.00"                neutral
 */
export function displayBalance(
  cents: number,
  accountClass: AccountClass,
  currency = "MXN",
): BalanceDisplay {
  const text = formatMoneyAbs(cents, currency);

  if (cents === 0) return { text, label: null, tone: "neutral" };

  if (accountClass === "liability") {
    return cents < 0
      ? { text, label: "debes", tone: "debt" }
      : { text, label: "a favor", tone: "credit" };
  }

  // Activo: negativo es un sobregiro y merece verse como deuda.
  return cents < 0
    ? { text, label: "en negativo", tone: "debt" }
    : { text, label: null, tone: "neutral" };
}

/** Clases de color de Tailwind que corresponden a cada tono. */
export const balanceToneClass: Record<BalanceDisplay["tone"], string> = {
  neutral: "",
  debt: "text-destructive",
  credit: "text-emerald-600 dark:text-emerald-400",
};
