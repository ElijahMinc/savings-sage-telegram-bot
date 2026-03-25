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
  addDays,
  getDaysInMonth,
  addHours,
  addMinutes,
  addMonths,
  endOfMonth,
  isAfter,
  isSameDay,
  set,
  startOfDay,
  startOfMonth,
  subDays,
} from "date-fns";

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
  ) {
    switch (scheduleType) {
      case "end_of_day":
        return expenses.filter((expense) =>
          isSameDay(new Date(expense.created_date), baseDate),
        );
      default:
        return expenses;
    }
  }

  private getCurrentMonthTotal(items: IAmountData[], baseDate: Date) {
    const monthStart = startOfMonth(baseDate);

    return items.reduce((total, item) => {
      const createdAt = new Date(item.created_date);

      if (createdAt < monthStart || createdAt > baseDate) {
        return total;
      }

      return total + this.parseAmount(item.amount);
    }, 0);
  }

  private getSevenDayAverageExpenses(expenses: IAmountData[], baseDate: Date) {
    const rangeStart = startOfDay(subDays(baseDate, 6));

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
  ) {
    const historyCutoff = startOfDay(subDays(baseDate, 6));
    const earliestKnownTransaction = [...expenses, ...income].reduce<
      Date | null
    >((earliest, item) => {
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
  }) {
    const snapshot = getLimitSnapshot({
      monthlyIncome: input.monthlyIncome,
      monthlyExpenses: input.monthlyExpenses,
      monthlySavingsGoal: input.monthlySavingsGoal ?? 0,
      daysInMonth: getDaysInMonth(input.baseDate),
      currentDayOfMonth: input.baseDate.getDate(),
    });

    return snapshot.autoDailyLimit;
  }

  private getDailyReminderThreshold(input: {
    baseDate: Date;
    expenses: IAmountData[];
    income: IAmountData[];
    monthlySavingsGoal: number | null;
  }) {
    const monthlyExpenses = this.getCurrentMonthTotal(
      input.expenses,
      input.baseDate,
    );
    const monthlyIncome = this.getCurrentMonthTotal(
      input.income,
      input.baseDate,
    );
    const realMonthlyBalance = monthlyIncome - monthlyExpenses;
    const hasEnoughHistory = this.hasEnoughSevenDayHistory(
      input.expenses,
      input.income,
      input.baseDate,
    );

    if (realMonthlyBalance < 0) {
      if (!hasEnoughHistory) {
        return (monthlyIncome / getDaysInMonth(input.baseDate)) * 2;
      }

      return (
        this.getSevenDayAverageExpenses(input.expenses, input.baseDate) * 1.5
      );
    }

    return (
      this.getDailyLimit({
        monthlyIncome,
        monthlyExpenses,
        monthlySavingsGoal: input.monthlySavingsGoal,
        baseDate: input.baseDate,
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

  private async sendDailyReminder(bot: Telegraf<IBotContext>, input: {
    chatId: number;
    expenses: IAmountData[];
    income: IAmountData[];
    monthlySavingsGoal: number | null;
    total: number;
    transactionCount: number;
    baseDate: Date;
  }) {
    const monthlyExpenses = this.getCurrentMonthTotal(
      input.expenses,
      input.baseDate,
    );
    const monthlyIncome = this.getCurrentMonthTotal(
      input.income,
      input.baseDate,
    );
    const threshold = this.getDailyReminderThreshold({
      baseDate: input.baseDate,
      expenses: input.expenses,
      income: input.income,
      monthlySavingsGoal: input.monthlySavingsGoal,
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

  private getNextEndOfDayRun(baseDate: Date) {
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
  }

  private getNextEndOfMonthRun(baseDate: Date) {
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
  }

  private getNextRunAt(job: IExpenseReminderJob) {
    const now = new Date();

    switch (job.scheduleType as ExpenseReminderScheduleType) {
      case "every_minute":
        return addMinutes(now, 1);
      case "every_hour":
        return addHours(now, 1);
      case "end_of_day":
        return this.getNextEndOfDayRun(now);
      case "end_of_month":
        return this.getNextEndOfMonthRun(now);
      default:
        return addHours(now, 1);
    }
  }

  private async tick(bot: Telegraf<IBotContext>) {
    if (this.isTicking) {
      return;
    }

    this.isTicking = true;

    try {
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
          const monthlySavingsGoal =
            getDecryptedNumber(sessionData?.monthlySavingsGoal) ?? null;
          const scopedExpenses = this.getScopedExpenses(
            expenses,
            job.scheduleType,
            now,
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

          const nextRunAt = this.getNextRunAt(job);
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
