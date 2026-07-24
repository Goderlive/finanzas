"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AuthState = { error?: string; message?: string };

const emailPwd = z.object({
  email: z.string().email("Correo inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

// Solo permite rutas internas relativas como destino de redirección.
function safeNext(next: FormDataEntryValue | null): string {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "";
}

export async function login(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = emailPwd.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Correo o contraseña incorrectos" };

  redirect(safeNext(formData.get("next")) || "/");
}

export async function register(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const schema = emailPwd.extend({
    displayName: z.string().trim().min(1, "Escribe tu nombre"),
  });
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { display_name: parsed.data.displayName } },
  });
  if (error) return { error: error.message };

  const next = safeNext(formData.get("next"));

  // Supabase self-hosted sin SMTP: el registro no crea sesión porque exige
  // confirmar el correo. Autoconfirmamos vía admin (service_role) e iniciamos
  // sesión, para un alta sin fricción en este entorno privado de 2 usuarios.
  if (!data.session) {
    if (data.user) {
      const admin = createAdminClient();
      const { error: confirmErr } = await admin.auth.admin.updateUserById(
        data.user.id,
        { email_confirm: true },
      );
      if (!confirmErr) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (!signInErr) redirect(next || "/onboarding");
      }
    }
    return { message: "Cuenta creada. Ya puedes iniciar sesión." };
  }

  redirect(next || "/onboarding");
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function acceptInvite(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const token = String(formData.get("token") ?? "");
  if (!token) return { error: "Invitación inválida" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/invite/${token}`);

  const { error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) return { error: error.message };

  redirect("/");
}
