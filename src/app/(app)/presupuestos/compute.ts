export type SpentMap = Record<string, number>;

/** Mapa padre -> ids de hijos, para acumular el gasto de subcategorías. */
export function childrenMap(
  categories: { id: string; parent_id: string | null }[],
): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const c of categories) {
    if (c.parent_id) {
      const arr = m.get(c.parent_id) ?? [];
      arr.push(c.id);
      m.set(c.parent_id, arr);
    }
  }
  return m;
}

/** Gasto de una categoría incluyendo el de sus hijas. */
export function rollupSpent(
  catId: string,
  spent: SpentMap,
  children: Map<string, string[]>,
): number {
  return (
    (spent[catId] ?? 0) +
    (children.get(catId) ?? []).reduce((s, ch) => s + (spent[ch] ?? 0), 0)
  );
}
