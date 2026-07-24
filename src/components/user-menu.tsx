"use client";

import Link from "next/link";
import {
  BarChart3,
  CreditCard,
  Home,
  LogOut,
  PieChart,
  PiggyBank,
  Tags,
  TrendingUp,
  User,
} from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({
  displayName,
  email,
}: {
  displayName: string;
  email: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Cuenta">
          <User className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="font-medium">{displayName}</div>
          <div className="text-xs font-normal text-muted-foreground">
            {email}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/reportes" className="flex w-full items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Reportes
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/presupuestos" className="flex w-full items-center gap-2">
            <PieChart className="h-4 w-4" />
            Presupuestos
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/deudas" className="flex w-full items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Deudas
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/ahorros" className="flex w-full items-center gap-2">
            <PiggyBank className="h-4 w-4" />
            Ahorros
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/inversiones" className="flex w-full items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Inversiones
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/categorias" className="flex w-full items-center gap-2">
            <Tags className="h-4 w-4" />
            Categorías
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/hogar" className="flex w-full items-center gap-2">
            <Home className="h-4 w-4" />
            Hogar
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <form action={logout} className="w-full">
            <button
              type="submit"
              className="flex w-full items-center gap-2 text-left"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
