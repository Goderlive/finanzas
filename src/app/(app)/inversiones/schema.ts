import { z } from "zod";

export const investmentSchema = z.object({
  symbol: z.string().trim().min(1, "Escribe un símbolo").max(20),
  name: z.string().trim().max(60).optional(),
  ownership: z.enum(["joint", "personal"]),
  quantity: z.string().trim().min(1, "Escribe la cantidad"),
  purchasePrice: z.string().trim().min(1, "Escribe el precio de compra"),
  purchaseDate: z.string().optional(),
});

export const priceSchema = z.object({
  investmentId: z.string().uuid(),
  price: z.string().trim().min(1, "Escribe el precio"),
  asOf: z.string().min(1, "Selecciona la fecha"),
});

export type InvestmentValues = z.infer<typeof investmentSchema>;
