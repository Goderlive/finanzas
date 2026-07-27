// Renta fija: pagarés, CETES y depósitos a plazo.
//
// CONVENCIÓN DE CÁLCULO — base 360 (actual/360), que es la que usan los
// instrumentos de mercado de dinero en México: la tasa anual se prorratea
// entre 360 días. Con esa base todo encaja: 360 días = 12 meses de 30 días =
// 360 periodos diarios, así que los tres métodos de capitalización coinciden
// al cabo de un año exacto.
//
// Si tu banco liquida sobre 365 días, cambia DAY_BASIS y se ajusta todo.

import { addDays, daysBetween, today } from "@/lib/dates";
import type { CompoundingMethod } from "@/lib/supabase/database.types";

/** Días que la convención considera un año. */
export const DAY_BASIS = 360;

/** Umbral de aviso de vencimiento, en días. */
export const MATURITY_ALERT_DAYS = 7;

export type FixedIncome = {
  principal: number; // centavos
  annual_rate: number; // fracción anual: 0.1025 = 10.25%
  start_date: string;
  maturity_date: string;
  compounding: CompoundingMethod;
  reinvests_at_maturity: boolean;
};

export type FixedIncomeState = {
  /** Días transcurridos del plazo vigente. */
  daysElapsed: number;
  /** Días que dura el plazo. */
  daysTotal: number;
  /** Días para el vencimiento vigente; negativo si ya venció sin reinvertir. */
  daysRemaining: number;
  /** Valor a hoy, en centavos. */
  currentValue: number;
  /** Interés devengado desde el inicio (incluye renovaciones anteriores). */
  accruedInterest: number;
  /** Valor al final del plazo vigente. */
  maturityValue: number;
  /** Interés que falta por devengar hasta el vencimiento vigente. */
  pendingInterest: number;
  /** Vencimiento vigente: si reinvierte, el de la renovación en curso. */
  maturityDate: string;
  /** Renovaciones ya ocurridas (0 si es el plazo original). */
  termsCompleted: number;
  /** Venció y no se reinvierte: dejó de generar interés. */
  matured: boolean;
  /** Faltan menos de MATURITY_ALERT_DAYS días para el vencimiento. */
  maturingSoon: boolean;
};

/**
 * Factor de crecimiento de 1 peso durante `days` días.
 *
 *   simple   1 + r·d/360          el interés no se capitaliza
 *   monthly  (1 + r/12)^(d/30)    capitaliza cada mes de 30 días
 *   daily    (1 + r/360)^d        capitaliza cada día
 */
export function growthFactor(
  annualRate: number,
  days: number,
  compounding: CompoundingMethod,
): number {
  if (days <= 0) return 1;
  switch (compounding) {
    case "simple":
      return 1 + (annualRate * days) / DAY_BASIS;
    case "monthly":
      return Math.pow(1 + annualRate / 12, days / (DAY_BASIS / 12));
    case "daily":
      return Math.pow(1 + annualRate / DAY_BASIS, days);
  }
}

/** Valor de `principal` tras `days` días, redondeado a centavos. */
export function valueAfter(
  principal: number,
  annualRate: number,
  days: number,
  compounding: CompoundingMethod,
): number {
  return Math.round(principal * growthFactor(annualRate, days, compounding));
}

/**
 * Estado de una inversión de renta fija a una fecha.
 *
 * Si `reinvests_at_maturity` está activo y ya pasó el vencimiento, el plazo se
 * renueva por la misma duración y el valor acumulado pasa a ser el nuevo
 * principal: es lo que hace un pagaré con renovación automática. Sin esa
 * bandera, el instrumento deja de generar interés el día del vencimiento.
 */
export function computeFixedIncome(
  fi: FixedIncome,
  now = today(),
): FixedIncomeState {
  const termDays = daysBetween(fi.start_date, fi.maturity_date);
  const elapsedTotal = Math.max(0, daysBetween(fi.start_date, now));

  // Plazo inválido (vencimiento en o antes del inicio): sin devengo.
  if (termDays <= 0) {
    return {
      daysElapsed: 0,
      daysTotal: 0,
      daysRemaining: 0,
      currentValue: fi.principal,
      accruedInterest: 0,
      maturityValue: fi.principal,
      pendingInterest: 0,
      maturityDate: fi.maturity_date,
      termsCompleted: 0,
      matured: true,
      maturingSoon: false,
    };
  }

  let termsCompleted = 0;
  if (fi.reinvests_at_maturity && elapsedTotal >= termDays) {
    termsCompleted = Math.floor(elapsedTotal / termDays);
  }

  // Capital al empezar el plazo vigente: el principal capitalizado por cada
  // renovación completa. Para 'simple' esto es correcto igualmente, porque en
  // cada renovación el interés del plazo anterior se suma al capital.
  const termFactor = growthFactor(fi.annual_rate, termDays, fi.compounding);
  const baseCapital = Math.round(
    fi.principal * Math.pow(termFactor, termsCompleted),
  );

  const daysIntoTerm = elapsedTotal - termsCompleted * termDays;
  // Sin reinversión el devengo se congela el día del vencimiento.
  const accruingDays = Math.min(daysIntoTerm, termDays);

  const currentValue = valueAfter(
    baseCapital,
    fi.annual_rate,
    accruingDays,
    fi.compounding,
  );
  const maturityValue = valueAfter(
    baseCapital,
    fi.annual_rate,
    termDays,
    fi.compounding,
  );
  const maturityDate = addDays(
    fi.start_date,
    (termsCompleted + 1) * termDays,
  );
  const daysRemaining = daysBetween(now, maturityDate);
  const matured = !fi.reinvests_at_maturity && daysIntoTerm >= termDays;

  return {
    daysElapsed: accruingDays,
    daysTotal: termDays,
    daysRemaining,
    currentValue,
    accruedInterest: currentValue - fi.principal,
    maturityValue,
    pendingInterest: maturityValue - currentValue,
    maturityDate,
    termsCompleted,
    matured,
    maturingSoon:
      !matured && daysRemaining >= 0 && daysRemaining < MATURITY_ALERT_DAYS,
  };
}

/**
 * Rendimiento anualizado efectivo del instrumento, para comparar entre sí
 * plazos y capitalizaciones distintas.
 */
export function effectiveAnnualRate(
  annualRate: number,
  compounding: CompoundingMethod,
): number {
  return growthFactor(annualRate, DAY_BASIS, compounding) - 1;
}
