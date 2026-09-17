export type UserId = string;
export type GroupId = string;
export type MemberId = UserId;

export type ExpenseScope = "personal" | "group";

export type ExpenseType = "rent" | "grocery" | "other";

/** Un movimiento personal puede ser plata que sale o plata que entra. */
export type MovementKind = "expense" | "income";

export type PaymentStatus = "pending" | "paid";

export type RentStatus = "pending" | "partial" | "paid";

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

export type PersonalMovement = {
  id: string;
  scope: "personal";
  ownerUserId: UserId;
  kind: MovementKind;
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

export type Expense = PersonalMovement | GroupExpense;

export type ExpenseDraft = {
  scope: ExpenseScope;
  kind: MovementKind;
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

/** Una deuda pendiente lista para mostrar. El id sirve solo como key de React. */
export type Settlement = Transfer & {
  id: string;
};

/** Una transferencia que YA ocurrió y quedó guardada en la base. */
export type GroupSettlement = {
  id: string;
  groupId: GroupId;
  fromUser: UserId;
  toUser: UserId;
  amountCents: number;
  settledOn: string;
};

/**
 * El desglose de "cuánta plata tenés", tal cual lo devuelve la función
 * my_money_balance() de Supabase. Cruza lo personal con lo grupal.
 */
export type MoneyBalance = {
  incomeCents: number;
  personalExpenseCents: number;
  groupPaidCents: number;
  receivedCents: number;
  sentCents: number;
  balanceCents: number;
};
