import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { NewTransaction } from "../new-transaction";

export default async function NuevaTransaccionPage() {
  const supabase = await createClient();
  const [{ data: accounts }, { data: categories }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name")
      .eq("is_archived", false)
      .order("created_at", { ascending: true }),
    supabase
      .from("categories")
      .select("id, name, kind, parent_id")
      .eq("is_archived", false)
      .order("name", { ascending: true }),
  ]);

  const today = new Date().toLocaleDateString("en-CA");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/transacciones"
          aria-label="Volver"
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-semibold">Nuevo movimiento</h1>
      </div>
      <NewTransaction
        accounts={accounts ?? []}
        categories={categories ?? []}
        defaultDate={today}
      />
    </div>
  );
}
