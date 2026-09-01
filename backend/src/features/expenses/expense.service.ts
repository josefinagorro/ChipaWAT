import type { Debt, Expense, Housemate } from "./expense.types.js";

export const housemates: Housemate[] = [
  { id: "gorro", name: "Gorro" },
  { id: "tori", name: "Tori" },
  { id: "juli", name: "Juli" },
  { id: "gime", name: "Gime" },
  { id: "paz", name: "Paz" },
  { id: "vale", name: "Vale" },
  { id: "arela", name: "Arela" },
];

export const expenses: Expense[] = [
  {
    id: "rent-september",
    title: "Alquiler septiembre",
    amount: 2100000,
    category: "rent",
    kind: "group",
    paidBy: "gorro",
    participants: housemates.map((housemate) => housemate.id),
    date: "2026-09-01",
  },
  {
    id: "first-groceries",
    title: "Compra grande de llegada",
    amount: 168400,
    category: "groceries",
    kind: "group",
    paidBy: "tori",
    participants: ["gorro", "tori", "juli", "gime", "paz", "vale"],
    date: "2026-09-02",
  },
  {
    id: "cleaning-supplies",
    title: "Productos de limpieza",
    amount: 52400,
    category: "groceries",
    kind: "group",
    paidBy: "arela",
    participants: housemates.map((housemate) => housemate.id),
    date: "2026-09-03",
  },
  {
    id: "gorro-coffee",
    title: "Cafe antes del trabajo",
    amount: 4300,
    category: "personal",
    kind: "personal",
    paidBy: "gorro",
    participants: ["gorro"],
    date: "2026-09-03",
  },
];

export function calculateDebts(expenseList: Expense[]): Debt[] {
  const debts = new Map<string, Debt>();

  expenseList
    .filter((expense) => expense.kind === "group")
    .forEach((expense) => {
      const splitAmount = expense.amount / expense.participants.length;

      expense.participants
        .filter((participant) => participant !== expense.paidBy)
        .forEach((participant) => {
          const key = `${participant}-${expense.paidBy}`;
          const current = debts.get(key);

          debts.set(key, {
            from: participant,
            to: expense.paidBy,
            amount: (current?.amount ?? 0) + splitAmount,
          });
        });
    });

  return Array.from(debts.values()).sort((first, second) => second.amount - first.amount);
}

export function createExpense(expense: Omit<Expense, "id">): Expense {
  const newExpense = {
    ...expense,
    id: `expense-${Date.now()}`,
  };

  expenses.unshift(newExpense);

  return newExpense;
}
