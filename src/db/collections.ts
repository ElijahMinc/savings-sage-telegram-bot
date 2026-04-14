import { mongoDbClient } from "./connection";
import { IExpenseReminderJob } from "./schema/reminder-job.schema";
import { ITransactionRecordStored } from "./schema/transaction.schema";
import { ISessionData } from "./schema/session.schema";

export const collections = {
  reminderJobs: mongoDbClient.collection<IExpenseReminderJob>("reminder_jobs"),
  transactions:
    mongoDbClient.collection<ITransactionRecordStored>("transactions"),
  sessions: mongoDbClient.collection<ISessionData>("sessions"),
} as const;
