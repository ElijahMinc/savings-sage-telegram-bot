import { ExpenseReminderScheduleType } from "@/modules/expense-reminder/expense-reminder.types";
import { addHours, addMinutes } from "date-fns";
import moment from "moment-timezone";

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

  return moment.tz.zone(normalizedTimezone) != null;
};

export const resolveReminderTimezone = (timezone?: string | null) => {
  if (isValidReminderTimezone(timezone)) {
    return timezone!.trim();
  }

  return DEFAULT_REMINDER_TIMEZONE;
};

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
      const zonedDate = moment.tz(
        baseDate,
        resolveReminderTimezone(input.timezone),
      );
      let next = zonedDate.clone().hour(23).minute(59).second(0).millisecond(0);

      if (!next.isAfter(zonedDate)) {
        next = next.add(1, "day");
      }

      return next.toDate();
    }
    case "end_of_month": {
      const zonedDate = moment.tz(
        baseDate,
        resolveReminderTimezone(input.timezone),
      );
      let next = zonedDate
        .clone()
        .endOf("month")
        .hour(23)
        .minute(59)
        .second(0)
        .millisecond(0);

      if (!next.isAfter(zonedDate)) {
        next = zonedDate
          .clone()
          .add(1, "month")
          .endOf("month")
          .hour(23)
          .minute(59)
          .second(0)
          .millisecond(0);
      }

      return next.toDate();
    }
    default:
      return addHours(baseDate, 1);
  }
};

export const formatReminderRunAt = (date: Date, timezone?: string | null) => {
  const resolvedTimezone = resolveReminderTimezone(timezone);
  return moment(date).tz(resolvedTimezone).format("YYYY-MM-DD HH:mm z");
};

export const getReminderDayRange = (date: Date, timezone?: string | null) => {
  const zonedDate = moment.tz(date, resolveReminderTimezone(timezone));

  return {
    start: zonedDate.clone().startOf("day").toDate(),
    end: zonedDate.clone().endOf("day").toDate(),
  };
};

export const getReminderMonthRange = (date: Date, timezone?: string | null) => {
  const zonedDate = moment.tz(date, resolveReminderTimezone(timezone));

  return {
    start: zonedDate.clone().startOf("month").toDate(),
    end: zonedDate.clone().endOf("month").toDate(),
  };
};

export const getReminderHistoryCutoff = (
  date: Date,
  timezone?: string | null,
) => {
  return moment
    .tz(date, resolveReminderTimezone(timezone))
    .startOf("day")
    .subtract(6, "days")
    .toDate();
};

export const getReminderMonthMetrics = (
  date: Date,
  timezone?: string | null,
) => {
  const zonedDate = moment.tz(date, resolveReminderTimezone(timezone));

  return {
    currentDayOfMonth: zonedDate.date(),
    daysInMonth: zonedDate.daysInMonth(),
  };
};
