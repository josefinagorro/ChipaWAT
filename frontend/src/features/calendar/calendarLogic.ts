import type { ExpenseContext, GroupId, User, UserId } from "../expenses/types";
import type {
  CalendarEvent,
  CalendarOccurrence,
  GroupCalendarEvent,
  PersonalCalendarEvent,
  RecurrenceFrequency,
} from "./types";

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const nextDate = new Date(`${date}T00:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return isoDate(nextDate);
}

export function monthDays(monthKey: string): string[] {
  const firstDay = new Date(`${monthKey}-01T00:00:00.000Z`);
  const days: string[] = [];
  const cursor = new Date(firstDay);

  while (cursor.getUTCMonth() === firstDay.getUTCMonth()) {
    days.push(isoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

export function getContextEvents(
  events: CalendarEvent[],
  context: ExpenseContext,
  currentUserId: UserId,
): CalendarEvent[] {
  if (context.scope === "personal") {
    return events.filter((event) => {
      if (event.scope === "personal") {
        return event.ownerUserId === currentUserId;
      }

      return (
        event.responsibleIds.includes(currentUserId) ||
        event.participantIds.includes(currentUserId)
      );
    });
  }

  return events.filter((event) => event.scope === "group" && event.groupId === context.groupId);
}

export function expandOccurrences(
  events: CalendarEvent[],
  rangeStart: string,
  rangeEnd: string,
): CalendarOccurrence[] {
  return events.flatMap((event) =>
    getOccurrenceDates(event, rangeStart, rangeEnd).map((date, index) => ({
      id: `${event.id}-${date}`,
      sourceEventId: event.id,
      event,
      date,
      responsibleIds: getResponsibleIdsForOccurrence(event, index),
      originContext:
        event.scope === "personal"
          ? { scope: "personal", ownerUserId: event.ownerUserId }
          : { scope: "group", groupId: event.groupId },
    })),
  );
}

export function getPersonalTodaySummary(
  events: CalendarEvent[],
  currentUserId: UserId,
  today: string,
): CalendarOccurrence[] {
  const contextEvents = getContextEvents(
    events,
    { scope: "personal", ownerUserId: currentUserId },
    currentUserId,
  );

  return expandOccurrences(contextEvents, today, today).sort(compareOccurrences);
}

export function getGroupUpcomingSummary(
  events: CalendarEvent[],
  groupId: GroupId,
  fromDate: string,
  daysAhead = 7,
): CalendarOccurrence[] {
  const contextEvents = getContextEvents(events, { scope: "group", groupId }, "");

  return expandOccurrences(contextEvents, fromDate, addDays(fromDate, daysAhead)).sort(
    compareOccurrences,
  );
}

export function compareOccurrences(first: CalendarOccurrence, second: CalendarOccurrence): number {
  const dateComparison = first.date.localeCompare(second.date);

  if (dateComparison !== 0) {
    return dateComparison;
  }

  return getTimeSortValue(first.event).localeCompare(getTimeSortValue(second.event));
}

export function createBusyBlocks(events: PersonalCalendarEvent[]): Array<{
  userId: UserId;
  date: string;
  startTime?: string;
  endTime?: string;
}> {
  return events.map((event) => ({
    userId: event.ownerUserId,
    date: event.date,
    startTime: event.startTime,
    endTime: event.endTime,
  }));
}

export function canGroupUseMembers(groupMembers: User[], selectedIds: UserId[]): boolean {
  const allowedIds = new Set(groupMembers.map((member) => member.id));
  return selectedIds.every((selectedId) => allowedIds.has(selectedId));
}

function getOccurrenceDates(event: CalendarEvent, rangeStart: string, rangeEnd: string): string[] {
  if (event.date > rangeEnd) {
    return [];
  }

  if (event.recurrence.frequency === "none") {
    return event.date >= rangeStart && event.date <= rangeEnd ? [event.date] : [];
  }

  const dates: string[] = [];
  let cursor = event.date;
  let guard = 0;

  while (cursor <= rangeEnd && guard < 420) {
    if (cursor >= rangeStart && matchesRecurrenceDay(cursor, event.recurrence.daysOfWeek)) {
      dates.push(cursor);
    }

    cursor = getNextDate(cursor, event.recurrence.frequency, event.recurrence.interval);
    guard += 1;
  }

  return dates;
}

function getNextDate(date: string, frequency: RecurrenceFrequency, interval: number): string {
  if (frequency === "monthly") {
    const nextDate = new Date(`${date}T00:00:00.000Z`);
    nextDate.setUTCMonth(nextDate.getUTCMonth() + interval);
    return isoDate(nextDate);
  }

  if (frequency === "weekly") {
    return addDays(date, 7 * interval);
  }

  return addDays(date, interval);
}

function matchesRecurrenceDay(date: string, daysOfWeek?: number[]): boolean {
  if (!daysOfWeek?.length) {
    return true;
  }

  return daysOfWeek.includes(new Date(`${date}T00:00:00.000Z`).getUTCDay());
}

function getResponsibleIdsForOccurrence(event: CalendarEvent, occurrenceIndex: number): UserId[] {
  if (event.scope === "personal") {
    return [event.ownerUserId];
  }

  const groupEvent = event as GroupCalendarEvent;
  const rotation = groupEvent.recurrence.rotationUserIds;

  if (!rotation?.length) {
    return groupEvent.responsibleIds;
  }

  return [rotation[occurrenceIndex % rotation.length]];
}

function getTimeSortValue(event: CalendarEvent): string {
  return event.allDay ? "99:99" : event.startTime ?? "99:98";
}
