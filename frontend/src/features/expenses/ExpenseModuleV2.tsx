import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import {
  ArrowRight,
  Banknote,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Edit3,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ReceiptText,
  Search,
  ShoppingBasket,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import {
  calculateSettlements,
  getRentPaidCents,
  getRentShareCents,
  getRentStatus,
} from "./calculations";
import { currentUserId, expenses as mockExpenses, groupMembers, groups, rentMonths, users } from "./mockData";
import { formatMoney, parseMoneyToCents, splitEvenly } from "./money";
import type {
  Expense,
  ExpenseContext,
  ExpenseDraft,
  ExpenseType,
  GroupExpense,
  MemberId,
  PersonalExpense,
  RentMonth,
  Settlement,
  User,
} from "./types";

type FilterType = "all" | ExpenseType;

type ShellControls = {
  sidebarCollapsed: boolean;
  onSidebarToggle: () => void;
};

const personalContext: ExpenseContext = { scope: "personal", ownerUserId: currentUserId };
const defaultGroupId = "casa-tahoe";

const expenseLabels: Record<ExpenseType, string> = {
  rent: "Alquiler",
  grocery: "Supermercado",
  other: "Otro gasto",
};

const statusLabels = {
  paid: "Pagado",
  pending: "Pendiente",
  partial: "Parcial",
};

function getGroupContext(groupId: string): ExpenseContext {
  return { scope: "group", groupId };
}

function blankDraft(context: ExpenseContext, memberIds: MemberId[]): ExpenseDraft {
  return {
    scope: context.scope,
    type: context.scope === "personal" ? "other" : "grocery",
    category: context.scope === "personal" ? "Comida" : "Supermercado",
    description: "",
    date: "2026-01-22",
    amount: "",
    paidBy: currentUserId,
    participantIds: memberIds,
    rentMonthLabel: "Alquiler abril",
    dueDate: "2026-04-05",
  };
}

function userName(userId: MemberId): string {
  return users.find((user) => user.id === userId)?.name ?? userId;
}

function userById(userId: MemberId): User {
  return users.find((user) => user.id === userId) ?? users[0];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function getMonthKey(value: string): string {
  return value.slice(0, 7);
}

function isGroupExpense(expense: Expense): expense is GroupExpense {
  return expense.scope === "group";
}

function isPersonalExpense(expense: Expense): expense is PersonalExpense {
  return expense.scope === "personal";
}

function Avatar({ userId, small = false }: { userId: MemberId; small?: boolean }) {
  const user = userById(userId);

  return (
    <span
      className={small ? "avatar avatar-small" : "avatar"}
      style={{ "--member-color": user.color } as CSSProperties}
      title={user.name}
    >
      {user.name.slice(0, 1)}
    </span>
  );
}

function StatusBadge({ status }: { status: "paid" | "pending" | "partial" }) {
  return <span className={`status-badge ${status}`}>{statusLabels[status]}</span>;
}

export function ExpenseModuleV2({ sidebarCollapsed, onSidebarToggle }: ShellControls) {
  const [context, setContext] = useState<ExpenseContext>(getGroupContext(defaultGroupId));
  const [allRents, setAllRents] = useState<RentMonth[]>(rentMonths);
  const [allExpenses, setAllExpenses] = useState<Expense[]>(mockExpenses);
  const [activeRentId, setActiveRentId] = useState("rent-january");
  const [showModal, setShowModal] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<FilterType>("all");
  const [personFilter, setPersonFilter] = useState<MemberId>("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [paidSettlementIds, setPaidSettlementIds] = useState<string[]>([]);

  const activeGroup = context.scope === "group" ? groups.find((group) => group.id === context.groupId) : undefined;
  const userGroups = groups.filter((group) =>
    groupMembers.some(
      (membership) => membership.groupId === group.id && membership.userId === currentUserId,
    ),
  );
  const activeGroupMembers = useMemo(() => {
    if (context.scope !== "group") {
      return [];
    }

    const memberIds = groupMembers
      .filter((membership) => membership.groupId === context.groupId)
      .map((membership) => membership.userId);

    return users.filter((user) => memberIds.includes(user.id));
  }, [context]);

  const activeMemberIds = activeGroupMembers.map((member) => member.id);
  const [draft, setDraft] = useState(() => blankDraft(getGroupContext(defaultGroupId), activeMemberIds));

  const contextRents = allRents.filter(
    (rent) => context.scope === "group" && rent.groupId === context.groupId,
  );
  const contextExpenses = allExpenses.filter((expense) => {
    if (context.scope === "personal") {
      return expense.scope === "personal" && expense.ownerUserId === context.ownerUserId;
    }

    return expense.scope === "group" && expense.groupId === context.groupId;
  });
  const groupExpenses = contextExpenses.filter(isGroupExpense);
  const personalExpenses = contextExpenses.filter(isPersonalExpense);

  const activeRent =
    contextRents.find((rent) => rent.id === activeRentId) ?? contextRents[0] ?? null;
  const activeMonthKey = activeRent ? getMonthKey(activeRent.dueDate) : "2026-01";

  const { directTransfers, simplifiedSettlements } = useMemo(
    () =>
      context.scope === "group"
        ? calculateSettlements(activeGroupMembers, contextRents, groupExpenses, paidSettlementIds)
        : { directTransfers: [], simplifiedSettlements: [] },
    [activeGroupMembers, context, contextRents, groupExpenses, paidSettlementIds],
  );

  const pendingSettlements = simplifiedSettlements.filter(
    (settlement) => settlement.status === "pending",
  );
  const userPendingBalance = pendingSettlements.reduce((total, settlement) => {
    if (settlement.to === currentUserId) {
      return total + settlement.amountCents;
    }

    if (settlement.from === currentUserId) {
      return total - settlement.amountCents;
    }

    return total;
  }, 0);

  const currentMonthExpenses = contextExpenses.filter(
    (expense) => getMonthKey(expense.date) === activeMonthKey,
  );
  const personalMonthTotal = personalExpenses.reduce((total, expense) => total + expense.amountCents, 0);
  const groupMonthTotal =
    (activeRent?.totalCents ?? 0) +
    currentMonthExpenses.reduce((total, expense) => total + expense.amountCents, 0);
  const userPaidThisMonth = groupExpenses
    .filter((expense) => getMonthKey(expense.date) === activeMonthKey && expense.paidBy === currentUserId)
    .reduce((total, expense) => total + expense.amountCents, 0);
  const userShareThisMonth =
    (activeRent ? getRentShareCents(activeRent) : 0) +
    groupExpenses.reduce((total, expense) => {
      if (getMonthKey(expense.date) !== activeMonthKey) {
        return total;
      }

      const index = expense.participantIds.indexOf(currentUserId);

      if (index === -1) {
        return total;
      }

      return total + splitEvenly(expense.amountCents, expense.participantIds.length)[index];
    }, 0);

  const groceryExpenses = groupExpenses.filter((expense) => expense.type === "grocery");
  const otherGroupExpenses = groupExpenses.filter((expense) => expense.type === "other");

  const historyItems = [
    ...contextRents.map((rent) => ({
      id: rent.id,
      scope: "group" as const,
      type: "rent" as const,
      title: rent.label,
      date: rent.dueDate,
      amountCents: rent.totalCents,
      paidBy: rent.paidBy,
      participantIds: rent.participantIds,
    })),
    ...contextExpenses.map((expense) => ({
      id: expense.id,
      scope: expense.scope,
      type: expense.type,
      title: expense.description,
      date: expense.date,
      amountCents: expense.amountCents,
      paidBy: expense.scope === "group" ? expense.paidBy : expense.ownerUserId,
      participantIds: expense.scope === "group" ? expense.participantIds : [expense.ownerUserId],
    })),
  ]
    .filter((item) => historyFilter === "all" || item.type === historyFilter)
    .filter((item) => personFilter === "all" || item.participantIds.includes(personFilter))
    .filter((item) => monthFilter === "all" || getMonthKey(item.date) === monthFilter)
    .sort((first, second) => second.date.localeCompare(first.date));

  const availableMonths = Array.from(
    new Set([...contextRents.map((rent) => getMonthKey(rent.dueDate)), ...contextExpenses.map((expense) => getMonthKey(expense.date))]),
  ).sort();
  const draftAmountCents = parseMoneyToCents(draft.amount);
  const draftShareCents =
    draft.participantIds.length > 0 ? Math.round(draftAmountCents / draft.participantIds.length) : 0;

  const switchContext = (nextContext: ExpenseContext) => {
    const nextMembers =
      nextContext.scope === "group"
        ? groupMembers
            .filter((membership) => membership.groupId === nextContext.groupId)
            .map((membership) => membership.userId)
        : [currentUserId];

    setContext(nextContext);
    setHistoryFilter("all");
    setPersonFilter("all");
    setMonthFilter("all");
    setEditingExpenseId(null);
    setDraft(blankDraft(nextContext, nextMembers));
    setActiveRentId(
      allRents.find((rent) => nextContext.scope === "group" && rent.groupId === nextContext.groupId)
        ?.id ?? "",
    );
  };

  const openNewExpense = (type: ExpenseType = context.scope === "personal" ? "other" : "grocery") => {
    setEditingExpenseId(null);
    setDraft({
      ...blankDraft(context, context.scope === "group" ? activeMemberIds : [currentUserId]),
      type: context.scope === "personal" ? "other" : type,
      category: type === "rent" ? "Alquiler" : type === "grocery" ? "Supermercado" : "Otros",
    });
    setShowModal(true);
  };

  const openEditExpense = (expense: Expense) => {
    setEditingExpenseId(expense.id);
    setDraft({
      scope: expense.scope,
      type: expense.type,
      category: expense.category,
      description: expense.description,
      date: expense.date,
      amount: String(expense.amountCents / 100),
      paidBy: expense.scope === "group" ? expense.paidBy : currentUserId,
      participantIds: expense.scope === "group" ? expense.participantIds : [currentUserId],
      rentMonthLabel: "Alquiler abril",
      dueDate: "2026-04-05",
    });
    setShowModal(true);
  };

  const setParticipant = (memberId: MemberId) => {
    setDraft((current) => ({
      ...current,
      participantIds: current.participantIds.includes(memberId)
        ? current.participantIds.filter((participantId) => participantId !== memberId)
        : [...current.participantIds, memberId],
    }));
  };

  const saveDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (draftAmountCents <= 0) {
      return;
    }

    if (context.scope === "personal") {
      const nextExpense: PersonalExpense = {
        id: editingExpenseId ?? `personal-${Date.now()}`,
        scope: "personal",
        ownerUserId: currentUserId,
        type: "other",
        category: draft.category.trim() || "Otros",
        description: draft.description.trim() || draft.category.trim() || "Gasto personal",
        date: draft.date,
        amountCents: draftAmountCents,
      };

      setAllExpenses((current) =>
        editingExpenseId
          ? current.map((expense) => (expense.id === editingExpenseId ? nextExpense : expense))
          : [nextExpense, ...current],
      );
      setShowModal(false);
      return;
    }

    if (draft.participantIds.length === 0) {
      return;
    }

    if (draft.type === "rent") {
      const payments = Object.fromEntries(
        draft.participantIds.map((memberId) => [
          memberId,
          memberId === draft.paidBy ? "paid" : "pending",
        ]),
      ) as RentMonth["payments"];

      const newRent: RentMonth = {
        id: `rent-${Date.now()}`,
        scope: "group",
        groupId: context.groupId,
        label: draft.rentMonthLabel.trim() || "Nuevo alquiler",
        month: draft.rentMonthLabel.replace("Alquiler", "").trim() || "Nuevo mes",
        totalCents: draftAmountCents,
        dueDate: draft.dueDate,
        paidBy: draft.paidBy,
        participantIds: draft.participantIds,
        payments,
      };

      setAllRents((current) => [newRent, ...current]);
      setActiveRentId(newRent.id);
    } else {
      const nextExpense: GroupExpense = {
        id: editingExpenseId ?? `group-${Date.now()}`,
        scope: "group",
        groupId: context.groupId,
        type: draft.type,
        category: draft.category.trim() || expenseLabels[draft.type],
        description: draft.description.trim() || expenseLabels[draft.type],
        date: draft.date,
        amountCents: draftAmountCents,
        paidBy: draft.paidBy,
        participantIds: draft.participantIds,
      };

      setAllExpenses((current) =>
        editingExpenseId
          ? current.map((expense) => (expense.id === editingExpenseId ? nextExpense : expense))
          : [nextExpense, ...current],
      );
    }

    setShowModal(false);
    setEditingExpenseId(null);
  };

  const toggleRentPayment = (rentId: string, memberId: MemberId) => {
    setAllRents((current) =>
      current.map((rent) =>
        rent.id === rentId
          ? {
              ...rent,
              payments: {
                ...rent.payments,
                [memberId]: rent.payments[memberId] === "paid" ? "pending" : "paid",
              },
            }
          : rent,
      ),
    );
  };

  const toggleSettlement = (settlement: Settlement) => {
    setPaidSettlementIds((current) =>
      current.includes(settlement.id)
        ? current.filter((settlementId) => settlementId !== settlement.id)
        : [...current, settlement.id],
    );
  };

  const markAllSettlementsPaid = () => {
    setPaidSettlementIds((current) =>
      Array.from(new Set([...current, ...simplifiedSettlements.map((settlement) => settlement.id)])),
    );
  };

  const deleteExpense = (expenseId: string) => {
    setAllExpenses((current) => current.filter((expense) => expense.id !== expenseId));
  };

  return (
    <main className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            {context.scope === "personal" ? <UserRound size={20} /> : <Home size={20} />}
          </div>
          <div>
            <strong>ChipaWAT</strong>
            <span>{context.scope === "personal" ? "Mi espacio" : activeGroup?.name}</span>
          </div>
        </div>
        <button
          className="sidebar-toggle"
          type="button"
          aria-label={sidebarCollapsed ? "Expandir menu" : "Esconder menu"}
          onClick={onSidebarToggle}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>

        <nav className="nav-list" aria-label="Secciones">
          <details className="nav-group" open>
            <summary className="nav-item active">
              <CircleDollarSign size={18} />
              Gastos
            </summary>
            <div className="nav-subitems">
              {context.scope === "group" ? (
                <a href="#alquiler">
                  <Banknote size={16} />
                  Alquiler
                </a>
              ) : null}
              <a href="#historial">
                <Search size={16} />
                Historial
              </a>
            </div>
          </details>
          <a className="nav-item" href="#calendario">
            <CalendarDays size={18} />
            Calendario
          </a>
          <a className="nav-item" href="#super">
            <ShoppingBasket size={18} />
            Super
          </a>
        </nav>

        <div className="nav-bottom">
          <a className="nav-item" href="#grupos">
            <UsersRound size={18} />
            Grupos
          </a>
          <a className="nav-item" href="#cuenta">
            <UserRound size={18} />
            Cuenta
          </a>
        </div>
      </aside>

      <section className="content" id="gastos">
        <header className="module-header">
          <div>
            <span className="eyebrow">
              {context.scope === "personal" ? "Mi espacio privado" : activeGroup?.name}
            </span>
            <h1>{context.scope === "personal" ? "Gastos personales" : "Gastos compartidos"}</h1>
            <p>
              {context.scope === "personal"
                ? "Solo ves tus gastos privados. No generan deudas ni afectan balances grupales."
                : "Este balance pertenece solo al grupo activo y no mezcla datos de otros grupos."}
            </p>
          </div>
          <button className="primary-button" type="button" onClick={() => openNewExpense()}>
            <Plus size={18} />
            Nuevo gasto
          </button>
        </header>

        <section className="calendar-context-tabs expense-context-tabs" aria-label="Contexto de gastos">
          <button
            className={context.scope === "personal" ? "active" : ""}
            type="button"
            onClick={() => switchContext(personalContext)}
          >
            <UserRound size={18} />
            Personal
          </button>
          <button
            className={context.scope === "group" ? "active" : ""}
            type="button"
            onClick={() => switchContext(getGroupContext(activeGroup?.id ?? defaultGroupId))}
          >
            <UsersRound size={18} />
            Grupo
          </button>
          <label className="group-select">
            Grupo activo
            <select
              disabled={context.scope !== "group"}
              value={context.scope === "group" ? context.groupId : activeGroup?.id ?? defaultGroupId}
              onChange={(event) => switchContext(getGroupContext(event.target.value))}
            >
              {userGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
        </section>

        {context.scope === "personal" ? (
          <PersonalView
            expenses={personalExpenses}
            historyItems={historyItems}
            monthFilter={monthFilter}
            personalMonthTotal={personalMonthTotal}
            onDelete={deleteExpense}
            onEdit={openEditExpense}
            onMonthChange={setMonthFilter}
            openNewExpense={() => openNewExpense("other")}
            availableMonths={availableMonths}
          />
        ) : (
          <GroupView
            activeRent={activeRent}
            activeGroupMembers={activeGroupMembers}
            activeMonthKey={activeMonthKey}
            availableMonths={availableMonths}
            contextRents={contextRents}
            directTransfers={directTransfers}
            groceryExpenses={groceryExpenses}
            groupMonthTotal={groupMonthTotal}
            historyFilter={historyFilter}
            historyItems={historyItems}
            monthFilter={monthFilter}
            otherGroupExpenses={otherGroupExpenses}
            personFilter={personFilter}
            settlements={simplifiedSettlements}
            userPaidThisMonth={userPaidThisMonth}
            userPendingBalance={userPendingBalance}
            userShareThisMonth={userShareThisMonth}
            onAdd={openNewExpense}
            onDelete={deleteExpense}
            onEdit={openEditExpense}
            onHistoryFilterChange={(value) => setHistoryFilter(value as FilterType)}
            onMonthFilterChange={setMonthFilter}
            onPersonFilterChange={setPersonFilter}
            onRentChange={setActiveRentId}
            onMarkAllSettlementsPaid={markAllSettlementsPaid}
            onSettlementToggle={toggleSettlement}
            onRentPaymentToggle={toggleRentPayment}
          />
        )}
      </section>

      {showModal ? (
        <ExpenseModal
          context={context}
          draft={draft}
          draftAmountCents={draftAmountCents}
          draftShareCents={draftShareCents}
          editingExpenseId={editingExpenseId}
          members={activeGroupMembers}
          onClose={() => setShowModal(false)}
          onParticipantToggle={setParticipant}
          onSave={saveDraft}
          onSelectAll={() =>
            setDraft((current) => ({
              ...current,
              participantIds:
                current.participantIds.length === activeMemberIds.length ? [] : activeMemberIds,
            }))
          }
          onUpdate={setDraft}
        />
      ) : null}
    </main>
  );
}

function PersonalView({
  expenses,
  personalMonthTotal,
  historyItems,
  availableMonths,
  monthFilter,
  onMonthChange,
  onEdit,
  onDelete,
  openNewExpense,
}: {
  expenses: PersonalExpense[];
  personalMonthTotal: number;
  historyItems: HistoryItem[];
  availableMonths: string[];
  monthFilter: string;
  onMonthChange: (value: string) => void;
  onEdit: (expense: Expense) => void;
  onDelete: (expenseId: string) => void;
  openNewExpense: () => void;
}) {
  const categoryTotals = expenses.reduce<Record<string, number>>((totals, expense) => {
    totals[expense.category] = (totals[expense.category] ?? 0) + expense.amountCents;
    return totals;
  }, {});

  return (
    <>
      <section className="summary-grid" aria-label="Resumen personal">
        <SummaryCard label="Gastaste este mes" value={formatMoney(personalMonthTotal)} icon={<ReceiptText size={20} />} />
        <SummaryCard label="Gastos cargados" value={String(expenses.length)} icon={<CalendarDays size={20} />} />
        <SummaryCard label="Categorias" value={String(Object.keys(categoryTotals).length)} icon={<ShoppingBasket size={20} />} />
        <SummaryCard label="Balance grupal" value="$0.00" detail="No aplica" icon={<UserRound size={20} />} />
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2>Gastos privados de Juli</h2>
          <button className="small-button" type="button" onClick={openNewExpense}>
            <Plus size={16} />
            Agregar
          </button>
        </div>
        <div className="expense-grid">
          {expenses.map((expense) => (
            <PersonalExpenseCard
              expense={expense}
              key={expense.id}
              onDelete={() => onDelete(expense.id)}
              onEdit={() => onEdit(expense)}
            />
          ))}
        </div>
      </section>

      <section className="panel">
        <PanelTitle icon={<Search size={18} />} title="Historial personal" />
        <div className="filters">
          <FilterSelect
            label="Mes"
            value={monthFilter}
            onChange={onMonthChange}
            options={[
              ["all", "Todos"],
              ...availableMonths.map((month) => [month, month] as [string, string]),
            ]}
          />
        </div>
        <HistoryList items={historyItems} />
      </section>
    </>
  );
}

type HistoryItem = {
  id: string;
  scope: "personal" | "group";
  type: ExpenseType;
  title: string;
  date: string;
  amountCents: number;
  paidBy: MemberId;
  participantIds: MemberId[];
};

function GroupView({
  activeRent,
  activeGroupMembers,
  availableMonths,
  contextRents,
  directTransfers,
  groceryExpenses,
  groupMonthTotal,
  historyFilter,
  historyItems,
  monthFilter,
  otherGroupExpenses,
  personFilter,
  settlements,
  userPaidThisMonth,
  userPendingBalance,
  userShareThisMonth,
  onAdd,
  onDelete,
  onEdit,
  onHistoryFilterChange,
  onMarkAllSettlementsPaid,
  onMonthFilterChange,
  onPersonFilterChange,
  onRentChange,
  onRentPaymentToggle,
  onSettlementToggle,
}: {
  activeRent: RentMonth | null;
  activeGroupMembers: User[];
  activeMonthKey: string;
  availableMonths: string[];
  contextRents: RentMonth[];
  directTransfers: { from: string; to: string; amountCents: number }[];
  groceryExpenses: GroupExpense[];
  groupMonthTotal: number;
  historyFilter: FilterType;
  historyItems: HistoryItem[];
  monthFilter: string;
  otherGroupExpenses: GroupExpense[];
  personFilter: string;
  settlements: Settlement[];
  userPaidThisMonth: number;
  userPendingBalance: number;
  userShareThisMonth: number;
  onAdd: (type?: ExpenseType) => void;
  onDelete: (expenseId: string) => void;
  onEdit: (expense: Expense) => void;
  onHistoryFilterChange: (value: string) => void;
  onMarkAllSettlementsPaid: () => void;
  onMonthFilterChange: (value: string) => void;
  onPersonFilterChange: (value: string) => void;
  onRentChange: (rentId: string) => void;
  onRentPaymentToggle: (rentId: string, memberId: string) => void;
  onSettlementToggle: (settlement: Settlement) => void;
}) {
  const rentPaidCents = activeRent ? getRentPaidCents(activeRent) : 0;
  const rentProgress = activeRent ? Math.round((rentPaidCents / activeRent.totalCents) * 100) : 0;
  const pendingOptimizedSettlements = settlements.filter((settlement) => settlement.status === "pending");
  const memberBalanceDetails = activeGroupMembers.map((member) => ({
    member,
    balance: pendingOptimizedSettlements.reduce((total, settlement) => {
      if (settlement.to === member.id) {
        return total + settlement.amountCents;
      }

      if (settlement.from === member.id) {
        return total - settlement.amountCents;
      }

      return total;
    }, 0),
    owes: pendingOptimizedSettlements.filter((settlement) => settlement.from === member.id),
    owedBy: pendingOptimizedSettlements.filter((settlement) => settlement.to === member.id),
  }));

  return (
    <>
      <section className="summary-grid" aria-label="Resumen financiero">
        <SummaryCard label="Gastos del grupo" value={formatMoney(groupMonthTotal)} icon={<ReceiptText size={20} />} />
        <SummaryCard label="Vos pagaste" value={formatMoney(userPaidThisMonth)} icon={<Banknote size={20} />} />
        <SummaryCard label="Te corresponde" value={formatMoney(userShareThisMonth)} icon={<UsersRound size={20} />} />
        <SummaryCard
          label="Balance personal"
          value={formatMoney(Math.abs(userPendingBalance))}
          detail={userPendingBalance >= 0 ? "Te deben" : "Debes"}
          tone={userPendingBalance >= 0 ? "positive" : "negative"}
          icon={<CircleDollarSign size={20} />}
        />
      </section>

      {activeRent ? (
        <section className="rent-card" id="alquiler">
          <div className="rent-hero">
            <div>
              <span className="eyebrow">Alquiler destacado</span>
              <h2>{activeRent.label}</h2>
              <p>
                {activeGroupMembers.length} personas · vence {formatDate(activeRent.dueDate)} · lo adelanto{" "}
                {userName(activeRent.paidBy)}
              </p>
            </div>
            <StatusBadge status={getRentStatus(activeRent)} />
          </div>

          <div className="rent-numbers">
            <Metric label="Total mensual" value={formatMoney(activeRent.totalCents)} />
            <Metric label="Por persona" value={formatMoney(getRentShareCents(activeRent))} />
            <Metric label="Cubierto" value={formatMoney(rentPaidCents)} />
          </div>

          <div className="progress-track" aria-label={`Alquiler cubierto ${rentProgress}%`}>
            <span style={{ width: `${rentProgress}%` }} />
          </div>

          <div className="month-tabs" aria-label="Meses de alquiler">
            {contextRents.map((rent) => (
              <button
                className={rent.id === activeRent.id ? "active" : ""}
                key={rent.id}
                type="button"
                onClick={() => onRentChange(rent.id)}
              >
                {rent.month}
              </button>
            ))}
          </div>

          <div className="rent-members">
            {activeRent.participantIds.map((memberId) => (
              <button
                className="member-payment"
                key={memberId}
                type="button"
                onClick={() => onRentPaymentToggle(activeRent.id, memberId)}
              >
                <Avatar userId={memberId} />
                <span>
                  <strong>{userName(memberId)}</strong>
                  <small>{formatMoney(getRentShareCents(activeRent))}</small>
                </span>
                <StatusBadge status={activeRent.payments[memberId]} />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel" id="balance">
        <div className="section-heading-row">
          <div>
            <PanelTitle icon={<CircleDollarSign size={18} />} title="Balance por integrante" />
            <span className="count-pill">{activeGroupMembers.length} integrantes</span>
          </div>
          <div className="view-toggle" aria-label="Vista de balance">
            <button type="button">Lista</button>
            <button className="active" type="button">Tarjetas</button>
          </div>
        </div>
        <p className="balance-helper">
          Se calcula con alquileres y gastos grupales cargados en Gastos. La lista de Super es solo para organizar
          compras pendientes hasta que alguien cargue el gasto pagado.
        </p>
        <div className="member-balance-grid">
          {memberBalanceDetails.map(({ member, balance, owes, owedBy }) => (
            <article className="member-balance-card" key={member.id}>
              <div className="member-balance-head">
                <Avatar userId={member.id} />
                <div>
                  <h3>{member.name}</h3>
                  <span
                    className={
                      balance > 0
                        ? "balance-status positive"
                        : balance < 0
                          ? "balance-status negative"
                          : "balance-status neutral"
                    }
                  >
                    {balance > 0 ? "Te deben" : balance < 0 ? "Debes" : "Al día"}
                  </span>
                </div>
              </div>

              <div className="member-balance-lines">
                <div>
                  <span>Le deben</span>
                  {owedBy.length === 0 ? <small>-</small> : null}
                  {owedBy.map((transfer) => (
                    <small key={`${transfer.from}-${transfer.to}-owed`}>
                      <b>{userName(transfer.from)}</b>
                      <strong>{formatMoney(transfer.amountCents)}</strong>
                    </small>
                  ))}
                </div>
                <div>
                  <span>Les debes</span>
                  {owes.length === 0 ? <small>-</small> : null}
                  {owes.map((transfer) => (
                    <small key={`${transfer.from}-${transfer.to}-owes`}>
                      <b>{userName(transfer.to)}</b>
                      <strong>{formatMoney(transfer.amountCents)}</strong>
                    </small>
                  ))}
                </div>
              </div>

              <div
                className={
                  balance > 0
                    ? "member-balance-total positive"
                    : balance < 0
                      ? "member-balance-total negative"
                      : "member-balance-total neutral"
                }
              >
                <strong>
                  {balance > 0 ? "+" : balance < 0 ? "-" : ""}
                  {formatMoney(Math.abs(balance))}
                </strong>
                <small>{balance > 0 ? "Balance a favor" : balance < 0 ? "Debes al grupo" : "Sin deuda"}</small>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel optimized-transfers">
        <div className="section-heading-row">
          <PanelTitle icon={<ReceiptText size={18} />} title="Transferencias optimizadas" />
          {pendingOptimizedSettlements.length > 0 ? (
            <button className="secondary-button" type="button" onClick={onMarkAllSettlementsPaid}>
              <CheckCircle2 size={16} />
              Marcar todo como pagado
            </button>
          ) : null}
        </div>
        <p className="balance-helper">
          Acá se compensan las deudas cruzadas para hacer la menor cantidad posible de pagos entre integrantes.
        </p>
        <div className="settlement-list">
          {settlements.length === 0 ? (
            <EmptyState title="Todo saldado" detail="No quedan transferencias pendientes." />
          ) : (
            settlements.map((settlement) => (
              <SettlementRow
                key={settlement.id}
                settlement={settlement}
                onToggle={() => onSettlementToggle(settlement)}
              />
            ))
          )}
        </div>
      </section>

      <ExpenseSection
        expenses={groceryExpenses}
        icon={<ShoppingBasket size={18} />}
        title="Compras de supermercado"
        onAdd={() => onAdd("grocery")}
        onDelete={onDelete}
        onEdit={onEdit}
      />

      <ExpenseSection
        expenses={otherGroupExpenses}
        icon={<ReceiptText size={18} />}
        title="Otros gastos"
        onAdd={() => onAdd("other")}
        onDelete={onDelete}
        onEdit={onEdit}
      />

      <section className="panel" id="historial">
        <PanelTitle icon={<Search size={18} />} title="Historial" />
        <div className="filters">
          <FilterSelect
            label="Tipo"
            value={historyFilter}
            onChange={onHistoryFilterChange}
            options={[
              ["all", "Todos"],
              ["rent", "Alquiler"],
              ["grocery", "Supermercado"],
              ["other", "Otros"],
            ]}
          />
          <FilterSelect
            label="Persona"
            value={personFilter}
            onChange={onPersonFilterChange}
            options={[
              ["all", "Todas"],
              ...activeGroupMembers.map((member) => [member.id, member.name] as [string, string]),
            ]}
          />
          <FilterSelect
            label="Mes"
            value={monthFilter}
            onChange={onMonthFilterChange}
            options={[
              ["all", "Todos"],
              ...availableMonths.map((month) => [month, month] as [string, string]),
            ]}
          />
        </div>
        <HistoryList items={historyItems} />
      </section>

      <section className="panel">
        <PanelTitle icon={<CircleDollarSign size={18} />} title="Detalle sin compensar" />
        <div className="direct-list">
          {directTransfers.map((transfer) => (
            <div className="mini-transfer" key={`${transfer.from}-${transfer.to}`}>
              <span>
                {userName(transfer.from)} debe a {userName(transfer.to)}
              </span>
              <strong>{formatMoney(transfer.amountCents)}</strong>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function ExpenseModal({
  context,
  draft,
  draftAmountCents,
  draftShareCents,
  editingExpenseId,
  members,
  onClose,
  onParticipantToggle,
  onSave,
  onSelectAll,
  onUpdate,
}: {
  context: ExpenseContext;
  draft: ExpenseDraft;
  draftAmountCents: number;
  draftShareCents: number;
  editingExpenseId: string | null;
  members: User[];
  onClose: () => void;
  onParticipantToggle: (memberId: string) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onSelectAll: () => void;
  onUpdate: React.Dispatch<React.SetStateAction<ExpenseDraft>>;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <form className="expense-modal" onSubmit={onSave}>
        <div className="modal-heading">
          <div>
            <span className="eyebrow">{context.scope === "personal" ? "Privado" : "Compartido"}</span>
            <h2>{editingExpenseId ? "Editar gasto" : "Nuevo gasto"}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {context.scope === "group" ? (
          <div className="type-picker">
            {(["rent", "grocery", "other"] as ExpenseType[]).map((type) => (
              <button
                className={draft.type === type ? "active" : ""}
                key={type}
                type="button"
                onClick={() => onUpdate((current) => ({ ...current, type }))}
                disabled={Boolean(editingExpenseId) && type === "rent"}
              >
                {expenseLabels[type]}
              </button>
            ))}
          </div>
        ) : null}

        {draft.type === "rent" && context.scope === "group" ? (
          <div className="form-grid">
            <label>
              Mes
              <input
                value={draft.rentMonthLabel}
                onChange={(event) =>
                  onUpdate((current) => ({ ...current, rentMonthLabel: event.target.value }))
                }
              />
            </label>
            <label>
              Vence
              <input
                type="date"
                value={draft.dueDate}
                onChange={(event) =>
                  onUpdate((current) => ({ ...current, dueDate: event.target.value }))
                }
              />
            </label>
          </div>
        ) : (
          <>
            <div className="form-grid">
              <label>
                Descripcion
                <input
                  value={draft.description}
                  onChange={(event) =>
                    onUpdate((current) => ({ ...current, description: event.target.value }))
                  }
                  placeholder={context.scope === "personal" ? "Almuerzo sola" : "Supermercado Safeway"}
                />
              </label>
              <label>
                Categoria
                <input
                  value={draft.category}
                  onChange={(event) =>
                    onUpdate((current) => ({ ...current, category: event.target.value }))
                  }
                  placeholder={context.scope === "personal" ? "Ropa, comida, ski..." : "Uber, ski, cafe..."}
                />
              </label>
            </div>
            <label>
              Fecha
              <input
                type="date"
                value={draft.date}
                onChange={(event) =>
                  onUpdate((current) => ({ ...current, date: event.target.value }))
                }
              />
            </label>
          </>
        )}

        <div className="form-grid">
          <label>
            Monto
            <input
              inputMode="decimal"
              min="0"
              value={draft.amount}
              onChange={(event) => onUpdate((current) => ({ ...current, amount: event.target.value }))}
              placeholder="120"
            />
          </label>
          {context.scope === "group" ? (
            <label>
              Quien pago
              <select
                value={draft.paidBy}
                onChange={(event) => onUpdate((current) => ({ ...current, paidBy: event.target.value }))}
              >
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {context.scope === "group" ? (
          <fieldset>
            <div className="fieldset-heading">
              <legend>Participaron</legend>
              <button type="button" onClick={onSelectAll}>
                Seleccionar todas
              </button>
            </div>
            <div className="member-picker">
              {members.map((member) => (
                <button
                  className={draft.participantIds.includes(member.id) ? "selected" : ""}
                  key={member.id}
                  type="button"
                  onClick={() => onParticipantToggle(member.id)}
                >
                  <Avatar userId={member.id} small />
                  {member.name}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        <div className="preview-box">
          <span>Vista previa</span>
          {context.scope === "personal" ? (
            <>
              <strong>{formatMoney(draftAmountCents)}</strong>
              <p>Este gasto queda solo en tu espacio privado.</p>
            </>
          ) : (
            <>
              <strong>
                {formatMoney(draftAmountCents)} / {draft.participantIds.length || 0} personas ={" "}
                {formatMoney(draftShareCents)}
              </strong>
              <p>Le pagan a {userName(draft.paidBy)} dentro del grupo activo.</p>
            </>
          )}
        </div>

        <button className="primary-button" type="submit">
          Guardar
        </button>
      </form>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  tone,
  icon,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "positive" | "negative";
  icon: React.ReactNode;
}) {
  return (
    <article className={`summary-card ${tone ?? ""}`}>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PanelTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="panel-title">
      <h2>{title}</h2>
      {icon}
    </div>
  );
}

function SettlementRow({
  settlement,
  onToggle,
}: {
  settlement: Settlement;
  onToggle: () => void;
}) {
  return (
    <button className={`settlement-row ${settlement.status}`} type="button" onClick={onToggle}>
      <div className="settlement-person">
        <Avatar userId={settlement.from} small />
        <span>
          <strong>{userName(settlement.from)}</strong>
          <small>Debe pagar</small>
        </span>
      </div>
      <b>{formatMoney(settlement.amountCents)}</b>
      <ArrowRight className="settlement-arrow" size={18} />
      <div className="settlement-person">
        <Avatar userId={settlement.to} small />
        <span>
          <strong>{userName(settlement.to)}</strong>
          <small>Debe recibir</small>
        </span>
      </div>
      <span className="settlement-action">
        {settlement.status === "paid" ? (
          <>
            <CheckCircle2 size={16} />
            Pagado
          </>
        ) : (
          "Marcar como pagado"
        )}
      </span>
    </button>
  );
}

function ExpenseSection({
  expenses,
  icon,
  title,
  onAdd,
  onEdit,
  onDelete,
}: {
  expenses: GroupExpense[];
  icon: React.ReactNode;
  title: string;
  onAdd: () => void;
  onEdit: (expense: Expense) => void;
  onDelete: (expenseId: string) => void;
}) {
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>{title}</h2>
        <div className="panel-actions">
          {icon}
          <button className="small-button" type="button" onClick={onAdd}>
            <Plus size={16} />
            Agregar
          </button>
        </div>
      </div>
      <div className="expense-grid">
        {expenses.map((expense) => (
          <GroupExpenseCard
            expense={expense}
            key={expense.id}
            onDelete={() => onDelete(expense.id)}
            onEdit={() => onEdit(expense)}
          />
        ))}
      </div>
    </section>
  );
}

function GroupExpenseCard({
  expense,
  onEdit,
  onDelete,
}: {
  expense: GroupExpense;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const shareCents = Math.round(expense.amountCents / expense.participantIds.length);

  return (
    <article className="expense-card">
      <div className="expense-card-head">
        <div>
          <span className="category-pill">{expense.category}</span>
          <h3>{expense.description}</h3>
          <small>
            {formatDate(expense.date)} · pago {userName(expense.paidBy)}
          </small>
        </div>
        <strong>{formatMoney(expense.amountCents)}</strong>
      </div>
      <div className="participants">
        {users.map((user) => (
          <span className={expense.participantIds.includes(user.id) ? "included" : ""} key={user.id}>
            <Avatar userId={user.id} small />
            {user.name}
          </span>
        ))}
      </div>
      <div className="card-footer">
        <span>{formatMoney(shareCents)} por persona</span>
        <CardActions onDelete={onDelete} onEdit={onEdit} />
      </div>
    </article>
  );
}

function PersonalExpenseCard({
  expense,
  onEdit,
  onDelete,
}: {
  expense: PersonalExpense;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="expense-card">
      <div className="expense-card-head">
        <div>
          <span className="category-pill">{expense.category}</span>
          <h3>{expense.description}</h3>
          <small>{formatDate(expense.date)} · privado</small>
        </div>
        <strong>{formatMoney(expense.amountCents)}</strong>
      </div>
      <div className="card-footer">
        <span>No genera deuda grupal</span>
        <CardActions onDelete={onDelete} onEdit={onEdit} />
      </div>
    </article>
  );
}

function CardActions({ onDelete, onEdit }: { onDelete: () => void; onEdit: () => void }) {
  return (
    <div>
      <button className="icon-button muted" type="button" onClick={onEdit} aria-label="Editar gasto">
        <Edit3 size={16} />
      </button>
      <button className="icon-button muted danger" type="button" onClick={onDelete} aria-label="Eliminar gasto">
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function HistoryList({ items }: { items: HistoryItem[] }) {
  return (
    <div className="history-list">
      {items.map((item) => (
        <div className="history-row" key={item.id}>
          <div>
            <StatusIcon type={item.type} />
            <span>
              <strong>{item.title}</strong>
              <small>
                {item.scope === "personal" ? "Personal" : expenseLabels[item.type]} ·{" "}
                {formatDate(item.date)}
              </small>
            </span>
          </div>
          <b>{formatMoney(item.amountCents)}</b>
        </div>
      ))}
    </div>
  );
}

function StatusIcon({ type }: { type: ExpenseType }) {
  if (type === "rent") {
    return <Banknote size={18} />;
  }

  if (type === "grocery") {
    return <ShoppingBasket size={18} />;
  }

  return <CalendarDays size={18} />;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <CheckCircle2 size={22} />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}
