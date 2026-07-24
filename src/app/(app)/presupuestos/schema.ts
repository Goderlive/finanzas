import { z } from "zod";

export const budgetFormSchema = z.object({
  categoryId: z.string().uuid("Selecciona una categoría"),
  amount: z.string().trim().min(1, "Escribe un monto"),
  month: z.string().regex(/^\d{4}-\d{2}-01$/, "Mes inválido"),
  rollover: z.string().optional(),
});

export type BudgetFormValues = z.infer<typeof budgetFormSchema>;
