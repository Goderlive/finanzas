import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { getHousehold, getHouseholdMembers } from "@/lib/household";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InviteForm } from "./invite-form";
import { CopyLink } from "./copy-link";

export default async function HogarPage() {
  const supabase = await createClient();
  const [household, members, session, { data: invitations }] =
    await Promise.all([
      getHousehold(),
      getHouseholdMembers(),
      getSessionProfile(),
      supabase
        .from("household_invitations")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const currentUserId = session?.user.id;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{household?.name ?? "Hogar"}</h1>
        <p className="text-sm text-muted-foreground">
          Moneda base: {household?.base_currency ?? "MXN"}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Miembros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between text-sm"
            >
              <span>
                {m.display_name}
                {m.id === currentUserId ? " (tú)" : ""}
              </span>
              <span className="text-xs text-muted-foreground">
                {m.role === "owner" ? "Titular" : "Miembro"}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {members.length < 2 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Invitar al segundo miembro</CardTitle>
            <CardDescription>
              Genera un enlace de invitación (válido 7 días).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteForm />
          </CardContent>
        </Card>
      ) : null}

      {invitations && invitations.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Invitaciones pendientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {invitations.map((inv) => (
              <div key={inv.id} className="space-y-1">
                <p className="text-sm font-medium">{inv.email}</p>
                <CopyLink link={`${base}/invite/${inv.token}`} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
