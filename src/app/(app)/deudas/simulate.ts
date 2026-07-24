export type PayoffResult = {
  paysOff: boolean;
  months: number;
  totalInterest: number; // centavos
};

/**
 * Amortización mensual simple. `annualRate` en decimal (0.42 = 42% anual),
 * montos en centavos. Devuelve meses hasta liquidar e interés total pagado.
 */
export function simulatePayoff(
  balanceCents: number,
  annualRate: number,
  monthlyPaymentCents: number,
): PayoffResult {
  if (balanceCents <= 0) return { paysOff: true, months: 0, totalInterest: 0 };
  if (monthlyPaymentCents <= 0) {
    return { paysOff: false, months: Infinity, totalInterest: Infinity };
  }

  const r = annualRate / 12;
  let bal = balanceCents;
  let totalInterest = 0;
  let months = 0;

  while (bal > 0) {
    const interest = Math.round(bal * r);
    // Si el pago no cubre el interés, la deuda nunca se salda.
    if (r > 0 && monthlyPaymentCents <= interest) {
      return { paysOff: false, months: Infinity, totalInterest: Infinity };
    }
    const pay = Math.min(monthlyPaymentCents, bal + interest);
    bal = bal + interest - pay;
    totalInterest += interest;
    months += 1;
    if (months > 1200) {
      return { paysOff: false, months: Infinity, totalInterest: Infinity };
    }
  }

  return { paysOff: true, months, totalInterest };
}
