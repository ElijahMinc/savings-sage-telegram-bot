import { mongoDbClient } from "@/db/connection";
import { MongoServerError } from "mongodb";

type JobStatus = "pending" | "completed";

interface IDailyReportJob {
  key: string;
  status: JobStatus;
  runAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

class ReportJobService {
  private jobs = mongoDbClient.collection<IDailyReportJob>("daily_report_jobs");
  private indexInitPromise: Promise<string> | null = null;

  private async ensureIndexes() {
    if (!this.indexInitPromise) {
      this.indexInitPromise = this.jobs.createIndex(
        { key: 1, status: 1 },
        {
          unique: true,
          partialFilterExpression: { status: "pending" },
        }
      );
    }

    await this.indexInitPromise;
  }

  async hasPendingJob(key: string) {
    await this.ensureIndexes();
    const count = await this.jobs.countDocuments({ key, status: "pending" });
    return count > 0;
  }

  async tryCreatePendingJob(key: string, runAt: Date) {
    await this.ensureIndexes();

    try {
      const now = new Date();
      const result = await this.jobs.updateOne(
        { key, status: "pending" },
        {
          $setOnInsert: {
            key,
            status: "pending",
            runAt,
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true }
      );

      return result.upsertedCount > 0;
    } catch (error) {
      if (
        error instanceof MongoServerError &&
        error.code === 11000
      ) {
        return false;
      }

      throw error;
    }
  }

  async markCompleted(key: string) {
    await this.jobs.updateOne(
      { key, status: "pending" },
      { $set: { status: "completed", updatedAt: new Date() } }
    );
  }

  async clearPendingJob(key: string) {
    await this.jobs.deleteOne({ key, status: "pending" });
  }
}

export const reportJobService = new ReportJobService();
