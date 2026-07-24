export type Member = { id: string; name: string };

export type ExpenseWithSplits = {
  id: string;
  amount: number;
  paid_by: string;
  splits: { profile_id: string; owed_amount: number }[];
};

export type SettlementRow = {
  from_profile: string;
  to_profile: string;
  amount: number;
};

export type BalanceResult = {
  /** Monto absoluto que el deudor debe al acreedor (centavos). 0 = a mano. */
  amount: number;
  debtor: Member | null;
  creditor: Member | null;
};

/**
 * Balance "quién le debe a quién" para un hogar de 2 personas.
 * net(A) > 0 significa que B le debe a A.
 */
export function computeBalance(
  members: Member[],
  expenses: ExpenseWithSplits[],
  settlements: SettlementRow[],
): BalanceResult {
  if (members.length < 2) return { amount: 0, debtor: null, creditor: null };

  const [a, b] = members;
  let net = 0; // a favor de A

  for (const e of expenses) {
    if (e.paid_by === a.id) net += e.amount;
    for (const s of e.splits) {
      if (s.profile_id === a.id) net -= s.owed_amount;
    }
  }

  for (const s of settlements) {
    if (s.from_profile === a.id && s.to_profile === b.id) net += s.amount;
    else if (s.from_profile === b.id && s.to_profile === a.id) net -= s.amount;
  }

  if (net > 0) return { amount: net, debtor: b, creditor: a };
  if (net < 0) return { amount: -net, debtor: a, creditor: b };
  return { amount: 0, debtor: null, creditor: null };
}
