import { z } from "zod";

export const debtTypes = ["loan", "credit_card", "mortgage", "other"] as const;

export const debtFormSchema = z.object({
  name: z.string().trim().min(1, "Escribe un nombre").max(60),
  type: z.enum(debtTypes),
  ownership: z.enum(["joint", "personal"]),
  principal: z.string().trim().optional(),
  currentBalance: z.string().trim().min(1, "Escribe el saldo actual"),
  interestRate: z.string().trim().optional(), // % anual (ej. 42)
  minimumPayment: z.string().trim().optional(),
  statementDay: z.string().trim().optional(),
  dueDay: z.string().trim().optional(),
});

export type DebtFormValues = z.infer<typeof debtFormSchema>;
