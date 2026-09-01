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
