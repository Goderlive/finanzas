// Utilidades de mes. Un "mes" se representa como el primer día: "YYYY-MM-01".

import { todayDate } from "@/lib/dates";

export function firstOfMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Normaliza un parámetro (YYYY-MM o YYYY-MM-01) a "YYYY-MM-01"; default: mes actual. */
export function parseMonthParam(m?: string): string {
  if (m && /^\d{4}-\d{2}$/.test(m)) return `${m}-01`;
  if (m && /^\d{4}-\d{2}-01$/.test(m)) return m;
  return firstOfMonth(todayDate());
}

export function addMonths(monthFirst: string, delta: number): string {
  const [y, mo] = monthFirst.split("-").map(Number);
  return firstOfMonth(new Date(y, mo - 1 + delta, 1));
}

export function monthLabel(monthFirst: string): string {
  const [y, mo] = monthFirst.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("es-MX", {
    month: "long",
    year: "numeric",
  });
}

/** "YYYY-MM-01" -> "YYYY-MM" para usar en la URL. */
export function monthParam(monthFirst: string): string {
  return monthFirst.slice(0, 7);
}
