import { createClient } from "@/lib/supabase/server";
import type { CategoryKind, Tables } from "@/lib/supabase/database.types";
import { NewCategoryButton } from "./new-category-button";
import { CategoryItem } from "./category-item";
import type { TopLevelCategory } from "./category-dialog";

export default async function CategoriesPage() {
  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("categories")
    .select("*")
    .eq("is_archived", false)
    .order("name", { ascending: true });

  const all = categories ?? [];
  const topLevel: TopLevelCategory[] = all
    .filter((c) => !c.parent_id)
    .map((c) => ({ id: c.id, name: c.name, kind: c.kind }));

  const childrenOf = (parentId: string) =>
    all.filter((c) => c.parent_id === parentId);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Categorías</h1>
          <p className="text-sm text-muted-foreground">
            Organiza tus gastos e ingresos.
          </p>
        </div>
        <NewCategoryButton topLevel={topLevel} />
      </div>

      {all.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aún no hay categorías. Crea la primera con el botón «Nueva».
        </div>
      ) : (
        <>
          <KindSection
            title="Gastos"
            kind="expense"
            categories={all}
            childrenOf={childrenOf}
            topLevel={topLevel}
          />
          <KindSection
            title="Ingresos"
            kind="income"
            categories={all}
            childrenOf={childrenOf}
            topLevel={topLevel}
          />
        </>
      )}
    </div>
  );
}

function KindSection({
  title,
  kind,
  categories,
  childrenOf,
  topLevel,
}: {
  title: string;
  kind: CategoryKind;
  categories: Tables<"categories">[];
  childrenOf: (parentId: string) => Tables<"categories">[];
  topLevel: TopLevelCategory[];
}) {
  const parents = categories.filter((c) => !c.parent_id && c.kind === kind);
  if (parents.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      {parents.map((parent) => (
        <div key={parent.id} className="space-y-2">
          <CategoryItem category={parent} topLevel={topLevel} />
          {childrenOf(parent.id).map((child) => (
            <CategoryItem
              key={child.id}
              category={child}
              topLevel={topLevel}
              nested
            />
          ))}
        </div>
      ))}
    </section>
  );
}
