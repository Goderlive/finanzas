// Fechas como "YYYY-MM-DD", con aritmética sobre enteros (año, mes, día).
//
// Nunca `new Date("2026-01-20")`: esa forma se interpreta como UTC y en México
// se corre un día. Construir con `new Date(y, m - 1, d)` sí es hora local.

export type YMD = { y: number; m: number; d: number }; // m es 1-12

export function parseDate(date: string): YMD {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

export function formatDate({ y, m, d }: YMD): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Hoy en formato "YYYY-MM-DD", en hora local. */
export function today(now = new Date()): string {
  return formatDate({
    y: now.getFullYear(),
    m: now.getMonth() + 1,
    d: now.getDate(),
  });
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
