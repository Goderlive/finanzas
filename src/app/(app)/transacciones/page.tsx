import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { getHousehold, getHouseholdMembers } from "@/lib/household";
import { TransactionsView } from "./transactions-view";
import { TransactionFilters } from "./transaction-filters";
import { today } from "@/lib/dates";
import type { Tables } from "@/lib/supabase/database.types";
import {
  expandCategories,
  parseFilters,
  resolveRange,
  UNCATEGORIZED,
} from "./filters";

/**
 * Tope de seguridad. Con un periodo puesto (el default es el mes en curso) no
 * se alcanza; existe para que «Todo» en un hogar con años de historia no baje
 * la base entera. Si se toca, la vista lo dice en vez de mentir en los totales.
 */
const MAX_ROWS = 500;

/** Texto que se puede meter en un filtro de PostgREST sin romperlo. */
function sanitizeSearch(q: string): string {
  return q.replace(/[,()%*\\"]/g, " ").trim();
}

export default async function TransaccionesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseFilters(await searchParams);
  const defaultDate = today();
  const range = resolveRange(filters, defaultDate);

  const supabase = await createClient();

  // Las categorías se necesitan ANTES de consultar: filtrar por una categoría
  // padre significa filtrar también por sus hijas, y esa expansión sólo se
  // puede hacer con el árbol en la mano.
  const [{ data: accounts }, { data: categories }, session, household, members] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("id, name, is_archived, type, statement_day, payment_day")
        .order("created_at", { ascending: true }),
      supabase.from("categories").select("id, name, kind, parent_id, is_archived"),
      getSessionProfile(),
      getHousehold(),
      getHouseholdMembers(),
    ]);

  const allAccounts = accounts ?? [];
  const allCategories = categories ?? [];

  let query = supabase
    .from("transactions")
    .select("*")
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (range.from) query = query.gte("occurred_at", range.from);
  if (range.to) query = query.lte("occurred_at", range.to);
  if (filters.types.length) query = query.in("type", filters.types);
  if (filters.accounts.length) {
    // El traspaso se ve desde cualquiera de sus dos lados: quien filtra por
    // «Ahorro» espera ver también lo que llegó ahí desde otra cuenta.
    const ids = filters.accounts.join(",");
    query = query.or(`account_id.in.(${ids}),transfer_account_id.in.(${ids})`);
  }

  if (filters.categories.length) {
    const ids = expandCategories(filters.categories, allCategories);
    const wantsNone = filters.categories.includes(UNCATEGORIZED);
    // Un traspaso no lleva categoría por diseño, no por olvido: no debe caer
    // en «Sin categoría» salvo que se pidan los traspasos explícitamente.
    const noneClause = filters.types.includes("transfer")
      ? "category_id.is.null"
      : "and(category_id.is.null,type.neq.transfer)";

    if (ids.length && wantsNone) {
      query = query.or(`category_id.in.(${ids.join(",")}),${noneClause}`);
    } else if (ids.length) {
      query = query.in("category_id", ids);
    } else if (wantsNone) {
      query = query.or(noneClause);
    }
  }

  const search = sanitizeSearch(filters.q);
  if (search) query = query.ilike("description", `%${search}%`);

  const { data: rows } = await query;
  const found = rows ?? [];

  // Un traspaso son dos asientos. Se muestra una sola vez, desde el lado que
  // sale (amount < 0), que es el que lee natural: «Ahorro → Tarjeta». Pero si
  // el filtro sólo dejó pasar el otro lado, ése es el que se muestra: mejor
  // verlo al revés que no verlo.
  const legsByGroup = new Map<string, number>();
  for (const t of found) {
    if (t.transfer_group_id) {
      legsByGroup.set(
        t.transfer_group_id,
        (legsByGroup.get(t.transfer_group_id) ?? 0) + 1,
      );
    }
  }
  const visible = found.filter((t: Tables<"transactions">) => {
    if (t.type !== "transfer") return true;
    if (!t.transfer_group_id) return t.amount < 0;
    return (legsByGroup.get(t.transfer_group_id) ?? 0) < 2 || t.amount < 0;
  });

  // Totales de lo filtrado. Los traspasos no entran: mueven dinero entre
  // cuentas propias, no son ingreso ni gasto del hogar.
  let income = 0;
  let expense = 0;
  for (const t of visible) {
    if (t.type === "income") income += t.amount;
    else if (t.type === "expense") expense += Math.abs(t.amount);
  }

  const currency = household?.base_currency ?? "MXN";

  const accountNames = Object.fromEntries(
    allAccounts.map((a) => [a.id, a.name]),
  );
  const categoryNames = Object.fromEntries(
    allCategories.map((c) => [c.id, c.name]),
  );
  const memberNames = Object.fromEntries(
    members.map((m) => [m.id, m.display_name]),
  );

  const formAccounts = allAccounts
    .filter((a) => !a.is_archived)
    .map((a) => ({ id: a.id, name: a.name }));
  const formCategories = allCategories
    .filter((c) => !c.is_archived)
    .map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      parent_id: c.parent_id,
    }));

  // En los filtros sí aparecen las archivadas: el historial que dejaron sigue
  // ahí y es justo lo que se viene a buscar.
  const filterAccounts = allAccounts.map((a) => ({
    id: a.id,
    name: a.name,
    archived: a.is_archived,
  }));
  const filterCategories = allCategories.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    parent_id: c.parent_id,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Movimientos</h1>

      <TransactionFilters
        filters={filters}
        accounts={filterAccounts}
        categories={filterCategories}
        today={defaultDate}
      />

      <TransactionsView
        transactions={visible}
        accounts={formAccounts}
        categories={formCategories}
        accountNames={accountNames}
        categoryNames={categoryNames}
        memberNames={memberNames}
        currency={currency}
        defaultDate={defaultDate}
        currentUserId={session?.user.id ?? ""}
        householdId={household?.id ?? ""}
        totals={{ income, expense, count: visible.length }}
        truncated={found.length >= MAX_ROWS}
      />
    </div>
  );
}
