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
import { Telegraf } from "telegraf";
import cron, { ScheduledTask } from "node-cron";
import {
  addDays,
  addHours,
  addMinutes,
  addMonths,
  endOfMonth,
  isAfter,
  set,
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
          const [expenses, income, sessionData] = await Promise.all([
            transactionService.getExpensesByKey(job.key),
            transactionService.getIncomeByKey(job.key),
            sessionsService.getSessionDataByKey(job.key),
          ]);
          const monthlySavingsGoal = getDecryptedNumber(
            sessionData?.monthlySavingsGoal,
          );
          const total = expenses.reduce(
            (acc, expense) => acc + this.parseAmount(expense.amount),
            0,
          );

          if (expenses.length || income.length) {
            const { filename, readStream } =
              xlmxService.getMonthlyAnalyticsReadStream(
                expenses,
                income,
                monthlySavingsGoal,
              );

            await bot.telegram.sendDocument(job.chatId, {
              source: readStream,
              filename,
            });
          }

          await bot.telegram.sendMessage(
            job.chatId,
            `Reminder: total expenses now are ${getFixedAmount(total)} EUR (${expenses.length} transactions).`,
          );

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
