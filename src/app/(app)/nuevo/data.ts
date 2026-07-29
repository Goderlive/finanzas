import { createClient } from "@/lib/supabase/server";
import { getHouseholdMembers } from "@/lib/household";
import { getSessionProfile } from "@/lib/auth";
import { addDays, today } from "@/lib/dates";

/**
 * Datos que el formulario rápido necesita pero que NO puede esperar: la página
 * los pide sin `await` y se los pasa al cliente como promesa, para que el campo
 * de monto exista y tenga el foco desde el primer frame.
 *
 * Por eso nada de aquí lanza: una consulta caída degrada el formulario (sin
 * chips, sin cuenta preseleccionada) en vez de tumbar la captura entera.
 */

/** Cuánto pasado se mira para deducir "lo que más usas". */
const RECENT_DAYS = 120;
/** Techo de filas leídas: suficiente para un hogar de dos, barato de traer. */
const RECENT_LIMIT = 300;
/** Chips que caben en dos renglones sin hacer scroll en un teléfono. */
export const TOP_CATEGORIES = 6;

export type QuickAccount = { id: string; name: string };
export type QuickCategory = { id: string; label: string };

export type QuickTransactionOptions = {
  accounts: QuickAccount[];
  /** Todas las categorías del tipo, ya ordenadas por uso reciente. */
  categories: QuickCategory[];
  /** Las más usadas, para los chips de arriba. */
  topCategories: QuickCategory[];
  /** La última cuenta usada para este tipo de movimiento. */
  defaultAccountId: string | null;
};

export type QuickSharedOptions = {
  members: { id: string; name: string }[];
  /** Quién paga por defecto: el usuario que abrió la app. */
  defaultPaidBy: string | null;
  /** Descripciones recientes más repetidas, para capturar de un toque. */
  suggestions: string[];
};

const EMPTY_TRANSACTION_OPTIONS: QuickTransactionOptions = {
  accounts: [],
  categories: [],
  topCategories: [],
  defaultAccountId: null,
};

/** Ordena por frecuencia (desc) y, a igual uso, deja el orden que traía. */
function byFrequency<T>(items: T[], key: (item: T) => string, counts: Map<string, number>) {
  return [...items].sort((a, b) => (counts.get(key(b)) ?? 0) - (counts.get(key(a)) ?? 0));
}

export async function getQuickTransactionOptions(
  type: "expense" | "income",
): Promise<QuickTransactionOptions> {
  try {
    const supabase = await createClient();
    const since = addDays(today(), -RECENT_DAYS);

    const [{ data: accounts }, { data: categories }, { data: recent }] =
      await Promise.all([
        supabase
          .from("accounts")
          .select("id, name")
          .eq("is_archived", false)
          .order("created_at", { ascending: true }),
        supabase
          .from("categories")
          .select("id, name, kind, parent_id")
          .eq("kind", type)
          .eq("is_archived", false)
          .order("name", { ascending: true }),
        // Una sola lectura resuelve las dos preguntas: qué categorías se usan
        // más y cuál fue la última cuenta de este tipo de movimiento.
        supabase
          .from("transactions")
          .select("category_id, account_id")
          .eq("type", type)
          .gte("occurred_at", since)
          .order("created_at", { ascending: false })
          .limit(RECENT_LIMIT),
      ]);

    const rows = recent ?? [];

    const counts = new Map<string, number>();
    for (const r of rows) {
      if (r.category_id) counts.set(r.category_id, (counts.get(r.category_id) ?? 0) + 1);
    }

    // Una subcategoría suelta ("Súper") no dice de qué cuelga; con el padre
    // delante se distingue de una homónima en otro grupo.
    const all = categories ?? [];
    const parentName = new Map(all.filter((c) => !c.parent_id).map((c) => [c.id, c.name]));
    const labelled: QuickCategory[] = all.map((c) => ({
      id: c.id,
      label: c.parent_id
        ? `${parentName.get(c.parent_id) ?? "—"} · ${c.name}`
        : c.name,
    }));

    const ordered = byFrequency(labelled, (c) => c.id, counts);

    // Un chip sólo vale si de verdad se ha usado: llenarlos con categorías de
    // uso cero sería adivinar y quitaría espacio a lo que sí se repite.
    const topCategories = ordered
      .filter((c) => (counts.get(c.id) ?? 0) > 0)
      .slice(0, TOP_CATEGORIES);

    const lastAccountId = rows.find((r) => r.account_id)?.account_id ?? null;
    const list = accounts ?? [];
    // La última cuenta usada puede haberse archivado desde entonces.
    const defaultAccountId =
      (lastAccountId && list.some((a) => a.id === lastAccountId)
        ? lastAccountId
        : list[0]?.id) ?? null;

    return { accounts: list, categories: ordered, topCategories, defaultAccountId };
  } catch {
    return EMPTY_TRANSACTION_OPTIONS;
  }
}

export async function getQuickSharedOptions(): Promise<QuickSharedOptions> {
  try {
    const supabase = await createClient();
    const since = addDays(today(), -RECENT_DAYS);

    const [members, session, { data: recent }] = await Promise.all([
      getHouseholdMembers(),
      getSessionProfile(),
      supabase
        .from("shared_expenses")
        .select("description")
        .gte("occurred_at", since)
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT),
    ]);

    const counts = new Map<string, number>();
    for (const r of recent ?? []) {
      const d = (r.description ?? "").trim();
      if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    const suggestions = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_CATEGORIES)
      .map(([d]) => d);

    return {
      members: members.map((m) => ({ id: m.id, name: m.display_name })),
      defaultPaidBy: session?.user.id ?? null,
      suggestions,
    };
  } catch {
    return { members: [], defaultPaidBy: null, suggestions: [] };
  }
}
