import { IBotContext, IAmountData } from "@/context/context.interface";
import { getFixedAmount } from "@/helpers/getFixedAmount";
import { decrypt } from "@/helpers/decrypt";
import { IEncryptedData } from "@/helpers/encrypt";
import {
  expenseReminderJobService,
  ExpenseReminderScheduleType,
  IExpenseReminderJob,
} from "@/services/ExpenseReminderJobService";
import { transactionService } from "@/services/TransactionService";
import { xlmxService } from "@/services/XLMX.service";
import { sessionsService } from "@/services/SessionService";
import { getDecryptedNumber } from "@/helpers/encryptedNumber.helper";
import { getLimitSnapshot } from "@/helpers/limitSnapshot.helper";
import { Telegraf } from "telegraf";
import cron, { ScheduledTask } from "node-cron";
import {
  getNextReminderRunAt,
  getReminderDayRange,
  getReminderHistoryCutoff,
  getReminderMonthMetrics,
  getReminderMonthRange,
  resolveReminderTimezone,
} from "@/helpers/reminderSchedule.helper";

class ExpenseReminderWorker {
  private task: ScheduledTask | null = null;
  private isTicking = false;

  start(bot: Telegraf<IBotContext>) {
    if (this.task) {
      return;
    }

    void this.tick(bot);

    this.task = cron.schedule("* * * * *", async () => {
      await this.tick(bot);
    });
  }

  private parseAmount(amount: IAmountData["amount"]): number {
    if (typeof amount === "number") {
      return amount;
    }

    return Number(decrypt(amount as IEncryptedData));
  }

  private getScopedExpenses(
    expenses: IAmountData[],
    scheduleType: ExpenseReminderScheduleType,
    baseDate: Date,
    timezone?: string | null,
  ) {
    switch (scheduleType) {
      case "end_of_day": {
        const dayRange = getReminderDayRange(baseDate, timezone);

        return expenses.filter((expense) => {
          const createdAt = new Date(expense.created_date);
          return createdAt >= dayRange.start && createdAt <= dayRange.end;
        });
      }
      default:
        return expenses;
    }
  }

  private getCurrentMonthTotal(
    items: IAmountData[],
    baseDate: Date,
    timezone?: string | null,
  ) {
    const monthRange = getReminderMonthRange(baseDate, timezone);

    return items.reduce((total, item) => {
      const createdAt = new Date(item.created_date);

      if (createdAt < monthRange.start || createdAt > monthRange.end) {
        return total;
      }

      return total + this.parseAmount(item.amount);
    }, 0);
  }

  private getSevenDayAverageExpenses(
    expenses: IAmountData[],
    baseDate: Date,
    timezone?: string | null,
  ) {
    const rangeStart = getReminderHistoryCutoff(baseDate, timezone);

    const total = expenses.reduce((sum, expense) => {
      const createdAt = new Date(expense.created_date);

      if (createdAt < rangeStart || createdAt > baseDate) {
        return sum;
      }

      return sum + this.parseAmount(expense.amount);
    }, 0);

    return total / 7;
  }

  private hasEnoughSevenDayHistory(
    expenses: IAmountData[],
    income: IAmountData[],
    baseDate: Date,
    timezone?: string | null,
  ) {
    const historyCutoff = getReminderHistoryCutoff(baseDate, timezone);
    const earliestKnownTransaction = [
      ...expenses,
      ...income,
    ].reduce<Date | null>((earliest, item) => {
      const createdAt = new Date(item.created_date);

      if (earliest == null || createdAt < earliest) {
        return createdAt;
      }

      return earliest;
    }, null);

    return (
      earliestKnownTransaction != null &&
      earliestKnownTransaction <= historyCutoff
    );
  }

  private getDailyLimit(input: {
    monthlyIncome: number;
    monthlyExpenses: number;
    monthlySavingsGoal: number | null;
    baseDate: Date;
    timezone?: string | null;
  }) {
    const monthMetrics = getReminderMonthMetrics(
      input.baseDate,
      input.timezone,
    );
    const snapshot = getLimitSnapshot({
      monthlyIncome: input.monthlyIncome,
      monthlyExpenses: input.monthlyExpenses,
      monthlySavingsGoal: input.monthlySavingsGoal ?? 0,
      daysInMonth: monthMetrics.daysInMonth,
      currentDayOfMonth: monthMetrics.currentDayOfMonth,
    });

    return snapshot.autoDailyLimit;
  }

  private getDailyReminderThreshold(input: {
    baseDate: Date;
    expenses: IAmountData[];
    income: IAmountData[];
    monthlySavingsGoal: number | null;
    timezone?: string | null;
  }) {
    const monthlyExpenses = this.getCurrentMonthTotal(
      input.expenses,
      input.baseDate,
      input.timezone,
    );
    const monthlyIncome = this.getCurrentMonthTotal(
      input.income,
      input.baseDate,
      input.timezone,
    );
    const realMonthlyBalance = monthlyIncome - monthlyExpenses;
    const hasEnoughHistory = this.hasEnoughSevenDayHistory(
      input.expenses,
      input.income,
      input.baseDate,
      input.timezone,
    );

    if (realMonthlyBalance < 0) {
      if (!hasEnoughHistory) {
        return (
          (monthlyIncome /
            getReminderMonthMetrics(input.baseDate, input.timezone)
              .daysInMonth) *
          2
        );
      }

      return (
        this.getSevenDayAverageExpenses(
          input.expenses,
          input.baseDate,
          input.timezone,
        ) * 1.5
      );
    }

    return (
      this.getDailyLimit({
        monthlyIncome,
        monthlyExpenses,
        monthlySavingsGoal: input.monthlySavingsGoal,
        baseDate: input.baseDate,
        timezone: input.timezone,
      }) * 2
    );
  }

  private getDailyReminderSummary(input: {
    total: number;
    transactionCount: number;
    monthlyIncome: number;
    monthlyExpenses: number;
  }) {
    const realMonthlyBalance = input.monthlyIncome - input.monthlyExpenses;

    if (realMonthlyBalance < 0) {
      return (
        `Today: ${getFixedAmount(input.total)} EUR (${input.transactionCount} transactions)\n\n` +
        `⚠️ You are overspending your income\n` +
        `Balance: ${getFixedAmount(realMonthlyBalance)} EUR\n` +
        `(Income ${getFixedAmount(input.monthlyIncome)} / Expenses ${getFixedAmount(input.monthlyExpenses)})`
      );
    }

    return `Daily reminder: ${getFixedAmount(input.total)} EUR spent today (${input.transactionCount} transactions).`;
  }

  private async sendDailyReminder(
    bot: Telegraf<IBotContext>,
    input: {
      chatId: number;
      expenses: IAmountData[];
      income: IAmountData[];
      monthlySavingsGoal: number | null;
      total: number;
      transactionCount: number;
      baseDate: Date;
      timezone?: string | null;
    },
  ) {
    const monthlyExpenses = this.getCurrentMonthTotal(
      input.expenses,
      input.baseDate,
      input.timezone,
    );
    const monthlyIncome = this.getCurrentMonthTotal(
      input.income,
      input.baseDate,
      input.timezone,
    );
    const threshold = this.getDailyReminderThreshold({
      baseDate: input.baseDate,
      expenses: input.expenses,
      income: input.income,
      monthlySavingsGoal: input.monthlySavingsGoal,
      timezone: input.timezone,
    });
    const shouldAttachReport =
      input.transactionCount >= 10 || input.total >= threshold;
    const summary = this.getDailyReminderSummary({
      total: input.total,
      transactionCount: input.transactionCount,
      monthlyIncome,
      monthlyExpenses,
    });

    if (!shouldAttachReport) {
      await bot.telegram.sendMessage(input.chatId, summary);
      return;
    }

    const { filename, readStream } = xlmxService.getDailyAnalyticsReadStream(
      input.expenses,
      input.income,
      input.monthlySavingsGoal ?? undefined,
    );

    await bot.telegram.sendDocument(
      input.chatId,
      {
        source: readStream,
        filename,
      },
      {
        caption: summary,
      },
    );
  }

  private getNextRunAt(
    job: IExpenseReminderJob,
    timezone?: string | null,
    baseDate?: Date,
  ) {
    return getNextReminderRunAt({
      scheduleType: job.scheduleType,
      baseDate,
      timezone,
    });
  }

  private async reconcilePendingTimezoneSensitiveJobs() {
    const jobs =
      await expenseReminderJobService.getPendingTimezoneSensitiveJobs();

    if (!jobs.length) {
      return;
    }

    const now = new Date();
    const timezoneByKey = new Map<string, string>();

    for (const job of jobs) {
      if (!job._id) {
        continue;
      }

      // Keep due jobs claimable for the current tick instead of rolling them
      // forward to the next day/month before execution.
      if (job.runAt <= now) {
        continue;
      }

      let sessionTimezone = timezoneByKey.get(job.key);

      if (!sessionTimezone) {
        const sessionData = await sessionsService.getSessionDataByKey(job.key);
        sessionTimezone = resolveReminderTimezone(sessionData?.timezone);
        timezoneByKey.set(job.key, sessionTimezone);
      }

      const nextRunAt = this.getNextRunAt(job, sessionTimezone);

      if (nextRunAt.getTime() === job.runAt.getTime()) {
        continue;
      }

      await expenseReminderJobService.syncPendingJobSchedule(job._id, {
        runAt: nextRunAt,
      });
    }
  }

  private async tick(bot: Telegraf<IBotContext>) {
    if (this.isTicking) {
      return;
    }

    this.isTicking = true;

    try {
      await this.reconcilePendingTimezoneSensitiveJobs();

      while (true) {
        const job = await expenseReminderJobService.claimNextDueJob(new Date());

        if (!job || !job._id) {
          break;
        }

        try {
          const now = new Date();
          const [expenses, income, sessionData] = await Promise.all([
            transactionService.getExpensesByKey(job.key),
            transactionService.getIncomeByKey(job.key),
            sessionsService.getSessionDataByKey(job.key),
          ]);
          const timezone = resolveReminderTimezone(sessionData?.timezone);
          const monthlySavingsGoal =
            getDecryptedNumber(sessionData?.monthlySavingsGoal) ?? null;
          const scopedExpenses = this.getScopedExpenses(
            expenses,
            job.scheduleType,
            now,
            timezone,
          );
          const total = scopedExpenses.reduce(
            (acc, expense) => acc + this.parseAmount(expense.amount),
            0,
          );

          if (job.scheduleType === "end_of_day") {
            await this.sendDailyReminder(bot, {
              chatId: job.chatId,
              expenses,
              income,
              monthlySavingsGoal,
              total,
              transactionCount: scopedExpenses.length,
              baseDate: now,
              timezone,
            });
          } else {
            if (expenses.length || income.length) {
              const { filename, readStream } =
                xlmxService.getMonthlyAnalyticsReadStream(
                  expenses,
                  income,
                  monthlySavingsGoal ?? undefined,
                );

              await bot.telegram.sendDocument(job.chatId, {
                source: readStream,
                filename,
              });
            }

            await bot.telegram.sendMessage(
              job.chatId,
              `Reminder: total expenses now are ${getFixedAmount(total)} EUR (${scopedExpenses.length} transactions).`,
            );
          }

          const nextRunAt = this.getNextRunAt(job, timezone, now);
          await expenseReminderJobService.markExecutedAndRescheduled(
            job._id,
            nextRunAt,
          );
        } catch (error) {
          const errorText =
            error instanceof Error ? error.message : "Unknown worker error";

          await expenseReminderJobService.releaseForRetry(
            {
              _id: job._id,
              attempts: job.attempts,
              maxAttempts: job.maxAttempts,
            },
            60_000,
            errorText,
          );
        }
      }
    } finally {
      this.isTicking = false;
    }
  }
}

export const expenseReminderWorker = new ExpenseReminderWorker();
