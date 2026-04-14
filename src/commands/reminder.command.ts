import { Telegraf, Markup } from "telegraf";
import { message } from "telegraf/filters";
import { IBotContext } from "@/types/app-context.interface";
import { Command } from "./command.class";
import { COMMAND_NAMES } from "@/constants";
import { getSessionKeyFromContext } from "@/helpers/getSessionKey.helper";

import {
  formatReminderRunAt,
  getNextReminderRunAt,
  isTimezoneAwareReminderSchedule,
  isValidReminderTimezone,
  resolveReminderTimezone,
} from "@/helpers/reminderSchedule.helper";
import { getTimezoneFromCoordinates } from "@/helpers/timezoneFromCoordinates.helper";
import { ExpenseReminderScheduleType } from "@/modules/expense-reminder/expense-reminder.types";
import { expenseReminderService } from "@/modules/expense-reminder/expense-reminder.service";

const MIN_SCHEDULE_AHEAD_MS = 30_000;
const CALLBACK_PREFIX = "remind_preset:";
const CALLBACK_DISABLE_PREFIX = "remind_disable:";
const CALLBACK_DISABLE_ALL = "remind_disable_all";
const KEYBOARD_PRESETS: ReminderPreset[] = ["minute", "day_end", "month_end"];
const TIMEZONE_WARNING_MESSAGE =
  "Reminder time may become incorrect after daylight saving or timezone changes. You will need to update it manually.";
const DISABLE_TIMEZONE_SYNC_TEXT = "Disable timezone sync";

type ReminderPreset = "minute" | "hour" | "day_end" | "month_end";

const PRESET_TO_SCHEDULE: Record<ReminderPreset, ExpenseReminderScheduleType> =
  {
    minute: "every_minute",
    hour: "every_hour",
    day_end: "end_of_day",
    month_end: "end_of_month",
  };
const SCHEDULE_TO_PRESET: Record<ExpenseReminderScheduleType, ReminderPreset> =
  {
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

const getRunAtByPreset = (preset: ReminderPreset, timezone?: string) => {
  return getNextReminderRunAt({
    scheduleType: PRESET_TO_SCHEDULE[preset],
    timezone,
  });
};

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

const reminderMenuText = "Choose reminder schedule:";

export class ReminderCommand extends Command {
  constructor(public bot: Telegraf<IBotContext>) {
    super(bot);
  }

  private getOptionalReminderTimezone(ctx: IBotContext) {
    const timezone = ctx.session.timezone;

    if (typeof timezone !== "string") {
      return undefined;
    }

    const normalizedTimezone = timezone.trim();

    if (!isValidReminderTimezone(normalizedTimezone)) {
      return undefined;
    }

    return normalizedTimezone;
  }

  private getTimezoneNote(ctx: IBotContext) {
    const timezone = this.getOptionalReminderTimezone(ctx);
    return timezone
      ? `Location sets local time ${timezone}.`
      : "Local time works only after location sync. Otherwise UTC is used.";
  }

  private async buildReminderKeyboard(key: string) {
    const reminders =
      await expenseReminderService.getExpensesTotalJobsByKey(key);
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
    await ctx.reply(this.getTimezoneNote(ctx));
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
    const timezone = resolveReminderTimezone(ctx.session.timezone);
    const reminders =
      await expenseReminderService.getExpensesTotalJobsByKey(key);

    if (!reminders.length) {
      await ctx.reply("No active reminders yet.");
      return;
    }

    const reminderLines = reminders.map((reminder) => {
      const displayRunAt = isTimezoneAwareReminderSchedule(
        reminder.scheduleType,
      )
        ? getNextReminderRunAt({
            scheduleType: reminder.scheduleType,
            timezone,
          })
        : reminder.runAt;

      return `- ${toReminderLabel(reminder.scheduleType)}. Next run at ${formatReminderRunAt(
        displayRunAt,
        timezone,
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
    const timezone = this.getOptionalReminderTimezone(ctx);
    const runAt = getRunAtByPreset(preset, timezone);

    if (runAt.getTime() - Date.now() < MIN_SCHEDULE_AHEAD_MS) {
      await ctx.reply("Please choose another option; next run is too close.");
      return;
    }

    const result = await expenseReminderService.upsertExpensesTotalJob({
      key,
      chatId,
      userId,
      scheduleType,
      runAt,
    });

    const actionText = result.created ? "created" : "updated";
    if (!timezone) {
      await ctx.reply(
        "Saved. Current reminder time uses UTC.\nSend location if you want local time.",
      );
    } else {
      await ctx.reply(
        `Reminder ${actionText}. Next run at ${formatReminderRunAt(
          runAt,
          timezone,
        )}. Schedule: ${toScheduleDescription(preset)} (${timezone}).`,
      );
    }

    if (!timezone && isTimezoneAwareReminderSchedule(scheduleType)) {
      await ctx.reply(TIMEZONE_WARNING_MESSAGE);
    }

    await this.showConfiguredReminders(ctx, key);
    await this.showReminderMenu(ctx, key);
  }

  private async disableReminder(ctx: IBotContext) {
    const key = await this.getSessionKey(ctx);

    if (!key) {
      return;
    }

    const disabled =
      await expenseReminderService.disableExpensesTotalJobByKey(key);

    await ctx.reply(
      disabled
        ? "All reminders disabled."
        : "No reminders were configured yet.",
    );

    await this.showReminderMenu(ctx, key);
  }

  private async disableReminderByPreset(
    ctx: IBotContext,
    preset: ReminderPreset,
  ) {
    const key = await this.getSessionKey(ctx);

    if (!key) {
      return;
    }

    const scheduleType = PRESET_TO_SCHEDULE[preset];
    const disabled =
      await expenseReminderService.disableExpensesTotalJobByScheduleType(
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

    this.bot.on(message("location"), async (ctx) => {
      const timezone = getTimezoneFromCoordinates(
        ctx.message.location.latitude,
        ctx.message.location.longitude,
      );

      if (!timezone) {
        await ctx.reply("Could not detect timezone for local time sync.");
        return;
      }

      ctx.session.timezone = timezone;
      const key = await this.getSessionKey(ctx);

      await ctx.reply(
        `Location sets local time ${timezone}.`,
        Markup.removeKeyboard(),
      );

      if (key) {
        await this.showConfiguredReminders(ctx, key);
        await this.showReminderMenu(ctx, key);
      }
    });

    this.bot.hears(DISABLE_TIMEZONE_SYNC_TEXT, async (ctx) => {
      ctx.session.timezone = undefined;
      const key = await this.getSessionKey(ctx);

      await ctx.reply(
        "Using UTC. Send location to use local time.",
        Markup.removeKeyboard(),
      );

      if (key) {
        await this.showConfiguredReminders(ctx, key);
        await this.showReminderMenu(ctx, key);
      }
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
