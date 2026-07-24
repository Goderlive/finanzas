import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import type { Tables } from "@/lib/supabase/database.types";

/** Hogar del usuario actual (o null). Cacheado por request. */
export const getHousehold = cache(
  async (): Promise<Tables<"households"> | null> => {
    const session = await getSessionProfile();
    if (!session?.profile?.household_id) return null;

    const supabase = await createClient();
    const { data } = await supabase
      .from("households")
      .select("*")
      .eq("id", session.profile.household_id)
      .maybeSingle();
    return data ?? null;
  },
);

/** Miembros del hogar (perfiles). Cacheado por request. */
export const getHouseholdMembers = cache(
  async (): Promise<Tables<"profiles">[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: true });
    return data ?? [];
  },
);
