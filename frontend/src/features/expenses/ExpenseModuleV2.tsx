import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
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
  Undo2,
  UserRound,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import {
  calculateSettlements,
  getRentPaidCents,
  getRentShareCents,
  getRentStatus,
} from "./calculations";
import { listMyGroups } from "../groups/groupsApi";
import type { MyGroup } from "../groups/types";
import { useAuth } from "../auth/AuthContext";
import { formatMoney, parseMoneyToCents, splitEvenly } from "./money";
import {
  createPersonalMovement,
  deletePersonalMovement,
  listPersonalMovements,
  updatePersonalMovement,
} from "./personalMovementsApi";
import { emptyMoneyBalance, getMyMoneyBalance } from "./moneyBalanceApi";
import {
  createRentMonth,
  deleteGroupExpense,
  deleteGroupSettlement,
  listGroupExpenses,
  listGroupSettlements,
  listRentMonths,
  recordGroupSettlement,
  saveGroupExpense,
  setRentPayment,
} from "./groupExpensesApi";
import type {
  Expense,
  ExpenseContext,
  ExpenseDraft,
  ExpenseType,
  GroupExpense,
  GroupSettlement,
  MemberId,
  MoneyBalance,
  MovementKind,
  PersonalMovement,
  RentMonth,
  Settlement,
  User,
} from "./types";

type FilterType = "all" | ExpenseType;
type MovementFilter = "all" | MovementKind;

type ShellControls = {
  sidebarCollapsed: boolean;
  onSidebarToggle: () => void;
};

// ownerUserId ya no filtra nada: de los movimientos personales se encarga Supabase.
const personalContext: ExpenseContext = { scope: "personal", ownerUserId: "" };

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

const errorBoxStyle: CSSProperties = {
  margin: 0,
  padding: "10px 12px",
  borderRadius: 10,
  color: "#9a2b3f",
  background: "#fde3e7",
  fontSize: 13,
};

function getGroupContext(groupId: string): ExpenseContext {
  return { scope: "group", groupId };
}

function blankDraft(context: ExpenseContext, memberIds: MemberId[], payerId: MemberId): ExpenseDraft {
  const today = new Date().toISOString().slice(0, 10);
  const monthName = new Date().toLocaleDateString("es-AR", { month: "long" });

  return {
    scope: context.scope,
    kind: "expense",
    type: context.scope === "personal" ? "other" : "grocery",
    category: context.scope === "personal" ? "Comida" : "Supermercado",
    description: "",
    date: today,
    amount: "",
    paidBy: payerId,
    participantIds: memberIds,
    rentMonthLabel: `Alquiler ${monthName}`,
    dueDate: today,
  };
}

/**
 * Quien es cada persona (nombre y color) sale de la base, no de un archivo
 * fijo. Va por contexto para que cualquier tarjeta pueda resolver un id sin
 * que haya que pasarlo por props hasta el fondo del arbol.
 */
const DirectoryContext = createContext<User[]>([]);

function useDirectory(): User[] {
  return useContext(DirectoryContext);
}

function useUserName(): (userId: MemberId) => string {
  const directory = useDirectory();

  return (userId: MemberId) => directory.find((user) => user.id === userId)?.name ?? "Alguien";
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

function Avatar({ userId, small = false }: { userId: MemberId; small?: boolean }) {
  const directory = useDirectory();
  const user = directory.find((entry) => entry.id === userId);
  const name = user?.name ?? "?";

  return (
    <span
      className={small ? "avatar avatar-small" : "avatar"}
      style={{ "--member-color": user?.color ?? "#d36a97" } as CSSProperties}
      title={name}
    >
      {name.slice(0, 1)}
    </span>
  );
}

function StatusBadge({ status }: { status: "paid" | "pending" | "partial" }) {
  return <span className={`status-badge ${status}`}>{statusLabels[status]}</span>;
}

export function ExpenseModuleV2({ sidebarCollapsed, onSidebarToggle }: ShellControls) {
  const [context, setContext] = useState<ExpenseContext>(getGroupContext(""));
  const [activeRentId, setActiveRentId] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<FilterType>("all");
  const [movementFilter, setMovementFilter] = useState<MovementFilter>("all");
  const [personFilter, setPersonFilter] = useState<MemberId>("all");
  const [monthFilter, setMonthFilter] = useState("all");

  // Nada de esto sale ya de mockData: grupos, integrantes, movimientos y
  // alquiler vienen de Supabase, y las policies se encargan de que cada una
  // vea lo suyo.
  const { profile, user } = useAuth();
  const currentUserId = user?.id ?? "";
  const [personalMovements, setPersonalMovements] = useState<PersonalMovement[]>([]);
  const [personalLoading, setPersonalLoading] = useState(true);
  const [personalError, setPersonalError] = useState<string | null>(null);

  // El saldo lo calcula Postgres (my_money_balance) sobre TODOS tus grupos, no
  // solo el activo: la plata que tenés es una sola, aunque la gastes en varios
  // lados. Por eso vive en el modulo y no adentro de una vista.
  const [balance, setBalance] = useState<MoneyBalance>(emptyMoneyBalance);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const reloadBalance = useCallback(async () => {
    setBalanceError(null);

    try {
      setBalance(await getMyMoneyBalance());
    } catch (caughtError) {
      setBalanceError(
        caughtError instanceof Error
          ? caughtError.message
          : "No pudimos calcular cuanta plata tenes.",
      );
    }
  }, []);

  const reloadPersonalMovements = useCallback(async () => {
    setPersonalError(null);

    try {
      setPersonalMovements(await listPersonalMovements());
    } catch (caughtError) {
      setPersonalError(
        caughtError instanceof Error
          ? caughtError.message
          : "No pudimos cargar tus movimientos personales.",
      );
    } finally {
      setPersonalLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadPersonalMovements();
    void reloadBalance();
  }, [reloadPersonalMovements, reloadBalance]);

  const [myGroups, setMyGroups] = useState<MyGroup[]>([]);
  const [dbGroupExpenses, setDbGroupExpenses] = useState<GroupExpense[]>([]);
  const [dbRents, setDbRents] = useState<RentMonth[]>([]);
  const [dbSettlements, setDbSettlements] = useState<GroupSettlement[]>([]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [groupLoading, setGroupLoading] = useState(true);
  const [groupError, setGroupError] = useState<string | null>(null);

  const reloadGroups = useCallback(async () => {
    if (!currentUserId) {
      return;
    }

    try {
      const nextGroups = await listMyGroups(currentUserId);
      setMyGroups(nextGroups);

      // Si el grupo que estabas mirando ya no existe (o recien entras), cae al primero.
      setContext((current) =>
        current.scope === "group" && !nextGroups.some((group) => group.id === current.groupId)
          ? getGroupContext(nextGroups[0]?.id ?? "")
          : current,
      );
    } catch (caughtError) {
      setGroupError(
        caughtError instanceof Error ? caughtError.message : "No pudimos cargar tus grupos.",
      );
    } finally {
      setGroupsLoaded(true);
    }
  }, [currentUserId]);

  useEffect(() => {
    void reloadGroups();
  }, [reloadGroups]);

  const activeGroupId = context.scope === "group" ? context.groupId : "";

  const reloadGroupData = useCallback(async () => {
    if (!activeGroupId) {
      setDbGroupExpenses([]);
      setDbRents([]);
      setDbSettlements([]);
      setGroupLoading(false);
      return;
    }

    setGroupError(null);

    try {
      const [nextExpenses, nextRents, nextSettlements] = await Promise.all([
        listGroupExpenses(activeGroupId),
        listRentMonths(activeGroupId),
        listGroupSettlements(activeGroupId),
      ]);

      setDbGroupExpenses(nextExpenses);
      setDbRents(nextRents);
      setDbSettlements(nextSettlements);
    } catch (caughtError) {
      setGroupError(
        caughtError instanceof Error
          ? caughtError.message
          : "No pudimos cargar los gastos del grupo.",
      );
    } finally {
      setGroupLoading(false);
    }
  }, [activeGroupId]);

  useEffect(() => {
    void reloadGroupData();
  }, [reloadGroupData]);

  const activeGroup = myGroups.find((group) => group.id === activeGroupId);
  const userGroups = myGroups;

  // Todas las personas que pueden aparecer en pantalla, para resolver nombres y colores.
  const directory = useMemo<User[]>(() => {
    const known = new Map<string, User>();

    myGroups.forEach((group) =>
      group.members.forEach((member) => {
        if (!known.has(member.userId)) {
          known.set(member.userId, { id: member.userId, name: member.name, color: member.color });
        }
      }),
    );

    if (profile && !known.has(profile.id)) {
      known.set(profile.id, { id: profile.id, name: profile.name, color: profile.color });
    }

    return Array.from(known.values());
  }, [myGroups, profile]);

  const activeGroupMembers = useMemo<User[]>(
    () =>
      (activeGroup?.members ?? []).map((member) => ({
        id: member.userId,
        name: member.name,
        color: member.color,
      })),
    [activeGroup],
  );

  const activeMemberIds = activeGroupMembers.map((member) => member.id);
  const [draft, setDraft] = useState(() => blankDraft(getGroupContext(""), [], ""));

  // Las consultas ya vienen filtradas por grupo, no hace falta filtrar de nuevo.
  const contextRents = context.scope === "group" ? dbRents : [];
  const contextExpenses: Expense[] =
    context.scope === "personal" ? personalMovements : dbGroupExpenses;
  const groupExpenses = contextExpenses.filter(isGroupExpense);

  const activeRent =
    contextRents.find((rent) => rent.id === activeRentId) ?? contextRents[0] ?? null;
  const activeMonthKey = activeRent
    ? getMonthKey(activeRent.dueDate)
    : new Date().toISOString().slice(0, 7);

  const { directTransfers, simplifiedSettlements } = useMemo(
    () =>
      context.scope === "group"
        ? calculateSettlements(activeGroupMembers, contextRents, groupExpenses, dbSettlements)
        : { directTransfers: [], simplifiedSettlements: [] },
    [activeGroupMembers, context, contextRents, groupExpenses, dbSettlements],
  );

  // Ya no hay estado "pagada": una deuda saldada directamente desaparece de la
  // lista, porque la transferencia guardada la cancela en el calculo.
  const userPendingBalance = simplifiedSettlements.reduce((total, settlement) => {
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
  const thisMonthKey = new Date().toISOString().slice(0, 7);
  const personalMonthMovements = personalMovements.filter(
    (movement) => getMonthKey(movement.date) === thisMonthKey,
  );
  const personalMonthExpenses = personalMonthMovements
    .filter((movement) => movement.kind === "expense")
    .reduce((total, movement) => total + movement.amountCents, 0);
  const personalMonthIncome = personalMonthMovements
    .filter((movement) => movement.kind === "income")
    .reduce((total, movement) => total + movement.amountCents, 0);
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

  const historyItems: HistoryItem[] = [
    ...contextRents.map((rent) => ({
      id: rent.id,
      scope: "group" as const,
      kind: "expense" as MovementKind,
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
      kind: expense.scope === "personal" ? expense.kind : ("expense" as MovementKind),
      type: expense.type,
      title: expense.description,
      date: expense.date,
      amountCents: expense.amountCents,
      paidBy: expense.scope === "group" ? expense.paidBy : expense.ownerUserId,
      participantIds: expense.scope === "group" ? expense.participantIds : [expense.ownerUserId],
    })),
  ]
    .filter((item) => historyFilter === "all" || item.type === historyFilter)
    .filter((item) => movementFilter === "all" || item.kind === movementFilter)
    .filter((item) => personFilter === "all" || item.participantIds.includes(personFilter))
    .filter((item) => monthFilter === "all" || getMonthKey(item.date) === monthFilter)
    .sort((first, second) => second.date.localeCompare(first.date));

  const visibleMovements = personalMovements.filter(
    (movement) => movementFilter === "all" || movement.kind === movementFilter,
  );

  const availableMonths = Array.from(
    new Set([...contextRents.map((rent) => getMonthKey(rent.dueDate)), ...contextExpenses.map((expense) => getMonthKey(expense.date))]),
  ).sort();
  const draftAmountCents = parseMoneyToCents(draft.amount);
  const draftShareCents =
    draft.participantIds.length > 0 ? Math.round(draftAmountCents / draft.participantIds.length) : 0;

  const switchContext = (nextContext: ExpenseContext) => {
    const nextMembers =
      nextContext.scope === "group"
        ? (myGroups.find((group) => group.id === nextContext.groupId)?.members ?? []).map(
            (member) => member.userId,
          )
        : [currentUserId];

    setContext(nextContext);
    setHistoryFilter("all");
    setMovementFilter("all");
    setPersonFilter("all");
    setMonthFilter("all");
    setEditingExpenseId(null);
    setDraft(blankDraft(nextContext, nextMembers, currentUserId));
    setActiveRentId("");
  };

  const openNewMovement = (
    type: ExpenseType = context.scope === "personal" ? "other" : "grocery",
    kind: MovementKind = "expense",
  ) => {
    setEditingExpenseId(null);
    setDraft({
      ...blankDraft(
        context,
        context.scope === "group" ? activeMemberIds : [currentUserId],
        currentUserId,
      ),
      kind: context.scope === "personal" ? kind : "expense",
      type: context.scope === "personal" ? "other" : type,
      category:
        context.scope === "personal" && kind === "income"
          ? "Sueldo"
          : type === "rent"
            ? "Alquiler"
            : type === "grocery"
              ? "Supermercado"
              : "Otros",
    });
    setShowModal(true);
  };

  const openEditMovement = (expense: Expense) => {
    setEditingExpenseId(expense.id);
    setDraft({
      scope: expense.scope,
      kind: expense.scope === "personal" ? expense.kind : "expense",
      type: expense.type,
      category: expense.category,
      description: expense.description,
      date: expense.date,
      amount: String(expense.amountCents / 100),
      paidBy: expense.scope === "group" ? expense.paidBy : currentUserId,
      participantIds: expense.scope === "group" ? expense.participantIds : [currentUserId],
      rentMonthLabel: "Alquiler",
      dueDate: expense.date,
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
      const fallbackTitle = draft.kind === "income" ? "Ingreso" : "Gasto personal";
      const input = {
        kind: draft.kind,
        category: draft.category.trim() || (draft.kind === "income" ? "Ingreso" : "Otros"),
        description: draft.description.trim() || draft.category.trim() || fallbackTitle,
        date: draft.date,
        amountCents: draftAmountCents,
      };
      const idToEdit = editingExpenseId;

      void (async () => {
        setPersonalError(null);

        try {
          if (idToEdit) {
            await updatePersonalMovement(idToEdit, input);
          } else {
            await createPersonalMovement(input);
          }

          await Promise.all([reloadPersonalMovements(), reloadBalance()]);
          setShowModal(false);
          setEditingExpenseId(null);
        } catch (caughtError) {
          // El modal queda abierto para no perder lo que escribio.
          setPersonalError(
            caughtError instanceof Error ? caughtError.message : "No pudimos guardar el movimiento.",
          );
        }
      })();

      return;
    }

    if (draft.participantIds.length === 0) {
      return;
    }

    const groupId = context.groupId;
    const idToEdit = editingExpenseId;
    const isRent = draft.type === "rent";
    const rentInput = {
      label: draft.rentMonthLabel.trim() || "Nuevo alquiler",
      month: draft.rentMonthLabel.replace("Alquiler", "").trim() || "Nuevo mes",
      totalCents: draftAmountCents,
      dueDate: draft.dueDate,
      paidBy: draft.paidBy,
      participantIds: draft.participantIds,
    };
    const expenseInput = {
      id: idToEdit,
      type: (draft.type === "grocery" ? "grocery" : "other") as "grocery" | "other",
      category: draft.category.trim() || expenseLabels[draft.type],
      description: draft.description.trim() || expenseLabels[draft.type],
      amountCents: draftAmountCents,
      date: draft.date,
      paidBy: draft.paidBy,
      participantIds: draft.participantIds,
    };

    void (async () => {
      setGroupError(null);

      try {
        if (isRent) {
          await createRentMonth(groupId, rentInput);
        } else {
          await saveGroupExpense(groupId, expenseInput);
        }

        await Promise.all([reloadGroupData(), reloadBalance()]);
        setShowModal(false);
        setEditingExpenseId(null);
      } catch (caughtError) {
        // El modal queda abierto para no perder lo que escribio.
        setGroupError(
          caughtError instanceof Error ? caughtError.message : "No pudimos guardar el gasto.",
        );
      }
    })();
  };

  const toggleRentPayment = (rentId: string, memberId: MemberId) => {
    const rent = dbRents.find((entry) => entry.id === rentId);

    if (!rent) {
      return;
    }

    const nextStatus = rent.payments[memberId] === "paid" ? "pending" : "paid";

    void (async () => {
      setGroupError(null);

      try {
        await setRentPayment(rentId, memberId, nextStatus);
        await Promise.all([reloadGroupData(), reloadBalance()]);
      } catch (caughtError) {
        setGroupError(
          caughtError instanceof Error ? caughtError.message : "No pudimos actualizar el pago.",
        );
      }
    })();
  };

  /**
   * Marcar una deuda como saldada guarda la transferencia en la base. Eso hace
   * dos cosas de una: la deuda desaparece de las pendientes, y la plata vuelve
   * al saldo de quien la cobra (y sale del de quien la paga).
   */
  const settleDebt = (settlements: Settlement[]) => {
    if (context.scope !== "group" || settlements.length === 0) {
      return;
    }

    const groupId = context.groupId;

    void (async () => {
      setGroupError(null);

      try {
        for (const settlement of settlements) {
          await recordGroupSettlement(groupId, {
            fromUser: settlement.from,
            toUser: settlement.to,
            amountCents: settlement.amountCents,
          });
        }

        await Promise.all([reloadGroupData(), reloadBalance()]);
      } catch (caughtError) {
        setGroupError(
          caughtError instanceof Error
            ? caughtError.message
            : "No pudimos registrar la transferencia.",
        );
      }
    })();
  };

  const undoSettlement = (settlementId: string) => {
    void (async () => {
      setGroupError(null);

      try {
        await deleteGroupSettlement(settlementId);
        await Promise.all([reloadGroupData(), reloadBalance()]);
      } catch (caughtError) {
        setGroupError(
          caughtError instanceof Error
            ? caughtError.message
            : "No pudimos deshacer la transferencia.",
        );
      }
    })();
  };

  const deleteMovement = (movementId: string) => {
    if (context.scope === "personal") {
      void (async () => {
        setPersonalError(null);

        try {
          await deletePersonalMovement(movementId);
          await Promise.all([reloadPersonalMovements(), reloadBalance()]);
        } catch (caughtError) {
          setPersonalError(
            caughtError instanceof Error ? caughtError.message : "No pudimos borrar el movimiento.",
          );
        }
      })();

      return;
    }

    void (async () => {
      setGroupError(null);

      try {
        await deleteGroupExpense(movementId);
        await Promise.all([reloadGroupData(), reloadBalance()]);
      } catch (caughtError) {
        setGroupError(
          caughtError instanceof Error ? caughtError.message : "No pudimos borrar el gasto.",
        );
      }
    })();
  };

  return (
    <DirectoryContext.Provider value={directory}>
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
              <Wallet size={18} />
              Movimientos
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

      <section className="content" id="movimientos">
        <header className="module-header">
          <div>
            <span className="eyebrow">
              {context.scope === "personal" ? "Mi espacio privado" : activeGroup?.name}
            </span>
            <h1>{context.scope === "personal" ? "Mis movimientos" : "Movimientos del grupo"}</h1>
            <p>
              {context.scope === "personal"
                ? "Cargá lo que entra y lo que sale. Nadie mas ve tus movimientos privados."
                : "Este balance pertenece solo al grupo activo y no mezcla datos de otros grupos."}
            </p>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={() => openNewMovement()}
          >
            <Plus size={18} />
            {context.scope === "personal" ? "Nuevo movimiento" : "Nuevo gasto"}
          </button>
        </header>

        <MoneyHero
          balance={balance}
          error={balanceError}
          onAddIncome={() => {
            if (context.scope !== "personal") {
              switchContext(personalContext);
            }

            openNewMovement("other", "income");
          }}
        />

        <section className="calendar-context-tabs expense-context-tabs" aria-label="Contexto de movimientos">
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
            onClick={() => switchContext(getGroupContext(activeGroup?.id ?? userGroups[0]?.id ?? ""))}
          >
            <UsersRound size={18} />
            Grupo
          </button>
          <label className="group-select">
            Grupo activo
            <select
              disabled={context.scope !== "group"}
              value={context.scope === "group" ? context.groupId : activeGroup?.id ?? userGroups[0]?.id ?? ""}
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

        {groupError && context.scope === "group" ? <p style={errorBoxStyle}>{groupError}</p> : null}

        {context.scope === "personal" ? (
          <PersonalView
            movements={visibleMovements}
            ownerName={profile?.name ?? "vos"}
            loading={personalLoading}
            error={personalError}
            historyItems={historyItems}
            monthFilter={monthFilter}
            movementFilter={movementFilter}
            monthExpenseCents={personalMonthExpenses}
            monthIncomeCents={personalMonthIncome}
            balance={balance}
            onDelete={deleteMovement}
            onEdit={openEditMovement}
            onMonthChange={setMonthFilter}
            onMovementFilterChange={setMovementFilter}
            onNewExpense={() => openNewMovement("other", "expense")}
            onNewIncome={() => openNewMovement("other", "income")}
            availableMonths={availableMonths}
          />
        ) : !groupsLoaded ? (
          <section className="panel">
            <p>Cargando tus grupos...</p>
          </section>
        ) : userGroups.length === 0 ? (
          <section className="panel">
            <p>
              Todavia no sos parte de ningun grupo. Crea uno desde Grupos, en el menu de la
              izquierda, o pedile el link de invitacion a una amiga.
            </p>
          </section>
        ) : groupLoading ? (
          <section className="panel">
            <p>Cargando los gastos del grupo...</p>
          </section>
        ) : (
          <GroupView
            activeRent={activeRent}
            activeGroupMembers={activeGroupMembers}
            activeMonthKey={activeMonthKey}
            availableMonths={availableMonths}
            contextRents={contextRents}
            currentUserId={currentUserId}
            directTransfers={directTransfers}
            groceryExpenses={groceryExpenses}
            groupMonthTotal={groupMonthTotal}
            historyFilter={historyFilter}
            historyItems={historyItems}
            monthFilter={monthFilter}
            otherGroupExpenses={otherGroupExpenses}
            personFilter={personFilter}
            recordedSettlements={dbSettlements}
            settlements={simplifiedSettlements}
            userPaidThisMonth={userPaidThisMonth}
            userPendingBalance={userPendingBalance}
            userShareThisMonth={userShareThisMonth}
            onAdd={openNewMovement}
            onDelete={deleteMovement}
            onEdit={openEditMovement}
            onHistoryFilterChange={(value) => setHistoryFilter(value as FilterType)}
            onMonthFilterChange={setMonthFilter}
            onPersonFilterChange={setPersonFilter}
            onRentChange={setActiveRentId}
            onSettleAll={() => settleDebt(simplifiedSettlements)}
            onSettle={(settlement) => settleDebt([settlement])}
            onUndoSettlement={undoSettlement}
            onRentPaymentToggle={toggleRentPayment}
          />
        )}
      </section>

      {showModal ? (
        <MovementModal
          context={context}
          draft={draft}
          draftAmountCents={draftAmountCents}
          draftShareCents={draftShareCents}
          editingExpenseId={editingExpenseId}
          error={context.scope === "personal" ? personalError : groupError}
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
    </DirectoryContext.Provider>
  );
}

/**
 * La cuenta grande de arriba de todo. Se ve igual en Personal y en Grupo
 * porque la plata es una sola: lo que cargaste como ingreso, menos tus gastos
 * privados, menos lo que adelantaste en cualquier grupo, mas lo que ya te
 * devolvieron.
 */
function MoneyHero({
  balance,
  error,
  onAddIncome,
}: {
  balance: MoneyBalance;
  error: string | null;
  onAddIncome: () => void;
}) {
  const negative = balance.balanceCents < 0;

  return (
    <section className={`money-hero ${negative ? "negative" : ""}`} aria-label="Dinero actual">
      <div className="money-hero-main">
        <span className="eyebrow">Dinero actual</span>
        <strong>{formatMoney(balance.balanceCents)}</strong>
        <p>
          {negative
            ? "Gastaste mas de lo que cargaste como ingreso."
            : "Es la plata que te queda contando lo personal y lo que pusiste en tus grupos."}
        </p>
        <button className="secondary-button" type="button" onClick={onAddIncome}>
          <ArrowDownLeft size={16} />
          Cargar ingreso
        </button>
      </div>

      <div className="money-hero-breakdown">
        <MoneyLine label="Ingresos" amountCents={balance.incomeCents} sign="+" />
        <MoneyLine label="Gastos personales" amountCents={balance.personalExpenseCents} sign="-" />
        <MoneyLine label="Pusiste en grupos" amountCents={balance.groupPaidCents} sign="-" />
        <MoneyLine label="Te transfirieron" amountCents={balance.receivedCents} sign="+" />
        <MoneyLine label="Transferiste" amountCents={balance.sentCents} sign="-" />
      </div>

      {error ? <p style={errorBoxStyle}>{error}</p> : null}
    </section>
  );
}

function MoneyLine({
  label,
  amountCents,
  sign,
}: {
  label: string;
  amountCents: number;
  sign: "+" | "-";
}) {
  return (
    <div className={`money-line ${sign === "+" ? "positive" : "negative"}`}>
      <span>{label}</span>
      <strong>
        {sign}
        {formatMoney(amountCents)}
      </strong>
    </div>
  );
}

function PersonalView({
  movements,
  ownerName,
  loading,
  error,
  monthExpenseCents,
  monthIncomeCents,
  balance,
  historyItems,
  availableMonths,
  monthFilter,
  movementFilter,
  onMonthChange,
  onMovementFilterChange,
  onEdit,
  onDelete,
  onNewExpense,
  onNewIncome,
}: {
  movements: PersonalMovement[];
  ownerName: string;
  loading: boolean;
  error: string | null;
  monthExpenseCents: number;
  monthIncomeCents: number;
  balance: MoneyBalance;
  historyItems: HistoryItem[];
  availableMonths: string[];
  monthFilter: string;
  movementFilter: MovementFilter;
  onMonthChange: (value: string) => void;
  onMovementFilterChange: (value: MovementFilter) => void;
  onEdit: (expense: Expense) => void;
  onDelete: (movementId: string) => void;
  onNewExpense: () => void;
  onNewIncome: () => void;
}) {
  const pendingFromGroups = balance.groupPaidCents - balance.receivedCents;

  return (
    <>
      <section className="summary-grid" aria-label="Resumen personal">
        <SummaryCard
          label="Ingresos del mes"
          value={formatMoney(monthIncomeCents)}
          tone="positive"
          icon={<ArrowDownLeft size={20} />}
        />
        <SummaryCard
          label="Gastos del mes"
          value={formatMoney(monthExpenseCents)}
          icon={<ArrowUpRight size={20} />}
        />
        <SummaryCard
          label="Pusiste en grupos"
          value={formatMoney(balance.groupPaidCents)}
          detail={`Te falta cobrar ${formatMoney(Math.max(pendingFromGroups, 0))}`}
          icon={<UsersRound size={20} />}
        />
        <SummaryCard
          label="Movimientos cargados"
          value={String(movements.length)}
          icon={<ReceiptText size={20} />}
        />
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2>Movimientos de {ownerName}</h2>
          <div className="panel-actions">
            <button className="small-button" type="button" onClick={onNewIncome}>
              <ArrowDownLeft size={16} />
              Ingreso
            </button>
            <button className="small-button" type="button" onClick={onNewExpense}>
              <ArrowUpRight size={16} />
              Gasto
            </button>
          </div>
        </div>

        <div className="filters">
          <FilterSelect
            label="Mostrar"
            value={movementFilter}
            onChange={(value) => onMovementFilterChange(value as MovementFilter)}
            options={[
              ["all", "Todo"],
              ["income", "Solo ingresos"],
              ["expense", "Solo gastos"],
            ]}
          />
        </div>

        {error ? <p style={errorBoxStyle}>{error}</p> : null}

        {loading ? (
          <p>Cargando tus movimientos...</p>
        ) : movements.length === 0 ? (
          <p>
            Todavia no cargaste nada. Empeza por un ingreso (lo que cobraste) y despues anota los
            gastos: el dinero actual de arriba se va actualizando solo.
          </p>
        ) : (
          <div className="expense-grid">
            {movements.map((movement) => (
              <PersonalMovementCard
                movement={movement}
                key={movement.id}
                onDelete={() => onDelete(movement.id)}
                onEdit={() => onEdit(movement)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="panel" id="historial">
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
  kind: MovementKind;
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
  currentUserId,
  directTransfers,
  groceryExpenses,
  groupMonthTotal,
  historyFilter,
  historyItems,
  monthFilter,
  otherGroupExpenses,
  personFilter,
  recordedSettlements,
  settlements,
  userPaidThisMonth,
  userPendingBalance,
  userShareThisMonth,
  onAdd,
  onDelete,
  onEdit,
  onHistoryFilterChange,
  onMonthFilterChange,
  onPersonFilterChange,
  onRentChange,
  onRentPaymentToggle,
  onSettle,
  onSettleAll,
  onUndoSettlement,
}: {
  activeRent: RentMonth | null;
  activeGroupMembers: User[];
  activeMonthKey: string;
  availableMonths: string[];
  contextRents: RentMonth[];
  currentUserId: MemberId;
  directTransfers: { from: string; to: string; amountCents: number }[];
  groceryExpenses: GroupExpense[];
  groupMonthTotal: number;
  historyFilter: FilterType;
  historyItems: HistoryItem[];
  monthFilter: string;
  otherGroupExpenses: GroupExpense[];
  personFilter: string;
  recordedSettlements: GroupSettlement[];
  settlements: Settlement[];
  userPaidThisMonth: number;
  userPendingBalance: number;
  userShareThisMonth: number;
  onAdd: (type?: ExpenseType) => void;
  onDelete: (expenseId: string) => void;
  onEdit: (expense: Expense) => void;
  onHistoryFilterChange: (value: string) => void;
  onMonthFilterChange: (value: string) => void;
  onPersonFilterChange: (value: string) => void;
  onRentChange: (rentId: string) => void;
  onRentPaymentToggle: (rentId: string, memberId: string) => void;
  onSettle: (settlement: Settlement) => void;
  onSettleAll: () => void;
  onUndoSettlement: (settlementId: string) => void;
}) {
  const userName = useUserName();
  const rentPaidCents = activeRent ? getRentPaidCents(activeRent) : 0;
  const rentProgress = activeRent ? Math.round((rentPaidCents / activeRent.totalCents) * 100) : 0;
  const memberBalanceDetails = activeGroupMembers.map((member) => ({
    member,
    balance: settlements.reduce((total, settlement) => {
      if (settlement.to === member.id) {
        return total + settlement.amountCents;
      }

      if (settlement.from === member.id) {
        return total - settlement.amountCents;
      }

      return total;
    }, 0),
    owes: settlements.filter((settlement) => settlement.from === member.id),
    owedBy: settlements.filter((settlement) => settlement.to === member.id),
  }));

  return (
    <>
      <section className="summary-grid" aria-label="Resumen financiero">
        <SummaryCard label="Gastos del grupo" value={formatMoney(groupMonthTotal)} icon={<ReceiptText size={20} />} />
        <SummaryCard label="Vos pagaste" value={formatMoney(userPaidThisMonth)} icon={<Banknote size={20} />} />
        <SummaryCard label="Te corresponde" value={formatMoney(userShareThisMonth)} icon={<UsersRound size={20} />} />
        <SummaryCard
          label="Balance en el grupo"
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
        </div>
        <p className="balance-helper">
          Se calcula con alquileres y gastos grupales cargados acá, menos las transferencias que ya
          se registraron. La lista de Super es solo para organizar compras pendientes hasta que
          alguien cargue el gasto pagado.
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
          <PanelTitle icon={<ReceiptText size={18} />} title="Transferencias pendientes" />
          {settlements.length > 0 ? (
            <button className="secondary-button" type="button" onClick={onSettleAll}>
              <CheckCircle2 size={16} />
              Registrar todas
            </button>
          ) : null}
        </div>
        <p className="balance-helper">
          Acá se compensan las deudas cruzadas para hacer la menor cantidad posible de pagos. Cuando
          marcás una como hecha queda guardada: la deuda desaparece y la plata vuelve al dinero
          actual de quien la cobra.
        </p>
        <div className="settlement-list">
          {settlements.length === 0 ? (
            <EmptyState title="Todo saldado" detail="No quedan transferencias pendientes." />
          ) : (
            settlements.map((settlement) => (
              <SettlementRow
                key={settlement.id}
                settlement={settlement}
                onSettle={() => onSettle(settlement)}
              />
            ))
          )}
        </div>
      </section>

      {recordedSettlements.length > 0 ? (
        <section className="panel">
          <PanelTitle icon={<CheckCircle2 size={18} />} title="Transferencias registradas" />
          <p className="balance-helper">
            Pagos que ya ocurrieron. Si alguno se cargó por error, deshacelo y la deuda vuelve a
            aparecer arriba.
          </p>
          <div className="recorded-settlement-list">
            {recordedSettlements.map((settlement) => (
              <div className="recorded-settlement" key={settlement.id}>
                <Avatar userId={settlement.fromUser} small />
                <span>
                  <strong>
                    {userName(settlement.fromUser)} → {userName(settlement.toUser)}
                  </strong>
                  <small>
                    {formatDate(settlement.settledOn)}
                    {settlement.toUser === currentUserId ? " · lo cobraste vos" : ""}
                    {settlement.fromUser === currentUserId ? " · lo pagaste vos" : ""}
                  </small>
                </span>
                <b>{formatMoney(settlement.amountCents)}</b>
                <button
                  className="icon-button muted"
                  type="button"
                  aria-label="Deshacer transferencia"
                  title="Deshacer"
                  onClick={() => onUndoSettlement(settlement.id)}
                >
                  <Undo2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

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

function MovementModal({
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
  error,
}: {
  context: ExpenseContext;
  draft: ExpenseDraft;
  draftAmountCents: number;
  draftShareCents: number;
  editingExpenseId: string | null;
  error: string | null;
  members: User[];
  onClose: () => void;
  onParticipantToggle: (memberId: string) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onSelectAll: () => void;
  onUpdate: React.Dispatch<React.SetStateAction<ExpenseDraft>>;
}) {
  const userName = useUserName();
  const isPersonal = context.scope === "personal";
  const isIncome = isPersonal && draft.kind === "income";

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="expense-modal" onSubmit={onSave}>
        <div className="modal-heading">
          <div>
            <span className="eyebrow">{isPersonal ? "Privado" : "Compartido"}</span>
            <h2>
              {editingExpenseId ? "Editar " : "Nuevo "}
              {isPersonal ? "movimiento" : "gasto"}
            </h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {isPersonal ? (
          // El mismo formulario sirve para las dos cosas: lo unico que cambia
          // es si el monto suma o resta. Por eso es un par de botones y no dos
          // pantallas distintas.
          <div className="type-picker kind-picker">
            <button
              className={draft.kind === "expense" ? "active expense" : ""}
              type="button"
              onClick={() => onUpdate((current) => ({ ...current, kind: "expense" }))}
            >
              <ArrowUpRight size={16} />
              Gasto
            </button>
            <button
              className={draft.kind === "income" ? "active income" : ""}
              type="button"
              onClick={() => onUpdate((current) => ({ ...current, kind: "income" }))}
            >
              <ArrowDownLeft size={16} />
              Ingreso
            </button>
          </div>
        ) : (
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
        )}

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
                  placeholder={
                    isIncome
                      ? "Sueldo de la semana"
                      : isPersonal
                        ? "Almuerzo sola"
                        : "Supermercado Safeway"
                  }
                />
              </label>
              <label>
                Categoria
                <input
                  value={draft.category}
                  onChange={(event) =>
                    onUpdate((current) => ({ ...current, category: event.target.value }))
                  }
                  placeholder={
                    isIncome
                      ? "Sueldo, propinas, devolucion..."
                      : isPersonal
                        ? "Ropa, comida, ski..."
                        : "Uber, ski, cafe..."
                  }
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
          {isPersonal ? (
            <>
              <strong className={isIncome ? "amount-income" : "amount-expense"}>
                {isIncome ? "+" : "-"}
                {formatMoney(draftAmountCents)}
              </strong>
              <p>
                {isIncome
                  ? "Suma a tu dinero actual. Nadie mas lo ve."
                  : "Se descuenta de tu dinero actual. Nadie mas lo ve."}
              </p>
            </>
          ) : (
            <>
              <strong>
                {formatMoney(draftAmountCents)} / {draft.participantIds.length || 0} personas ={" "}
                {formatMoney(draftShareCents)}
              </strong>
              <p>
                Le pagan a {userName(draft.paidBy)} dentro del grupo activo. A quien lo adelanto se
                le descuenta el total de su dinero actual hasta que le transfieran.
              </p>
            </>
          )}
        </div>

        {error ? <p style={errorBoxStyle}>{error}</p> : null}

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
  onSettle,
}: {
  settlement: Settlement;
  onSettle: () => void;
}) {
  const userName = useUserName();

  return (
    <button className="settlement-row pending" type="button" onClick={onSettle}>
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
      <span className="settlement-action">Ya se transfirió</span>
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
  const userName = useUserName();
  const directory = useDirectory();
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
        {directory.map((user) => (
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

function PersonalMovementCard({
  movement,
  onEdit,
  onDelete,
}: {
  movement: PersonalMovement;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isIncome = movement.kind === "income";

  return (
    <article className={`expense-card movement-card ${isIncome ? "income" : "expense"}`}>
      <div className="expense-card-head">
        <div>
          <span className="category-pill">{movement.category}</span>
          <h3>{movement.description}</h3>
          <small>
            {formatDate(movement.date)} · {isIncome ? "ingreso" : "gasto"} privado
          </small>
        </div>
        <strong className={isIncome ? "amount-income" : "amount-expense"}>
          {isIncome ? "+" : "-"}
          {formatMoney(movement.amountCents)}
        </strong>
      </div>
      <div className="card-footer">
        <span>
          {isIncome ? "Suma a tu dinero actual" : "Se descuenta de tu dinero actual"}
        </span>
        <CardActions onDelete={onDelete} onEdit={onEdit} />
      </div>
    </article>
  );
}

function CardActions({ onDelete, onEdit }: { onDelete: () => void; onEdit: () => void }) {
  return (
    <div>
      <button className="icon-button muted" type="button" onClick={onEdit} aria-label="Editar movimiento">
        <Edit3 size={16} />
      </button>
      <button className="icon-button muted danger" type="button" onClick={onDelete} aria-label="Eliminar movimiento">
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
            <StatusIcon kind={item.kind} type={item.type} />
            <span>
              <strong>{item.title}</strong>
              <small>
                {item.scope === "personal"
                  ? item.kind === "income"
                    ? "Ingreso"
                    : "Gasto personal"
                  : expenseLabels[item.type]}{" "}
                · {formatDate(item.date)}
              </small>
            </span>
          </div>
          <b className={item.kind === "income" ? "amount-income" : undefined}>
            {item.kind === "income" ? "+" : ""}
            {formatMoney(item.amountCents)}
          </b>
        </div>
      ))}
    </div>
  );
}

function StatusIcon({ kind, type }: { kind: MovementKind; type: ExpenseType }) {
  if (kind === "income") {
    return <ArrowDownLeft size={18} />;
  }

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
