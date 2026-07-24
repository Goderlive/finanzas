import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";

export function AppHeader({
  householdName,
  displayName,
  email,
}: {
  householdName: string;
  displayName: string;
  email: string;
}) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/" className="truncate font-semibold">
          {householdName}
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <UserMenu displayName={displayName} email={email} />
        </div>
      </div>
    </header>
  );
}
