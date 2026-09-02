import { supabase } from "../../lib/supabaseClient";
import type { ShoppingItem, ShoppingItemStatus } from "./types";

type PersonalShoppingItemRow = {
  id: string;
  user_id: string;
  name: string;
  quantity: string;
  category: string;
  suggested_store: string | null;
  notes: string | null;
  status: ShoppingItemStatus;
  bought_at: string | null;
  created_at: string;
};

export type PersonalShoppingItemInput = {
  name: string;
  quantity: string;
  category: string;
  suggestedStore: string;
  notes: string;
};

const selectColumns =
  "id, user_id, name, quantity, category, suggested_store, notes, status, bought_at, created_at";

function fail(message: string): never {
  throw new Error(message);
}

function toShoppingItem(row: PersonalShoppingItemRow): ShoppingItem {
  return {
    id: row.id,
    scope: "personal",
    ownerUserId: row.user_id,
    name: row.name,
    quantity: row.quantity,
    category: row.category,
    suggestedStore: row.suggested_store ?? undefined,
    notes: row.notes ?? undefined,
    status: row.status,
    // Nadie carga ni compra un item personal "a tu nombre": siempre sos vos.
    createdByUserId: row.user_id,
    boughtByUserId: row.status === "bought" ? row.user_id : undefined,
    createdAt: row.created_at,
    boughtAt: row.bought_at ?? undefined,
  };
}

/**
 * No hace falta filtrar por usuaria: las policies de Supabase ya devuelven
 * únicamente las filas propias.
 */
export async function listPersonalShoppingItems(): Promise<ShoppingItem[]> {
  const { data, error } = await supabase
    .from("personal_shopping_items")
    .select(selectColumns)
    .order("created_at", { ascending: false });

  if (error) fail(error.message);

  return ((data ?? []) as PersonalShoppingItemRow[]).map(toShoppingItem);
}

export async function createPersonalShoppingItem(input: PersonalShoppingItemInput): Promise<void> {
  // user_id no se manda: la tabla lo completa sola con auth.uid().
  const { error } = await supabase.from("personal_shopping_items").insert({
    name: input.name,
    quantity: input.quantity,
    category: input.category,
    suggested_store: input.suggestedStore || null,
    notes: input.notes || null,
  });

  if (error) fail(error.message);
}

export async function setPersonalShoppingItemStatus(
  id: string,
  status: ShoppingItemStatus,
): Promise<void> {
  const { error } = await supabase
    .from("personal_shopping_items")
    .update({
      status,
      bought_at: status === "bought" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) fail(error.message);
}

export async function deletePersonalShoppingItem(id: string): Promise<void> {
  const { error } = await supabase.from("personal_shopping_items").delete().eq("id", id);
  if (error) fail(error.message);
}
