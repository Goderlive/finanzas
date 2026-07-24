"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireHousehold } from "@/lib/auth";

export type InviteState = { error?: string; link?: string; email?: string };

export async function createInvite(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const parsed = z
    .string()
    .email("Correo inválido")
    .safeParse(
      String(formData.get("email") ?? "")
        .trim()
        .toLowerCase(),
    );
  if (!parsed.success) return { error: "Correo inválido" };

  await requireHousehold();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invitation", {
    p_email: parsed.data,
  });
  if (error) return { error: error.message };

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  revalidatePath("/hogar");
  return { link: `${base}/invite/${data}`, email: parsed.data };
}
