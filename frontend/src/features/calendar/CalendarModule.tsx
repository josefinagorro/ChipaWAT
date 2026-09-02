import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
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
import { calendarEvents } from "./mockData";
import type {
  CalendarDraft,
  CalendarEvent,
  CalendarEventPriority,
  CalendarEventStatus,
  CalendarEventKind,
  CalendarOccurrence,
  GroupCalendarEvent,
  RecurrenceFrequency,
} from "./types";
import { currentUserId, groupMembers, groups, users } from "../expenses/mockData";
import type { ExpenseContext, User, UserId } from "../expenses/types";

type CalendarView = "month" | "week" | "day" | "list";

type ShellControls = {
  sidebarCollapsed: boolean;
  onSidebarToggle: () => void;
};

const defaultGroupId = "casa-tahoe";
const today = "2026-01-12";
const weekHours = Array.from({ length: 18 }, (_, index) => index + 6);
const hourHeight = 68;

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

function getGroupContext(groupId: string): ExpenseContext {
  return { scope: "group", groupId };
}

function blankDraft(context: ExpenseContext, memberIds: UserId[]): CalendarDraft {
  return {
    scope: context.scope,
    kind: "responsibility",
    title: "",
    description: "",
    category: context.scope === "personal" ? "Recordatorio" : "Casa",
    date: today,
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

function userName(userId: UserId): string {
  return users.find((user) => user.id === userId)?.name ?? userId;
}

function userById(userId: UserId): User {
  return users.find((user) => user.id === userId) ?? users[0];
}

function originLabel(event: CalendarEvent): string {
  if (event.scope !== "group") {
    return "";
  }

  return groups.find((group) => group.id === event.groupId)?.name ?? "";
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

function Avatar({ userId, small = false }: { userId: UserId; small?: boolean }) {
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

export function CalendarModule({ sidebarCollapsed, onSidebarToggle }: ShellControls) {
  const [context, setContext] = useState<ExpenseContext>(getGroupContext(defaultGroupId));
  const [events, setEvents] = useState<CalendarEvent[]>(calendarEvents);
  const [view, setView] = useState<CalendarView>("week");
  const [selectedDate, setSelectedDate] = useState(today);
  const [showModal, setShowModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  const activeGroup = context.scope === "group" ? groups.find((group) => group.id === context.groupId) : undefined;
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
  const [draft, setDraft] = useState(() => blankDraft(context, activeMemberIds));

  const contextEvents = useMemo(
    () => getContextEvents(events, context, currentUserId),
    [context, events],
  );
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
  const personalToday = getPersonalTodaySummary(events, currentUserId, today);
  const groupUpcoming =
    context.scope === "group" ? getGroupUpcomingSummary(events, context.groupId, today, 7) : [];
  const groupToday = groupUpcoming.filter((occurrence) => occurrence.date === today);
  const activeToday = context.scope === "personal" ? personalToday : groupToday;
  const activeUpcoming = context.scope === "personal" ? personalToday : groupUpcoming;
  const pendingToday = activeToday.filter((occurrence) => occurrence.event.status === "pending").length;

  const switchContext = (nextContext: ExpenseContext) => {
    const memberIds =
      nextContext.scope === "group"
        ? groupMembers
            .filter((membership) => membership.groupId === nextContext.groupId)
            .map((membership) => membership.userId)
        : [currentUserId];

    setContext(nextContext);
    setDraft(blankDraft(nextContext, memberIds));
    setEditingEventId(null);
  };

  const openNewActivity = () => {
    setEditingEventId(null);
    setDraft(blankDraft(context, context.scope === "group" ? activeMemberIds : [currentUserId]));
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

  const saveDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!draft.title.trim()) {
      return;
    }

    if (context.scope === "group" && !canGroupUseMembers(activeGroupMembers, [...draft.responsibleIds, ...draft.participantIds])) {
      return;
    }

    const base = {
      id: editingEventId ?? `activity-${Date.now()}`,
      title: draft.title.trim(),
      description: draft.description.trim() || undefined,
      category: draft.category.trim() || "Otro",
      date: draft.date,
      startTime: draft.allDay ? undefined : draft.startTime,
      endTime: draft.allDay ? undefined : draft.endTime,
      allDay: draft.allDay,
      recurrence: {
        frequency: draft.recurrenceFrequency,
        interval: 1,
        rotationUserIds:
          context.scope === "group" && draft.recurrenceFrequency !== "none" && draft.kind === "responsibility"
            ? draft.responsibleIds
            : undefined,
      },
      priority: draft.priority,
      status: "pending" as const,
      notes: draft.notes.trim() || undefined,
    };

    const nextEvent: CalendarEvent =
      context.scope === "personal"
        ? {
            ...base,
            scope: "personal",
            ownerUserId: currentUserId,
            privacy: "private",
          }
        : {
            ...base,
            scope: "group",
            groupId: context.groupId,
            kind: draft.kind,
            responsibleIds: draft.responsibleIds,
            participantIds: draft.participantIds,
          };

    setEvents((current) =>
      editingEventId
        ? current.map((calendarEvent) => (calendarEvent.id === editingEventId ? nextEvent : calendarEvent))
        : [nextEvent, ...current],
    );
    setShowModal(false);
    setEditingEventId(null);
  };

  const deleteActivity = (eventId: string) => {
    setEvents((current) => current.filter((event) => event.id !== eventId));
  };

  const markCompleted = (eventId: string) => {
    setEvents((current) =>
      current.map((event) =>
        event.id === eventId
          ? {
              ...event,
              status: event.status === "completed" ? "pending" : "completed",
            }
          : event,
      ),
    );
  };

  const toggleMember = (field: "responsibleIds" | "participantIds", userId: UserId) => {
    setDraft((current) => ({
      ...current,
      [field]: current[field].includes(userId)
        ? current[field].filter((selectedId) => selectedId !== userId)
        : [...current[field], userId],
    }));
  };

  return (
    <main className={`app-shell calendar-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
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
              {context.scope === "personal" ? "Mi calendario" : activeGroup?.name}
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

        <section className="calendar-context-tabs" aria-label="Calendarios">
          <button
            className={context.scope === "personal" ? "active" : ""}
            type="button"
            onClick={() => switchContext({ scope: "personal", ownerUserId: currentUserId })}
          >
            <UserRound size={18} />
            Personal
          </button>
          <button
            className={context.scope === "group" && context.groupId === defaultGroupId ? "active" : ""}
            type="button"
            onClick={() => switchContext(getGroupContext(defaultGroupId))}
          >
            <UsersRound size={18} />
            Casa Tahoe
          </button>
        </section>

        <section className="summary-grid" aria-label="Resumen de calendario">
          <SummaryCard
            label="Hoy"
            value={String(activeToday.length)}
            detail={context.scope === "personal" ? "en tu calendario" : `en ${activeGroup?.name}`}
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
            value={String(context.scope === "group" ? groupUpcoming.length : contextEvents.filter((event) => event.scope === "personal").length)}
            icon={<CalendarDays size={20} />}
          />
          <SummaryCard label="Vista actual" value={view} detail={formatLongDate(selectedDate)} icon={<Search size={20} />} />
        </section>

        <section className="panel calendar-dashboard calendar-dashboard-single">
          <PanelTitle
            icon={context.scope === "personal" ? <UserRound size={18} /> : <UsersRound size={18} />}
            title={context.scope === "personal" ? "Mi día" : `Hoy en ${activeGroup?.name}`}
          />
          <OccurrenceList
            emptyText={
              context.scope === "personal"
                ? "No tenés actividades pendientes en tu calendario personal."
                : "No hay acontecimientos del grupo para hoy."
            }
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

          {view === "month" ? (
            <MonthView monthKey={selectedDate.slice(0, 7)} occurrences={occurrences} onSelectDate={setSelectedDate} />
          ) : view === "week" ? (
            <WeekScheduleView
              occurrences={occurrences}
              onComplete={markCompleted}
              onDelete={deleteActivity}
              onEdit={openEditActivity}
              onSelectDate={setSelectedDate}
              startDate={selectedDate}
            />
          ) : view === "day" ? (
            <OccurrenceList
              emptyText="No hay actividades para este dia."
              occurrences={selectedDayOccurrences}
              onComplete={markCompleted}
              onDelete={deleteActivity}
              onEdit={openEditActivity}
            />
          ) : (
            <OccurrenceList
              emptyText="No hay actividades en el rango elegido."
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

function WeekView({
  startDate,
  occurrences,
  onSelectDate,
}: {
  startDate: string;
  occurrences: CalendarOccurrence[];
  onSelectDate: (date: string) => void;
}) {
  return (
    <div className="week-grid">
      {Array.from({ length: 7 }, (_, index) => addDays(startDate, index)).map((date) => (
        <button className="week-day" key={date} type="button" onClick={() => onSelectDate(date)}>
          <strong>{formatDate(date)}</strong>
          <span>{occurrences.filter((occurrence) => occurrence.date === date).length} actividades</span>
        </button>
      ))}
    </div>
  );
}

function WeekScheduleView({
  startDate,
  occurrences,
  onSelectDate,
  onComplete,
  onDelete,
  onEdit,
}: {
  startDate: string;
  occurrences: CalendarOccurrence[];
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
  onComplete,
  onDelete,
  onEdit,
}: {
  occurrence: CalendarOccurrence;
  onComplete: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const top = getEventTop(occurrence.event.startTime);
  const height = getEventHeight(occurrence.event.startTime, occurrence.event.endTime);

  return (
    <article
      className={`calendar-event-block ${occurrence.event.scope} ${occurrence.event.priority}`}
      style={{ top, height } as CSSProperties}
    >
      <button type="button" onClick={onEdit}>
        <strong>{occurrence.event.title}</strong>
        <span>
          {occurrence.event.startTime} - {occurrence.event.endTime}
          {originLabel(occurrence.event) ? ` · ${originLabel(occurrence.event)}` : ""}
        </span>
      </button>
      <div>
        {occurrence.responsibleIds.slice(0, 2).map((userId) => (
          <Avatar key={userId} userId={userId} small />
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
  return Math.max(38, ((endMinutes - startMinutes) / 60) * hourHeight);
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
  emptyText,
  occurrences,
  onComplete,
  onDelete,
  onEdit,
}: {
  emptyText: string;
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
      {occurrences.map((occurrence) => (
        <article className={`activity-card ${occurrence.event.status}`} key={occurrence.id}>
          <div>
            <div className="activity-title">
              <span className={`category-pill ${occurrence.event.scope}`}>{occurrence.event.category}</span>
              {occurrence.event.scope === "group" ? (
                <span className={`kind-badge ${occurrence.event.kind}`}>{occurrence.event.kind === "plan" ? "Plan" : "Responsabilidad"}</span>
              ) : null}
              <span className={`priority-badge ${occurrence.event.priority}`}>{priorityLabels[occurrence.event.priority]}</span>
            </div>
            <h3>{occurrence.event.title}</h3>
            <small>
              {formatDate(occurrence.date)} ·{" "}
              {occurrence.event.allDay
                ? "Durante el dia"
                : `${occurrence.event.startTime} a ${occurrence.event.endTime}`}
              {originLabel(occurrence.event) ? ` · ${originLabel(occurrence.event)}` : ""}
            </small>
          </div>
          <div className="activity-people">
            {occurrence.responsibleIds.map((userId) => (
              <Avatar key={userId} userId={userId} small />
            ))}
          </div>
          <div className="card-footer">
            <span>{statusLabels[occurrence.event.status]}</span>
            <div>
              <button className="icon-button muted" type="button" onClick={() => onComplete(occurrence.sourceEventId)} aria-label="Completar actividad">
                <CheckCircle2 size={16} />
              </button>
              <button className="icon-button muted" type="button" onClick={() => onEdit(occurrence.event)} aria-label="Editar actividad">
                <Edit3 size={16} />
              </button>
              <button className="icon-button muted danger" type="button" onClick={() => onDelete(occurrence.sourceEventId)} aria-label="Eliminar actividad">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function ActivityModal({
  context,
  draft,
  editingEventId,
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
            <Avatar userId={member.id} small />
            {member.name}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
