import { z } from "zod";

export const accountTypes = [
  "checking",
  "savings",
  "cash",
  "credit_card",
  "investment",
  "other",
] as const;

/** Día del mes opcional (1-31). Vacío => null. */
const dayOfMonth = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? Number(v) : null))
  .refine(
    (v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 31),
    "El día debe estar entre 1 y 31",
  );

export const accountFormSchema = z.object({
  name: z.string().trim().min(1, "Escribe un nombre").max(60),
  type: z.enum(accountTypes),
  ownership: z.enum(["joint", "personal"]),
  initialBalance: z.string().trim().optional(),
  // Ciclo de tarjeta de crédito; sólo se guardan si type = 'credit_card'.
  statementDay: dayOfMonth,
  paymentDay: dayOfMonth,
  creditLimit: z.string().trim().optional(),
});

export type AccountFormValues = z.infer<typeof accountFormSchema>;
