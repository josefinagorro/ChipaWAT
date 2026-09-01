export type MemberId = string;

export type ExpenseType = "rent" | "grocery" | "other";

export type PaymentStatus = "pending" | "paid";

export type RentStatus = "pending" | "partial" | "paid";

export type SettlementStatus = "pending" | "paid";

export type HouseMember = {
  id: MemberId;
  name: string;
  color: string;
};

export type RentMonth = {
  id: string;
  label: string;
  month: string;
  totalCents: number;
  dueDate: string;
  paidBy: MemberId;
  participantIds: MemberId[];
  payments: Record<MemberId, PaymentStatus>;
};

export type SharedExpense = {
  id: string;
  type: Exclude<ExpenseType, "rent">;
  category: string;
  description: string;
  date: string;
  amountCents: number;
  paidBy: MemberId;
  participantIds: MemberId[];
};

export type ExpenseDraft = {
  type: ExpenseType;
  category: string;
  description: string;
  date: string;
  amount: string;
  paidBy: MemberId;
  participantIds: MemberId[];
  rentMonthLabel: string;
  dueDate: string;
};

export type Transfer = {
  from: MemberId;
  to: MemberId;
  amountCents: number;
};

export type MemberBalance = {
  memberId: MemberId;
  amountCents: number;
};

export type Settlement = Transfer & {
  id: string;
  status: SettlementStatus;
};
