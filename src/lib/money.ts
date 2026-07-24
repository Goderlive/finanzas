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
