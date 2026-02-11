import { Telegraf, Markup } from "telegraf";
import { IBotContext } from "@context/context.interface";
import { Command } from "./command.class";
import { COMMAND_NAMES } from "@/constants";
import { getSessionKeyFromContext } from "@/helpers/getSessionKey.helper";
import {
  expenseReminderJobService,
  ExpenseReminderScheduleType,
} from "@/services/ExpenseReminderJobService";
import {
  addDays,
  addHours,
  addMinutes,
  addMonths,
  endOfMonth,
  format,
  isAfter,
  set,
} from "date-fns";

const MIN_SCHEDULE_AHEAD_MS = 30_000;
const CALLBACK_PREFIX = "remind_preset:";
const CALLBACK_DISABLE_PREFIX = "remind_disable:";
const CALLBACK_DISABLE_ALL = "remind_disable_all";
const KEYBOARD_PRESETS: ReminderPreset[] = ["minute", "day_end", "month_end"];

type ReminderPreset = "minute" | "hour" | "day_end" | "month_end";

const PRESET_TO_SCHEDULE: Record<ReminderPreset, ExpenseReminderScheduleType> = {
  minute: "every_minute",
  hour: "every_hour",
  day_end: "end_of_day",
  month_end: "end_of_month",
};
const SCHEDULE_TO_PRESET: Record<ExpenseReminderScheduleType, ReminderPreset> = {
  every_minute: "minute",
  every_hour: "hour",
  end_of_day: "day_end",
  end_of_month: "month_end",
};

const PRESET_ALIASES: Record<string, ReminderPreset> = {
  minute: "minute",
  every_minute: "minute",
  "1m": "minute",
  day_end: "day_end",
  eod: "day_end",
  end_of_day: "day_end",
  month_end: "month_end",
  eom: "month_end",
  end_of_month: "month_end",
};

const getNextEndOfDayRun = (baseDate: Date) => {
  let next = set(baseDate, {
    hours: 23,
    minutes: 59,
    seconds: 0,
    milliseconds: 0,
  });

  if (!isAfter(next, baseDate)) {
    next = addDays(next, 1);
  }

  return next;
};

const getNextEndOfMonthRun = (baseDate: Date) => {
  let next = set(endOfMonth(baseDate), {
    hours: 23,
    minutes: 59,
    seconds: 0,
    milliseconds: 0,
  });

  if (!isAfter(next, baseDate)) {
    next = set(endOfMonth(addMonths(baseDate, 1)), {
      hours: 23,
      minutes: 59,
      seconds: 0,
      milliseconds: 0,
    });
  }

  return next;
};

const getRunAtByPreset = (preset: ReminderPreset) => {
  const now = new Date();

  switch (preset) {
    case "minute":
      return addMinutes(now, 1);
    case "hour":
      return addHours(now, 1);
    case "day_end":
      return getNextEndOfDayRun(now);
    case "month_end":
      return getNextEndOfMonthRun(now);
    default:
      return addHours(now, 1);
  }
};

const toDisplay = (date: Date) => format(date, "yyyy-MM-dd HH:mm");

const toScheduleDescription = (preset: ReminderPreset) => {
  switch (preset) {
    case "minute":
      return "every minute";
    case "hour":
      return "every hour";
    case "day_end":
      return "at the end of each day (23:59)";
    case "month_end":
      return "at the end of each month (23:59)";
    default:
      return "every hour";
  }
};

const toDisableDescription = (preset: ReminderPreset) => {
  switch (preset) {
    case "minute":
      return "minute reminder disabled.";
    case "hour":
      return "hourly reminder disabled.";
    case "day_end":
      return "end-of-day reminder disabled.";
    case "month_end":
      return "end-of-month reminder disabled.";
    default:
      return "reminder disabled.";
  }
};

const toReminderLabel = (scheduleType: ExpenseReminderScheduleType) => {
  return toScheduleDescription(SCHEDULE_TO_PRESET[scheduleType]);
};

const toKeyboardLabel = (preset: ReminderPreset, isActive: boolean) => {
  if (isActive) {
    switch (preset) {
      case "minute":
        return "Disable every minute";
      case "day_end":
        return "Disable end of day";
      case "month_end":
        return "Disable end of month";
      default:
        return "Disable reminder";
    }
  }

  switch (preset) {
    case "minute":
      return "Every minute";
    case "day_end":
      return "End of day";
    case "month_end":
      return "End of month";
    default:
      return "Reminder";
  }
};

const getPresetByInput = (rawInput: string): ReminderPreset | null => {
  const normalized = rawInput.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return PRESET_ALIASES[normalized] ?? null;
};

const reminderMenuText = `Choose reminder schedule:
- every minute
- end of day
- end of month

Tap the same preset again to disable it.

Examples:
/remind day_end
/remind month_end
/remind disable day_end
/remind disable`;

export class ReminderCommand extends Command {
  constructor(public bot: Telegraf<IBotContext>) {
    super(bot);
  }

  private async buildReminderKeyboard(key: string) {
    const reminders = await expenseReminderJobService.getExpensesTotalJobsByKey(key);
    const activePresets = new Set(
      reminders.map((reminder) => SCHEDULE_TO_PRESET[reminder.scheduleType]),
    );

    const presetRows = KEYBOARD_PRESETS.map((preset) => {
      const isActive = activePresets.has(preset);
      const callbackData = isActive
        ? `${CALLBACK_DISABLE_PREFIX}${preset}`
        : `${CALLBACK_PREFIX}${preset}`;

      return [
        Markup.button.callback(toKeyboardLabel(preset, isActive), callbackData),
      ];
    });

    return Markup.inlineKeyboard([
      ...presetRows,
      [Markup.button.callback("Disable all reminders", CALLBACK_DISABLE_ALL)],
    ]);
  }

  private async showReminderMenu(ctx: IBotContext, key: string) {
    const reminderKeyboard = await this.buildReminderKeyboard(key);
    await ctx.reply(reminderMenuText, reminderKeyboard);
  }

  private async getSessionKey(ctx: IBotContext) {
    const key = getSessionKeyFromContext(ctx);

    if (!key) {
      await ctx.reply("Cannot resolve chat/user session for reminder");
      return null;
    }

    return key;
  }

  private async showConfiguredReminders(ctx: IBotContext, key: string) {
    const reminders = await expenseReminderJobService.getExpensesTotalJobsByKey(key);

    if (!reminders.length) {
      await ctx.reply("No active reminders yet.");
      return;
    }

    const reminderLines = reminders.map((reminder) => {
      return `- ${toReminderLabel(reminder.scheduleType)}. Next run at ${toDisplay(
        reminder.runAt,
      )}`;
    });

    await ctx.reply(`Active reminders:\n${reminderLines.join("\n")}`);
  }

  private async upsertReminder(ctx: IBotContext, preset: ReminderPreset) {
    const key = await this.getSessionKey(ctx);
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;

    if (!key || !chatId || !userId) {
      return;
    }

    const scheduleType = PRESET_TO_SCHEDULE[preset];
    const runAt = getRunAtByPreset(preset);

    if (runAt.getTime() - Date.now() < MIN_SCHEDULE_AHEAD_MS) {
      await ctx.reply("Please choose another option; next run is too close.");
      return;
    }

    const result = await expenseReminderJobService.upsertExpensesTotalJob({
      key,
      chatId,
      userId,
      scheduleType,
      runAt,
    });

    const actionText = result.created ? "created" : "updated";
    await ctx.reply(
      `Reminder ${actionText}. Next run at ${toDisplay(
        runAt,
      )}. Schedule: ${toScheduleDescription(preset)}.`,
    );

    await this.showConfiguredReminders(ctx, key);
    await this.showReminderMenu(ctx, key);
  }

  private async disableReminder(ctx: IBotContext) {
    const key = await this.getSessionKey(ctx);

    if (!key) {
      return;
    }

    const disabled = await expenseReminderJobService.disableExpensesTotalJobByKey(
      key,
    );

    await ctx.reply(
      disabled
        ? "All reminders disabled."
        : "No reminders were configured yet.",
    );

    await this.showReminderMenu(ctx, key);
  }

  private async disableReminderByPreset(ctx: IBotContext, preset: ReminderPreset) {
    const key = await this.getSessionKey(ctx);

    if (!key) {
      return;
    }

    const scheduleType = PRESET_TO_SCHEDULE[preset];
    const disabled =
      await expenseReminderJobService.disableExpensesTotalJobByScheduleType(
        key,
        scheduleType,
      );

    await ctx.reply(
      disabled
        ? toDisableDescription(preset)
        : `No configured ${toScheduleDescription(preset)} reminder was found.`,
    );

    await this.showConfiguredReminders(ctx, key);
    await this.showReminderMenu(ctx, key);
  }

  handle(): void {
    this.bot.command(COMMAND_NAMES.REMIND, async (ctx) => {
      const rawInput = ctx.message.text.split(" ").slice(1).join(" ").trim();
      const [rawAction, ...rawActionTail] = rawInput
        .split(" ")
        .map((part) => part.trim())
        .filter(Boolean);
      const action = rawAction?.toLowerCase();

      if (!rawInput) {
        const key = await this.getSessionKey(ctx);
        if (key) {
          await this.showConfiguredReminders(ctx, key);
          await this.showReminderMenu(ctx, key);
        }
        return;
      }

      if (action === "list" || action === "status") {
        const key = await this.getSessionKey(ctx);
        if (key) {
          await this.showConfiguredReminders(ctx, key);
        }
        return;
      }

      if (
        action === "disable" ||
        action === "off" ||
        action === "remove" ||
        action === "delete"
      ) {
        if (!rawActionTail.length) {
          await this.disableReminder(ctx);
          return;
        }

        const presetToDisable = getPresetByInput(rawActionTail.join(" "));

        if (!presetToDisable) {
          await ctx.reply(
            "Unknown reminder preset to disable. Use minute, day_end or month_end.",
          );
          return;
        }

        await this.disableReminderByPreset(ctx, presetToDisable);
        return;
      }

      const preset = getPresetByInput(rawInput);

      if (preset) {
        await this.upsertReminder(ctx, preset);
        return;
      }

      const key = await this.getSessionKey(ctx);
      if (!key) {
        return;
      }

      await this.showReminderMenu(ctx, key);
    });

    this.bot.action(
      new RegExp(`^${CALLBACK_PREFIX}(minute|day_end|month_end)$`),
      async (ctx) => {
        const preset = (ctx.match[1] as ReminderPreset) ?? "minute";
        await ctx.answerCbQuery();
        await this.upsertReminder(ctx as IBotContext, preset);
      },
    );

    this.bot.action(
      new RegExp(`^${CALLBACK_DISABLE_PREFIX}(minute|day_end|month_end)$`),
      async (ctx) => {
        const preset = (ctx.match[1] as ReminderPreset) ?? "minute";
        await ctx.answerCbQuery();
        await this.disableReminderByPreset(ctx as IBotContext, preset);
      },
    );

    this.bot.action(CALLBACK_DISABLE_ALL, async (ctx) => {
      await ctx.answerCbQuery();
      await this.disableReminder(ctx as IBotContext);
    });
  }
}
