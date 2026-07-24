import { z } from "zod";

export const categoryKinds = ["expense", "income"] as const;

export const categoryFormSchema = z.object({
  name: z.string().trim().min(1, "Escribe un nombre").max(60),
  kind: z.enum(categoryKinds),
  parentId: z.string().optional(), // "none" o un uuid
  icon: z.string().trim().max(40).optional(),
  color: z.string().trim().max(20).optional(),
});

export type CategoryFormValues = z.infer<typeof categoryFormSchema>;
