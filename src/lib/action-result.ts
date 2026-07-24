export type ActionResult = { ok: boolean; error?: string };

export const OK: ActionResult = { ok: true };

export function fail(error: string): ActionResult {
  return { ok: false, error };
}
