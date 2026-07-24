import { z } from "zod";

export const splitTypes = ["equal", "percentage", "fixed"] as const;

export const sharedExpenseSchema = z.object({
  description: z.string().trim().min(1, "Escribe una descripción").max(200),
  amount: z.string().trim().min(1, "Escribe un monto"),
  paidBy: z.string().uuid("Selecciona quién pagó"),
  splitType: z.enum(splitTypes),
  p0: z.string().uuid(),
  v0: z.string().optional(),
  p1: z.string().uuid(),
  v1: z.string().optional(),
  occurredAt: z.string().min(1, "Selecciona una fecha"),
});

export const settlementSchema = z
  .object({
    fromProfile: z.string().uuid("Selecciona quién paga"),
    toProfile: z.string().uuid("Selecciona quién recibe"),
    amount: z.string().trim().min(1, "Escribe un monto"),
    settledAt: z.string().min(1, "Selecciona una fecha"),
    note: z.string().trim().max(200).optional(),
  })
  .refine((d) => d.fromProfile !== d.toProfile, {
    message: "Deben ser personas distintas",
    path: ["toProfile"],
  });

export type SharedExpenseValues = z.infer<typeof sharedExpenseSchema>;
export type SettlementValues = z.infer<typeof settlementSchema>;
