import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSessionProfile } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (session.profile?.household_id) redirect("/");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Crea tu hogar</CardTitle>
          <CardDescription>
            Un hogar agrupa tus cuentas y las de tu pareja. Después podrás
            invitar al segundo miembro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingForm
            defaultName={session.profile?.display_name ?? ""}
          />
        </CardContent>
      </Card>
    </main>
  );
}
