import { z } from "zod";

export const accountTypes = [
  "checking",
  "savings",
  "cash",
  "credit_card",
  "investment",
  "loan",
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
  // Se captura SIEMPRE como magnitud positiva. En un pasivo el usuario
  // escribe cuánto debe y la acción le pone el signo negativo (regla de
  // signo del proyecto, migración 0018).
  initialBalance: z.string().trim().optional(),
  // Ciclo de tarjeta de crédito; sólo se guardan si type = 'credit_card'.
  statementDay: dayOfMonth,
  paymentDay: dayOfMonth,
  creditLimit: z.string().trim().optional(),
  minimumPayment: z.string().trim().optional(),
});

export type AccountFormValues = z.infer<typeof accountFormSchema>;

/** Tipos de cuenta que representan una deuda. Espejo de account_class_for. */
export const liabilityAccountTypes: readonly AccountFormValues["type"][] = [
  "credit_card",
  "loan",
];

export function isLiabilityType(type: string): boolean {
  return (liabilityAccountTypes as readonly string[]).includes(type);
}

export const cardPaymentSchema = z.object({
  fromAccountId: z.string().uuid("Elige la cuenta de origen"),
  cardId: z.string().uuid("Elige la tarjeta a pagar"),
  amount: z.string().trim().min(1, "Escribe un monto"),
  occurredAt: z.string().min(1, "Selecciona una fecha"),
  description: z.string().trim().max(200).optional(),
});

export type CardPaymentValues = z.infer<typeof cardPaymentSchema>;
