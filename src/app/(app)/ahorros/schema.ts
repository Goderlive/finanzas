import { z } from "zod";

export const savingsGoalSchema = z.object({
  name: z.string().trim().min(1, "Escribe un nombre").max(60),
  ownership: z.enum(["joint", "personal"]),
  targetAmount: z.string().trim().min(1, "Escribe el monto objetivo"),
  currentAmount: z.string().trim().optional(),
  targetDate: z.string().optional(), // YYYY-MM-DD o vacío
});

export type SavingsGoalValues = z.infer<typeof savingsGoalSchema>;
