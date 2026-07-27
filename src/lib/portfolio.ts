// Portafolio de renta variable: costo promedio ponderado, rendimiento y
// evolución del valor.
//
// CONVENCIÓN: los rendimientos anualizados usan 365 días, que es tiempo de
// calendario. Ojo con no confundirla con la base 360 de `fixed-income.ts`:
// aquélla es la convención con la que un banco liquida intereses, ésta es
// aritmética de calendario para comparar rendimientos entre sí.

import { daysBetween, today } from "@/lib/dates";

/** Días de un año, para anualizar rendimientos. */
export const YEAR_DAYS = 365;

/** Historia mínima para que un rendimiento anualizado signifique algo. */
export const MIN_DAYS_FOR_ANNUALIZED = 30;

export type Lot = {
  type: "buy" | "sell";
  quantity: number;
  /** Precio por unidad en centavos. */
  price: number;
  occurred_at: string;
};

export type CostBasis = {
  /** Unidades en posesión. */
  quantity: number;
  /** Costo total de lo que sigue en posesión, en centavos. */
  totalCost: number;
  /** Costo promedio ponderado por unidad, en centavos (decimal). */
  averageCost: number;
  /** Ganancia ya materializada por las ventas, en centavos. */
  realizedGain: number;
  /** Fecha de la primera compra; null si no hay lotes. */
  firstPurchase: string | null;
  /** true si se intentó vender más de lo que había. */
  oversold: boolean;
};

/**
 * Costo base por promedio ponderado, procesando los lotes en orden.
 *
 * Una compra sube la cantidad y el costo total; el promedio se recalcula.
 * Una venta baja la cantidad y retira costo al promedio vigente, que NO
 * cambia: la diferencia entre el precio de venta y ese promedio es la
 * ganancia materializada.
 */
export function computeCostBasis(lots: Lot[]): CostBasis {
  const ordered = [...lots].sort((a, b) =>
    a.occurred_at === b.occurred_at ? 0 : a.occurred_at < b.occurred_at ? -1 : 1,
  );

  let quantity = 0;
  let totalCost = 0;
  let realizedGain = 0;
  let firstPurchase: string | null = null;
  let oversold = false;

  for (const lot of ordered) {
    if (lot.type === "buy") {
      if (firstPurchase === null) firstPurchase = lot.occurred_at;
      quantity += lot.quantity;
      totalCost += lot.quantity * lot.price;
      continue;
    }

    // Venta
    const sold = Math.min(lot.quantity, quantity);
    if (lot.quantity > quantity) oversold = true;
    const avg = quantity > 0 ? totalCost / quantity : 0;
    realizedGain += sold * (lot.price - avg);
    totalCost -= sold * avg;
    quantity -= sold;
    // Evita arrastrar residuos de coma flotante en posiciones cerradas.
    if (quantity <= 1e-9) {
      quantity = 0;
      totalCost = 0;
    }
  }

  return {
    quantity,
    totalCost: Math.round(totalCost),
    averageCost: quantity > 0 ? totalCost / quantity : 0,
    realizedGain: Math.round(realizedGain),
    firstPurchase,
    oversold,
  };
}

export type HoldingReturn = {
  quantity: number;
  averageCost: number;
  costBasis: number;
  currentValue: number;
  /** Plusvalía no realizada: valor actual − costo de lo que se tiene. */
  unrealizedGain: number;
  /** Ganancia de las ventas ya hechas. */
  realizedGain: number;
  /** Ganancia total = no realizada + realizada. */
  totalGain: number;
  /** Porcentaje sobre el costo. null si no hay costo. */
  totalGainPct: number | null;
  /** Días desde la primera compra. */
  daysHeld: number;
  /**
   * Rendimiento anualizado ponderado por dinero (XIRR). Con una sola compra
   * coincide con el CAGR. null si hay poca historia o no converge.
   */
  annualizedReturn: number | null;
};

/**
 * Valor presente neto de unos flujos a una tasa anual dada.
 * Los flujos negativos son salidas (compras); los positivos, entradas.
 */
function npv(flows: { amount: number; date: string }[], rate: number): number {
  const base = flows[0].date;
  return flows.reduce((sum, f) => {
    const years = daysBetween(base, f.date) / YEAR_DAYS;
    return sum + f.amount / Math.pow(1 + rate, years);
  }, 0);
}

/**
 * Rendimiento anualizado ponderado por dinero (XIRR), por bisección.
 *
 * Se usa bisección y no Newton porque siempre converge cuando la raíz está
 * acotada y no depende de una derivada que puede dispararse. Con una sola
 * compra y un solo valor final, el resultado es exactamente el CAGR.
 */
export function annualizedReturn(
  flows: { amount: number; date: string }[],
): number | null {
  if (flows.length < 2) return null;
  const sorted = [...flows].sort((a, b) => (a.date < b.date ? -1 : 1));

  const span = daysBetween(sorted[0].date, sorted[sorted.length - 1].date);
  if (span < MIN_DAYS_FOR_ANNUALIZED) return null;
  // Hacen falta flujos en ambos sentidos para que exista una tasa.
  if (!sorted.some((f) => f.amount < 0) || !sorted.some((f) => f.amount > 0)) {
    return null;
  }

  // -99% a +1000% anual cubre cualquier caso realista.
  let low = -0.99;
  let high = 10;
  let fLow = npv(sorted, low);
  let fHigh = npv(sorted, high);
  if (fLow * fHigh > 0) return null; // la raíz no está acotada aquí

  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    const fMid = npv(sorted, mid);
    if (Math.abs(fMid) < 1e-6 || high - low < 1e-9) return mid;
    if (fLow * fMid < 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }
  return (low + high) / 2;
}

/** Rendimiento de un holding con su precio actual. */
export function computeHoldingReturn(
  lots: Lot[],
  currentPrice: number | null,
  now = today(),
): HoldingReturn {
  const basis = computeCostBasis(lots);
  const price = currentPrice ?? basis.averageCost;
  const currentValue = Math.round(basis.quantity * price);
  const unrealizedGain = currentValue - basis.totalCost;
  const totalGain = unrealizedGain + basis.realizedGain;

  // Base sobre la que medir el % : todo lo que se puso, incluidas las ventas.
  const invested = lots
    .filter((l) => l.type === "buy")
    .reduce((s, l) => s + l.quantity * l.price, 0);

  const flows = [
    ...lots.map((l) => ({
      amount: l.type === "buy" ? -l.quantity * l.price : l.quantity * l.price,
      date: l.occurred_at,
    })),
    ...(currentValue > 0 ? [{ amount: currentValue, date: now }] : []),
  ];

  return {
    quantity: basis.quantity,
    averageCost: basis.averageCost,
    costBasis: basis.totalCost,
    currentValue,
    unrealizedGain,
    realizedGain: basis.realizedGain,
    totalGain,
    totalGainPct: invested > 0 ? (totalGain / invested) * 100 : null,
    daysHeld: basis.firstPurchase ? daysBetween(basis.firstPurchase, now) : 0,
    annualizedReturn: annualizedReturn(flows),
  };
}

// ---------------------------------------------------------------------------
// Evolución del valor
// ---------------------------------------------------------------------------

export type EvolutionPoint = {
  date: string;
  /** Valor de la posición a esa fecha. */
  value: number;
  /** Costo de lo que se tenía a esa fecha. */
  cost: number;
};

/**
 * Serie de valor y costo del holding a lo largo del tiempo.
 *
 * Se evalúa en cada fecha con precio conocido (los snapshots) y también en las
 * fechas de los lotes, para que un cambio de posición se vea aunque ese día no
 * haya precio. En cada punto se usa el último precio conocido hasta esa fecha.
 */
export function buildEvolution(
  lots: Lot[],
  snapshots: { as_of: string; price: number }[],
  now = today(),
): EvolutionPoint[] {
  if (lots.length === 0) return [];

  const prices = [...snapshots].sort((a, b) => (a.as_of < b.as_of ? -1 : 1));
  const dates = new Set<string>([
    ...lots.map((l) => l.occurred_at),
    ...prices.map((p) => p.as_of),
    now,
  ]);

  const points: EvolutionPoint[] = [];
  for (const date of [...dates].sort()) {
    if (date > now) continue;
    const basis = computeCostBasis(lots.filter((l) => l.occurred_at <= date));
    if (basis.quantity === 0 && basis.totalCost === 0) continue;

    // Último precio conocido a esa fecha; si aún no hay, el costo promedio.
    let price = basis.averageCost;
    for (const p of prices) {
      if (p.as_of <= date) price = p.price;
      else break;
    }

    points.push({
      date,
      value: Math.round(basis.quantity * price),
      cost: basis.totalCost,
    });
  }
  return points;
}

// ---------------------------------------------------------------------------
// Portafolio completo
// ---------------------------------------------------------------------------

export type PortfolioPosition = {
  /** Lo invertido, en centavos: la base del rendimiento. */
  cost: number;
  /** Valor actual, en centavos. */
  value: number;
  /** Rendimiento anualizado del holding; null si no se puede calcular. */
  annualizedReturn: number | null;
};

export type PortfolioSummary = {
  totalCost: number;
  totalValue: number;
  totalGain: number;
  totalGainPct: number | null;
  /**
   * Rendimiento anualizado del conjunto, ponderado por el valor de cada
   * posición. Sólo entran las que tienen rendimiento calculable.
   */
  weightedAnnualReturn: number | null;
};

/** Resumen del portafolio sumando renta fija y variable. */
export function summarizePortfolio(
  positions: PortfolioPosition[],
): PortfolioSummary {
  const totalCost = positions.reduce((s, p) => s + p.cost, 0);
  const totalValue = positions.reduce((s, p) => s + p.value, 0);
  const totalGain = totalValue - totalCost;

  const withReturn = positions.filter(
    (p) => p.annualizedReturn !== null && p.value > 0,
  );
  const weightBase = withReturn.reduce((s, p) => s + p.value, 0);
  const weightedAnnualReturn =
    weightBase > 0
      ? withReturn.reduce(
          (s, p) => s + (p.annualizedReturn as number) * (p.value / weightBase),
          0,
        )
      : null;

  return {
    totalCost,
    totalValue,
    totalGain,
    totalGainPct: totalCost > 0 ? (totalGain / totalCost) * 100 : null,
    weightedAnnualReturn,
  };
}
