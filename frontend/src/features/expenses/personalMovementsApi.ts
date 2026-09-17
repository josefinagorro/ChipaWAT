import { supabase } from "../../lib/supabaseClient";
import type { MovementKind, PersonalMovement } from "./types";

type PersonalMovementRow = {
  id: string;
  user_id: string;
  kind: MovementKind;
  description: string;
  category: string;
  amount_cents: number;
  spent_on: string;
};

export type PersonalMovementInput = {
  kind: MovementKind;
  description: string;
  category: string;
  date: string;
  amountCents: number;
};

function fail(message: string): never {
  throw new Error(message);
}

function toPersonalMovement(row: PersonalMovementRow): PersonalMovement {
  return {
    id: row.id,
    scope: "personal",
    ownerUserId: row.user_id,
    // Las filas viejas (las que cargaste antes de que existieran los ingresos)
    // no tienen kind; son gastos.
    kind: row.kind ?? "expense",
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
export async function listPersonalMovements(): Promise<PersonalMovement[]> {
  const { data, error } = await supabase
    .from("personal_movements")
    .select("id, user_id, kind, description, category, amount_cents, spent_on")
    .order("spent_on", { ascending: false });

  if (error) fail(error.message);

  return ((data ?? []) as PersonalMovementRow[]).map(toPersonalMovement);
}

export async function createPersonalMovement(input: PersonalMovementInput): Promise<void> {
  // user_id no se manda: la tabla lo completa sola con auth.uid().
  const { error } = await supabase.from("personal_movements").insert({
    kind: input.kind,
    description: input.description,
    category: input.category,
    amount_cents: input.amountCents,
    spent_on: input.date,
  });

  if (error) fail(error.message);
}

export async function updatePersonalMovement(
  id: string,
  input: PersonalMovementInput,
): Promise<void> {
  const { error } = await supabase
    .from("personal_movements")
    .update({
      kind: input.kind,
      description: input.description,
      category: input.category,
      amount_cents: input.amountCents,
      spent_on: input.date,
    })
    .eq("id", id);

  if (error) fail(error.message);
}

export async function deletePersonalMovement(id: string): Promise<void> {
  const { error } = await supabase.from("personal_movements").delete().eq("id", id);
  if (error) fail(error.message);
}
