import type {
  AccountType,
  DebtType,
  TransactionType,
} from "@/lib/supabase/database.types";

export const accountTypeLabels: Record<AccountType, string> = {
  checking: "Cuenta bancaria",
  savings: "Ahorro",
  cash: "Efectivo",
  credit_card: "Tarjeta de crédito",
  investment: "Inversión",
  other: "Otra",
};

export const transactionTypeLabels: Record<TransactionType, string> = {
  income: "Ingreso",
  expense: "Gasto",
  transfer: "Transferencia",
};

export const debtTypeLabels: Record<DebtType, string> = {
  loan: "Préstamo",
  credit_card: "Tarjeta de crédito",
  mortgage: "Hipoteca",
  other: "Otra",
};
