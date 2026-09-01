import cors from "cors";
import express from "express";
import { expenseRouter } from "./features/expenses/expense.routes.js";
import { healthRouter } from "./routes/health.routes.js";

export const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL ?? "http://localhost:5173",
  }),
);
app.use(express.json());

app.use("/api/expenses", expenseRouter);
app.use("/api/health", healthRouter);
