import { ObjectId } from "mongodb";

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
