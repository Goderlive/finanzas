import { z } from "zod";

export const transactionTypes = ["expense", "income", "transfer"] as const;

/** Plazos que ofrecen los bancos en México. */
export const msiMonthOptions = [3, 6, 9, 12, 18, 24] as const;

export const transactionFormSchema = z
  .object({
    type: z.enum(transactionTypes),
    amount: z.string().trim().min(1, "Escribe un monto"),
    accountId: z.string().uuid("Selecciona una cuenta"),
    transferAccountId: z.string().optional(),
    categoryId: z.string().optional(), // "none" o uuid
    description: z.string().trim().max(200).optional(),
    occurredAt: z.string().min(1, "Selecciona una fecha"),
    // Meses sin intereses: sólo aplica a gastos con tarjeta de crédito.
    msi: z
      .string()
      .optional()
      .transform((v) => v === "on" || v === "true"),
    msiMonths: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v && v.length > 0 ? Number(v) : null)),
  })
  .refine(
    (d) =>
      !d.msi ||
      (d.msiMonths !== null &&
        Number.isInteger(d.msiMonths) &&
        d.msiMonths >= 2 &&
        d.msiMonths <= 120),
    { message: "Elige el número de mensualidades", path: ["msiMonths"] },
  )
  .refine((d) => !d.msi || d.type === "expense", {
    message: "Sólo un gasto puede diferirse a meses sin intereses",
    path: ["msi"],
  })
  .refine(
    (d) =>
      d.type !== "transfer" ||
      (!!d.transferAccountId &&
        d.transferAccountId !== "none" &&
        d.transferAccountId !== d.accountId),
    {
      message: "Elige una cuenta destino distinta a la de origen",
      path: ["transferAccountId"],
    },
  );

export type TransactionFormValues = z.infer<typeof transactionFormSchema>;
