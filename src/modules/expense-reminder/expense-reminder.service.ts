import {
  getNextReminderRunAt,
  getReminderDayRange,
  getReminderHistoryCutoff,
  getReminderHourRange,
  getReminderMonthMetrics,
  getReminderMonthRange,
  getReminderMinuteRange,
  resolveReminderTimezone,
} from "@/helpers/reminderSchedule.helper";
import { expenseReminderRepository } from "./expense-reminder.repository";
import { getFixedAmount } from "@/helpers/getFixedAmount";
import { decrypt } from "@/helpers/decrypt";
import { IAmountData } from "@/types/app-context.interface";
import { IEncryptedData } from "@/helpers/encrypt";
import { getLimitSnapshot } from "@/helpers/limitSnapshot.helper";
import { transactionService } from "@/modules/transaction";
import { sessionsService } from "@/services/SessionService";
import { getDecryptedNumber } from "@/helpers/encryptedNumber.helper";
import { xlmxService } from "@/services/XLMX.service";
import { ObjectId } from "mongodb";
import { IMessageSender } from "@/types/reminder-sender.interface";
import {
  ExpenseReminderScheduleType,
  IExpenseReminderJob,
} from "@/db/schema/reminder-job.schema";

class ExpenseReminderService {
  private readonly repository = expenseReminderRepository;

  async upsertExpensesTotalJob(input: {
    key: string;
    chatId: number;
    userId: number;
    maxAttempts?: number;
    scheduleType: ExpenseReminderScheduleType;
    runAt: Date;
  }) {
    return this.repository.upsertExpensesTotalJob(input);
  }

  async disableExpensesTotalJobByKey(key: string) {
    return this.repository.disableExpensesTotalJobByKey(key);
  }

  async disableExpensesTotalJobByScheduleType(
    key: string,
    scheduleType: ExpenseReminderScheduleType,
  ) {
    return this.repository.disableExpensesTotalJobByScheduleType(
      key,
      scheduleType,
    );
  }

  async getExpensesTotalJobsByKey(key: string) {
    return this.repository.getExpensesTotalJobsByKey(key);
  }

  async releaseForRetry(
    job: Pick<IExpenseReminderJob, "_id" | "attempts" | "maxAttempts">,
    retryInMs: number,
    lastError: string,
  ) {
    if (!job._id) {
      return;
    }

    if (job.attempts >= job.maxAttempts) {
      await this.repository.markFailed(job._id, lastError);
      return;
    }

    await this.repository.rescheduleProcessingJob(job._id, {
      runAt: new Date(Date.now() + retryInMs),
      lastError,
    });
  }

  getNextRunAt(
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
    let range: { start: Date; end: Date } | null = null;

    switch (scheduleType) {
      case "every_minute":
        range = getReminderMinuteRange(baseDate, timezone);
        break;
      case "every_hour":
        range = getReminderHourRange(baseDate, timezone);
        break;
      case "end_of_day": {
        range = getReminderDayRange(baseDate, timezone);
        break;
      }
      case "end_of_month":
        range = getReminderMonthRange(baseDate, timezone);
        break;
      default:
        return expenses;
    }

    return expenses.filter((expense) => {
      const createdAt = new Date(expense.created_date);
      return createdAt >= range.start && createdAt <= range.end;
    });
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

  private getReminderEmptyStateMessage(
    scheduleType: ExpenseReminderScheduleType,
  ) {
    switch (scheduleType) {
      case "every_minute":
        return (
          "No transactions recorded this minute.\n" +
          "Nothing to report yet — your minute summary was skipped."
        );
      case "every_hour":
        return (
          "No transactions recorded this hour.\n" +
          "Nothing to report yet — your hourly summary was skipped."
        );
      case "end_of_month":
        return (
          "No transactions recorded this month.\n" +
          "Nothing to report yet — your monthly summary was skipped."
        );
      case "end_of_day":
      default:
        return (
          "No transactions recorded today.\n" +
          "Nothing to report yet — your daily summary was skipped."
        );
    }
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

  private getReminderSummary(input: {
    scheduleType: ExpenseReminderScheduleType;
    total: number;
    transactionCount: number;
    monthlyIncome?: number;
    monthlyExpenses?: number;
  }) {
    switch (input.scheduleType) {
      case "every_minute":
        return `Minute reminder: ${getFixedAmount(input.total)} EUR spent this minute (${input.transactionCount} transactions).`;
      case "every_hour":
        return `Hourly reminder: ${getFixedAmount(input.total)} EUR spent this hour (${input.transactionCount} transactions).`;
      case "end_of_month":
        return `Monthly reminder: ${getFixedAmount(input.total)} EUR spent this month (${input.transactionCount} transactions).`;
      case "end_of_day":
      default:
        return this.getDailyReminderSummary({
          total: input.total,
          transactionCount: input.transactionCount,
          monthlyIncome: input.monthlyIncome ?? 0,
          monthlyExpenses: input.monthlyExpenses ?? 0,
        });
    }
  }

  private async sendDailyReminder(
    sender: IMessageSender,
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

    const summary = this.getReminderSummary({
      scheduleType: "end_of_day",
      total: input.total,
      transactionCount: input.transactionCount,
      monthlyIncome,
      monthlyExpenses,
    });

    if (!shouldAttachReport) {
      await sender.sendMessage(input.chatId, summary);
      return;
    }

    const { filename, readStream } = xlmxService.getDailyAnalyticsReadStream(
      input.expenses,
      input.income,
      input.monthlySavingsGoal ?? undefined,
    );

    await sender.sendDocument(
      input.chatId,
      {
        source: readStream,
        filename,
      },
      summary,
    );
  }

  async executeJob(
    sender: IMessageSender,
    job: IExpenseReminderJob,
  ): Promise<Date> {
    if (!job._id) {
      throw new Error("Job id is required");
    }

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

    if (scopedExpenses.length === 0) {
      await sender.sendMessage(
        job.chatId,
        this.getReminderEmptyStateMessage(job.scheduleType),
      );

      return this.getNextRunAt(job, timezone, now);
    }

    if (job.scheduleType === "end_of_day") {
      await this.sendDailyReminder(sender, {
        chatId: job.chatId,
        expenses,
        income,
        monthlySavingsGoal,
        total,
        transactionCount: scopedExpenses.length,
        baseDate: now,
        timezone,
      });
    } else if (job.scheduleType === "end_of_month") {
      const { filename, readStream } = xlmxService.getMonthlyAnalyticsReadStream(
        expenses,
        income,
        monthlySavingsGoal ?? undefined,
      );

      await sender.sendDocument(
        job.chatId,
        {
          source: readStream,
          filename,
        },
        this.getReminderSummary({
          scheduleType: job.scheduleType,
          total,
          transactionCount: scopedExpenses.length,
        }),
      );
    } else {
      await sender.sendMessage(
        job.chatId,
        this.getReminderSummary({
          scheduleType: job.scheduleType,
          total,
          transactionCount: scopedExpenses.length,
        }),
      );
    }

    const nextRunAt = this.getNextRunAt(job, timezone, now);

    return nextRunAt;
  }

  async claimNextDueJob(now: Date) {
    return this.repository.claimNextDueJob(now);
  }

  async markExecutedAndRescheduled(jobId: ObjectId, nextRunAt: Date) {
    return this.repository.markExecutedAndRescheduled(jobId, nextRunAt);
  }

  async syncPendingJobSchedule(jobId: ObjectId, input: { runAt: Date }) {
    return this.repository.syncPendingJobSchedule(jobId, input);
  }

  async getPendingTimezoneSensitiveJobs() {
    return this.repository.getPendingTimezoneSensitiveJobs();
  }
}

export const expenseReminderService = new ExpenseReminderService();
