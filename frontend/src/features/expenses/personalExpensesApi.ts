import { supabase } from "../../lib/supabaseClient";
import type { PersonalExpense } from "./types";

type PersonalExpenseRow = {
  id: string;
  user_id: string;
  description: string;
  category: string;
  amount_cents: number;
  spent_on: string;
};

export type PersonalExpenseInput = {
  description: string;
  category: string;
  date: string;
  amountCents: number;
};

function fail(message: string): never {
  throw new Error(message);
}

function toPersonalExpense(row: PersonalExpenseRow): PersonalExpense {
  return {
    id: row.id,
    scope: "personal",
    ownerUserId: row.user_id,
    type: "other",
    category: row.category,
    description: row.description,
    date: row.spent_on,
    amountCents: row.amount_cents,
  };
}

/**
 * No hace falta filtrar por usuaria: las policies de Supabase ya devuelven
 * únicamente las filas propias, aunque alguien toque el código del navegador.
 */
export async function listPersonalExpenses(): Promise<PersonalExpense[]> {
  const { data, error } = await supabase
    .from("personal_expenses")
    .select("id, user_id, description, category, amount_cents, spent_on")
    .order("spent_on", { ascending: false });

  if (error) fail(error.message);

  return ((data ?? []) as PersonalExpenseRow[]).map(toPersonalExpense);
}

export async function createPersonalExpense(input: PersonalExpenseInput): Promise<void> {
  // user_id no se manda: la tabla lo completa sola con auth.uid().
  const { error } = await supabase.from("personal_expenses").insert({
    description: input.description,
    category: input.category,
    amount_cents: input.amountCents,
    spent_on: input.date,
  });

  if (error) fail(error.message);
}

export async function updatePersonalExpense(id: string, input: PersonalExpenseInput): Promise<void> {
  const { error } = await supabase
    .from("personal_expenses")
    .update({
      description: input.description,
      category: input.category,
      amount_cents: input.amountCents,
      spent_on: input.date,
    })
    .eq("id", id);

  if (error) fail(error.message);
}

export async function deletePersonalExpense(id: string): Promise<void> {
  const { error } = await supabase.from("personal_expenses").delete().eq("id", id);
  if (error) fail(error.message);
}
