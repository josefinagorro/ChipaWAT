import { supabase } from "../../lib/supabaseClient";
import type { UserId } from "../expenses/types";
import type {
  CalendarEventKind,
  CalendarEventPriority,
  CalendarEventStatus,
  GroupCalendarEvent,
  RecurrenceFrequency,
} from "./types";

type GroupCalendarEventRow = {
  id: string;
  group_id: string;
  kind: CalendarEventKind;
  title: string;
  description: string | null;
  category: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  recurrence_frequency: RecurrenceFrequency;
  recurrence_interval: number;
  recurrence_days_of_week: number[] | null;
  recurrence_rotation_user_ids: string[] | null;
  priority: CalendarEventPriority;
  status: CalendarEventStatus;
  notes: string | null;
};

type MemberRow = { event_id: string; user_id: string };

export type GroupCalendarEventInput = {
  id: string | null;
  kind: CalendarEventKind;
  title: string;
  description: string;
  category: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  recurrenceFrequency: RecurrenceFrequency;
  priority: CalendarEventPriority;
  notes: string;
  responsibleIds: UserId[];
  participantIds: UserId[];
  rotationUserIds: UserId[] | null;
};

const selectColumns =
  "id, group_id, kind, title, description, category, event_date, start_time, end_time, all_day, recurrence_frequency, recurrence_interval, recurrence_days_of_week, recurrence_rotation_user_ids, priority, status, notes";

function fail(message: string): never {
  throw new Error(message);
}

function trimTime(value: string | null): string | undefined {
  return value ? value.slice(0, 5) : undefined;
}

/**
 * Trae los acontecimientos de todos los grupos pedidos en una sola consulta.
 * Se usa tanto para "Mi calendario" (combina todos los grupos donde participo)
 * como para el calendario de un grupo puntual (se le pasa un solo id).
 */
export async function listGroupCalendarEvents(groupIds: string[]): Promise<GroupCalendarEvent[]> {
  if (groupIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("group_calendar_events")
    .select(selectColumns)
    .in("group_id", groupIds)
    .order("event_date");

  if (error) fail(error.message);

  const rows = (data ?? []) as GroupCalendarEventRow[];

  if (rows.length === 0) {
    return [];
  }

  const eventIds = rows.map((row) => row.id);

  const [responsibleResult, participantsResult] = await Promise.all([
    supabase.from("group_calendar_event_responsible").select("event_id, user_id").in("event_id", eventIds),
    supabase.from("group_calendar_event_participants").select("event_id, user_id").in("event_id", eventIds),
  ]);

  if (responsibleResult.error) fail(responsibleResult.error.message);
  if (participantsResult.error) fail(participantsResult.error.message);

  const responsible = (responsibleResult.data ?? []) as MemberRow[];
  const participants = (participantsResult.data ?? []) as MemberRow[];

  return rows.map((row) => ({
    id: row.id,
    scope: "group",
    groupId: row.group_id,
    kind: row.kind,
    title: row.title,
    description: row.description ?? undefined,
    category: row.category,
    date: row.event_date,
    startTime: trimTime(row.start_time),
    endTime: trimTime(row.end_time),
    allDay: row.all_day,
    recurrence: {
      frequency: row.recurrence_frequency,
      interval: row.recurrence_interval,
      daysOfWeek: row.recurrence_days_of_week ?? undefined,
      rotationUserIds: row.recurrence_rotation_user_ids ?? undefined,
    },
    priority: row.priority,
    status: row.status,
    notes: row.notes ?? undefined,
    // Ordenados siempre igual, así la rotación y la UI no bailan entre recargas.
    responsibleIds: responsible
      .filter((entry) => entry.event_id === row.id)
      .map((entry) => entry.user_id)
      .sort(),
    participantIds: participants
      .filter((entry) => entry.event_id === row.id)
      .map((entry) => entry.user_id)
      .sort(),
  }));
}

export async function saveGroupCalendarEvent(groupId: string, input: GroupCalendarEventInput): Promise<void> {
  const { error } = await supabase.rpc("save_group_calendar_event", {
    p_group_id: groupId,
    p_event_id: input.id,
    p_kind: input.kind,
    p_title: input.title,
    p_description: input.description || null,
    p_category: input.category,
    p_event_date: input.date,
    p_start_time: input.allDay ? null : input.startTime,
    p_end_time: input.allDay ? null : input.endTime,
    p_all_day: input.allDay,
    p_recurrence_frequency: input.recurrenceFrequency,
    p_recurrence_interval: 1,
    p_recurrence_days_of_week: null,
    p_recurrence_rotation_user_ids: input.rotationUserIds,
    p_priority: input.priority,
    p_notes: input.notes || null,
    p_responsible_ids: input.responsibleIds,
    p_participant_ids: input.participantIds,
  });

  if (error) fail(error.message);
}

export async function setGroupCalendarEventStatus(
  id: string,
  status: CalendarEventStatus,
): Promise<void> {
  const { error } = await supabase.rpc("set_group_calendar_event_status", {
    p_event_id: id,
    p_status: status,
  });

  if (error) fail(error.message);
}

export async function deleteGroupCalendarEvent(id: string): Promise<void> {
  const { error } = await supabase.from("group_calendar_events").delete().eq("id", id);
  if (error) fail(error.message);
}
