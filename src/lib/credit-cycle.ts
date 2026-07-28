// Ciclo de tarjetas de crédito: cortes, fechas límite de pago y saldos.
//
// Espejo exacto de las funciones SQL clamp_day / statement_close_for /
// payment_due_for / statement_close_plus (migración 20260726000010).
// Si cambias una regla aquí, cámbiala también allá.
//
// Las fechas son strings "YYYY-MM-DD", igual que `occurred_at` en la BD.
// Toda la aritmética es sobre enteros (año, mes, día) a propósito: construir
// `new Date("2026-01-20")` la interpreta como UTC y en México puede correrse
// un día.

import type { TransactionType } from "@/lib/supabase/database.types";
import {
  daysBetween,
  formatDate as fmt,
  formatShortDate,
  parseDate as parse,
  today,
} from "@/lib/dates";

export { daysBetween, today };

/** Días que tiene un mes (m es 1-12), con años bisiestos. */
export function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

/** Suma meses a un (año, mes), normalizando el desbordamiento. */
function addMonths(y: number, m: number, delta: number): { y: number; m: number } {
  const total = y * 12 + (m - 1) + delta;
  return { y: Math.floor(total / 12), m: (total % 12) + 1 };
}

/**
 * Día `day` dentro del mes de `y`/`m`, acotado al último día si el mes es más
 * corto. clampDay(2026, 2, 31) -> "2026-02-28".
 */
export function clampDay(y: number, m: number, day: number): string {
  return fmt({ y, m, d: Math.min(day, daysInMonth(y, m)) });
}

/**
 * Corte al que se factura una compra: el primer corte en o posterior a la
 * fecha de compra. Una compra el día del corte entra en ESE corte.
 */
export function statementCloseFor(purchase: string, statementDay: number): string {
  const { y, m } = parse(purchase);
  const thisMonth = clampDay(y, m, statementDay);
  if (thisMonth >= purchase) return thisMonth;
  const next = addMonths(y, m, 1);
  return clampDay(next.y, next.m, statementDay);
}

/**
 * Fecha límite de pago de un corte. Si el día de pago cae en o antes del día
 * de corte, el pago es el mes siguiente al corte.
 */
export function paymentDueFor(
  close: string,
  statementDay: number,
  paymentDay: number,
): string {
  const { y, m } = parse(close);
  const target = paymentDay <= statementDay ? addMonths(y, m, 1) : { y, m };
  return clampDay(target.y, target.m, paymentDay);
}

/**
 * Desplaza un corte `n` meses (n puede ser negativo), re-acotando el día en
 * cada mes: desde "2026-01-31" con corte 31, n=1 da "2026-02-28" y n=2 da
 * "2026-03-31" (el acotamiento no se arrastra).
 */
export function statementClosePlus(
  close: string,
  statementDay: number,
  n: number,
): string {
  const { y, m } = parse(close);
  const t = addMonths(y, m, n);
  return clampDay(t.y, t.m, statementDay);
}

// ---------------------------------------------------------------------------
// Saldos del ciclo
// ---------------------------------------------------------------------------

/**
 * Asiento que toca una cuenta (compra, pago, traspaso).
 *
 * `amount` viene con signo desde la base: ya es el efecto sobre el saldo de
 * `account_id`. Un traspaso son dos asientos, uno por cuenta, así que cada
 * cuenta sólo mira las filas cuyo `account_id` es la suya.
 */
export type CycleMovement = {
  id: string;
  account_id: string;
  type: TransactionType;
  amount: number;
  occurred_at: string;
};

/** Compra diferida a MSI con su calendario, para corregir el saldo. */
export type CyclePlan = {
  transaction_id: string;
  occurred_at: string;
  total_amount: number;
  installments: { statement_period: string; amount: number }[];
};

/**
 * Parte de las compras a MSI que el banco todavía NO ha facturado a una fecha
 * de corte dada.
 *
 * El trigger de saldos descuenta la compra completa el día que se registra,
 * pero el banco sólo cobra la mensualidad de cada periodo. Esta cantidad es
 * justo la diferencia que hay que devolver al saldo para que cuadre.
 *
 * `purchasedOnOrBefore` limita a las compras ya ocurridas cuando se rebobina
 * el saldo a un corte pasado; si es null se consideran todas.
 */
export function unbilledInstallments(
  plans: CyclePlan[],
  billedThrough: string,
  purchasedOnOrBefore: string | null,
): number {
  let total = 0;
  for (const plan of plans) {
    if (purchasedOnOrBefore && plan.occurred_at > purchasedOnOrBefore) continue;
    let billed = 0;
    for (const i of plan.installments) {
      if (i.statement_period <= billedThrough) billed += i.amount;
    }
    total += plan.total_amount - billed;
  }
  return total;
}

/**
 * Efecto de un asiento sobre el saldo de una cuenta.
 *
 * Desde la migración 0019 el signo vive en la propia fila, así que esto ya no
 * traduce nada: sólo comprueba que el asiento sea de esta cuenta. En una
 * tarjeta, una compra (negativa) deja el saldo más negativo y un pago
 * (positivo) lo acerca a cero.
 */
export function movementEffect(m: CycleMovement, accountId: string): number {
  return m.account_id === accountId ? m.amount : 0;
}

export type CreditCard = {
  id: string;
  current_balance: number;
  statement_day: number | null;
  payment_day: number | null;
  credit_limit: number | null;
  minimum_payment?: number | null;
};

export type CreditCardCycle = {
  /** false si a la tarjeta le falta configurar corte o día de pago. */
  configured: boolean;
  /**
   * Deuda facturada a hoy más el periodo en curso, SIN las mensualidades MSI
   * que el banco aún no cobra. Es la deuda revolvente. Positivo = debes.
   */
  currentDebt: number;
  /** Compras a MSI que el banco todavía no factura (mensualidades futuras). */
  msiUnbilled: number;
  /**
   * Todo lo cargado a la tarjeta, MSI completos incluidos. Es lo que consume
   * la línea de crédito: los bancos retienen el importe total de una compra a
   * meses y lo liberan conforme se paga.
   */
  rawDebt: number;
  /** Deuda al último corte: lo que hay que pagar. Positivo = debes. */
  statementDebt: number;
  /** Gastado en el periodo en curso, aún no facturado. */
  currentPeriodSpend: number;
  lastClose: string | null;
  nextClose: string | null;
  /** Fecha límite de pago relevante (la del último corte si hay saldo). */
  dueDate: string | null;
  daysToNextClose: number | null;
  daysToDue: number | null;
  /** true si ya venció la fecha de pago y sigue habiendo saldo del corte. */
  overdue: boolean;
  limitUsedPct: number | null;
  availableCredit: number | null;
  /** Pago mínimo capturado a mano, si está configurado. */
  minimumPayment: number | null;
};

/**
 * Estado del ciclo de una tarjeta.
 *
 * Los saldos se derivan del saldo actual de la cuenta (corrigiéndolo) en vez
 * de re-sumarse desde `initial_balance`: así nunca discrepan del saldo que la
 * app muestra en el resto de la interfaz.
 *
 * Dos correcciones sobre `current_balance`:
 *   1. se deshacen los movimientos posteriores al corte, para rebobinar; y
 *   2. se devuelven las mensualidades MSI que el banco aún no factura, porque
 *      el trigger de saldos descontó la compra completa el día que se hizo.
 */
export function computeCreditCardCycle(
  card: CreditCard,
  movements: CycleMovement[],
  plans: CyclePlan[] = [],
  now = today(),
): CreditCardCycle {
  // La línea de crédito la consume el importe completo, MSI incluidos.
  const rawDebt = Math.max(0, -card.current_balance);
  const limitUsedPct =
    card.credit_limit && card.credit_limit > 0
      ? (rawDebt / card.credit_limit) * 100
      : null;
  const availableCredit =
    card.credit_limit != null ? card.credit_limit - rawDebt : null;

  if (card.statement_day == null || card.payment_day == null) {
    return {
      configured: false,
      currentDebt: rawDebt,
      msiUnbilled: 0,
      rawDebt,
      statementDebt: 0,
      currentPeriodSpend: 0,
      lastClose: null,
      nextClose: null,
      dueDate: null,
      daysToNextClose: null,
      daysToDue: null,
      overdue: false,
      limitUsedPct,
      availableCredit,
      minimumPayment: card.minimum_payment ?? null,
    };
  }

  // El corte del día de hoy aún no ha cerrado: las compras de hoy entran en él.
  const nextClose = statementCloseFor(now, card.statement_day);
  const lastClose = statementClosePlus(nextClose, card.statement_day, -1);

  const msiTxIds = new Set(plans.map((p) => p.transaction_id));

  // Movimientos del periodo en curso: posteriores al último corte.
  let effectsAfterClose = 0;
  let currentPeriodSpend = 0;
  for (const m of movements) {
    if (m.occurred_at <= lastClose) continue;
    const effect = movementEffect(m, card.id);
    effectsAfterClose += effect;
    // De una compra a MSI el periodo no carga el total, sólo su mensualidad;
    // ésta se suma abajo junto con las de planes de periodos anteriores.
    if (effect < 0 && !msiTxIds.has(m.id)) currentPeriodSpend += -effect;
  }
  for (const plan of plans) {
    for (const i of plan.installments) {
      if (i.statement_period === nextClose) currentPeriodSpend += i.amount;
    }
  }

  // Al corte: rebobinamos y devolvemos lo que aún no estaba facturado
  // entonces, contando sólo las compras a MSI ya ocurridas en esa fecha.
  const balanceAtClose =
    card.current_balance -
    effectsAfterClose +
    unbilledInstallments(plans, lastClose, lastClose);
  const statementDebt = Math.max(0, -balanceAtClose);

  // A hoy: el periodo en curso ya devengó la mensualidad que se cobrará en el
  // próximo corte, así que lo no facturado se mide contra ese corte.
  const msiUnbilled = unbilledInstallments(plans, nextClose, null);
  const currentDebt = Math.max(0, -(card.current_balance + msiUnbilled));

  // Si el corte anterior ya está pagado, lo útil es la fecha del corte en curso.
  const dueDate =
    statementDebt > 0
      ? paymentDueFor(lastClose, card.statement_day, card.payment_day)
      : paymentDueFor(nextClose, card.statement_day, card.payment_day);
  const daysToDue = daysBetween(now, dueDate);

  return {
    configured: true,
    currentDebt,
    msiUnbilled,
    rawDebt,
    statementDebt,
    currentPeriodSpend,
    lastClose,
    nextClose,
    dueDate,
    daysToNextClose: daysBetween(now, nextClose),
    daysToDue,
    overdue: statementDebt > 0 && daysToDue < 0,
    limitUsedPct,
    availableCredit,
    minimumPayment: card.minimum_payment ?? null,
  };
}

// ---------------------------------------------------------------------------
// Pago de tarjeta
// ---------------------------------------------------------------------------

export type PaymentShortcut = {
  key: "total" | "statement" | "minimum";
  label: string;
  hint: string;
  /** Centavos, positivo. */
  amount: number;
};

/**
 * Atajos de monto que se le ofrecen a quien va a pagar, de mayor a menor.
 *
 * Se omite el que no aplica: sin saldo del corte no tiene sentido ofrecer
 * «lo del último corte», y el mínimo sólo aparece si está configurado. Los
 * duplicados se descartan para no ofrecer dos botones con el mismo importe.
 */
export function paymentShortcuts(cycle: CreditCardCycle): PaymentShortcut[] {
  const out: PaymentShortcut[] = [];

  if (cycle.rawDebt > 0) {
    out.push({
      key: "total",
      label: "Pago total",
      hint: "Liquida todo el saldo, MSI incluidos",
      amount: cycle.rawDebt,
    });
  }
  if (cycle.statementDebt > 0) {
    out.push({
      key: "statement",
      label: "Saldo del último corte",
      hint: "Lo que evita intereses",
      amount: cycle.statementDebt,
    });
  }
  if (cycle.minimumPayment != null && cycle.minimumPayment > 0) {
    out.push({
      key: "minimum",
      label: "Pago mínimo",
      hint: "Genera intereses sobre el resto",
      amount: cycle.minimumPayment,
    });
  }

  const seen = new Set<number>();
  return out.filter((s) => !seen.has(s.amount) && seen.add(s.amount));
}

/**
 * Parte del saldo del corte que un pago de `amount` dejaría sin cubrir, y que
 * por tanto va a generar intereses. 0 si el pago alcanza.
 */
export function interestExposure(
  cycle: CreditCardCycle,
  amount: number,
): number {
  return Math.max(0, cycle.statementDebt - Math.max(0, amount));
}

/** "5 mar" — etiqueta corta para fechas del ciclo. */
export const formatCycleDate = formatShortDate;

/** "en 5 días" / "hoy" / "hace 3 días" */
export function formatDayCount(days: number): string {
  if (days === 0) return "hoy";
  if (days === 1) return "mañana";
  if (days === -1) return "ayer";
  if (days > 0) return `en ${days} días`;
  return `hace ${-days} días`;
}
