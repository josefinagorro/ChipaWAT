import type { ExpenseContext, GroupId, UserId } from "../expenses/types";

export type CalendarEventScope = "personal" | "group";
export type CalendarEventKind = "responsibility" | "plan";
export type CalendarEventStatus = "pending" | "completed" | "skipped" | "rescheduled";
export type CalendarEventPriority = "normal" | "important" | "urgent";
export type RecurrenceFrequency = "none" | "daily" | "weekly" | "weekdays" | "monthly";

export type RecurrenceRule = {
  frequency: RecurrenceFrequency;
  interval: number;
  daysOfWeek?: number[];
  rotationUserIds?: UserId[];
};

export type BaseCalendarEvent = {
  id: string;
  title: string;
  description?: string;
  category: string;
  date: string;
  startTime?: string;
  endTime?: string;
  allDay: boolean;
  recurrence: RecurrenceRule;
  priority: CalendarEventPriority;
  status: CalendarEventStatus;
  notes?: string;
};

export type PersonalCalendarEvent = BaseCalendarEvent & {
  scope: "personal";
  ownerUserId: UserId;
  privacy: "private" | "busy";
};

export type GroupCalendarEvent = BaseCalendarEvent & {
  scope: "group";
  groupId: GroupId;
  kind: CalendarEventKind;
  responsibleIds: UserId[];
  participantIds: UserId[];
};

export type CalendarEvent = PersonalCalendarEvent | GroupCalendarEvent;

export type CalendarOccurrence = {
  id: string;
  sourceEventId: string;
  event: CalendarEvent;
  date: string;
  responsibleIds: UserId[];
  originContext: ExpenseContext;
};

export type CalendarDraft = {
  scope: CalendarEventScope;
  kind: CalendarEventKind;
  title: string;
  description: string;
  category: string;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  recurrenceFrequency: RecurrenceFrequency;
  priority: CalendarEventPriority;
  notes: string;
  responsibleIds: UserId[];
  participantIds: UserId[];
};
