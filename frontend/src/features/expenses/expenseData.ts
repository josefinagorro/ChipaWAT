export type Housemate = {
  id: string;
  name: string;
};

export type ExpenseCategory = "rent" | "groceries" | "outing" | "personal";

export type Expense = {
  id: string;
  title: string;
  amount: number;
  category: ExpenseCategory;
  kind: "group" | "personal";
  paidBy: string;
  participants: string[];
  date: string;
};

export type Debt = {
  from: string;
  to: string;
  amount: number;
};

export type Balance = {
  housemateId: string;
  amount: number;
};

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

export const groceryPurchases: Expense[] = expenses.filter(
  (expense) => expense.category === "groceries",
);

export const additionalExpenseExample: Expense = {
  id: "taxi-night",
  title: "Taxi de vuelta",
  amount: 36000,
  category: "outing",
  kind: "group",
  paidBy: "juli",
  participants: ["gorro", "juli", "paz", "vale"],
  date: "2026-09-05",
};

export const getHousemateName = (id: string) =>
  housemates.find((housemate) => housemate.id === id)?.name ?? id;

export const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

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
export function calculateBalances(expenseList: Expense[]): Balance[] {
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
