import { supabase } from "../../lib/supabaseClient";
import type { MoneyBalance } from "./types";

type MoneyBalanceRow = {
  income_cents: number;
  personal_expense_cents: number;
  group_paid_cents: number;
  received_cents: number;
  sent_cents: number;
  balance_cents: number;
};

export const emptyMoneyBalance: MoneyBalance = {
  incomeCents: 0,
  personalExpenseCents: 0,
  groupPaidCents: 0,
  receivedCents: 0,
  sentCents: 0,
  balanceCents: 0,
};

/**
 * Cuánta plata te queda, cruzando lo personal con lo grupal.
 *
 * La cuenta la hace Postgres (función my_money_balance) y no el navegador, por
 * dos motivos: es una sola consulta en vez de traerse todos los gastos de todos
 * tus grupos, y el saldo sale siempre igual venga de donde venga.
 */
export async function getMyMoneyBalance(): Promise<MoneyBalance> {
  const { data, error } = await supabase.rpc("my_money_balance");

  if (error) {
    throw new Error(error.message);
  }

  // La función devuelve una sola fila, pero el cliente siempre entrega un array.
  const row = (Array.isArray(data) ? data[0] : data) as MoneyBalanceRow | undefined;

  if (!row) {
    return emptyMoneyBalance;
  }

  return {
    incomeCents: Number(row.income_cents ?? 0),
    personalExpenseCents: Number(row.personal_expense_cents ?? 0),
    groupPaidCents: Number(row.group_paid_cents ?? 0),
    receivedCents: Number(row.received_cents ?? 0),
    sentCents: Number(row.sent_cents ?? 0),
    balanceCents: Number(row.balance_cents ?? 0),
  };
}
