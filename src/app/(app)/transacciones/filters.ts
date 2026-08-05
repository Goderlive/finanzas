// Estado de los filtros de Movimientos.
//
// Vive en la URL, no en `useState`: así el filtro sobrevive a un refresh, se
// puede compartir, y el servidor puede consultar sólo lo que se pidió en vez
// de traer todo y recortarlo en el cliente.
//
// El PERIODO se guarda como preset ("mes"), no como fechas. Si guardáramos las
// fechas resueltas, un enlace a "este mes" seguiría apuntando a agosto en
// septiembre. Las fechas sólo viajan en la URL cuando son personalizadas.

import { formatDate, parseDate, addDays, formatShortDate } from "@/lib/dates";
import type { TransactionType } from "@/lib/supabase/database.types";

export const periodPresets = [
  "mes",
  "mes-pasado",
  "30d",
  "anio",
  "todo",
  "custom",
] as const;

export type PeriodPreset = (typeof periodPresets)[number];

export const periodLabels: Record<PeriodPreset, string> = {
  mes: "Este mes",
  "mes-pasado": "Mes pasado",
  "30d": "Últimos 30 días",
  anio: "Este año",
  todo: "Todo",
  custom: "Personalizado",
};

export const defaultPeriod: PeriodPreset = "mes";

/**
 * Id reservado para «movimientos sin categoría». Los demás valores del filtro
 * de categoría son uuids, así que no hay forma de que choquen.
 */
export const UNCATEGORIZED = "sin";

export const transactionTypes: TransactionType[] = [
  "expense",
  "income",
  "transfer",
];

export type Filters = {
  period: PeriodPreset;
  /** Sólo se usan con `period === "custom"`. */
  from: string | null;
  to: string | null;
  /** Vacío = todos los tipos. Igual para cuentas y categorías. */
  types: TransactionType[];
  accounts: string[];
  categories: string[];
  q: string;
};

export const emptyFilters: Filters = {
  period: defaultPeriod,
  from: null,
  to: null,
  types: [],
  accounts: [],
  categories: [],
  q: "",
};

// --- Lectura desde la URL ---------------------------------------------------

type Param = string | string[] | undefined;

function one(v: Param): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function list(v: Param): string[] {
  return one(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export function parseFilters(sp: Record<string, Param>): Filters {
  const rawPeriod = one(sp.periodo) as PeriodPreset;
  const period = periodPresets.includes(rawPeriod) ? rawPeriod : defaultPeriod;
  const from = one(sp.desde);
  const to = one(sp.hasta);

  return {
    period,
    from: isYmd(from) ? from : null,
    to: isYmd(to) ? to : null,
    types: list(sp.tipo).filter((t): t is TransactionType =>
      (transactionTypes as string[]).includes(t),
    ),
    accounts: list(sp.cuenta),
    categories: list(sp.categoria),
    q: one(sp.q).trim(),
  };
}

// --- Escritura hacia la URL -------------------------------------------------

/** Sólo se escribe lo que difiere del default: URLs cortas y legibles. */
export function toSearchParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.period !== defaultPeriod) p.set("periodo", f.period);
  if (f.period === "custom") {
    if (f.from) p.set("desde", f.from);
    if (f.to) p.set("hasta", f.to);
  }
  if (f.types.length) p.set("tipo", f.types.join(","));
  if (f.accounts.length) p.set("cuenta", f.accounts.join(","));
  if (f.categories.length) p.set("categoria", f.categories.join(","));
  if (f.q) p.set("q", f.q);
  return p;
}

/** Cuántos filtros del panel están puestos (el periodo tiene su propio control). */
export function panelCount(f: Filters): number {
  return (
    (f.types.length ? 1 : 0) +
    (f.accounts.length ? 1 : 0) +
    (f.categories.length ? 1 : 0)
  );
}

export function isDefault(f: Filters): boolean {
  return (
    f.period === defaultPeriod &&
    panelCount(f) === 0 &&
    f.q === ""
  );
}

// --- Rango de fechas --------------------------------------------------------

export type DateRange = { from: string | null; to: string | null };

function lastDayOfMonth(y: number, m: number): string {
  // `new Date(y, m, 0)` es el día 0 del mes siguiente, o sea el último de éste.
  return formatDate({ y, m, d: new Date(y, m, 0).getDate() });
}

/**
 * Convierte el preset en fechas concretas (ambas inclusivas). `today` se
 * recibe como parámetro para que sea el hoy del hogar, no el del servidor.
 */
export function resolveRange(f: Filters, today: string): DateRange {
  const { y, m } = parseDate(today);

  switch (f.period) {
    case "mes":
      return { from: formatDate({ y, m, d: 1 }), to: lastDayOfMonth(y, m) };
    case "mes-pasado": {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { from: formatDate({ y: py, m: pm, d: 1 }), to: lastDayOfMonth(py, pm) };
    }
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "anio":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "todo":
      return { from: null, to: null };
    case "custom":
      // Un extremo vacío es un rango abierto, no un error: «desde marzo» y
      // «hasta marzo» son peticiones legítimas.
      return { from: f.from, to: f.to };
  }
}

/** Etiqueta corta del periodo, ya resuelto, para el chip y el encabezado. */
export function rangeLabel(f: Filters, today: string): string {
  if (f.period !== "custom") return periodLabels[f.period];
  const { from, to } = resolveRange(f, today);
  if (from && to) return `${formatShortDate(from)} – ${formatShortDate(to)}`;
  if (from) return `Desde ${formatShortDate(from)}`;
  if (to) return `Hasta ${formatShortDate(to)}`;
  return periodLabels.todo;
}

// --- Categorías -------------------------------------------------------------

type CategoryNode = { id: string; parent_id: string | null };

/**
 * Elegir una categoría padre incluye a sus hijas: nadie que filtra por
 * «Casa» espera que se le escondan los movimientos de «Casa › Luz».
 */
export function expandCategories(
  selected: string[],
  categories: CategoryNode[],
): string[] {
  const picked = new Set(selected.filter((id) => id !== UNCATEGORIZED));
  for (const c of categories) {
    if (c.parent_id && picked.has(c.parent_id)) picked.add(c.id);
  }
  return [...picked];
}
