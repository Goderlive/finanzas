import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { getHousehold } from "@/lib/household";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (!session.profile?.household_id) redirect("/onboarding");

  const household = await getHousehold();

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader
        householdName={household?.name ?? "Mi hogar"}
        displayName={session.profile.display_name}
        email={session.user.email ?? ""}
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-28">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
