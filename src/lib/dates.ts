// Fechas como "YYYY-MM-DD", con aritmética sobre enteros (año, mes, día).
//
// Nunca `new Date("2026-01-20")`: esa forma se interpreta como UTC y en México
// se corre un día. Construir con `new Date(y, m - 1, d)` sí es hora local.
//
// Y nunca `new Date().getDate()` para saber qué día es hoy: el servidor de
// Next.js corre en UTC, así que entre las 18:00 y la medianoche de México ya
// cree que es mañana. Para eso están `today()` y `todayDate()`, que fijan la
// zona del hogar. La misma corrección vive en SQL como `household_today()`.

export type YMD = { y: number; m: number; d: number }; // m es 1-12

/** Zona horaria del hogar. Todo "hoy" de la app se decide aquí. */
export const HOUSEHOLD_TIME_ZONE = "America/Mexico_City";

export function parseDate(date: string): YMD {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

export function formatDate({ y, m, d }: YMD): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const householdYmd = new Intl.DateTimeFormat("en-CA", {
  timeZone: HOUSEHOLD_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Hoy en formato "YYYY-MM-DD", en hora de México (no la del servidor). */
export function today(now = new Date()): string {
  // `formatToParts` en vez de leer la cadena: el orden y los separadores de
  // un locale no son contrato, los nombres de las partes sí.
  const parts = householdYmd.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * El día de hoy en México como `Date` a medianoche, para el código que
 * necesita un objeto (getFullYear, getMonth, comparar vencimientos). La hora
 * se descarta a propósito: la app razona en días, nunca en horas.
 */
export function todayDate(now = new Date()): Date {
  const { y, m, d } = parseDate(today(now));
  return new Date(y, m - 1, d);
}

/** Días completos de `from` a `to` (negativo si `to` ya pasó). */
export function daysBetween(from: string, to: string): number {
  const a = parseDate(from);
  const b = parseDate(to);
  const ms = Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d);
  return Math.round(ms / 86_400_000);
}

/** Suma días a una fecha. */
export function addDays(date: string, days: number): string {
  const { y, m, d } = parseDate(date);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + days);
  return formatDate({
    y: t.getUTCFullYear(),
    m: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
  });
}

/** "5 mar" — etiqueta corta. */
export function formatShortDate(date: string): string {
  const { y, m, d } = parseDate(date);
  return new Date(y, m - 1, d).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  });
}

/** "5 mar 2026" — con año, para vencimientos lejanos. */
export function formatLongDate(date: string): string {
  const { y, m, d } = parseDate(date);
  return new Date(y, m - 1, d).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
