export type UserId = string;
export type GroupId = string;
export type MemberId = UserId;

export type ExpenseScope = "personal" | "group";

export type ExpenseType = "rent" | "grocery" | "other";

export type PaymentStatus = "pending" | "paid";

export type RentStatus = "pending" | "partial" | "paid";

export type SettlementStatus = "pending" | "paid";

export type GroupRole = "owner" | "admin" | "member";

export type User = {
  id: UserId;
  name: string;
  color: string;
};

export type Group = {
  id: GroupId;
  name: string;
  description: string;
};

export type GroupMember = {
  groupId: GroupId;
  userId: UserId;
  role: GroupRole;
};

export type ExpenseContext =
  | {
      scope: "personal";
      ownerUserId: UserId;
    }
  | {
      scope: "group";
      groupId: GroupId;
    };

export type RentMonth = {
  id: string;
  scope: "group";
  groupId: GroupId;
  label: string;
  month: string;
  totalCents: number;
  dueDate: string;
  paidBy: UserId;
  participantIds: UserId[];
  payments: Record<UserId, PaymentStatus>;
};

export type PersonalExpense = {
  id: string;
  scope: "personal";
  ownerUserId: UserId;
  type: "other";
  category: string;
  description: string;
  date: string;
  amountCents: number;
};

export type GroupExpense = {
  id: string;
  scope: "group";
  groupId: GroupId;
  type: Exclude<ExpenseType, "rent">;
  category: string;
  description: string;
  date: string;
  amountCents: number;
  paidBy: UserId;
  participantIds: UserId[];
};

export type Expense = PersonalExpense | GroupExpense;

export type ExpenseDraft = {
  scope: ExpenseScope;
  type: ExpenseType;
  category: string;
  description: string;
  date: string;
  amount: string;
  paidBy: UserId;
  participantIds: UserId[];
  rentMonthLabel: string;
  dueDate: string;
};

export type Transfer = {
  from: UserId;
  to: UserId;
  amountCents: number;
};

export type MemberBalance = {
  memberId: UserId;
  amountCents: number;
};

export type Settlement = Transfer & {
  id: string;
  status: SettlementStatus;
};
