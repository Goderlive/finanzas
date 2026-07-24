"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, Home, Plus, Users, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: typeof Home };

const left: Item[] = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/cuentas", label: "Cuentas", icon: Wallet },
];
const right: Item[] = [
  { href: "/transacciones", label: "Movimientos", icon: ArrowLeftRight },
  { href: "/compartidos", label: "Compartidos", icon: Users },
];

export function BottomNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex max-w-3xl items-stretch px-2">
        {left.map((i) => (
          <Tab key={i.href} item={i} active={isActive(i.href)} />
        ))}

        <Link
          href="/transacciones/nueva"
          aria-label="Nueva transacción"
          className="mx-1 -mt-5 flex h-14 w-14 shrink-0 items-center justify-center self-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95"
        >
          <Plus className="h-6 w-6" />
        </Link>

        {right.map((i) => (
          <Tab key={i.href} item={i} active={isActive(i.href)} />
        ))}
      </div>
    </nav>
  );
}

function Tab({ item, active }: { item: Item; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] transition-colors",
        active ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <Icon className="h-5 w-5" />
      <span>{item.label}</span>
    </Link>
  );
}
