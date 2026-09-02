import { supabase } from "../../lib/supabaseClient";
import type { UserId } from "../expenses/types";
import type { ShoppingItem, ShoppingItemStatus } from "./types";

type GroupShoppingItemRow = {
  id: string;
  group_id: string;
  name: string;
  quantity: string;
  category: string;
  suggested_store: string | null;
  notes: string | null;
  status: ShoppingItemStatus;
  created_by: string;
  bought_by: string | null;
  bought_at: string | null;
  created_at: string;
};

export type GroupShoppingItemInput = {
  name: string;
  quantity: string;
  category: string;
  suggestedStore: string;
  notes: string;
};

const selectColumns =
  "id, group_id, name, quantity, category, suggested_store, notes, status, created_by, bought_by, bought_at, created_at";

function fail(message: string): never {
  throw new Error(message);
}

function toShoppingItem(row: GroupShoppingItemRow): ShoppingItem {
  return {
    id: row.id,
    scope: "group",
    groupId: row.group_id,
    name: row.name,
    quantity: row.quantity,
    category: row.category,
    suggestedStore: row.suggested_store ?? undefined,
    notes: row.notes ?? undefined,
    status: row.status,
    createdByUserId: row.created_by,
    boughtByUserId: row.bought_by ?? undefined,
    createdAt: row.created_at,
    boughtAt: row.bought_at ?? undefined,
  };
}

export async function listGroupShoppingItems(groupId: string): Promise<ShoppingItem[]> {
  const { data, error } = await supabase
    .from("group_shopping_items")
    .select(selectColumns)
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  if (error) fail(error.message);

  return ((data ?? []) as GroupShoppingItemRow[]).map(toShoppingItem);
}

export async function createGroupShoppingItem(
  groupId: string,
  input: GroupShoppingItemInput,
): Promise<void> {
  // created_by no se manda: la tabla lo completa sola con auth.uid().
  const { error } = await supabase.from("group_shopping_items").insert({
    group_id: groupId,
    name: input.name,
    quantity: input.quantity,
    category: input.category,
    suggested_store: input.suggestedStore || null,
    notes: input.notes || null,
  });

  if (error) fail(error.message);
}

export async function setGroupShoppingItemStatus(
  id: string,
  status: ShoppingItemStatus,
  boughtByUserId: UserId | null,
): Promise<void> {
  const { error } = await supabase
    .from("group_shopping_items")
    .update({
      status,
      bought_by: status === "bought" ? boughtByUserId : null,
      bought_at: status === "bought" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) fail(error.message);
}

export async function deleteGroupShoppingItem(id: string): Promise<void> {
  const { error } = await supabase.from("group_shopping_items").delete().eq("id", id);
  if (error) fail(error.message);
}
