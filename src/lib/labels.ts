import type {
  AccountType,
  CompoundingMethod,
  DebtType,
  InvestmentType,
  TransactionType,
} from "@/lib/supabase/database.types";

export const accountTypeLabels: Record<AccountType, string> = {
  checking: "Cuenta bancaria",
  savings: "Ahorro",
  cash: "Efectivo",
  credit_card: "Tarjeta de crédito",
  investment: "Inversión",
  loan: "Préstamo",
  other: "Otra",
};

export const transactionTypeLabels: Record<TransactionType, string> = {
  income: "Ingreso",
  expense: "Gasto",
  transfer: "Transferencia",
};

export const investmentTypeLabels: Record<InvestmentType, string> = {
  fixed: "Renta fija",
  variable: "Renta variable",
};

export const compoundingLabels: Record<CompoundingMethod, string> = {
  simple: "Interés simple",
  monthly: "Capitaliza cada mes",
  daily: "Capitaliza diario",
};

export const debtTypeLabels: Record<DebtType, string> = {
  loan: "Préstamo",
  credit_card: "Tarjeta de crédito",
  mortgage: "Hipoteca",
  other: "Otra",
};
