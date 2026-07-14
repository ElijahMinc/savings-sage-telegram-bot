import { ExpenseReminderScheduleType } from "@/modules/expense-reminder/expense-reminder.types";
import {
  addDays,
  addHours,
  addMinutes,
  addMonths,
  endOfDay,
  endOfHour,
  endOfMinute,
  endOfMonth,
  getDate,
  getDaysInMonth,
  isAfter,
  set,
  startOfDay,
  startOfHour,
  startOfMinute,
  startOfMonth,
  subDays,
} from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export const DEFAULT_REMINDER_TIMEZONE = "UTC";

export const isTimezoneAwareReminderSchedule = (
  scheduleType: ExpenseReminderScheduleType,
) => {
  return scheduleType === "end_of_day" || scheduleType === "end_of_month";
};

export const isValidReminderTimezone = (timezone?: string | null) => {
  if (typeof timezone !== "string") {
    return false;
  }

  const normalizedTimezone = timezone.trim();

  if (!normalizedTimezone) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalizedTimezone });
    return true;
  } catch {
    return false;
  }
};

export const resolveReminderTimezone = (timezone?: string | null) => {
  if (isValidReminderTimezone(timezone)) {
    return timezone!.trim();
  }

  return DEFAULT_REMINDER_TIMEZONE;
};

const setEndOfDayTime = (date: Date) =>
  set(date, { hours: 23, minutes: 59, seconds: 0, milliseconds: 0 });

export const getNextReminderRunAt = (input: {
  scheduleType: ExpenseReminderScheduleType;
  baseDate?: Date;
  timezone?: string | null;
}) => {
  const baseDate = input.baseDate ?? new Date();

  switch (input.scheduleType) {
    case "every_minute":
      return addMinutes(baseDate, 1);
    case "every_hour":
      return addHours(baseDate, 1);
    case "end_of_day": {
      const tz = resolveReminderTimezone(input.timezone);
      const zonedDate = toZonedTime(baseDate, tz);
      let next = setEndOfDayTime(zonedDate);

      if (!isAfter(next, zonedDate)) {
        next = addDays(next, 1);
      }

      return fromZonedTime(next, tz);
    }
    case "end_of_month": {
      const tz = resolveReminderTimezone(input.timezone);
      const zonedDate = toZonedTime(baseDate, tz);
      let next = setEndOfDayTime(endOfMonth(zonedDate));

      if (!isAfter(next, zonedDate)) {
        next = setEndOfDayTime(endOfMonth(addMonths(zonedDate, 1)));
      }

      return fromZonedTime(next, tz);
    }
    default:
      return addHours(baseDate, 1);
  }
};

export const formatReminderRunAt = (date: Date, timezone?: string | null) => {
  const resolvedTimezone = resolveReminderTimezone(timezone);
  return formatInTimeZone(date, resolvedTimezone, "yyyy-MM-dd HH:mm zzz");
};

const buildZonedRange = (
  date: Date,
  timezone: string | undefined | null,
  startFn: (d: Date) => Date,
  endFn: (d: Date) => Date,
) => {
  const tz = resolveReminderTimezone(timezone);
  const zonedDate = toZonedTime(date, tz);

  return {
    start: fromZonedTime(startFn(zonedDate), tz),
    end: fromZonedTime(endFn(zonedDate), tz),
  };
};

export const getReminderMinuteRange = (
  date: Date,
  timezone?: string | null,
) => buildZonedRange(date, timezone, startOfMinute, endOfMinute);

export const getReminderHourRange = (date: Date, timezone?: string | null) =>
  buildZonedRange(date, timezone, startOfHour, endOfHour);

export const getReminderDayRange = (date: Date, timezone?: string | null) =>
  buildZonedRange(date, timezone, startOfDay, endOfDay);

export const getReminderMonthRange = (date: Date, timezone?: string | null) =>
  buildZonedRange(date, timezone, startOfMonth, endOfMonth);

export const getReminderHistoryCutoff = (
  date: Date,
  timezone?: string | null,
) => {
  const tz = resolveReminderTimezone(timezone);
  const zonedDate = toZonedTime(date, tz);
  return fromZonedTime(subDays(startOfDay(zonedDate), 6), tz);
};

export const getReminderMonthMetrics = (
  date: Date,
  timezone?: string | null,
) => {
  const tz = resolveReminderTimezone(timezone);
  const zonedDate = toZonedTime(date, tz);

  return {
    currentDayOfMonth: getDate(zonedDate),
    daysInMonth: getDaysInMonth(zonedDate),
  };
};
