"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type OnboardingState = { error?: string };

const schema = z.object({
  name: z.string().trim().min(1, "Escribe un nombre para el hogar"),
  displayName: z.string().trim().min(1, "Escribe tu nombre"),
});

export async function createHousehold(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const parsed = schema.safeParse({
    name: formData.get("name"),
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_household", {
    p_name: parsed.data.name,
    p_display_name: parsed.data.displayName,
  });
  if (error) return { error: error.message };

  redirect("/");
}
