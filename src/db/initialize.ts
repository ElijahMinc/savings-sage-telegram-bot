import { collections } from "./collections";

export async function ensureAllIndexes(): Promise<void> {
  await Promise.all([
    collections.transactions.createIndex({ key: 1, type: 1 }),
    collections.reminderJobs.createIndex({ status: 1, runAt: 1 }),
    collections.reminderJobs.createIndex(
      { key: 1, type: 1, scheduleType: 1 },
      { unique: true },
    ),
    collections.sessions.createIndex({ key: 1 }),
  ]);
}
