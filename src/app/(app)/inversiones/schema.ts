import { z } from "zod";

export const compoundingMethods = ["simple", "monthly", "daily"] as const;

/** Cuenta a la que se puede vincular una inversión (activo, no archivada). */
export type LinkableAccount = {
  id: string;
  name: string;
  owner_id: string | null;
  current_balance: number;
};

/**
 * De dónde sale el capital al vincular una inversión a una cuenta.
 *
 * Vincular significa «este dinero está DENTRO del saldo de esa cuenta», así
 * que hay que decir cómo llegó ahí.
 *
 *   already   el saldo ya lo incluye. No se toca nada.
 *   transfer  viene de otra cuenta. Se registra el traspaso.
 *   external  es dinero que la app nunca vio. Sube el saldo de la cuenta.
 *
 * El efecto de cada una sobre el patrimonio neto está en el comentario de
 * `applyFunding` (actions.ts): no es el mismo en las tres.
 */
export const fundingSources = ["already", "transfer", "external"] as const;
export type FundingSource = (typeof fundingSources)[number];

/** `"none"` es el valor del select cuando la inversión queda sin vincular. */
export const NO_ACCOUNT = "none";

export const linkSchema = z.object({
  investmentId: z.string().uuid(),
  accountId: z.string().min(1, "Selecciona una cuenta"),
  funding: z.enum(fundingSources),
  fromAccountId: z.string().optional(),
  occurredAt: z.string().optional(),
});

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
