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
