import type { ExpenseContext, GroupId, UserId } from "../expenses/types";

export type ShoppingItemStatus = "pending" | "bought";

export type ShoppingItem = {
  id: string;
  scope: "personal" | "group";
  ownerUserId?: UserId;
  groupId?: GroupId;
  name: string;
  quantity: string;
  category: string;
  suggestedStore?: string;
  notes?: string;
  status: ShoppingItemStatus;
  createdByUserId: UserId;
  boughtByUserId?: UserId;
  createdAt: string;
  boughtAt?: string;
};

export type ShoppingDraft = {
  name: string;
  quantity: string;
  category: string;
  suggestedStore: string;
  notes: string;
};

export type ShoppingContext = ExpenseContext;
