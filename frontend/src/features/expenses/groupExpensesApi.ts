import { supabase } from "../../lib/supabaseClient";
import type { GroupExpense, PaymentStatus, RentMonth, UserId } from "./types";

type GroupExpenseRow = {
  id: string;
  group_id: string;
  type: "grocery" | "other";
  category: string;
  description: string;
  amount_cents: number;
  spent_on: string;
  paid_by: string;
};

type ParticipantRow = { expense_id: string; user_id: string };

type RentMonthRow = {
  id: string;
  group_id: string;
  label: string;
  month: string;
  total_cents: number;
  due_date: string;
  paid_by: string;
};

type RentPaymentRow = { rent_month_id: string; user_id: string; status: PaymentStatus };

export type GroupExpenseInput = {
  id: string | null;
  type: "grocery" | "other";
  category: string;
  description: string;
  amountCents: number;
  date: string;
  paidBy: UserId;
  participantIds: UserId[];
};

export type RentMonthInput = {
  label: string;
  month: string;
  totalCents: number;
  dueDate: string;
  paidBy: UserId;
  participantIds: UserId[];
};

function fail(message: string): never {
  throw new Error(message);
}

export async function listGroupExpenses(groupId: string): Promise<GroupExpense[]> {
  const { data, error } = await supabase
    .from("group_expenses")
    .select("id, group_id, type, category, description, amount_cents, spent_on, paid_by")
    .eq("group_id", groupId)
    .order("spent_on", { ascending: false });

  if (error) fail(error.message);

  const rows = (data ?? []) as GroupExpenseRow[];

  if (rows.length === 0) {
    return [];
  }

  const participantsResult = await supabase
    .from("group_expense_participants")
    .select("expense_id, user_id")
    .in(
      "expense_id",
      rows.map((row) => row.id),
    );

  if (participantsResult.error) fail(participantsResult.error.message);

  const participants = (participantsResult.data ?? []) as ParticipantRow[];

  return rows.map((row) => ({
    id: row.id,
    scope: "group",
    groupId: row.group_id,
    type: row.type,
    category: row.category,
    description: row.description,
    date: row.spent_on,
    amountCents: row.amount_cents,
    paidBy: row.paid_by,
    // Ordenados siempre igual: al repartir centavos que no dividen exacto,
    // el resto le toca siempre a la misma persona y los totales no bailan.
    participantIds: participants
      .filter((participant) => participant.expense_id === row.id)
      .map((participant) => participant.user_id)
      .sort(),
  }));
}

export async function listRentMonths(groupId: string): Promise<RentMonth[]> {
  const { data, error } = await supabase
    .from("rent_months")
    .select("id, group_id, label, month, total_cents, due_date, paid_by")
    .eq("group_id", groupId)
    .order("due_date");

  if (error) fail(error.message);

  const rows = (data ?? []) as RentMonthRow[];

  if (rows.length === 0) {
    return [];
  }

  const paymentsResult = await supabase
    .from("rent_payments")
    .select("rent_month_id, user_id, status")
    .in(
      "rent_month_id",
      rows.map((row) => row.id),
    );

  if (paymentsResult.error) fail(paymentsResult.error.message);

  const payments = (paymentsResult.data ?? []) as RentPaymentRow[];

  return rows.map((row) => {
    const rentPayments = payments.filter((payment) => payment.rent_month_id === row.id);

    return {
      id: row.id,
      scope: "group" as const,
      groupId: row.group_id,
      label: row.label,
      month: row.month,
      totalCents: row.total_cents,
      dueDate: row.due_date,
      paidBy: row.paid_by,
      participantIds: rentPayments.map((payment) => payment.user_id).sort(),
      payments: Object.fromEntries(
        rentPayments.map((payment) => [payment.user_id, payment.status]),
      ) as Record<UserId, PaymentStatus>,
    };
  });
}

export async function saveGroupExpense(groupId: string, input: GroupExpenseInput): Promise<void> {
  const { error } = await supabase.rpc("save_group_expense", {
    target_group_id: groupId,
    expense_id: input.id,
    expense_type: input.type,
    expense_category: input.category,
    expense_description: input.description,
    expense_amount_cents: input.amountCents,
    expense_spent_on: input.date,
    expense_paid_by: input.paidBy,
    participant_ids: input.participantIds,
  });

  if (error) fail(error.message);
}

export async function deleteGroupExpense(expenseId: string): Promise<void> {
  const { error } = await supabase.from("group_expenses").delete().eq("id", expenseId);
  if (error) fail(error.message);
}

export async function createRentMonth(groupId: string, input: RentMonthInput): Promise<void> {
  const { error } = await supabase.rpc("create_rent_month", {
    target_group_id: groupId,
    rent_label: input.label,
    rent_month: input.month,
    rent_total_cents: input.totalCents,
    rent_due_date: input.dueDate,
    rent_paid_by: input.paidBy,
    participant_ids: input.participantIds,
  });

  if (error) fail(error.message);
}

export async function setRentPayment(
  rentMonthId: string,
  userId: UserId,
  status: PaymentStatus,
): Promise<void> {
  const { error } = await supabase
    .from("rent_payments")
    .update({ status })
    .eq("rent_month_id", rentMonthId)
    .eq("user_id", userId);

  if (error) fail(error.message);
}
