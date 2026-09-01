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
export function calculateBalances(expenseList: Expense[]) {
  const balances = new Map<string, number>();

  housemates.forEach((housemate) => {
    balances.set(housemate.id, 0);
  });

  expenseList
    .filter((expense) => expense.kind === "group")
    .forEach((expense) => {
      const splitAmount = expense.amount / expense.participants.length;
      const paidByBalance = balances.get(expense.paidBy) ?? 0;

      balances.set(expense.paidBy, paidByBalance + expense.amount);

      expense.participants.forEach((participant) => {
        const participantBalance = balances.get(participant) ?? 0;
        balances.set(participant, participantBalance - splitAmount);
      });
    });

  return Array.from(balances.entries()).map(([housemateId, amount]) => ({
    housemateId,
    amount,
  }));
}

export function calculateOptimizedTransfers(expenseList: Expense[]): Debt[] {
  const balances = calculateBalances(expenseList);
  const debtors = balances
    .filter((balance) => balance.amount < -0.01)
    .map((balance) => ({
      housemateId: balance.housemateId,
      amount: Math.abs(balance.amount),
    }))
    .sort((first, second) => second.amount - first.amount);
  const creditors = balances
    .filter((balance) => balance.amount > 0.01)
    .map((balance) => ({
      housemateId: balance.housemateId,
      amount: balance.amount,
    }))
    .sort((first, second) => second.amount - first.amount);
  const transfers: Debt[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.amount, creditor.amount);

    transfers.push({
      from: debtor.housemateId,
      to: creditor.housemateId,
      amount,
    });

    debtor.amount -= amount;
    creditor.amount -= amount;

    if (debtor.amount < 0.01) {
      debtorIndex += 1;
    }

    if (creditor.amount < 0.01) {
      creditorIndex += 1;
    }
  }

  return transfers;
}
