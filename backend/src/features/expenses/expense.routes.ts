import { Router } from "express";
import { calculateBalances, calculateDebts, calculateOptimizedTransfers, createExpense, expenses, housemates } from "./expense.service.js";
import type { Expense } from "./expense.types.js";

export const expenseRouter = Router();

expenseRouter.get("/", (_request, response) => {
  response.json({
    housemates,
    expenses,
    debts: calculateDebts(expenses),
    balances: calculateBalances(expenses),
    optimizedTransfers: calculateOptimizedTransfers(expenses),
  });
});

expenseRouter.post("/", (request, response) => {
  const expense = request.body as Partial<Expense>;

  if (
    !expense.title ||
    typeof expense.amount !== "number" ||
    !expense.category ||
    !expense.kind ||
    !expense.paidBy ||
    !Array.isArray(expense.participants) ||
    expense.participants.length === 0 ||
    !expense.date
  ) {
    response.status(400).json({
      message: "Faltan datos para guardar el gasto.",
    });
    return;
  }

  const newExpense = createExpense({
    title: expense.title,
    amount: expense.amount,
    category: expense.category,
    kind: expense.kind,
    paidBy: expense.paidBy,
    participants: expense.participants,
    date: expense.date,
  });

  response.status(201).json(newExpense);
});

