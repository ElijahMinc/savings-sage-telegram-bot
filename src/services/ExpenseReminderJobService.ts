import { mongoDbClient } from "@/db/connection";
import { MongoServerError, ObjectId } from "mongodb";

export type ExpenseReminderStatus = "pending" | "processing" | "failed";
export type ExpenseReminderScheduleType =
  | "every_minute"
  | "every_hour"
  | "end_of_day"
  | "end_of_month";

export interface IExpenseReminderJob {
  _id?: ObjectId;
  key: string;
  chatId: number;
  userId: number;
  type: "expenses_total";
  status: ExpenseReminderStatus;
  runAt: Date;
  scheduleType: ExpenseReminderScheduleType;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  updatedAt: Date;
  lockedAt?: Date;
  lastError?: string;
}

class ExpenseReminderJobService {
  private jobs = mongoDbClient.collection<IExpenseReminderJob>("reminder_jobs");
  private indexInitPromise: Promise<string[]> | null = null;

  private isNamespaceNotFoundError(error: unknown) {
    return (
      error instanceof MongoServerError &&
      (error.code === 26 || error.codeName === "NamespaceNotFound")
    );
  }

  private async ensureIndexes() {
    if (!this.indexInitPromise) {
      this.indexInitPromise = (async () => {
        try {
          let existingIndexes: Awaited<ReturnType<typeof this.jobs.indexes>> = [];

          try {
            existingIndexes = await this.jobs.indexes();
          } catch (error) {
            if (!this.isNamespaceNotFoundError(error)) {
              throw error;
            }
          }

          const legacyUniqueIndex = existingIndexes.find((index) => {
            const keyNames = Object.keys(index.key ?? {});
            return (
              index.unique === true &&
              keyNames.length === 2 &&
              index.key?.key === 1 &&
              index.key?.type === 1
            );
          });

          if (legacyUniqueIndex?.name) {
            try {
              await this.jobs.dropIndex(legacyUniqueIndex.name);
            } catch (error) {
              if (!this.isNamespaceNotFoundError(error)) {
                throw error;
              }
            }
          }

          return Promise.all([
            this.jobs.createIndex({ status: 1, runAt: 1 }),
            this.jobs.createIndex({ key: 1, type: 1 }),
            this.jobs.createIndex(
              { key: 1, type: 1, scheduleType: 1 },
              { unique: true },
            ),
          ]);
        } catch (error) {
          this.indexInitPromise = null;
          throw error;
        }
      })();
    }

    await this.indexInitPromise;
  }

  async upsertExpensesTotalJob(input: {
    key: string;
    chatId: number;
    userId: number;
    maxAttempts?: number;
    scheduleType: ExpenseReminderScheduleType;
    runAt: Date;
  }) {
    await this.ensureIndexes();

    const now = new Date();
    const result = await this.jobs.updateOne(
      {
        key: input.key,
        type: "expenses_total",
        scheduleType: input.scheduleType,
      },
      {
        $set: {
          chatId: input.chatId,
          userId: input.userId,
          status: "pending",
          runAt: input.runAt,
          scheduleType: input.scheduleType,
          attempts: 0,
          updatedAt: now,
        },
        $setOnInsert: {
          key: input.key,
          type: "expenses_total",
          maxAttempts: input.maxAttempts ?? 5,
          createdAt: now,
        },
      },
      { upsert: true },
    );

    return {
      created: result.upsertedCount > 0,
      updated: result.matchedCount > 0,
    };
  }

  async claimNextDueJob(now: Date) {
    await this.ensureIndexes();

    const claimed = await this.jobs.findOneAndUpdate(
      { status: "pending", runAt: { $lte: now } },
      {
        $set: {
          status: "processing",
          lockedAt: now,
          updatedAt: now,
        },
        $inc: { attempts: 1 },
      },
      { sort: { runAt: 1 }, returnDocument: "after" },
    );

    return claimed;
  }

  async markExecutedAndRescheduled(jobId: ObjectId, nextRunAt: Date) {
    await this.jobs.updateOne(
      { _id: jobId, status: "processing" },
      {
        $set: {
          status: "pending",
          runAt: nextRunAt,
          attempts: 0,
          updatedAt: new Date(),
        },
        $unset: { lockedAt: "", lastError: "" },
      },
    );
  }

  async markFailed(jobId: ObjectId, lastError: string) {
    await this.jobs.updateOne(
      { _id: jobId, status: "processing" },
      {
        $set: {
          status: "failed",
          updatedAt: new Date(),
          lastError,
        },
        $unset: { lockedAt: "" },
      },
    );
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
      await this.markFailed(job._id, lastError);
      return;
    }

    await this.jobs.updateOne(
      { _id: job._id, status: "processing" },
      {
        $set: {
          status: "pending",
          runAt: new Date(Date.now() + retryInMs),
          updatedAt: new Date(),
          lastError,
        },
        $unset: { lockedAt: "" },
      },
    );
  }

  async disableExpensesTotalJobByKey(key: string) {
    const result = await this.jobs.deleteMany({ key, type: "expenses_total" });
    return result.deletedCount > 0;
  }

  async disableExpensesTotalJobByScheduleType(
    key: string,
    scheduleType: ExpenseReminderScheduleType,
  ) {
    const result = await this.jobs.deleteOne({
      key,
      type: "expenses_total",
      scheduleType,
    });

    return result.deletedCount > 0;
  }

  async getExpensesTotalJobsByKey(key: string) {
    await this.ensureIndexes();

    return this.jobs
      .find({ key, type: "expenses_total", status: { $ne: "failed" } })
      .sort({ runAt: 1 })
      .toArray();
  }
}

export const expenseReminderJobService = new ExpenseReminderJobService();
