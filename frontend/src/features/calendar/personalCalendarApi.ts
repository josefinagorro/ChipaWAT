import { supabase } from "../../lib/supabaseClient";
import type {
  CalendarEventPriority,
  CalendarEventStatus,
  PersonalCalendarEvent,
  RecurrenceFrequency,
} from "./types";

type PersonalCalendarEventRow = {
  id: string;
  user_id: string;
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
  priority: CalendarEventPriority;
  status: CalendarEventStatus;
  notes: string | null;
};

export type PersonalCalendarEventInput = {
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
};

const selectColumns =
  "id, user_id, title, description, category, event_date, start_time, end_time, all_day, recurrence_frequency, recurrence_interval, recurrence_days_of_week, priority, status, notes";

function fail(message: string): never {
  throw new Error(message);
}

// Postgres devuelve "time" como "HH:MM:SS"; el formulario trabaja con "HH:MM".
function trimTime(value: string | null): string | undefined {
  return value ? value.slice(0, 5) : undefined;
}

function toPersonalCalendarEvent(row: PersonalCalendarEventRow): PersonalCalendarEvent {
  return {
    id: row.id,
    scope: "personal",
    ownerUserId: row.user_id,
    privacy: "private",
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
    },
    priority: row.priority,
    status: row.status,
    notes: row.notes ?? undefined,
  };
}

/**
 * No hace falta filtrar por usuaria: las policies de Supabase ya devuelven
 * únicamente las filas propias, aunque alguien toque el código del navegador.
 */
export async function listPersonalCalendarEvents(): Promise<PersonalCalendarEvent[]> {
  const { data, error } = await supabase
    .from("personal_calendar_events")
    .select(selectColumns)
    .order("event_date");

  if (error) fail(error.message);

  return ((data ?? []) as PersonalCalendarEventRow[]).map(toPersonalCalendarEvent);
}

export async function createPersonalCalendarEvent(input: PersonalCalendarEventInput): Promise<void> {
  // user_id no se manda: la tabla lo completa sola con auth.uid().
  const { error } = await supabase.from("personal_calendar_events").insert({
    title: input.title,
    description: input.description || null,
    category: input.category,
    event_date: input.date,
    start_time: input.allDay ? null : input.startTime,
    end_time: input.allDay ? null : input.endTime,
    all_day: input.allDay,
    recurrence_frequency: input.recurrenceFrequency,
    priority: input.priority,
    notes: input.notes || null,
  });

  if (error) fail(error.message);
}

export async function updatePersonalCalendarEvent(
  id: string,
  input: PersonalCalendarEventInput,
): Promise<void> {
  const { error } = await supabase
    .from("personal_calendar_events")
    .update({
      title: input.title,
      description: input.description || null,
      category: input.category,
      event_date: input.date,
      start_time: input.allDay ? null : input.startTime,
      end_time: input.allDay ? null : input.endTime,
      all_day: input.allDay,
      recurrence_frequency: input.recurrenceFrequency,
      priority: input.priority,
      notes: input.notes || null,
    })
    .eq("id", id);

  if (error) fail(error.message);
}

export async function setPersonalCalendarEventStatus(
  id: string,
  status: CalendarEventStatus,
): Promise<void> {
  const { error } = await supabase.from("personal_calendar_events").update({ status }).eq("id", id);
  if (error) fail(error.message);
}

export async function deletePersonalCalendarEvent(id: string): Promise<void> {
  const { error } = await supabase.from("personal_calendar_events").delete().eq("id", id);
  if (error) fail(error.message);
}
