import { z } from "zod";

export const compoundingMethods = ["simple", "monthly", "daily"] as const;

/** Renta variable: acciones, ETFs, cripto. */
const variableFields = z.object({
  investmentType: z.literal("variable"),
  symbol: z.string().trim().min(1, "Escribe un símbolo").max(20),
  name: z.string().trim().max(60).optional(),
  ownership: z.enum(["joint", "personal"]),
  quantity: z.string().trim().min(1, "Escribe la cantidad"),
  purchasePrice: z.string().trim().min(1, "Escribe el precio de compra"),
  purchaseDate: z.string().optional(),
});

/** Renta fija: pagarés, CETES, depósitos a plazo. */
const fixedFields = z.object({
  investmentType: z.literal("fixed"),
  name: z.string().trim().min(1, "Escribe un nombre").max(60),
  ownership: z.enum(["joint", "personal"]),
  principal: z.string().trim().min(1, "Escribe el monto invertido"),
  annualRate: z.string().trim().min(1, "Escribe la tasa anual"),
  startDate: z.string().min(1, "Selecciona la fecha de inicio"),
  maturityDate: z.string().min(1, "Selecciona la fecha de vencimiento"),
  compounding: z.enum(compoundingMethods),
  reinvests: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
});

export const investmentSchema = z.discriminatedUnion("investmentType", [
  variableFields,
  fixedFields,
]);

export const lotSchema = z.object({
  investmentId: z.string().uuid(),
  type: z.enum(["buy", "sell"]),
  quantity: z.string().trim().min(1, "Escribe la cantidad"),
  price: z.string().trim().min(1, "Escribe el precio"),
  occurredAt: z.string().min(1, "Selecciona la fecha"),
  note: z.string().trim().max(120).optional(),
});

export const priceSchema = z.object({
  investmentId: z.string().uuid(),
  price: z.string().trim().min(1, "Escribe el precio"),
  asOf: z.string().min(1, "Selecciona la fecha"),
});

export type InvestmentValues = z.infer<typeof investmentSchema>;
