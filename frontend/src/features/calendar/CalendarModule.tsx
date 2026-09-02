import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import {
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Edit3,
  Home,
  ListChecks,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  ShoppingBasket,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { listMyGroups } from "../groups/groupsApi";
import type { MyGroup } from "../groups/types";
import {
  addDays,
  canGroupUseMembers,
  compareOccurrences,
  expandOccurrences,
  getContextEvents,
  getGroupUpcomingSummary,
  getPersonalTodaySummary,
  monthDays,
} from "./calendarLogic";
import {
  createPersonalCalendarEvent,
  deletePersonalCalendarEvent,
  listPersonalCalendarEvents,
  setPersonalCalendarEventStatus,
  updatePersonalCalendarEvent,
  type PersonalCalendarEventInput,
} from "./personalCalendarApi";
import {
  deleteGroupCalendarEvent,
  listGroupCalendarEvents,
  saveGroupCalendarEvent,
  setGroupCalendarEventStatus,
  type GroupCalendarEventInput,
} from "./groupCalendarApi";
import type {
  CalendarDraft,
  CalendarEvent,
  CalendarEventPriority,
  CalendarEventStatus,
  CalendarEventKind,
  CalendarOccurrence,
  RecurrenceFrequency,
} from "./types";
import type { ExpenseContext, User, UserId } from "../expenses/types";

type CalendarView = "month" | "week" | "day" | "list";

type ShellControls = {
  sidebarCollapsed: boolean;
  onSidebarToggle: () => void;
};

const weekHours = Array.from({ length: 18 }, (_, index) => index + 6);
const hourHeight = 68;

const errorBoxStyle: CSSProperties = {
  margin: 0,
  padding: "10px 12px",
  borderRadius: 10,
  color: "#9a2b3f",
  background: "#fde3e7",
  fontSize: 13,
};

const statusLabels: Record<CalendarEventStatus, string> = {
  pending: "Pendiente",
  completed: "Completada",
  skipped: "Omitida",
  rescheduled: "Reprogramada",
};

const priorityLabels: Record<CalendarEventPriority, string> = {
  normal: "Normal",
  important: "Importante",
  urgent: "Urgente",
};

const recurrenceLabels: Record<RecurrenceFrequency, string> = {
  none: "No repetir",
  daily: "Diariamente",
  weekly: "Semanalmente",
  weekdays: "Días elegidos",
  monthly: "Mensualmente",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function getGroupContext(groupId: string): ExpenseContext {
  return { scope: "group", groupId };
}

function blankDraft(context: ExpenseContext, memberIds: UserId[], currentUserId: UserId): CalendarDraft {
  return {
    scope: context.scope,
    kind: "responsibility",
    title: "",
    description: "",
    category: context.scope === "personal" ? "Recordatorio" : "Casa",
    date: todayIso(),
    startTime: "18:00",
    endTime: "19:00",
    allDay: false,
    recurrenceFrequency: "none",
    priority: "normal",
    notes: "",
    responsibleIds: context.scope === "group" ? [memberIds[0] ?? currentUserId] : [currentUserId],
    participantIds: context.scope === "group" ? memberIds : [currentUserId],
  };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatLongDate(value: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(value));
}

function directoryUser(directory: User[], userId: UserId): User {
  return directory.find((user) => user.id === userId) ?? { id: userId, name: "Alguien", color: "#d36a97" };
}

function Avatar({ userId, directory, small = false }: { userId: UserId; directory: User[]; small?: boolean }) {
  const user = directoryUser(directory, userId);

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

export function CalendarModule({ sidebarCollapsed, onSidebarToggle }: ShellControls) {
  const { profile, user } = useAuth();
  const currentUserId = user?.id ?? "";

  const [context, setContext] = useState<ExpenseContext>({ scope: "personal", ownerUserId: "" });
  const [view, setView] = useState<CalendarView>("week");
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [showModal, setShowModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  // Nada de esto sale de un archivo mock: grupos, integrantes y acontecimientos
  // vienen de Supabase, y las policies se encargan de que cada una vea lo suyo.
  const [personalEvents, setPersonalEvents] = useState<CalendarEvent[]>([]);
  const [personalLoading, setPersonalLoading] = useState(true);
  const [personalError, setPersonalError] = useState<string | null>(null);

  const reloadPersonalEvents = useCallback(async () => {
    setPersonalError(null);

    try {
      setPersonalEvents(await listPersonalCalendarEvents());
    } catch (caughtError) {
      setPersonalError(
        caughtError instanceof Error ? caughtError.message : "No pudimos cargar tu calendario personal.",
      );
    } finally {
      setPersonalLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadPersonalEvents();
  }, [reloadPersonalEvents]);

  const [myGroups, setMyGroups] = useState<MyGroup[]>([]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);

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
      setGroupsError(caughtError instanceof Error ? caughtError.message : "No pudimos cargar tus grupos.");
    } finally {
      setGroupsLoaded(true);
    }
  }, [currentUserId]);

  useEffect(() => {
    void reloadGroups();
  }, [reloadGroups]);

  // Se pide el calendario de TODOS los grupos donde participas de una, no
  // solo del grupo activo: asi "Mi calendario" puede mezclar planes y
  // responsabilidades de cualquier grupo, como hacia el mock.
  const groupIdsKey = useMemo(() => myGroups.map((group) => group.id).sort().join(","), [myGroups]);

  const [groupEvents, setGroupEvents] = useState<CalendarEvent[]>([]);
  const [groupEventsLoading, setGroupEventsLoading] = useState(true);
  const [groupEventsError, setGroupEventsError] = useState<string | null>(null);

  const reloadGroupEvents = useCallback(async () => {
    const groupIds = groupIdsKey ? groupIdsKey.split(",") : [];

    if (groupIds.length === 0) {
      setGroupEvents([]);
      setGroupEventsLoading(false);
      return;
    }

    setGroupEventsError(null);

    try {
      setGroupEvents(await listGroupCalendarEvents(groupIds));
    } catch (caughtError) {
      setGroupEventsError(
        caughtError instanceof Error ? caughtError.message : "No pudimos cargar el calendario del grupo.",
      );
    } finally {
      setGroupEventsLoading(false);
    }
  }, [groupIdsKey]);

  useEffect(() => {
    void reloadGroupEvents();
  }, [reloadGroupEvents]);

  const activeGroup = context.scope === "group" ? myGroups.find((group) => group.id === context.groupId) : undefined;
  const activeGroupMembers = useMemo<User[]>(
    () => (activeGroup?.members ?? []).map((member) => ({ id: member.userId, name: member.name, color: member.color })),
    [activeGroup],
  );
  const activeMemberIds = activeGroupMembers.map((member) => member.id);

  // Todas las personas que pueden aparecer en pantalla (de cualquier grupo),
  // para resolver nombres y colores sin pasar la lista por props.
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

  const groupNames = useMemo(
    () => Object.fromEntries(myGroups.map((group) => [group.id, group.name])),
    [myGroups],
  );

  const [draft, setDraft] = useState(() => blankDraft(context, activeMemberIds, currentUserId));

  const combinedEvents = useMemo(() => [...personalEvents, ...groupEvents], [personalEvents, groupEvents]);
  const contextEvents = useMemo(
    () => getContextEvents(combinedEvents, context, currentUserId),
    [combinedEvents, context, currentUserId],
  );
  const today = todayIso();
  const rangeStart = view === "month" ? `${selectedDate.slice(0, 7)}-01` : selectedDate;
  const rangeEnd =
    view === "month"
      ? monthDays(selectedDate.slice(0, 7)).at(-1) ?? selectedDate
      : view === "week"
        ? addDays(selectedDate, 6)
        : view === "day"
          ? selectedDate
          : addDays(selectedDate, 14);
  const occurrences = useMemo(
    () => expandOccurrences(contextEvents, rangeStart, rangeEnd).sort(compareOccurrences),
    [contextEvents, rangeEnd, rangeStart],
  );
  const selectedDayOccurrences = occurrences.filter((occurrence) => occurrence.date === selectedDate);
  const personalToday = getPersonalTodaySummary(combinedEvents, currentUserId, today);
  const groupUpcoming =
    context.scope === "group" ? getGroupUpcomingSummary(combinedEvents, context.groupId, today, 7) : [];
  const groupToday = groupUpcoming.filter((occurrence) => occurrence.date === today);
  const activeToday = context.scope === "personal" ? personalToday : groupToday;
  const activeUpcoming = context.scope === "personal" ? personalToday : groupUpcoming;
  const pendingToday = activeToday.filter((occurrence) => occurrence.event.status === "pending").length;

  const switchContext = (nextContext: ExpenseContext) => {
    const memberIds =
      nextContext.scope === "group"
        ? (myGroups.find((group) => group.id === nextContext.groupId)?.members ?? []).map((member) => member.userId)
        : [currentUserId];

    setContext(nextContext);
    setDraft(blankDraft(nextContext, memberIds, currentUserId));
    setEditingEventId(null);
  };

  const openNewActivity = () => {
    setEditingEventId(null);
    setDraft(blankDraft(context, context.scope === "group" ? activeMemberIds : [currentUserId], currentUserId));
    setShowModal(true);
  };

  const openEditActivity = (event: CalendarEvent) => {
    setEditingEventId(event.id);
    setDraft({
      scope: event.scope,
      kind: event.scope === "group" ? event.kind : "responsibility",
      title: event.title,
      description: event.description ?? "",
      category: event.category,
      date: event.date,
      startTime: event.startTime ?? "09:00",
      endTime: event.endTime ?? "10:00",
      allDay: event.allDay,
      recurrenceFrequency: event.recurrence.frequency,
      priority: event.priority,
      notes: event.notes ?? "",
      responsibleIds: event.scope === "group" ? event.responsibleIds : [currentUserId],
      participantIds: event.scope === "group" ? event.participantIds : [currentUserId],
    });
    setShowModal(true);
  };

  const saveDraft = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();

    if (!draft.title.trim()) {
      return;
    }

    if (context.scope === "personal") {
      const input: PersonalCalendarEventInput = {
        title: draft.title.trim(),
        description: draft.description.trim(),
        category: draft.category.trim() || "Otro",
        date: draft.date,
        startTime: draft.allDay ? null : draft.startTime,
        endTime: draft.allDay ? null : draft.endTime,
        allDay: draft.allDay,
        recurrenceFrequency: draft.recurrenceFrequency,
        priority: draft.priority,
        notes: draft.notes.trim(),
      };
      const idToEdit = editingEventId;

      void (async () => {
        setPersonalError(null);

        try {
          if (idToEdit) {
            await updatePersonalCalendarEvent(idToEdit, input);
          } else {
            await createPersonalCalendarEvent(input);
          }

          await reloadPersonalEvents();
          setShowModal(false);
          setEditingEventId(null);
        } catch (caughtError) {
          // El modal queda abierto para no perder lo que escribio.
          setPersonalError(
            caughtError instanceof Error ? caughtError.message : "No pudimos guardar el acontecimiento.",
          );
        }
      })();

      return;
    }

    if (!canGroupUseMembers(activeGroupMembers, [...draft.responsibleIds, ...draft.participantIds])) {
      return;
    }

    if (draft.responsibleIds.length === 0 || draft.participantIds.length === 0) {
      return;
    }

    const groupId = context.groupId;
    const input: GroupCalendarEventInput = {
      id: editingEventId,
      kind: draft.kind,
      title: draft.title.trim(),
      description: draft.description.trim(),
      category: draft.category.trim() || "Otro",
      date: draft.date,
      startTime: draft.allDay ? null : draft.startTime,
      endTime: draft.allDay ? null : draft.endTime,
      allDay: draft.allDay,
      recurrenceFrequency: draft.recurrenceFrequency,
      priority: draft.priority,
      notes: draft.notes.trim(),
      responsibleIds: draft.responsibleIds,
      participantIds: draft.participantIds,
      rotationUserIds:
        draft.recurrenceFrequency !== "none" && draft.kind === "responsibility" ? draft.responsibleIds : null,
    };

    void (async () => {
      setGroupEventsError(null);

      try {
        await saveGroupCalendarEvent(groupId, input);
        await reloadGroupEvents();
        setShowModal(false);
        setEditingEventId(null);
      } catch (caughtError) {
        // El modal queda abierto para no perder lo que escribio.
        setGroupEventsError(
          caughtError instanceof Error ? caughtError.message : "No pudimos guardar el acontecimiento.",
        );
      }
    })();
  };

  const deleteActivity = (eventId: string) => {
    const target = combinedEvents.find((event) => event.id === eventId);

    if (!target) {
      return;
    }

    if (target.scope === "personal") {
      void (async () => {
        setPersonalError(null);

        try {
          await deletePersonalCalendarEvent(eventId);
          await reloadPersonalEvents();
        } catch (caughtError) {
          setPersonalError(
            caughtError instanceof Error ? caughtError.message : "No pudimos borrar el acontecimiento.",
          );
        }
      })();

      return;
    }

    void (async () => {
      setGroupEventsError(null);

      try {
        await deleteGroupCalendarEvent(eventId);
        await reloadGroupEvents();
      } catch (caughtError) {
        setGroupEventsError(
          caughtError instanceof Error ? caughtError.message : "No pudimos borrar el acontecimiento.",
        );
      }
    })();
  };

  const markCompleted = (eventId: string) => {
    const target = combinedEvents.find((event) => event.id === eventId);

    if (!target) {
      return;
    }

    const nextStatus: CalendarEventStatus = target.status === "completed" ? "pending" : "completed";

    if (target.scope === "personal") {
      void (async () => {
        setPersonalError(null);

        try {
          await setPersonalCalendarEventStatus(eventId, nextStatus);
          await reloadPersonalEvents();
        } catch (caughtError) {
          setPersonalError(
            caughtError instanceof Error ? caughtError.message : "No pudimos actualizar el estado.",
          );
        }
      })();

      return;
    }

    void (async () => {
      setGroupEventsError(null);

      try {
        await setGroupCalendarEventStatus(eventId, nextStatus);
        await reloadGroupEvents();
      } catch (caughtError) {
        setGroupEventsError(
          caughtError instanceof Error ? caughtError.message : "No pudimos actualizar el estado.",
        );
      }
    })();
  };

  const toggleMember = (field: "responsibleIds" | "participantIds", userId: UserId) => {
    setDraft((current) => ({
      ...current,
      [field]: current[field].includes(userId)
        ? current[field].filter((selectedId) => selectedId !== userId)
        : [...current[field], userId],
    }));
  };

  const modalError = context.scope === "personal" ? personalError : groupEventsError;
  const bannerError = context.scope === "personal" ? personalError : groupsError ?? groupEventsError;

  return (
    <main className={`app-shell calendar-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            {context.scope === "personal" ? <UserRound size={20} /> : <Home size={20} />}
          </div>
          <div>
            <strong>ChipaWAT</strong>
            <span>{context.scope === "personal" ? "Mi espacio" : activeGroup?.name ?? "Sin grupo"}</span>
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
          <a className="nav-item" href="#gastos">
            <CircleDollarSign size={18} />
            Gastos
          </a>
          <a className="nav-item active" href="#calendario">
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

      <section className="content" id="calendario">
        <header className="module-header">
          <div>
            <span className="eyebrow">
              {context.scope === "personal" ? "Mi calendario" : activeGroup?.name ?? "Grupo activo"}
            </span>
            <h1>{context.scope === "personal" ? "Calendario personal" : "Calendario grupal"}</h1>
            <p>
              {context.scope === "personal"
                ? "Combina tus actividades privadas con planes y tareas grupales donde participas."
                : "Actividades, planes y responsabilidades aisladas para el grupo activo."}
            </p>
          </div>
          <button className="primary-button" type="button" onClick={openNewActivity}>
            <Plus size={18} />
            Agregar acontecimiento
          </button>
        </header>

        <section className="calendar-context-tabs expense-context-tabs" aria-label="Calendarios">
          <button
            className={context.scope === "personal" ? "active" : ""}
            type="button"
            onClick={() => switchContext({ scope: "personal", ownerUserId: currentUserId })}
          >
            <UserRound size={18} />
            Personal
          </button>
          <button
            className={context.scope === "group" ? "active" : ""}
            type="button"
            onClick={() => switchContext(getGroupContext(activeGroup?.id ?? myGroups[0]?.id ?? ""))}
          >
            <UsersRound size={18} />
            Grupo
          </button>
          <label className="group-select">
            Grupo activo
            <select
              disabled={context.scope !== "group" || myGroups.length === 0}
              value={context.scope === "group" ? context.groupId : activeGroup?.id ?? myGroups[0]?.id ?? ""}
              onChange={(event) => switchContext(getGroupContext(event.target.value))}
            >
              {myGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
        </section>

        {bannerError ? <p style={errorBoxStyle}>{bannerError}</p> : null}

        <section className="summary-grid" aria-label="Resumen de calendario">
          <SummaryCard
            label="Hoy"
            value={String(activeToday.length)}
            detail={context.scope === "personal" ? "en tu calendario" : `en ${activeGroup?.name ?? "el grupo"}`}
            icon={<Clock3 size={20} />}
          />
          <SummaryCard
            label="Pendientes hoy"
            value={String(pendingToday)}
            detail={context.scope === "personal" ? "personales y asignadas" : "del grupo activo"}
            icon={<ListChecks size={20} />}
          />
          <SummaryCard
            label={context.scope === "group" ? "Próximas del grupo" : "Privadas"}
            value={String(
              context.scope === "group"
                ? groupUpcoming.length
                : contextEvents.filter((event) => event.scope === "personal").length,
            )}
            icon={<CalendarDays size={20} />}
          />
          <SummaryCard label="Vista actual" value={view} detail={formatLongDate(selectedDate)} icon={<Search size={20} />} />
        </section>

        <section className="panel calendar-dashboard calendar-dashboard-single">
          <PanelTitle
            icon={context.scope === "personal" ? <UserRound size={18} /> : <UsersRound size={18} />}
            title={context.scope === "personal" ? "Mi día" : `Hoy en ${activeGroup?.name ?? "el grupo"}`}
          />
          <OccurrenceList
            directory={directory}
            emptyText={
              context.scope === "personal"
                ? "No tenés actividades pendientes en tu calendario personal."
                : "No hay acontecimientos del grupo para hoy."
            }
            groupNames={groupNames}
            occurrences={context.scope === "personal" ? activeUpcoming : activeToday}
            onComplete={markCompleted}
            onDelete={deleteActivity}
            onEdit={openEditActivity}
          />
        </section>

        <section className="panel">
          <div className="calendar-toolbar">
            <div className="view-tabs" aria-label="Vista del calendario">
              {(["month", "week", "day", "list"] as CalendarView[]).map((nextView) => (
                <button
                  className={view === nextView ? "active" : ""}
                  key={nextView}
                  type="button"
                  onClick={() => setView(nextView)}
                >
                  {nextView}
                </button>
              ))}
            </div>
            <label>
              Fecha
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
              />
            </label>
          </div>

          {context.scope === "group" && !groupsLoaded ? (
            <p>Cargando tus grupos...</p>
          ) : context.scope === "group" && myGroups.length === 0 ? (
            <p>
              Todavia no sos parte de ningun grupo. Crea uno desde Grupos, en el menu de la izquierda, o pedile el
              link de invitacion a una amiga.
            </p>
          ) : (context.scope === "group" && groupEventsLoading) || (context.scope === "personal" && personalLoading) ? (
            <p>Cargando tu calendario...</p>
          ) : view === "month" ? (
            <MonthView monthKey={selectedDate.slice(0, 7)} occurrences={occurrences} onSelectDate={setSelectedDate} />
          ) : view === "week" ? (
            <WeekScheduleView
              directory={directory}
              groupNames={groupNames}
              occurrences={occurrences}
              onComplete={markCompleted}
              onDelete={deleteActivity}
              onEdit={openEditActivity}
              onSelectDate={setSelectedDate}
              startDate={selectedDate}
              today={today}
            />
          ) : view === "day" ? (
            <OccurrenceList
              directory={directory}
              emptyText="No hay actividades para este dia."
              groupNames={groupNames}
              occurrences={selectedDayOccurrences}
              onComplete={markCompleted}
              onDelete={deleteActivity}
              onEdit={openEditActivity}
            />
          ) : (
            <OccurrenceList
              directory={directory}
              emptyText="No hay actividades en el rango elegido."
              groupNames={groupNames}
              occurrences={occurrences}
              onComplete={markCompleted}
              onDelete={deleteActivity}
              onEdit={openEditActivity}
            />
          )}
        </section>
      </section>

      {showModal ? (
        <ActivityModal
          context={context}
          draft={draft}
          editingEventId={editingEventId}
          error={modalError}
          members={activeGroupMembers}
          onClose={() => setShowModal(false)}
          onSave={saveDraft}
          onSelectAll={(field) =>
            setDraft((current) => ({
              ...current,
              [field]: current[field].length === activeMemberIds.length ? [] : activeMemberIds,
            }))
          }
          onToggleMember={toggleMember}
          onUpdate={setDraft}
        />
      ) : null}

      <button className="calendar-fab" type="button" onClick={openNewActivity}>
        <Plus size={18} />
        Acontecimiento
      </button>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="summary-card">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
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

function MonthView({
  monthKey,
  occurrences,
  onSelectDate,
}: {
  monthKey: string;
  occurrences: CalendarOccurrence[];
  onSelectDate: (date: string) => void;
}) {
  return (
    <div className="month-grid">
      {monthDays(monthKey).map((date) => {
        const dayOccurrences = occurrences.filter((occurrence) => occurrence.date === date);

        return (
          <button className="month-day" key={date} type="button" onClick={() => onSelectDate(date)}>
            <strong>{date.slice(-2)}</strong>
            {dayOccurrences.slice(0, 3).map((occurrence) => (
              <span key={occurrence.id}>{occurrence.event.title}</span>
            ))}
            {dayOccurrences.length > 3 ? <small>+{dayOccurrences.length - 3}</small> : null}
          </button>
        );
      })}
    </div>
  );
}

function WeekScheduleView({
  startDate,
  today,
  occurrences,
  directory,
  groupNames,
  onSelectDate,
  onComplete,
  onDelete,
  onEdit,
}: {
  startDate: string;
  today: string;
  occurrences: CalendarOccurrence[];
  directory: User[];
  groupNames: Record<string, string>;
  onSelectDate: (date: string) => void;
  onComplete: (eventId: string) => void;
  onDelete: (eventId: string) => void;
  onEdit: (event: CalendarEvent) => void;
}) {
  const weekDates = Array.from({ length: 7 }, (_, index) => addDays(startDate, index));

  return (
    <div className="week-calendar" style={{ "--hour-height": `${hourHeight}px` } as CSSProperties}>
      <div className="week-calendar-header">
        <span />
        {weekDates.map((date) => (
          <button
            className={date === today ? "today" : ""}
            key={date}
            type="button"
            onClick={() => onSelectDate(date)}
          >
            <small>{weekdayName(date)}</small>
            <strong>{date.slice(-2)}</strong>
          </button>
        ))}
      </div>

      <div className="all-day-row">
        <span>Todo el día</span>
        {weekDates.map((date) => (
          <div className="all-day-cell" key={date}>
            {occurrences
              .filter((occurrence) => occurrence.date === date && occurrence.event.allDay)
              .map((occurrence) => (
                <button
                  className={`calendar-pill ${occurrence.event.scope}`}
                  key={occurrence.id}
                  type="button"
                  onClick={() => onEdit(occurrence.event)}
                  title={occurrence.event.title}
                >
                  {occurrence.event.title}
                </button>
              ))}
          </div>
        ))}
      </div>

      <div className="week-calendar-body">
        <div className="time-axis">
          {weekHours.map((hour) => (
            <span key={hour}>{String(hour).padStart(2, "0")}:00</span>
          ))}
        </div>
        <div className="week-columns">
          {weekDates.map((date) => {
            const timedOccurrences = occurrences.filter(
              (occurrence) => occurrence.date === date && !occurrence.event.allDay,
            );

            return (
              <div className="week-column" key={date}>
                {weekHours.map((hour) => (
                  <span className="hour-line" key={hour} />
                ))}
                {timedOccurrences.map((occurrence) => (
                  <CalendarBlock
                    key={occurrence.id}
                    directory={directory}
                    groupNames={groupNames}
                    occurrence={occurrence}
                    onComplete={() => onComplete(occurrence.sourceEventId)}
                    onDelete={() => onDelete(occurrence.sourceEventId)}
                    onEdit={() => onEdit(occurrence.event)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CalendarBlock({
  occurrence,
  directory,
  groupNames,
  onComplete,
  onDelete,
  onEdit,
}: {
  occurrence: CalendarOccurrence;
  directory: User[];
  groupNames: Record<string, string>;
  onComplete: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const top = getEventTop(occurrence.event.startTime);
  const height = getEventHeight(occurrence.event.startTime, occurrence.event.endTime);
  const origin = occurrence.event.scope === "group" ? groupNames[occurrence.event.groupId] ?? "" : "";
  const timeLabel = `${occurrence.event.startTime} - ${occurrence.event.endTime}${origin ? ` · ${origin}` : ""}`;

  return (
    <article
      className={`calendar-event-block ${occurrence.event.scope} ${occurrence.event.priority}`}
      style={{ top, height } as CSSProperties}
    >
      <button type="button" onClick={onEdit} title={`${occurrence.event.title} · ${timeLabel}`}>
        <strong>{occurrence.event.title}</strong>
        <span>{timeLabel}</span>
      </button>
      <div>
        {occurrence.responsibleIds.slice(0, 2).map((userId) => (
          <Avatar key={userId} directory={directory} userId={userId} small />
        ))}
        <button type="button" onClick={onComplete} aria-label="Completar acontecimiento">
          <CheckCircle2 size={14} />
        </button>
        <button type="button" onClick={onDelete} aria-label="Eliminar acontecimiento">
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  );
}

function getEventTop(startTime?: string): number {
  const minutes = minutesFromTime(startTime ?? "06:00");
  return Math.max(0, ((minutes - weekHours[0] * 60) / 60) * hourHeight);
}

function getEventHeight(startTime?: string, endTime?: string): number {
  const startMinutes = minutesFromTime(startTime ?? "06:00");
  const endMinutes = minutesFromTime(endTime ?? startTime ?? "07:00");
  return Math.max(56, ((endMinutes - startMinutes) / 60) * hourHeight);
}

function minutesFromTime(time: string): number {
  const [hour, minutes] = time.split(":").map(Number);
  return hour * 60 + minutes;
}

function weekdayName(date: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    timeZone: "UTC",
  })
    .format(new Date(date))
    .replace(".", "");
}

function OccurrenceList({
  directory,
  emptyText,
  groupNames,
  occurrences,
  onComplete,
  onDelete,
  onEdit,
}: {
  directory: User[];
  emptyText: string;
  groupNames: Record<string, string>;
  occurrences: CalendarOccurrence[];
  onComplete: (eventId: string) => void;
  onDelete: (eventId: string) => void;
  onEdit: (event: CalendarEvent) => void;
}) {
  if (occurrences.length === 0) {
    return (
      <div className="empty-state">
        <CheckCircle2 size={22} />
        <strong>Todo tranquilo</strong>
        <span>{emptyText}</span>
      </div>
    );
  }

  return (
    <div className="activity-list">
      {occurrences.map((occurrence) => {
        const origin = occurrence.event.scope === "group" ? groupNames[occurrence.event.groupId] ?? "" : "";

        return (
          <article className={`activity-card ${occurrence.event.status}`} key={occurrence.id}>
            <div>
              <div className="activity-title">
                <span className={`category-pill ${occurrence.event.scope}`}>{occurrence.event.category}</span>
                {occurrence.event.scope === "group" ? (
                  <span className={`kind-badge ${occurrence.event.kind}`}>
                    {occurrence.event.kind === "plan" ? "Plan" : "Responsabilidad"}
                  </span>
                ) : null}
                <span className={`priority-badge ${occurrence.event.priority}`}>
                  {priorityLabels[occurrence.event.priority]}
                </span>
              </div>
              <h3>{occurrence.event.title}</h3>
              <small>
                {formatDate(occurrence.date)} ·{" "}
                {occurrence.event.allDay
                  ? "Durante el dia"
                  : `${occurrence.event.startTime} a ${occurrence.event.endTime}`}
                {origin ? ` · ${origin}` : ""}
              </small>
            </div>
            <div className="activity-people">
              {occurrence.responsibleIds.map((userId) => (
                <Avatar key={userId} directory={directory} userId={userId} small />
              ))}
            </div>
            <div className="card-footer">
              <span>{statusLabels[occurrence.event.status]}</span>
              <div>
                <button
                  className="icon-button muted"
                  type="button"
                  onClick={() => onComplete(occurrence.sourceEventId)}
                  aria-label="Completar actividad"
                >
                  <CheckCircle2 size={16} />
                </button>
                <button
                  className="icon-button muted"
                  type="button"
                  onClick={() => onEdit(occurrence.event)}
                  aria-label="Editar actividad"
                >
                  <Edit3 size={16} />
                </button>
                <button
                  className="icon-button muted danger"
                  type="button"
                  onClick={() => onDelete(occurrence.sourceEventId)}
                  aria-label="Eliminar actividad"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ActivityModal({
  context,
  draft,
  editingEventId,
  error,
  members,
  onClose,
  onSave,
  onSelectAll,
  onToggleMember,
  onUpdate,
}: {
  context: ExpenseContext;
  draft: CalendarDraft;
  editingEventId: string | null;
  error: string | null;
  members: User[];
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onSelectAll: (field: "responsibleIds" | "participantIds") => void;
  onToggleMember: (field: "responsibleIds" | "participantIds", userId: UserId) => void;
  onUpdate: React.Dispatch<React.SetStateAction<CalendarDraft>>;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <form className="expense-modal activity-modal" onSubmit={onSave}>
        <div className="modal-heading">
          <div>
            <span className="eyebrow">{context.scope === "personal" ? "Mi espacio" : "Grupo activo"}</span>
            <h2>{editingEventId ? "Editar acontecimiento" : "Nuevo acontecimiento"}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {context.scope === "group" ? (
          <div className="type-picker">
            {(["responsibility", "plan"] as CalendarEventKind[]).map((kind) => (
              <button
                className={draft.kind === kind ? "active" : ""}
                key={kind}
                type="button"
                onClick={() => onUpdate((current) => ({ ...current, kind }))}
              >
                {kind === "plan" ? "Plan / acontecimiento" : "Responsabilidad"}
              </button>
            ))}
          </div>
        ) : null}

        <div className="form-grid">
          <label>
            Titulo
            <input
              value={draft.title}
              onChange={(event) => onUpdate((current) => ({ ...current, title: event.target.value }))}
              placeholder="Limpiar baño"
            />
          </label>
          <label>
            Categoria
            <input
              value={draft.category}
              onChange={(event) => onUpdate((current) => ({ ...current, category: event.target.value }))}
              placeholder="Limpieza, compras, plan..."
            />
          </label>
        </div>

        <label>
          Descripcion
          <input
            value={draft.description}
            onChange={(event) => onUpdate((current) => ({ ...current, description: event.target.value }))}
            placeholder="Detalle opcional"
          />
        </label>

        <div className="form-grid">
          <label>
            Fecha
            <input
              type="date"
              value={draft.date}
              onChange={(event) => onUpdate((current) => ({ ...current, date: event.target.value }))}
            />
          </label>
          <label>
            Recurrencia
            <select
              value={draft.recurrenceFrequency}
              onChange={(event) =>
                onUpdate((current) => ({
                  ...current,
                  recurrenceFrequency: event.target.value as RecurrenceFrequency,
                }))
              }
            >
              {Object.entries(recurrenceLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="toggle-row">
          <input
            checked={draft.allDay}
            type="checkbox"
            onChange={(event) => onUpdate((current) => ({ ...current, allDay: event.target.checked }))}
          />
          Todo el dia
        </label>

        {!draft.allDay ? (
          <div className="form-grid">
            <label>
              Hora inicio
              <input
                type="time"
                value={draft.startTime}
                onChange={(event) => onUpdate((current) => ({ ...current, startTime: event.target.value }))}
              />
            </label>
            <label>
              Hora fin
              <input
                type="time"
                value={draft.endTime}
                onChange={(event) => onUpdate((current) => ({ ...current, endTime: event.target.value }))}
              />
            </label>
          </div>
        ) : null}

        <label>
          Prioridad
          <select
            value={draft.priority}
            onChange={(event) =>
              onUpdate((current) => ({
                ...current,
                priority: event.target.value as CalendarEventPriority,
              }))
            }
          >
            {Object.entries(priorityLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        {context.scope === "group" ? (
          <>
            <MemberPicker
              label="Responsables"
              members={members}
              selectedIds={draft.responsibleIds}
              onSelectAll={() => onSelectAll("responsibleIds")}
              onToggle={(userId) => onToggleMember("responsibleIds", userId)}
            />
            <MemberPicker
              label="Participantes"
              members={members}
              selectedIds={draft.participantIds}
              onSelectAll={() => onSelectAll("participantIds")}
              onToggle={(userId) => onToggleMember("participantIds", userId)}
            />
          </>
        ) : null}

        <label>
          Notas
          <input
            value={draft.notes}
            onChange={(event) => onUpdate((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Notas privadas o del grupo"
          />
        </label>

        <div className="preview-box">
          <span>Vista previa</span>
          <strong>
            {draft.title || "Actividad"} · {draft.allDay ? "Durante el dia" : draft.startTime}
          </strong>
          <p>
            {context.scope === "personal"
              ? "Esta actividad queda privada en tu espacio."
              : "La actividad queda visible para integrantes del grupo activo."}
          </p>
        </div>

        {error ? <p style={errorBoxStyle}>{error}</p> : null}

        <button className="primary-button" type="submit">
          Guardar
        </button>
      </form>
    </div>
  );
}

function MemberPicker({
  label,
  members,
  selectedIds,
  onSelectAll,
  onToggle,
}: {
  label: string;
  members: User[];
  selectedIds: UserId[];
  onSelectAll: () => void;
  onToggle: (userId: UserId) => void;
}) {
  return (
    <fieldset>
      <div className="fieldset-heading">
        <legend>{label}</legend>
        <button type="button" onClick={onSelectAll}>
          Seleccionar todos
        </button>
      </div>
      <div className="member-picker">
        {members.map((member) => (
          <button
            className={selectedIds.includes(member.id) ? "selected" : ""}
            key={member.id}
            type="button"
            onClick={() => onToggle(member.id)}
          >
            <Avatar directory={members} userId={member.id} small />
            {member.name}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
