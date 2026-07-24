import { z } from "zod";

export const transactionTypes = ["expense", "income", "transfer"] as const;

export const transactionFormSchema = z
  .object({
    type: z.enum(transactionTypes),
    amount: z.string().trim().min(1, "Escribe un monto"),
    accountId: z.string().uuid("Selecciona una cuenta"),
    transferAccountId: z.string().optional(),
    categoryId: z.string().optional(), // "none" o uuid
    description: z.string().trim().max(200).optional(),
    occurredAt: z.string().min(1, "Selecciona una fecha"),
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
