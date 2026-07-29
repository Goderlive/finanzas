import type { TransactionType } from "@/lib/supabase/database.types";

/**
 * Los valores que acepta `?tipo=` en /nuevo. Son palabras en español porque
 * viven en el manifest y quedan grabadas en el launcher del teléfono cuando
 * se instala la PWA: renombrarlas obligaría a reinstalar para actualizar los
 * accesos directos, así que se tratan como contrato.
 */
export const quickTypes = ["gasto", "compartido", "ingreso"] as const;

export type QuickType = (typeof quickTypes)[number];

/** A dónde cae cualquier cosa que no esté en la lista blanca. */
export const DEFAULT_QUICK_TYPE: QuickType = "gasto";

/**
 * Valida `?tipo=` contra la lista blanca. Un valor desconocido —o repetido en
 * la URL, que Next entrega como arreglo— no es un error que valga interrumpir
 * una captura: cae al formulario de gasto, que es el caso común.
 */
export function parseQuickType(raw: string | string[] | undefined): QuickType {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return quickTypes.includes(value as QuickType)
    ? (value as QuickType)
    : DEFAULT_QUICK_TYPE;
}

/** El `type` de la tabla `transactions` que corresponde. */
export const quickToTransactionType: Record<
  Exclude<QuickType, "compartido">,
  Extract<TransactionType, "expense" | "income">
> = {
  gasto: "expense",
  ingreso: "income",
};

export const quickTitles: Record<QuickType, string> = {
  gasto: "Nuevo gasto",
  compartido: "Gasto compartido",
  ingreso: "Nuevo ingreso",
};
