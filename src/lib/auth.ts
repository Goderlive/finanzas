import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

export type SessionProfile = {
  user: User;
  profile: Tables<"profiles"> | null;
};

/**
 * Devuelve el usuario autenticado y su perfil (o null si no hay sesión).
 * Cacheado por request para no repetir la consulta en cada Server Component.
 */
export const getSessionProfile = cache(
  async (): Promise<SessionProfile | null> => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    return { user, profile: profile ?? null };
  },
);

/**
 * Garantiza sesión + hogar. Redirige si falta alguno. Úsalo en Server Actions
 * y páginas protegidas para obtener los IDs de forma segura.
 */
export async function requireHousehold(): Promise<{
  userId: string;
  householdId: string;
  profile: Tables<"profiles">;
}> {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (!session.profile?.household_id) redirect("/onboarding");
  return {
    userId: session.user.id,
    householdId: session.profile.household_id,
    profile: session.profile,
  };
}
