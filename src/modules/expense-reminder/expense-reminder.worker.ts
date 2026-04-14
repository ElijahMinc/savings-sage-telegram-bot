import cron, { ScheduledTask } from "node-cron";

import { sessionsService } from "@/services/SessionService";
import { resolveReminderTimezone } from "@/helpers/reminderSchedule.helper";
import { expenseReminderService } from "./expense-reminder.service";
import { TelegramExpenseReminderSender } from "./expense-reminder.sender";
import { ICronWorker } from "@/types/worker.interface";

class ExpenseReminderWorker implements ICronWorker<TelegramExpenseReminderSender> {
  public name = "ExpenseReminderWorker";
  private task: ScheduledTask | null = null;
  private isTicking = false;

  run(sender: TelegramExpenseReminderSender) {
    if (this.task) {
      return;
    }

    void this.tick(sender);

    this.task = cron.schedule("* * * * *", async () => {
      await this.tick(sender);
    });
  }

  private async reconcilePendingTimezoneSensitiveJobs() {
    const jobs = await expenseReminderService.getPendingTimezoneSensitiveJobs();

    if (!jobs.length) {
      return;
    }

    const now = new Date();
    const timezoneByKey = new Map<string, string>();

    for (const job of jobs) {
      if (!job._id) {
        continue;
      }

      if (job.runAt <= now) {
        continue;
      }

      let sessionTimezone = timezoneByKey.get(job.key);

      if (!sessionTimezone) {
        const sessionData = await sessionsService.getSessionDataByKey(job.key);
        sessionTimezone = resolveReminderTimezone(sessionData?.timezone);
        timezoneByKey.set(job.key, sessionTimezone);
      }

      const nextRunAt = expenseReminderService.getNextRunAt(
        job,
        sessionTimezone,
      );

      if (nextRunAt.getTime() === job.runAt.getTime()) {
        continue;
      }

      await expenseReminderService.syncPendingJobSchedule(job._id, {
        runAt: nextRunAt,
      });
    }
  }

  private async tick(sender: TelegramExpenseReminderSender) {
    if (this.isTicking) {
      return;
    }

    this.isTicking = true;

    try {
      await this.reconcilePendingTimezoneSensitiveJobs();

      while (true) {
        const job = await expenseReminderService.claimNextDueJob(new Date());

        if (!job || !job._id) {
          break;
        }

        try {
          const nextRunAt = await expenseReminderService.executeJob(
            sender,
            job,
          );

          await expenseReminderService.markExecutedAndRescheduled(
            job._id,
            nextRunAt,
          );
        } catch (error) {
          const errorText =
            error instanceof Error ? error.message : "Unknown worker error";

          await expenseReminderService.releaseForRetry(
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
