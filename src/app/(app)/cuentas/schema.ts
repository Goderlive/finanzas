import { z } from "zod";

export const accountTypes = [
  "checking",
  "savings",
  "cash",
  "credit_card",
  "investment",
  "other",
] as const;

export const accountFormSchema = z.object({
  name: z.string().trim().min(1, "Escribe un nombre").max(60),
  type: z.enum(accountTypes),
  ownership: z.enum(["joint", "personal"]),
  initialBalance: z.string().trim().optional(),
});

export type AccountFormValues = z.infer<typeof accountFormSchema>;
