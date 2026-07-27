// Compromisos mensuales: cuánto de los próximos meses ya está comprometido
// en mensualidades de MSI antes de gastar nada.

/** Mensualidad pendiente, con el mes en que se paga. */
export type CommitmentInstallment = {
  plan_id: string;
  due_date: string;
  amount: number;
  is_paid: boolean;
};

export type MonthlyCommitment = {
  /** Primer día del mes, "YYYY-MM-01". */
  month: string;
  total: number;
  count: number;
  /** Fracción del ingreso mensual de referencia; null si no hay ingreso. */
  incomeShare: number | null;
  /** true si supera el umbral configurado del hogar. */
  overThreshold: boolean;
};

/** "YYYY-MM-DD" -> "YYYY-MM-01" */
export function monthOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** Suma `delta` meses a un "YYYY-MM-01". */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

/**
 * Ingreso mensual de referencia: promedio de los últimos `months` meses
 * completos. Se excluye el mes en curso porque aún no ha terminado y
 * subestimaría el ingreso.
 */
export function averageMonthlyIncome(
  incomes: { amount: number; occurred_at: string }[],
  currentMonth: string,
  months = 6,
): number {
  const from = shiftMonth(currentMonth, -months);
  let total = 0;
  for (const i of incomes) {
    const m = monthOf(i.occurred_at);
    if (m >= from && m < currentMonth) total += i.amount;
  }
  return Math.round(total / months);
}

/**
 * Proyección mes a mes de las mensualidades pendientes, desde el mes en curso
 * hasta la última mensualidad. Los meses sin compromisos aparecen en cero para
 * que la gráfica no tenga huecos.
 */
export function projectCommitments(
  installments: CommitmentInstallment[],
  currentMonth: string,
  monthlyIncome: number,
  alertPct: number,
): MonthlyCommitment[] {
  const pending = installments.filter(
    (i) => !i.is_paid && monthOf(i.due_date) >= currentMonth,
  );
  if (pending.length === 0) return [];

  const byMonth = new Map<string, { total: number; count: number }>();
  for (const i of pending) {
    const m = monthOf(i.due_date);
    const acc = byMonth.get(m) ?? { total: 0, count: 0 };
    acc.total += i.amount;
    acc.count += 1;
    byMonth.set(m, acc);
  }

  const last = [...byMonth.keys()].sort().at(-1)!;
  const out: MonthlyCommitment[] = [];
  for (let m = currentMonth; m <= last; m = shiftMonth(m, 1)) {
    const acc = byMonth.get(m) ?? { total: 0, count: 0 };
    const incomeShare = monthlyIncome > 0 ? acc.total / monthlyIncome : null;
    out.push({
      month: m,
      total: acc.total,
      count: acc.count,
      incomeShare,
      overThreshold: incomeShare !== null && incomeShare > alertPct,
    });
  }
  return out;
}

/** "julio 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-MX", {
    month: "long",
    year: "numeric",
  });
}

/** "jul 26" — etiqueta compacta para la gráfica. */
export function shortMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1)
    .toLocaleDateString("es-MX", { month: "short", year: "2-digit" })
    .replace(".", "");
}
