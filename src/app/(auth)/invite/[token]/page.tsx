import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSessionProfile } from "@/lib/auth";
import { AcceptInviteForm } from "./accept-invite-form";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await getSessionProfile();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invitación a un hogar</CardTitle>
        <CardDescription>
          Te invitaron a compartir las finanzas del hogar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {session ? (
          session.profile?.household_id ? (
            <p className="text-sm text-muted-foreground">
              Ya perteneces a un hogar, no puedes aceptar otra invitación.
            </p>
          ) : (
            <AcceptInviteForm token={token} />
          )
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Inicia sesión o crea una cuenta para aceptar la invitación.
            </p>
            <div className="flex gap-2">
              <Button asChild className="flex-1">
                <Link href={`/register?next=/invite/${token}`}>Registrarme</Link>
              </Button>
              <Button asChild variant="outline" className="flex-1">
                <Link href={`/login?next=/invite/${token}`}>Iniciar sesión</Link>
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
