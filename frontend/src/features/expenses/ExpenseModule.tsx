import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Edit3,
  Home,
  Plus,
  ReceiptText,
  Search,
  ShoppingBasket,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import {
  calculateSettlements,
  getRentPaidCents,
  getRentShareCents,
  getRentStatus,
} from "./calculations";
import { currentUserId, houseMembers, rentMonths, sharedExpenses } from "./mockData";
import { formatMoney, parseMoneyToCents, splitEvenly } from "./money";
import type {
  ExpenseDraft,
  ExpenseType,
  HouseMember,
  MemberId,
  RentMonth,
  Settlement,
  SharedExpense,
} from "./types";

type FilterType = "all" | ExpenseType;

const blankDraft = (memberIds: MemberId[], paidBy: MemberId): ExpenseDraft => ({
  type: "grocery",
  category: "Supermercado",
  description: "",
  date: "2026-01-22",
  amount: "",
  paidBy,
  participantIds: memberIds,
  rentMonthLabel: "Alquiler abril",
  dueDate: "2026-04-05",
});

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

function memberName(memberId: MemberId): string {
  return houseMembers.find((member) => member.id === memberId)?.name ?? memberId;
}

function memberById(memberId: MemberId): HouseMember {
  return houseMembers.find((member) => member.id === memberId) ?? houseMembers[0];
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

function Avatar({ memberId, small = false }: { memberId: MemberId; small?: boolean }) {
  const member = memberById(memberId);

  return (
    <span
      className={small ? "avatar avatar-small" : "avatar"}
      style={{ "--member-color": member.color } as CSSProperties}
      title={member.name}
    >
      {member.name.slice(0, 1)}
    </span>
  );
}

function StatusBadge({ status }: { status: "paid" | "pending" | "partial" }) {
  return <span className={`status-badge ${status}`}>{statusLabels[status]}</span>;
}

export function ExpenseModule() {
  const [rents, setRents] = useState<RentMonth[]>(rentMonths);
  const [expenses, setExpenses] = useState<SharedExpense[]>(sharedExpenses);
  const [activeRentId, setActiveRentId] = useState("rent-january");
  const [showModal, setShowModal] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [draft, setDraft] = useState(() =>
    blankDraft(
      houseMembers.map((member) => member.id),
      currentUserId,
    ),
  );
  const [historyFilter, setHistoryFilter] = useState<FilterType>("all");
  const [personFilter, setPersonFilter] = useState<MemberId>("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [paidSettlementIds, setPaidSettlementIds] = useState<string[]>([]);

  const activeRent = rents.find((rent) => rent.id === activeRentId) ?? rents[0];
  const activeMonthKey = getMonthKey(activeRent.dueDate);

  const { directTransfers, balances, simplifiedSettlements } = useMemo(
    () => calculateSettlements(houseMembers, rents, expenses, paidSettlementIds),
    [expenses, paidSettlementIds, rents],
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

  const currentMonthExpenses = expenses.filter((expense) => getMonthKey(expense.date) === activeMonthKey);
  const currentMonthTotal =
    activeRent.totalCents +
    currentMonthExpenses.reduce((total, expense) => total + expense.amountCents, 0);
  const userPaidThisMonth = currentMonthExpenses
    .filter((expense) => expense.paidBy === currentUserId)
    .reduce((total, expense) => total + expense.amountCents, 0);
  const userShareThisMonth =
    getRentShareCents(activeRent) +
    currentMonthExpenses.reduce((total, expense) => {
      const index = expense.participantIds.indexOf(currentUserId);

      if (index === -1) {
        return total;
      }

      return total + splitEvenly(expense.amountCents, expense.participantIds.length)[index];
    }, 0);

  const groceryExpenses = expenses.filter((expense) => expense.type === "grocery");
  const otherExpenses = expenses.filter((expense) => expense.type === "other");
  const historyItems = [
    ...rents.map((rent) => ({
      id: rent.id,
      type: "rent" as const,
      title: rent.label,
      date: rent.dueDate,
      amountCents: rent.totalCents,
      paidBy: rent.paidBy,
      participantIds: rent.participantIds,
    })),
    ...expenses.map((expense) => ({
      id: expense.id,
      type: expense.type,
      title: expense.description,
      date: expense.date,
      amountCents: expense.amountCents,
      paidBy: expense.paidBy,
      participantIds: expense.participantIds,
    })),
  ]
    .filter((item) => historyFilter === "all" || item.type === historyFilter)
    .filter((item) => personFilter === "all" || item.participantIds.includes(personFilter))
    .filter((item) => monthFilter === "all" || getMonthKey(item.date) === monthFilter)
    .sort((first, second) => second.date.localeCompare(first.date));

  const availableMonths = Array.from(
    new Set([...rents.map((rent) => getMonthKey(rent.dueDate)), ...expenses.map((expense) => getMonthKey(expense.date))]),
  ).sort();

  const rentPaidCents = getRentPaidCents(activeRent);
  const rentProgress = Math.round((rentPaidCents / activeRent.totalCents) * 100);
  const draftAmountCents = parseMoneyToCents(draft.amount);
  const draftShareCents =
    draft.participantIds.length > 0 ? Math.round(draftAmountCents / draft.participantIds.length) : 0;

  const setParticipant = (memberId: MemberId) => {
    setDraft((current) => ({
      ...current,
      participantIds: current.participantIds.includes(memberId)
        ? current.participantIds.filter((participantId) => participantId !== memberId)
        : [...current.participantIds, memberId],
    }));
  };

  const openNewExpense = (type: ExpenseType = "grocery") => {
    setEditingExpenseId(null);
    setDraft({
      ...blankDraft(
        houseMembers.map((member) => member.id),
        currentUserId,
      ),
      type,
      category: type === "other" ? "Uber" : type === "rent" ? "Alquiler" : "Supermercado",
    });
    setShowModal(true);
  };

  const openEditExpense = (expense: SharedExpense) => {
    setEditingExpenseId(expense.id);
    setDraft({
      type: expense.type,
      category: expense.category,
      description: expense.description,
      date: expense.date,
      amount: String(expense.amountCents / 100),
      paidBy: expense.paidBy,
      participantIds: expense.participantIds,
      rentMonthLabel: "Alquiler abril",
      dueDate: "2026-04-05",
    });
    setShowModal(true);
  };

  const saveDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (draftAmountCents <= 0 || draft.participantIds.length === 0) {
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
        label: draft.rentMonthLabel.trim() || "Nuevo alquiler",
        month: draft.rentMonthLabel.replace("Alquiler", "").trim() || "Nuevo mes",
        totalCents: draftAmountCents,
        dueDate: draft.dueDate,
        paidBy: draft.paidBy,
        participantIds: draft.participantIds,
        payments,
      };

      setRents((current) => [newRent, ...current]);
      setActiveRentId(newRent.id);
    } else {
      const nextExpense: SharedExpense = {
        id: editingExpenseId ?? `expense-${Date.now()}`,
        type: draft.type,
        category: draft.category.trim() || expenseLabels[draft.type],
        description: draft.description.trim() || expenseLabels[draft.type],
        date: draft.date,
        amountCents: draftAmountCents,
        paidBy: draft.paidBy,
        participantIds: draft.participantIds,
      };

      setExpenses((current) =>
        editingExpenseId
          ? current.map((expense) => (expense.id === editingExpenseId ? nextExpense : expense))
          : [nextExpense, ...current],
      );
    }

    setShowModal(false);
    setEditingExpenseId(null);
  };

  const toggleRentPayment = (rentId: string, memberId: MemberId) => {
    setRents((current) =>
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

  const deleteExpense = (expenseId: string) => {
    setExpenses((current) => current.filter((expense) => expense.id !== expenseId));
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Home size={20} />
          </div>
          <div>
            <strong>ChipaWAT</strong>
            <span>Casa de invierno</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Secciones">
          <a className="nav-item active" href="#gastos">
            <CircleDollarSign size={18} />
            Gastos
          </a>
          <a className="nav-item" href="#alquiler">
            <Banknote size={18} />
            Alquiler
          </a>
          <a className="nav-item" href="#balance">
            <ReceiptText size={18} />
            Balances
          </a>
          <a className="nav-item" href="#historial">
            <Search size={18} />
            Historial
          </a>
        </nav>
      </aside>

      <section className="content" id="gastos">
        <header className="module-header">
          <div>
            <span className="eyebrow">Modulo Gastos</span>
            <h1>Gastos compartidos</h1>
            <p>Alquiler, supermercado, salidas y transferencias pendientes de la casa.</p>
          </div>
          <button className="primary-button" type="button" onClick={() => openNewExpense()}>
            <Plus size={18} />
            Nuevo gasto
          </button>
        </header>

        <section className="summary-grid" aria-label="Resumen financiero">
          <SummaryCard label="Gastos del mes" value={formatMoney(currentMonthTotal)} icon={<ReceiptText size={20} />} />
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

        <section className="rent-card" id="alquiler">
          <div className="rent-hero">
            <div>
              <span className="eyebrow">Alquiler destacado</span>
              <h2>{activeRent.label}</h2>
              <p>
                {houseMembers.length} personas · vence {formatDate(activeRent.dueDate)} · lo adelanto{" "}
                {memberName(activeRent.paidBy)}
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
            {rents.map((rent) => (
              <button
                className={rent.id === activeRent.id ? "active" : ""}
                key={rent.id}
                type="button"
                onClick={() => setActiveRentId(rent.id)}
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
                onClick={() => toggleRentPayment(activeRent.id, memberId)}
              >
                <Avatar memberId={memberId} />
                <span>
                  <strong>{memberName(memberId)}</strong>
                  <small>{formatMoney(getRentShareCents(activeRent))}</small>
                </span>
                <StatusBadge status={activeRent.payments[memberId]} />
              </button>
            ))}
          </div>
        </section>

        <section className="balance-grid" id="balance">
          <article className="panel">
            <PanelTitle icon={<ReceiptText size={18} />} title="Quien le debe a quien" />
            <div className="settlement-list">
              {pendingSettlements.length === 0 ? (
                <EmptyState title="Todo saldado" detail="No quedan transferencias pendientes." />
              ) : (
                pendingSettlements.map((settlement) => (
                  <SettlementRow
                    key={settlement.id}
                    settlement={settlement}
                    onToggle={() => toggleSettlement(settlement)}
                  />
                ))
              )}
            </div>
          </article>

          <article className="panel">
            <PanelTitle icon={<CircleDollarSign size={18} />} title="Balance por persona" />
            <div className="balance-list">
              {balances.map((balance) => (
                <div className="balance-row" key={balance.memberId}>
                  <div>
                    <Avatar memberId={balance.memberId} small />
                    <span>{memberName(balance.memberId)}</span>
                  </div>
                  <strong className={balance.amountCents >= 0 ? "positive" : "negative"}>
                    {balance.amountCents >= 0 ? "Recibe " : "Debe "}
                    {formatMoney(Math.abs(balance.amountCents))}
                  </strong>
                </div>
              ))}
            </div>
          </article>
        </section>

        <ExpenseSection
          expenses={groceryExpenses}
          icon={<ShoppingBasket size={18} />}
          title="Compras de supermercado"
          onAdd={() => openNewExpense("grocery")}
          onDelete={deleteExpense}
          onEdit={openEditExpense}
        />

        <ExpenseSection
          expenses={otherExpenses}
          icon={<ReceiptText size={18} />}
          title="Otros gastos"
          onAdd={() => openNewExpense("other")}
          onDelete={deleteExpense}
          onEdit={openEditExpense}
        />

        <section className="panel" id="historial">
          <PanelTitle icon={<Search size={18} />} title="Historial" />
          <div className="filters">
            <FilterSelect
              label="Tipo"
              value={historyFilter}
              onChange={(value) => setHistoryFilter(value as FilterType)}
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
              onChange={setPersonFilter}
              options={[
                ["all", "Todas"],
                ...houseMembers.map((member) => [member.id, member.name] as [string, string]),
              ]}
            />
            <FilterSelect
              label="Mes"
              value={monthFilter}
              onChange={setMonthFilter}
              options={[
                ["all", "Todos"],
                ...availableMonths.map((month) => [month, month] as [string, string]),
              ]}
            />
          </div>
          <div className="history-list">
            {historyItems.map((item) => (
              <div className="history-row" key={item.id}>
                <div>
                  <StatusIcon type={item.type} />
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {expenseLabels[item.type]} · {formatDate(item.date)} · pago{" "}
                      {memberName(item.paidBy)}
                    </small>
                  </span>
                </div>
                <b>{formatMoney(item.amountCents)}</b>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <PanelTitle icon={<ChevronDown size={18} />} title="Detalle sin compensar" />
          <div className="direct-list">
            {directTransfers.map((transfer) => (
              <div className="mini-transfer" key={`${transfer.from}-${transfer.to}`}>
                <span>
                  {memberName(transfer.from)} debe a {memberName(transfer.to)}
                </span>
                <strong>{formatMoney(transfer.amountCents)}</strong>
              </div>
            ))}
          </div>
        </section>
      </section>

      {showModal ? (
        <div className="modal-backdrop" role="presentation">
          <form className="expense-modal" onSubmit={saveDraft}>
            <div className="modal-heading">
              <div>
                <span className="eyebrow">{editingExpenseId ? "Editar" : "Nuevo"}</span>
                <h2>{editingExpenseId ? "Editar gasto" : "Nuevo gasto"}</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="type-picker">
              {(["rent", "grocery", "other"] as ExpenseType[]).map((type) => (
                <button
                  className={draft.type === type ? "active" : ""}
                  key={type}
                  type="button"
                  onClick={() => setDraft((current) => ({ ...current, type }))}
                  disabled={Boolean(editingExpenseId) && type === "rent"}
                >
                  {expenseLabels[type]}
                </button>
              ))}
            </div>

            {draft.type === "rent" ? (
              <div className="form-grid">
                <label>
                  Mes
                  <input
                    value={draft.rentMonthLabel}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, rentMonthLabel: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Vence
                  <input
                    type="date"
                    value={draft.dueDate}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, dueDate: event.target.value }))
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
                        setDraft((current) => ({ ...current, description: event.target.value }))
                      }
                      placeholder="Supermercado Safeway"
                    />
                  </label>
                  <label>
                    Categoria
                    <input
                      value={draft.category}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, category: event.target.value }))
                      }
                      placeholder="Uber, ski, cafe..."
                    />
                  </label>
                </div>
                <label>
                  Fecha
                  <input
                    type="date"
                    value={draft.date}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, date: event.target.value }))
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
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, amount: event.target.value }))
                  }
                  placeholder="120"
                />
              </label>
              <label>
                Quien pago
                <select
                  value={draft.paidBy}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, paidBy: event.target.value }))
                  }
                >
                  {houseMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <fieldset>
              <div className="fieldset-heading">
                <legend>Participaron</legend>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      participantIds:
                        current.participantIds.length === houseMembers.length
                          ? []
                          : houseMembers.map((member) => member.id),
                    }))
                  }
                >
                  Seleccionar todas
                </button>
              </div>
              <div className="member-picker">
                {houseMembers.map((member) => (
                  <button
                    className={draft.participantIds.includes(member.id) ? "selected" : ""}
                    key={member.id}
                    type="button"
                    onClick={() => setParticipant(member.id)}
                  >
                    <Avatar memberId={member.id} small />
                    {member.name}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="preview-box">
              <span>Vista previa</span>
              <strong>
                {formatMoney(draftAmountCents)} / {draft.participantIds.length || 0} personas ={" "}
                {formatMoney(draftShareCents)}
              </strong>
              <p>
                {draft.paidBy ? `Le pagan a ${memberName(draft.paidBy)}.` : "Selecciona quien pago."}
              </p>
            </div>

            <button className="primary-button" type="submit">
              Guardar
            </button>
          </form>
        </div>
      ) : null}
    </main>
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
      <div>
        <Avatar memberId={settlement.from} small />
        <span>
          <strong>
            {memberName(settlement.from)} le debe a {memberName(settlement.to)}
          </strong>
          <small>{settlement.status === "paid" ? "Liquidacion registrada" : "Pendiente"}</small>
        </span>
      </div>
      <b>{formatMoney(settlement.amountCents)}</b>
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
  expenses: SharedExpense[];
  icon: React.ReactNode;
  title: string;
  onAdd: () => void;
  onEdit: (expense: SharedExpense) => void;
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
          <ExpenseCard
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

function ExpenseCard({
  expense,
  onEdit,
  onDelete,
}: {
  expense: SharedExpense;
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
            {formatDate(expense.date)} · pago {memberName(expense.paidBy)}
          </small>
        </div>
        <strong>{formatMoney(expense.amountCents)}</strong>
      </div>
      <div className="participants">
        {houseMembers.map((member) => (
          <span className={expense.participantIds.includes(member.id) ? "included" : ""} key={member.id}>
            <Avatar memberId={member.id} small />
            {member.name}
          </span>
        ))}
      </div>
      <div className="card-footer">
        <span>{formatMoney(shareCents)} por persona</span>
        <div>
          <button className="icon-button muted" type="button" onClick={onEdit} aria-label="Editar gasto">
            <Edit3 size={16} />
          </button>
          <button className="icon-button muted danger" type="button" onClick={onDelete} aria-label="Eliminar gasto">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </article>
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
