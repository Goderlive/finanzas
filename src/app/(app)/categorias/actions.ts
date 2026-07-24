"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireHousehold } from "@/lib/auth";
import { fail, OK, type ActionResult } from "@/lib/action-result";
import { categoryFormSchema } from "./schema";

function parseForm(formData: FormData) {
  return categoryFormSchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    parentId: formData.get("parentId") ?? undefined,
    icon: formData.get("icon") ?? undefined,
    color: formData.get("color") ?? undefined,
  });
}

function normalizeParent(parentId?: string): string | null {
  return parentId && parentId !== "none" ? parentId : null;
}

export async function createCategory(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos");
  }

  const { householdId } = await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase.from("categories").insert({
    household_id: householdId,
    name: parsed.data.name,
    kind: parsed.data.kind,
    parent_id: normalizeParent(parsed.data.parentId),
    icon: parsed.data.icon || null,
    color: parsed.data.color || null,
  });
  if (error) return fail(error.message);

  revalidatePath("/categorias");
  return OK;
}

export async function updateCategory(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Categoría inválida");

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos");
  }

  const parentId = normalizeParent(parsed.data.parentId);
  if (parentId === id) return fail("Una categoría no puede ser su propio padre");

  await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({
      name: parsed.data.name,
      kind: parsed.data.kind,
      parent_id: parentId,
      icon: parsed.data.icon || null,
      color: parsed.data.color || null,
    })
    .eq("id", id);
  if (error) return fail(error.message);

  revalidatePath("/categorias");
  return OK;
}

export async function setCategoryArchived(
  id: string,
  archived: boolean,
): Promise<ActionResult> {
  await requireHousehold();
  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({ is_archived: archived })
    .eq("id", id);
  if (error) return fail(error.message);

  revalidatePath("/categorias");
  return OK;
}
